import { diffDays, minToTime } from "@/lib/datetime";

/**
 * MOTOR DE DISPONIBILIDADE (função pura, sem I/O).
 * Única fonte de verdade para decidir se um horário está DISPONIVEL / OCUPADO / BLOQUEADO.
 * O banco ainda garante a ausência de conflitos (constraint de exclusão), mas "pode agendar?"
 * é decidido aqui — tanto para exibir horários quanto para validar no servidor.
 */

export type SlotStatus = "DISPONIVEL" | "OCUPADO" | "BLOQUEADO";
export const ACTIVE_APPOINTMENT_STATUSES = ["PENDENTE", "CONFIRMADO", "REALIZADO"] as const;

export interface Interval {
  start: number; // minutos desde 00:00
  end: number;
}

export interface DayInput {
  slotMinutes: number;
  work: Interval[]; // regras TRABALHO do dia da semana
  breaks: Interval[]; // regras INTERVALO do dia da semana
  blockedAllDay: { motivo?: string | null } | null;
  blockedIntervals: (Interval & { motivo?: string | null })[];
  overrides: (Interval & { status: "DISPONIVEL" | "BLOQUEADO"; observacao?: string | null })[];
  appointments: (Interval & { id: string; status: string })[];
}

export interface Slot extends Interval {
  hora: string; // "HH:MM"
  status: SlotStatus;
  /** REGRA = gerado pela regra semanal; EXCECAO = existe linha em schedule_slots para este horário */
  origem: "REGRA" | "EXCECAO";
  excecao?: { status: "DISPONIVEL" | "BLOQUEADO"; observacao?: string | null };
  motivo?: string | null;
  appointmentId?: string;
}

const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) last.end = Math.max(last.end, i.end);
    else out.push({ ...i });
  }
  return out;
}

export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  let result = base.map((i) => ({ ...i }));
  for (const c of mergeIntervals(cut)) {
    const next: Interval[] = [];
    for (const r of result) {
      if (!overlaps(r, c)) {
        next.push(r);
        continue;
      }
      if (r.start < c.start) next.push({ start: r.start, end: c.start });
      if (c.end < r.end) next.push({ start: c.end, end: r.end });
    }
    result = next;
  }
  return result;
}

/** Grade base (só regras): horários gerados pelas regras semanais, sem exceções. */
export function baseGrid(input: Pick<DayInput, "slotMinutes" | "work" | "breaks">): Interval[] {
  const segments = subtractIntervals(mergeIntervals(input.work), input.breaks);
  const grid: Interval[] = [];
  for (const seg of segments) {
    for (let s = seg.start; s + input.slotMinutes <= seg.end; s += input.slotMinutes) {
      grid.push({ start: s, end: s + input.slotMinutes });
    }
  }
  return grid;
}

export function computeDaySlots(input: DayInput): Slot[] {
  const slots = new Map<number, Slot>();
  const blank = (i: Interval, origem: Slot["origem"]): Slot => ({
    ...i,
    hora: minToTime(i.start),
    status: "DISPONIVEL",
    origem,
  });

  for (const g of baseGrid(input)) slots.set(g.start, blank(g, "REGRA"));

  for (const o of input.overrides) {
    const existing = slots.get(o.start);
    const slot = existing ?? blank(o, "EXCECAO");
    slot.excecao = { status: o.status, observacao: o.observacao ?? null };
    if (!existing) slots.set(o.start, slot);
  }

  const active = input.appointments.filter((a) =>
    (ACTIVE_APPOINTMENT_STATUSES as readonly string[]).includes(a.status),
  );

  for (const slot of slots.values()) {
    const appt = active.find((a) => overlaps(a, slot));
    if (appt) {
      slot.status = "OCUPADO";
      slot.appointmentId = appt.id;
      continue;
    }
    if (input.blockedAllDay) {
      slot.status = "BLOQUEADO";
      slot.motivo = input.blockedAllDay.motivo ?? null;
      continue;
    }
    const blocked = input.blockedIntervals.find((b) => overlaps(b, slot));
    if (blocked) {
      slot.status = "BLOQUEADO";
      slot.motivo = blocked.motivo ?? null;
      continue;
    }
    const manual = input.overrides.find((o) => o.status === "BLOQUEADO" && overlaps(o, slot));
    if (manual) {
      slot.status = "BLOQUEADO";
      slot.motivo = manual.observacao ?? null;
    }
  }

  return [...slots.values()].sort((a, b) => a.start - b.start);
}

/**
 * Horários de INÍCIO em que um procedimento de `durationMin` cabe por inteiro
 * (todos os slots cobertos precisam existir, ser contíguos e estar DISPONIVEIS).
 */
export function startsForDuration(slots: Slot[], durationMin: number, minStart = 0): number[] {
  const byStart = new Map(slots.map((s) => [s.start, s]));
  const starts: number[] = [];
  for (const first of slots) {
    if (first.status !== "DISPONIVEL" || first.start < minStart) continue;
    const target = first.start + durationMin;
    let cover = first.start;
    let ok = true;
    while (cover < target) {
      const s = byStart.get(cover);
      if (!s || s.status !== "DISPONIVEL") {
        ok = false;
        break;
      }
      cover = s.end;
    }
    if (ok) starts.push(first.start);
  }
  return starts;
}

export interface BookingWindowOpts {
  today: string;
  nowMinutes: number;
  antecedenciaMinimaMin: number;
  diasMaxAntecedencia: number;
  /** passe false para o painel (a equipe pode agendar em cima da hora / retroativamente) */
  aplicar: boolean;
}

/** Hora mínima de início permitida para `date`, ou `Infinity` se a data inteira está fora da janela. */
export function minStartFor(date: string, w: BookingWindowOpts): number {
  if (!w.aplicar) return 0;
  if (date < w.today) return Infinity;
  if (diffDays(w.today, date) > w.diasMaxAntecedencia) return Infinity;
  if (date === w.today) return w.nowMinutes + w.antecedenciaMinimaMin;
  return 0;
}
