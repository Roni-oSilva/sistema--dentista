import { computeDaySlots, type DayInput, type SlotStatus } from "@/lib/agenda/engine";

/**
 * Regras de normalização da "planilha" (schedule_slots):
 * só guardamos exceções que DIFEREM do que as regras semanais + bloqueios já produzem.
 * Bloqueios (feriados/congressos) SEMPRE vencem um "DISPONIVEL" manual.
 */

export type BaseStatus = "DISPONIVEL" | "BLOQUEADO" | undefined; // undefined = fora da grade (sem atendimento)

/** Status do horário considerando apenas regras + bloqueios (ignora exceções e agendamentos). */
export function baseStatusAt(input: DayInput, start: number): BaseStatus {
  const slots = computeDaySlots({ ...input, overrides: [], appointments: [] });
  const s = slots.find((x) => x.start === start);
  return s ? (s.status as BaseStatus) : undefined;
}

export interface PlanArgs {
  base: BaseStatus;
  existing?: { status: "DISPONIVEL" | "BLOQUEADO"; observacao: string | null } | null;
  desired: { status: "DISPONIVEL" | "BLOQUEADO"; observacao: string | null };
  hasActiveAppointment: boolean;
}

export interface PlanResult {
  kind: "novo" | "alterado" | "inalterado" | "conflito";
  op: "upsert" | "delete" | null;
  reason?: string;
}

export function planSlotOp(a: PlanArgs): PlanResult {
  const obs = a.desired.observacao?.trim() || null;
  const existing = a.existing ?? null;

  if (a.desired.status === "BLOQUEADO" && a.hasActiveAppointment) {
    return { kind: "conflito", op: null, reason: "Existe agendamento ativo neste horário. Cancele ou remarque antes de bloquear." };
  }
  if (a.desired.status === "DISPONIVEL" && a.base === "BLOQUEADO") {
    return { kind: "conflito", op: null, reason: "Horário dentro de um bloqueio (feriado/período). Remova o bloqueio em Bloqueios." };
  }

  // Precisa de exceção gravada?
  let needs: boolean;
  if (a.desired.status === "DISPONIVEL") needs = a.base !== "DISPONIVEL" || obs !== null;
  else needs = a.base === "DISPONIVEL" || obs !== null; // BLOQUEADO: só se a regra deixaria livre (ou há observação a preservar)

  if (!needs) {
    if (existing) return { kind: "alterado", op: "delete" };
    return { kind: "inalterado", op: null };
  }
  if (!existing) return { kind: "novo", op: "upsert" };
  if (existing.status === a.desired.status && (existing.observacao ?? null) === obs) return { kind: "inalterado", op: null };
  return { kind: "alterado", op: "upsert" };
}

export type { SlotStatus };
