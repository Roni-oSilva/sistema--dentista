import { z } from "zod";
import { isValidTime, isValidYmd, timeToMin } from "@/lib/datetime";

/** Remove caracteres de controle e espaços nas pontas. React já escapa HTML na saída. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export const text = (max: number, min = 0) =>
  z
    .string()
    .transform(cleanText)
    .pipe(z.string().min(min, min > 0 ? "Campo obrigatório" : undefined).max(max, `Máximo de ${max} caracteres`));

export const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? cleanText(v) : ""))
    .pipe(z.string().max(max, `Máximo de ${max} caracteres`))
    .transform((v) => (v === "" ? null : v));

export const uuid = z.string().uuid("Identificador inválido");
export const ymd = z.string().refine(isValidYmd, "Data inválida");
export const hhmm = z
  .string()
  .refine(isValidTime, "Horário inválido")
  .transform((v) => v.slice(0, 5));

/** Checkbox HTML ("on"/"true") -> boolean */
export const checkbox = z
  .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal(""), z.boolean()])
  .optional()
  .transform((v) => v === "on" || v === "true" || v === true);

/** Telefone BR -> só dígitos nacionais (DDD + número), ou null se inválido. */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return d;
}

export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return digits;
}

export const phone = z
  .string()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Telefone inválido. Informe DDD + número." });
      return z.NEVER;
    }
    return n;
  });

export const emailOptional = z
  .string()
  .optional()
  .transform((v) => (v ? cleanText(v).toLowerCase() : ""))
  .pipe(z.union([z.literal(""), z.string().email("E-mail inválido").max(200)]))
  .transform((v) => (v === "" ? null : v));

export function timeRangeValid(start: string, end: string): boolean {
  return timeToMin(end) > timeToMin(start);
}
