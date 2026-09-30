import "server-only";
import { env } from "@/lib/env";
import { signToken, verifyToken } from "@/lib/signed-token";

/**
 * Mensagens de sucesso/erro exibidas após redirect. Vão assinadas (HMAC) e com validade curta:
 * ninguém consegue montar um link que faça o painel exibir um texto arbitrário.
 */
const TTL_SECONDS = 120;

export type FlashKind = "ok" | "erro";

export function flashToken(kind: FlashKind, msg: string): string {
  return signToken({ k: kind, m: msg.slice(0, 300) }, env.bookingCookieSecret, TTL_SECONDS);
}

/** Trecho de querystring: "f=<token>" */
export function flashParam(kind: FlashKind, msg: string): string {
  return `f=${encodeURIComponent(flashToken(kind, msg))}`;
}

export function readFlash(sp: Record<string, string | string[] | undefined>): { kind: FlashKind; msg: string } | null {
  const raw = Array.isArray(sp.f) ? sp.f[0] : sp.f;
  const p = verifyToken<{ k: FlashKind; m: string }>(raw, env.bookingCookieSecret);
  if (!p || (p.k !== "ok" && p.k !== "erro") || typeof p.m !== "string") return null;
  return { kind: p.k, msg: p.m };
}
