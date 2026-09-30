"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { canSetStatus } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit";
import { flashParam } from "@/lib/flash";
import { AppError, throwIfDbError, toActionError, type ActionResult } from "@/lib/errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/services/settings";
import { createAppointment, rescheduleAppointment } from "@/services/booking";
import {
  appointmentCreateSchema,
  appointmentNoteSchema,
  formToObject,
  rescheduleSchema,
  statusChangeSchema,
} from "@/validators/schemas";
import { normalizePhone } from "@/validators/common";

/** Criar agendamento pelo painel (secretaria/admin). */
export async function createAppointmentAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const staff = await requirePermission("appointments.create");
    const input = appointmentCreateSchema.parse(formToObject(fd));
    let telefone: string | undefined;
    if (!input.paciente_id) {
      if (input.nome.length < 2) throw new AppError("INVALID_INPUT", "Informe o nome do paciente ou selecione um existente.");
      const n = normalizePhone(input.telefone);
      if (!n) throw new AppError("INVALID_INPUT", "Telefone inválido. Informe DDD + número.");
      telefone = n;
    }
    const settings = await getSettings(staff.db);
    id = await createAppointment(settings, {
      pacienteId: input.paciente_id,
      nome: input.nome,
      telefone,
      email: input.email,
      profissionalId: input.profissional_id,
      procedimentoId: input.procedimento_id,
      data: input.data,
      horaInicio: input.hora_inicio,
      status: input.status,
      observacao: input.observacao,
      origem: "PAINEL",
      actorId: staff.id, // auditoria gravada dentro da transação do banco
    });
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/agendamentos/${id}?${flashParam("ok", "Agendamento criado.")}`);
}

export async function changeStatusAction(fd: FormData) {
  let back = "/admin/agendamentos";
  let msg: string;
  try {
    const input = statusChangeSchema.parse(formToObject(fd));
    back = `/admin/agendamentos/${input.id}`;
    const staff = await requirePermission("appointments.view");
    if (!canSetStatus(staff.role, input.status)) throw new AppError("FORBIDDEN");
    const { data: before } = await staff.db.from("appointments").select("status").eq("id", input.id).maybeSingle();
    if (!before) throw new AppError("NOT_FOUND");
    if (before.status === input.status) throw new AppError("INVALID_INPUT", "O agendamento já está neste status.");
    // UPDATE respeita RLS + trigger (defesa em profundidade); conflito ao reativar => SLOT_TAKEN
    const { data, error } = await staff.db.from("appointments").update({ status: input.status }).eq("id", input.id).select("id");
    throwIfDbError(error);
    if (!data?.length) throw new AppError("FORBIDDEN");
    await writeAudit(staff, input.status === "CANCELADO" ? "CANCELAR_AGENDAMENTO" : "ALTERAR_STATUS_AGENDAMENTO", "appointments", input.id, { de: before.status, para: input.status });
    msg = flashParam("ok", input.status === "CANCELADO" ? "Agendamento cancelado. O horário foi liberado." : "Status atualizado.");
  } catch (e) {
    const r = toActionError(e);
    msg = flashParam("erro", r.ok ? "Erro" : r.error);
  }
  revalidatePath("/admin", "layout");
  redirect(`${back}?${msg}`);
}

export async function updateNoteAction(fd: FormData) {
  let back = "/admin/agendamentos";
  let msg: string;
  try {
    const input = appointmentNoteSchema.parse(formToObject(fd));
    back = `/admin/agendamentos/${input.id}`;
    const staff = await requirePermission("appointments.edit");
    const { data, error } = await staff.db.from("appointments").update({ observacao: input.observacao }).eq("id", input.id).select("id");
    throwIfDbError(error);
    if (!data?.length) throw new AppError("NOT_FOUND");
    await writeAudit(staff, "EDITAR_AGENDAMENTO", "appointments", input.id, { campo: "observacao" });
    msg = flashParam("ok", "Observação salva.");
  } catch (e) {
    const r = toActionError(e);
    msg = flashParam("erro", r.ok ? "Erro" : r.error);
  }
  revalidatePath(back);
  redirect(`${back}?${msg}`);
}

export async function rescheduleAction(fd: FormData) {
  let back = "/admin/agendamentos";
  let msg: string;
  try {
    const input = rescheduleSchema.parse(formToObject(fd));
    back = `/admin/agendamentos/${input.id}`;
    const staff = await requirePermission("appointments.reschedule");
    const settings = await getSettings(createSupabaseAdminClient());
    await rescheduleAppointment(settings, {
      id: input.id,
      data: input.data,
      horaInicio: input.hora_inicio,
      profissionalId: input.profissional_id,
      actorId: staff.id,
    });
    msg = flashParam("ok", "Agendamento remarcado.");
  } catch (e) {
    const r = toActionError(e);
    msg = flashParam("erro", r.ok ? "Erro" : r.error);
  }
  revalidatePath("/admin", "layout");
  redirect(`${back}?${msg}`);
}
