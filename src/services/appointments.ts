import type { SupabaseClient } from "@supabase/supabase-js";
import { throwIfDbError } from "@/lib/errors";
import type { AppointmentRow } from "@/types";

export const APPT_SELECT =
  "id, paciente_id, profissional_id, procedimento_id, data, hora_inicio, hora_fim, status, observacao, origem, paciente:patients(nome, telefone), profissional:professionals(nome), procedimento:procedures(nome, duracao_minutos)";

export interface AppointmentFilter {
  from?: string;
  to?: string;
  status?: string;
  professionalId?: string;
  patientId?: string;
  limit?: number;
  desc?: boolean;
}

export async function listAppointments(db: SupabaseClient, f: AppointmentFilter = {}): Promise<AppointmentRow[]> {
  let q = db.from("appointments").select(APPT_SELECT);
  if (f.from) q = q.gte("data", f.from);
  if (f.to) q = q.lte("data", f.to);
  if (f.status) q = q.eq("status", f.status);
  if (f.professionalId) q = q.eq("profissional_id", f.professionalId);
  if (f.patientId) q = q.eq("paciente_id", f.patientId);
  q = q.order("data", { ascending: !f.desc }).order("hora_inicio", { ascending: !f.desc }).limit(f.limit ?? 200);
  const { data, error } = await q;
  throwIfDbError(error, "UNKNOWN");
  return (data ?? []) as unknown as AppointmentRow[];
}

export async function getAppointment(db: SupabaseClient, id: string): Promise<AppointmentRow | null> {
  const { data } = await db.from("appointments").select(APPT_SELECT).eq("id", id).maybeSingle();
  return (data as unknown as AppointmentRow) ?? null;
}
