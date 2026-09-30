import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { signToken, verifyToken } from "@/lib/signed-token";
import { publicBookingParamsSchema, type PublicBookingParams } from "@/validators/schemas";

export const BASE = "/agendamento";

export function parseBookingParams(sp: Record<string, string | string[] | undefined>): PublicBookingParams {
  const flat = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const r = publicBookingParamsSchema.safeParse(flat);
  return r.success ? r.data : {};
}

export function stepUrl(step: string, params: PublicBookingParams, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...extra })) if (v) q.set(k, v);
  const qs = q.toString();
  return `${BASE}/${step}${qs ? `?${qs}` : ""}`;
}

export interface PatientCookie {
  nome: string;
  telefone: string;
  email: string | null;
}

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/agendamento", maxAge: 1800 };

/** Dados do paciente ficam num cookie assinado e de curta duração (não vão na URL). */
export async function savePatientCookie(p: PatientCookie) {
  (await cookies()).set("bk_patient", signToken(p, env.bookingCookieSecret, 1800), cookieOpts);
}
export async function readPatientCookie(): Promise<PatientCookie | null> {
  return verifyToken<PatientCookie>((await cookies()).get("bk_patient")?.value, env.bookingCookieSecret);
}
export async function saveDoneCookie(appointmentId: string) {
  const store = await cookies();
  store.set("bk_done", signToken({ id: appointmentId }, env.bookingCookieSecret, 1800), cookieOpts);
  store.delete("bk_patient");
}
export async function readDoneCookie(): Promise<string | null> {
  return verifyToken<{ id: string }>((await cookies()).get("bk_done")?.value, env.bookingCookieSecret)?.id ?? null;
}
