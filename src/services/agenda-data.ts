import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/db";
import { eachDay, timeToMin, weekdayOf } from "@/lib/datetime";
import { computeDaySlots, type DayInput, type Slot } from "@/lib/agenda/engine";

interface RuleRow { dia_semana: number; tipo: "TRABALHO" | "INTERVALO"; hora_inicio: string; hora_fim: string }
interface BlockedDateRow { data: string; motivo: string | null }
interface BlockedPeriodRow { data_inicio: string; data_fim: string; hora_inicio: string | null; hora_fim: string | null; motivo: string | null }
interface OverrideRow { data: string; hora_inicio: string; hora_fim: string; status: "DISPONIVEL" | "BLOQUEADO"; observacao: string | null }
interface ApptRow { id: string; data: string; hora_inicio: string; hora_fim: string; status: string }

export interface AgendaBundle {
  professionalId: string;
  from: string;
  to: string;
  slotMinutes: number;
  rules: RuleRow[];
  blockedDates: BlockedDateRow[];
  blockedPeriods: BlockedPeriodRow[];
  overrides: OverrideRow[];
  appointments: ApptRow[];
}

/** Carrega tudo que o motor precisa para [from, to] de UM profissional (consultas em paralelo). */
export async function loadAgendaBundle(
  db: SupabaseClient,
  professionalId: string,
  from: string,
  to: string,
  slotMinutes: number,
): Promise<AgendaBundle> {
  const scope = `professional_id.is.null,professional_id.eq.${professionalId}`;
  const [rules, blockedDates, blockedPeriods, overrides, appointments] = await Promise.all([
    fetchAll<RuleRow>((a, b) =>
      db.from("availability_rules").select("dia_semana, tipo, hora_inicio, hora_fim").eq("professional_id", professionalId).range(a, b),
    ),
    fetchAll<BlockedDateRow>((a, b) =>
      db.from("blocked_dates").select("data, motivo").or(scope).gte("data", from).lte("data", to).range(a, b),
    ),
    fetchAll<BlockedPeriodRow>((a, b) =>
      db.from("blocked_periods").select("data_inicio, data_fim, hora_inicio, hora_fim, motivo").or(scope).lte("data_inicio", to).gte("data_fim", from).range(a, b),
    ),
    fetchAll<OverrideRow>((a, b) =>
      db.from("schedule_slots").select("data, hora_inicio, hora_fim, status, observacao").eq("professional_id", professionalId).gte("data", from).lte("data", to).order("data").order("hora_inicio").range(a, b),
    ),
    fetchAll<ApptRow>((a, b) =>
      db.from("appointments").select("id, data, hora_inicio, hora_fim, status").eq("profissional_id", professionalId).gte("data", from).lte("data", to).order("id").range(a, b),
    ),
  ]);
  return { professionalId, from, to, slotMinutes, rules, blockedDates, blockedPeriods, overrides, appointments };
}

/** Converte o bundle na entrada do motor para uma data específica. */
export function dayInputFor(bundle: AgendaBundle, date: string): DayInput {
  const weekday = weekdayOf(date);
  const iv = (r: { hora_inicio: string; hora_fim: string }) => ({ start: timeToMin(r.hora_inicio), end: timeToMin(r.hora_fim) });
  const rules = bundle.rules.filter((r) => r.dia_semana === weekday);
  const blockedDate = bundle.blockedDates.find((b) => b.data === date);
  const periods = bundle.blockedPeriods.filter((p) => p.data_inicio <= date && date <= p.data_fim);
  const allDayPeriod = periods.find((p) => p.hora_inicio === null || p.hora_fim === null);
  const allDay = blockedDate ?? allDayPeriod ?? null;

  return {
    slotMinutes: bundle.slotMinutes,
    work: rules.filter((r) => r.tipo === "TRABALHO").map(iv),
    breaks: rules.filter((r) => r.tipo === "INTERVALO").map(iv),
    blockedAllDay: allDay ? { motivo: allDay.motivo } : null,
    blockedIntervals: periods
      .filter((p) => p.hora_inicio !== null && p.hora_fim !== null)
      .map((p) => ({ start: timeToMin(p.hora_inicio!), end: timeToMin(p.hora_fim!), motivo: p.motivo })),
    overrides: bundle.overrides.filter((o) => o.data === date).map((o) => ({ ...iv(o), status: o.status, observacao: o.observacao })),
    appointments: bundle.appointments.filter((a) => a.data === date).map((a) => ({ ...iv(a), id: a.id, status: a.status })),
  };
}

export function slotsFor(bundle: AgendaBundle, date: string): Slot[] {
  return computeDaySlots(dayInputFor(bundle, date));
}

export function allSlots(bundle: AgendaBundle): { data: string; slot: Slot }[] {
  return eachDay(bundle.from, bundle.to).flatMap((data) => slotsFor(bundle, data).map((slot) => ({ data, slot })));
}
