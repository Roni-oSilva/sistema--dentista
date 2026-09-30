"use server";

import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { AppError, throwIfDbError } from "@/lib/errors";
import { flashRedirect } from "@/lib/action";
import { agendaSettingsSchema, clinicSettingsSchema, formToObject, horarioPadraoSchema } from "@/validators/schemas";
import { timeToMin } from "@/lib/datetime";

async function save(chave: string, valor: unknown, staff: Awaited<ReturnType<typeof requirePermission>>) {
  const { error } = await staff.db.from("system_settings").upsert({ chave, valor, atualizado_em: new Date().toISOString(), atualizado_por: staff.id });
  throwIfDbError(error);
  await writeAudit(staff, "ALTERAR_CONFIGURACAO", "system_settings", chave);
}

export async function saveClinicAction(fd: FormData) {
  return flashRedirect("/admin/configuracoes", async () => {
    const staff = await requirePermission("settings.manage");
    await save("clinica", clinicSettingsSchema.parse(formToObject(fd)), staff);
    return "Dados da clínica salvos.";
  });
}

export async function saveAgendaAction(fd: FormData) {
  return flashRedirect("/admin/configuracoes", async () => {
    const staff = await requirePermission("settings.manage");
    await save("agenda", agendaSettingsSchema.parse(formToObject(fd)), staff);
    return "Configurações da agenda salvas.";
  });
}

export async function saveDefaultScheduleAction(fd: FormData) {
  return flashRedirect("/admin/configuracoes", async () => {
    const staff = await requirePermission("settings.manage");
    const dias: { dia_semana: number; inicio: string; fim: string }[] = [];
    for (let d = 0; d < 7; d++) {
      if (fd.get(`ativo_${d}`) !== "on") continue;
      dias.push({ dia_semana: d, inicio: String(fd.get(`inicio_${d}`) ?? ""), fim: String(fd.get(`fim_${d}`) ?? "") });
    }
    const ini = String(fd.get("intervalo_inicio") ?? "");
    const fim = String(fd.get("intervalo_fim") ?? "");
    const value = horarioPadraoSchema.parse({ dias, intervalo: ini && fim ? { inicio: ini, fim } : null });
    for (const d of value.dias) if (timeToMin(d.fim) <= timeToMin(d.inicio)) throw new AppError("INVALID_INPUT", "Em cada dia, o horário final deve ser maior que o inicial.");
    if (value.intervalo && timeToMin(value.intervalo.fim) <= timeToMin(value.intervalo.inicio)) throw new AppError("INVALID_INPUT", "O fim do intervalo deve ser maior que o início.");
    await save("horario_padrao", value, staff);
    return "Horário padrão salvo. Aplique-o a cada profissional na tela do profissional.";
  });
}
