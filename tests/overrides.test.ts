import { describe, expect, it } from "vitest";
import { planSlotOp, baseStatusAt } from "@/lib/agenda/overrides";
import type { DayInput } from "@/lib/agenda/engine";

const h = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const input: DayInput = {
  slotMinutes: 30, work: [{ start: h("08:00"), end: h("10:00") }], breaks: [], blockedAllDay: null,
  blockedIntervals: [{ start: h("09:00"), end: h("09:30") }], overrides: [], appointments: [],
};

describe("normalização da planilha", () => {
  it("baseStatusAt ignora exceções e agendamentos", () => {
    const withStuff = { ...input, overrides: [{ start: h("08:00"), end: h("08:30"), status: "BLOQUEADO" as const }],
      appointments: [{ start: h("08:30"), end: h("09:00"), id: "x", status: "CONFIRMADO" }] };
    expect(baseStatusAt(withStuff, h("08:00"))).toBe("DISPONIVEL");
    expect(baseStatusAt(withStuff, h("08:30"))).toBe("DISPONIVEL");
    expect(baseStatusAt(withStuff, h("09:00"))).toBe("BLOQUEADO");
    expect(baseStatusAt(withStuff, h("20:00"))).toBeUndefined();
  });
  const D = { status: "DISPONIVEL" as const, observacao: null };
  const B = { status: "BLOQUEADO" as const, observacao: null };
  it("linha igual ao padrão não gera exceção", () => {
    expect(planSlotOp({ base: "DISPONIVEL", desired: D, hasActiveAppointment: false })).toMatchObject({ kind: "inalterado", op: null });
    expect(planSlotOp({ base: undefined, desired: B, hasActiveAppointment: false })).toMatchObject({ kind: "inalterado", op: null });
  });
  it("voltar ao padrão remove a exceção existente", () => {
    expect(planSlotOp({ base: "DISPONIVEL", existing: { status: "BLOQUEADO", observacao: null }, desired: D, hasActiveAppointment: false }))
      .toMatchObject({ kind: "alterado", op: "delete" });
  });
  it("bloquear horário livre cria exceção", () => {
    expect(planSlotOp({ base: "DISPONIVEL", desired: B, hasActiveAppointment: false })).toMatchObject({ kind: "novo", op: "upsert" });
  });
  it("abrir horário fora da grade cria exceção", () => {
    expect(planSlotOp({ base: undefined, desired: D, hasActiveAppointment: false })).toMatchObject({ kind: "novo", op: "upsert" });
  });
  it("bloquear com agendamento ativo é conflito", () => {
    expect(planSlotOp({ base: "DISPONIVEL", desired: B, hasActiveAppointment: true }).kind).toBe("conflito");
  });
  it("abrir horário dentro de bloqueio (feriado) é conflito", () => {
    expect(planSlotOp({ base: "BLOQUEADO", desired: D, hasActiveAppointment: false }).kind).toBe("conflito");
  });
  it("observação é preservada (não perdida em silêncio)", () => {
    expect(planSlotOp({ base: "DISPONIVEL", desired: { status: "DISPONIVEL", observacao: "encaixe" }, hasActiveAppointment: false }))
      .toMatchObject({ kind: "novo", op: "upsert" });
    expect(planSlotOp({ base: "DISPONIVEL", existing: { status: "DISPONIVEL", observacao: "encaixe" }, desired: { status: "DISPONIVEL", observacao: "encaixe" }, hasActiveAppointment: false }).kind)
      .toBe("inalterado");
    expect(planSlotOp({ base: "DISPONIVEL", existing: { status: "DISPONIVEL", observacao: "a" }, desired: { status: "DISPONIVEL", observacao: "b" }, hasActiveAppointment: false }).kind)
      .toBe("alterado");
  });
});
