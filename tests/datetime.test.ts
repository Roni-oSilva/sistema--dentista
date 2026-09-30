import { describe, expect, it } from "vitest";
import { addDays, diffDays, eachDay, formatBR, isValidYmd, nowInZone, parseBR, weekdayOf, minToTime, timeToMin, normalizeTime } from "@/lib/datetime";

describe("datas e fuso", () => {
  it("07/10/2026 nunca vira 06/10 (independente do fuso do processo)", () => {
    expect(formatBR("2026-10-07")).toBe("07/10/2026");
    expect(parseBR("07/10/2026")).toBe("2026-10-07");
    expect(addDays("2026-10-07", 0)).toBe("2026-10-07");
    expect(weekdayOf("2026-10-07")).toBe(3); // quarta
    expect(weekdayOf("2026-10-12")).toBe(1); // segunda (feriado do exemplo)
  });
  it("valida datas reais", () => {
    expect(isValidYmd("2026-02-29")).toBe(false);
    expect(isValidYmd("2028-02-29")).toBe(true);
    expect(isValidYmd("2026-13-01")).toBe(false);
    expect(isValidYmd("07/10/2026")).toBe(false);
    expect(parseBR("31/04/2026")).toBeNull();
    expect(parseBR("7/1/2026")).toBe("2026-01-07");
  });
  it("aritmética de dias atravessa mês/ano", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-10-07", "2026-10-20")).toBe(13);
    expect(eachDay("2026-10-20", "2026-10-22")).toEqual(["2026-10-20", "2026-10-21", "2026-10-22"]);
  });
  it("horas", () => {
    expect(timeToMin("14:30")).toBe(870);
    expect(timeToMin("14:30:00")).toBe(870);
    expect(minToTime(870)).toBe("14:30");
    expect(normalizeTime("09:05:00")).toBe("09:05");
    expect(() => timeToMin("25:00")).toThrow();
  });
  it("'agora' é calculado no fuso da clínica", () => {
    // 2026-10-08 01:30 UTC = 2026-10-07 22:30 em São Paulo (UTC-3)
    const now = new Date("2026-10-08T01:30:00Z");
    expect(nowInZone("America/Sao_Paulo", now)).toEqual({ date: "2026-10-07", minutes: 22 * 60 + 30 });
    expect(nowInZone("UTC", now)).toEqual({ date: "2026-10-08", minutes: 90 });
  });
});
