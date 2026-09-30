/**
 * Datas da agenda são SEMPRE strings "YYYY-MM-DD" e horas "HH:MM" (horário de parede da clínica).
 * Nunca use `new Date("2026-10-07")` para datas da agenda: isso é interpretado como UTC e pode
 * aparecer como 06/10 no Brasil. Todo cálculo aqui é feito em UTC sobre os componentes da string.
 */

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function isValidYmd(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const m = YMD_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 2000 || y > 2100) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtc(ymd: string): Date {
  const m = YMD_RE.exec(ymd);
  if (!m) throw new Error("Data inválida");
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado */
export function weekdayOf(ymd: string): number {
  return toUtc(ymd).getUTCDay();
}

export function addDays(ymd: string, n: number): string {
  const d = toUtc(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return fromUtc(d);
}

export function diffDays(a: string, b: string): number {
  return Math.round((toUtc(b).getTime() - toUtc(a).getTime()) / 86_400_000);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isValidTime(s: unknown): s is string {
  return typeof s === "string" && TIME_RE.test(s);
}

/** "HH:MM" ou "HH:MM:SS" -> minutos desde 00:00 */
export function timeToMin(t: string): number {
  const m = TIME_RE.exec(t);
  if (!m) throw new Error("Horário inválido");
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minToTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "14:30:00" (formato do Postgres) -> "14:30" */
export function normalizeTime(t: string): string {
  return minToTime(timeToMin(t));
}

/** "2026-10-07" -> "07/10/2026" */
export function formatBR(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** Aceita "07/10/2026", "7/10/2026" e "2026-10-07". Retorna null se inválida. */
export function parseBR(s: string): string | null {
  const t = s.trim();
  if (isValidYmd(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const ymd = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isValidYmd(ymd) ? ymd : null;
}

export const WEEKDAYS_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;

/** Data e hora "de parede" agora no fuso da clínica. */
export function nowInZone(timeZone: string, now: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
