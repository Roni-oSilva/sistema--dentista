"use server";

import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { AppError, throwIfDbError } from "@/lib/errors";
import { flashRedirect } from "@/lib/action";
import { formToObject, professionalSchema, ruleSchema } from "@/validators/schemas";
import { timeToMin } from "@/lib/datetime";
import { uuid } from "@/validators/common";
import { getSettings } from "@/services/settings";

export async function saveProfessionalAction(fd: FormData) {
  const raw = formToObject(fd);
  const back = raw.id && uuid.safeParse(raw.id).success ? `/admin/profissionais/${raw.id}` : "/admin/profissionais";
  return flashRedirect(back, async () => {
    const staff = await requirePermission("professionals.manage");
    const { procedure_ids, ...fields } = professionalSchema.parse(raw);
    let id: string;
    let msg: string;
    if (raw.id) {
      id = uuid.parse(raw.id);
      const { data, error } = await staff.db.from("professionals").update(fields).eq("id", id).select("id");
      throwIfDbError(error);
      if (!data?.length) throw new AppError("NOT_FOUND");
      msg = "Profissional atualizado.";
    } else {
      const { data, error } = await staff.db.from("professionals").insert(fields).select("id").single();
      throwIfDbError(error);
      id = data!.id;
      msg = "Profissional criado. Configure agora a disponibilidade.";
    }
    // sincroniza procedimentos realizados
    const { error: delErr } = await staff.db.from("professional_procedures").delete().eq("professional_id", id);
    throwIfDbError(delErr);
    if (procedure_ids.length) {
      const { error } = await staff.db.from("professional_procedures").insert(procedure_ids.map((procedure_id) => ({ professional_id: id, procedure_id })));
      throwIfDbError(error);
    }
    await writeAudit(staff, raw.id ? "EDITAR_PROFISSIONAL" : "CRIAR_PROFISSIONAL", "professionals", id, { ativo: fields.ativo, procedimentos: procedure_ids.length });
    return msg;
  });
}

async function assertNoOverlap(staff: Awaited<ReturnType<typeof requirePermission>>, rule: ReturnType<typeof ruleSchema.parse>) {
  const { data } = await staff.db.from("availability_rules").select("hora_inicio, hora_fim")
    .eq("professional_id", rule.professional_id).eq("dia_semana", rule.dia_semana).eq("tipo", rule.tipo);
  const s = timeToMin(rule.hora_inicio), e = timeToMin(rule.hora_fim);
  if ((data ?? []).some((r) => timeToMin(r.hora_inicio) < e && timeToMin(r.hora_fim) > s))
    throw new AppError("CONFLICT", "Este horário se sobrepõe a outro já cadastrado no mesmo dia.");
}

export async function addRuleAction(fd: FormData) {
  const pid = String(fd.get("professional_id") ?? "");
  return flashRedirect(`/admin/profissionais/${uuid.safeParse(pid).success ? pid : ""}`, async () => {
    const staff = await requirePermission("availability.manage");
    const rule = ruleSchema.parse(formToObject(fd));
    await assertNoOverlap(staff, rule);
    const { error } = await staff.db.from("availability_rules").insert(rule);
    throwIfDbError(error);
    await writeAudit(staff, "ALTERAR_DISPONIBILIDADE", "availability_rules", rule.professional_id, { acao: "adicionar", ...rule });
    return "Horário adicionado.";
  });
}

export async function deleteRuleAction(fd: FormData) {
  const pid = String(fd.get("professional_id") ?? "");
  return flashRedirect(`/admin/profissionais/${uuid.safeParse(pid).success ? pid : ""}`, async () => {
    const staff = await requirePermission("availability.manage");
    const id = uuid.parse(fd.get("id"));
    const { error } = await staff.db.from("availability_rules").delete().eq("id", id).eq("professional_id", uuid.parse(pid));
    throwIfDbError(error);
    await writeAudit(staff, "ALTERAR_DISPONIBILIDADE", "availability_rules", pid, { acao: "remover", regra: id });
    return "Horário removido.";
  });
}

/** Substitui as regras do profissional pelo horário padrão da clínica (Configurações). */
export async function applyDefaultScheduleAction(fd: FormData) {
  const pid = String(fd.get("professional_id") ?? "");
  return flashRedirect(`/admin/profissionais/${uuid.safeParse(pid).success ? pid : ""}`, async () => {
    const staff = await requirePermission("availability.manage");
    const professional_id = uuid.parse(pid);
    const { horarioPadrao } = await getSettings(staff.db);
    if (horarioPadrao.dias.length === 0) throw new AppError("INVALID_INPUT", "Defina o horário padrão em Configurações primeiro.");
    const rows = horarioPadrao.dias.flatMap((d) => [
      { professional_id, dia_semana: d.dia_semana, tipo: "TRABALHO", hora_inicio: d.inicio, hora_fim: d.fim },
      ...(horarioPadrao.intervalo && timeToMin(horarioPadrao.intervalo.inicio) >= timeToMin(d.inicio) && timeToMin(horarioPadrao.intervalo.fim) <= timeToMin(d.fim)
        ? [{ professional_id, dia_semana: d.dia_semana, tipo: "INTERVALO", hora_inicio: horarioPadrao.intervalo.inicio, hora_fim: horarioPadrao.intervalo.fim }]
        : []),
    ]);
    const { error: delErr } = await staff.db.from("availability_rules").delete().eq("professional_id", professional_id);
    throwIfDbError(delErr);
    const { error } = await staff.db.from("availability_rules").insert(rows);
    throwIfDbError(error);
    await writeAudit(staff, "ALTERAR_DISPONIBILIDADE", "availability_rules", professional_id, { acao: "aplicar_padrao", regras: rows.length });
    return "Horário padrão aplicado.";
  });
}
