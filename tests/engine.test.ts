import { describe, expect, it } from "vitest";
import { computeDaySlots, startsForDuration, minStartFor, type DayInput } from "@/lib/agenda/engine";
import { minToTime } from "@/lib/datetime";

const h = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const iv = (a: string, b: string) => ({ start: h(a), end: h(b) });

const base = (over: Partial<DayInput> = {}): DayInput => ({
  slotMinutes: 30,
  work: [iv("08:00", "18:00")],
  breaks: [iv("12:00", "14:00")],
  blockedAllDay: null,
  blockedIntervals: [],
  overrides: [],
  appointments: [],
  ...over,
});
const starts = (slots: ReturnType<typeof computeDaySlots>, d: number, minStart = 0) =>
  startsForDuration(slots, d, minStart).map(minToTime);

describe("disponibilidade", () => {
  it("gera a grade respeitando o intervalo", () => {
    const slots = computeDaySlots(base());
    expect(slots[0].hora).toBe("08:00");
    expect(slots.at(-1)!.hora).toBe("17:30");
    expect(slots.find((s) => s.hora === "12:00")).toBeUndefined();
    expect(slots.find((s) => s.hora === "13:30")).toBeUndefined();
    expect(slots.find((s) => s.hora === "14:00")).toBeDefined();
    expect(slots.every((s) => s.status === "DISPONIVEL")).toBe(true);
  });

  it("dia sem regra não tem horários (sábado/domingo)", () => {
    expect(computeDaySlots(base({ work: [], breaks: [] }))).toEqual([]);
  });

  it("procedimento de 60min não atravessa o intervalo", () => {
    const s = computeDaySlots(base());
    const t = starts(s, 60);
    expect(t).toContain("11:00");
    expect(t).not.toContain("11:30"); // 11:30-12:30 cruza o intervalo
    expect(t).not.toContain("12:00");
    expect(t).toContain("14:00");
    expect(t).not.toContain("17:30"); // terminaria 18:30
    expect(starts(s, 30)).toContain("11:30");
  });

  it("agendamento torna OCUPADO e impede sobreposição por duração", () => {
    const s = computeDaySlots(base({ appointments: [{ ...iv("09:00", "10:00"), id: "a", status: "CONFIRMADO" }] }));
    expect(s.find((x) => x.hora === "09:00")!.status).toBe("OCUPADO");
    expect(s.find((x) => x.hora === "09:30")!.status).toBe("OCUPADO");
    expect(s.find((x) => x.hora === "10:00")!.status).toBe("DISPONIVEL");
    expect(starts(s, 30)).not.toContain("09:00");
    expect(starts(s, 60)).not.toContain("08:30"); // 08:30-09:30 bate no agendado
    expect(starts(s, 60)).toContain("10:00");
    expect(starts(s, 60)).toContain("08:00");
  });

  it("CANCELADO e NAO_COMPARECEU liberam o horário", () => {
    for (const status of ["CANCELADO", "NAO_COMPARECEU"]) {
      const s = computeDaySlots(base({ appointments: [{ ...iv("09:00", "09:30"), id: "a", status }] }));
      expect(s.find((x) => x.hora === "09:00")!.status).toBe("DISPONIVEL");
    }
  });

  it("dia inteiro bloqueado (feriado)", () => {
    const s = computeDaySlots(base({ blockedAllDay: { motivo: "Feriado" } }));
    expect(s.every((x) => x.status === "BLOQUEADO")).toBe(true);
    expect(s[0].motivo).toBe("Feriado");
    expect(starts(s, 30)).toEqual([]);
  });

  it("bloqueio parcial de horário", () => {
    const s = computeDaySlots(base({ blockedIntervals: [{ ...iv("15:00", "16:00"), motivo: "Reunião" }] }));
    expect(s.find((x) => x.hora === "15:00")!.status).toBe("BLOQUEADO");
    expect(s.find((x) => x.hora === "15:30")!.status).toBe("BLOQUEADO");
    expect(s.find((x) => x.hora === "16:00")!.status).toBe("DISPONIVEL");
    expect(starts(s, 60)).not.toContain("14:30");
  });

  it("exceção BLOQUEADO fecha horário da regra; exceção DISPONIVEL abre horário fora da regra", () => {
    const s = computeDaySlots(
      base({
        overrides: [
          { ...iv("09:00", "09:30"), status: "BLOQUEADO", observacao: "Manutenção" },
          { ...iv("18:00", "18:30"), status: "DISPONIVEL" },
          { ...iv("12:00", "12:30"), status: "DISPONIVEL" },
        ],
      }),
    );
    expect(s.find((x) => x.hora === "09:00")!.status).toBe("BLOQUEADO");
    expect(s.find((x) => x.hora === "09:00")!.origem).toBe("REGRA");
    expect(s.find((x) => x.hora === "09:00")!.excecao?.status).toBe("BLOQUEADO");
    expect(s.find((x) => x.hora === "18:00")!.status).toBe("DISPONIVEL");
    expect(s.find((x) => x.hora === "18:00")!.origem).toBe("EXCECAO");
    expect(s.find((x) => x.hora === "12:00")!.status).toBe("DISPONIVEL"); // abriu dentro do intervalo
  });

  it("bloqueio por tabela vence exceção DISPONIVEL", () => {
    const s = computeDaySlots(base({ blockedAllDay: {}, overrides: [{ ...iv("18:00", "18:30"), status: "DISPONIVEL" }] }));
    expect(s.find((x) => x.hora === "18:00")!.status).toBe("BLOQUEADO");
  });

  it("OCUPADO tem precedência de exibição sobre BLOQUEADO (agendamento já existente)", () => {
    const s = computeDaySlots(base({ blockedAllDay: {}, appointments: [{ ...iv("09:00", "09:30"), id: "a", status: "PENDENTE" }] }));
    expect(s.find((x) => x.hora === "09:00")!.status).toBe("OCUPADO");
    expect(starts(s, 30)).toEqual([]);
  });

  it("antecedência mínima e janela máxima", () => {
    const w = { today: "2026-10-07", nowMinutes: 14 * 60, antecedenciaMinimaMin: 60, diasMaxAntecedencia: 30, aplicar: true };
    expect(minStartFor("2026-10-06", w)).toBe(Infinity);
    expect(minStartFor("2026-10-07", w)).toBe(15 * 60);
    expect(minStartFor("2026-10-08", w)).toBe(0);
    expect(minStartFor("2026-11-07", w)).toBe(Infinity);
    expect(minStartFor("2026-10-06", { ...w, aplicar: false })).toBe(0);
    const s = computeDaySlots(base());
    expect(starts(s, 30, 15 * 60)[0]).toBe("15:00");
  });

  it("slot de 45min e procedimento de 30min", () => {
    const s = computeDaySlots(base({ slotMinutes: 45, work: [iv("08:00", "10:15")], breaks: [] }));
    expect(s.map((x) => x.hora)).toEqual(["08:00", "08:45", "09:30"]);
    expect(starts(s, 30)).toEqual(["08:00", "08:45", "09:30"]);
    expect(starts(s, 60)).toEqual(["08:00", "08:45"]);
  });
});
