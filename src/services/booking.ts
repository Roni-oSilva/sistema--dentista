import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError, mapDbError } from "@/lib/errors";
import { addDays, minToTime, nowInZone, timeToMin } from "@/lib/datetime";
import { minStartFor, startsForDuration, type BookingWindowOpts } from "@/lib/agenda/engine";
import { loadAgendaBundle, slotsFor } from "@/services/agenda-data";
import type { AppSettings } from "@/types";

export function bookingWindow(settings: AppSettings, aplicar: boolean, now: Date = new Date()): BookingWindowOpts {
  const n = nowInZone(settings.agenda.timezone, now);
  return {
    today: n.date,
    nowMinutes: n.minutes,
    antecedenciaMinimaMin: settings.agenda.antecedencia_minima_minutos,
    diasMaxAntecedencia: settings.agenda.dias_max_antecedencia,
    aplicar,
  };
}

interface AvailOpts {
  settings: AppSettings;
  professionalId: string;
  durationMin: number;
  /** true no site público (antecedência mínima/máxima); false no painel */
  aplicarJanela: boolean;
  /** ao remarcar, o próprio agendamento não ocupa o horário */
  ignoreAppointmentId?: string;
  now?: Date;
}

/** Horários "HH:MM" em que o procedimento cabe inteiro em `date`. */
export async function availableTimes(db: SupabaseClient, date: string, o: AvailOpts): Promise<string[]> {
  const bundle = await loadAgendaBundle(db, o.professionalId, date, date, o.settings.agenda.duracao_padrao_minutos);
  if (o.ignoreAppointmentId) bundle.appointments = bundle.appointments.filter((a) => a.id !== o.ignoreAppointmentId);
  const minStart = minStartFor(date, bookingWindow(o.settings, o.aplicarJanela, o.now));
  if (minStart === Infinity) return [];
  return startsForDuration(slotsFor(bundle, date), o.durationMin, minStart).map(minToTime);
}

/** Datas (a partir de hoje, dentro da janela) com pelo menos um horário livre. */
export async function availableDates(db: SupabaseClient, o: AvailOpts & { from?: string; days?: number }): Promise<string[]> {
  const win = bookingWindow(o.settings, o.aplicarJanela, o.now);
  const from = o.from && o.from > win.today ? o.from : win.today;
  const days = Math.min(o.days ?? win.diasMaxAntecedencia, 120);
  const to = addDays(from, days);
  const bundle = await loadAgendaBundle(db, o.professionalId, from, to, o.settings.agenda.duracao_padrao_minutos);
  if (o.ignoreAppointmentId) bundle.appointments = bundle.appointments.filter((a) => a.id !== o.ignoreAppointmentId);
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const minStart = minStartFor(d, win);
    if (minStart === Infinity) continue;
    if (startsForDuration(slotsFor(bundle, d), o.durationMin, minStart).length > 0) out.push(d);
  }
  return out;
}

/** Procedimento ativo + profissional ativo que o realiza. Lança INVALID_INPUT se algo não bater. */
export async function loadBookingTarget(db: SupabaseClient, procedimentoId: string, profissionalId: string) {
  const [{ data: procedure }, { data: professional }, { data: link }] = await Promise.all([
    db.from("procedures").select("id, nome, duracao_minutos").eq("id", procedimentoId).eq("ativo", true).maybeSingle(),
    db.from("professionals").select("id, nome").eq("id", profissionalId).eq("ativo", true).maybeSingle(),
    db.from("professional_procedures").select("procedure_id").eq("professional_id", profissionalId).eq("procedure_id", procedimentoId).maybeSingle(),
  ]);
  if (!procedure || !professional || !link) throw new AppError("INVALID_INPUT", "Procedimento ou profissional indisponível.");
  return { procedure, professional } as {
    procedure: { id: string; nome: string; duracao_minutos: number };
    professional: { id: string; nome: string };
  };
}

export interface CreateAppointmentInput {
  pacienteId?: string;
  nome?: string;
  telefone?: string;
  email?: string | null;
  profissionalId: string;
  procedimentoId: string;
  data: string;
  horaInicio: string;
  status: "PENDENTE" | "CONFIRMADO";
  observacao?: string | null;
  origem: "PUBLICO" | "PAINEL";
  actorId: string | null;
}

/**
 * Cria agendamento: 1) revalida no servidor se o horário está livre (motor), 2) reserva em
 * transação no banco. Se outra pessoa reservou no meio do caminho, a constraint de exclusão
 * rejeita e devolvemos SLOT_TAKEN. O chamador precisa ter autorizado o ator antes.
 */
export async function createAppointment(settings: AppSettings, input: CreateAppointmentInput): Promise<string> {
  const db = createSupabaseAdminClient();
  const { procedure } = await loadBookingTarget(db, input.procedimentoId, input.profissionalId);

  const times = await availableTimes(db, input.data, {
    settings,
    professionalId: input.profissionalId,
    durationMin: procedure.duracao_minutos,
    aplicarJanela: input.origem === "PUBLICO",
  });
  if (!times.includes(input.horaInicio)) throw new AppError("SLOT_UNAVAILABLE");

  const fim = minToTime(timeToMin(input.horaInicio) + procedure.duracao_minutos);
  const { data, error } = await db.rpc("book_appointment", {
    p_paciente_id: input.pacienteId ?? null,
    p_nome: input.nome ?? null,
    p_telefone: input.telefone ?? null,
    p_email: input.email ?? null,
    p_profissional_id: input.profissionalId,
    p_procedimento_id: input.procedimentoId,
    p_data: input.data,
    p_hora_inicio: input.horaInicio,
    p_hora_fim: fim,
    p_status: input.status,
    p_observacao: input.observacao ?? null,
    p_origem: input.origem,
    p_actor: input.actorId,
  });
  if (error) throw mapDbError(error, "BOOKING_FAILED");
  return data as string;
}

export interface RescheduleInput {
  id: string;
  data: string;
  horaInicio: string;
  profissionalId: string;
  actorId: string;
}

export async function rescheduleAppointment(settings: AppSettings, input: RescheduleInput): Promise<void> {
  const db = createSupabaseAdminClient();
  const { data: appt } = await db.from("appointments").select("id, procedimento_id, status").eq("id", input.id).maybeSingle();
  if (!appt) throw new AppError("NOT_FOUND");
  if (!["PENDENTE", "CONFIRMADO"].includes(appt.status)) throw new AppError("INVALID_STATE");
  const { procedure } = await loadBookingTarget(db, appt.procedimento_id, input.profissionalId);

  const times = await availableTimes(db, input.data, {
    settings,
    professionalId: input.profissionalId,
    durationMin: procedure.duracao_minutos,
    aplicarJanela: false,
    ignoreAppointmentId: input.id,
  });
  if (!times.includes(input.horaInicio)) throw new AppError("SLOT_UNAVAILABLE");

  const { error } = await db.rpc("reschedule_appointment", {
    p_id: input.id,
    p_data: input.data,
    p_hora_inicio: input.horaInicio,
    p_hora_fim: minToTime(timeToMin(input.horaInicio) + procedure.duracao_minutos),
    p_profissional_id: input.profissionalId,
    p_actor: input.actorId,
  });
  if (error) throw mapDbError(error, "SAVE_FAILED");
}
