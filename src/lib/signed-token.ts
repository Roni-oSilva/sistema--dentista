import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Token assinado (HMAC-SHA256) com expiração, para o cookie do fluxo de agendamento.
 * Formato: base64url(payload).base64url(assinatura). O conteúdo NÃO é secreto, apenas íntegro.
 */
export function signToken(payload: unknown, secret: string, ttlSeconds: number, now = Date.now()): string {
  const body = Buffer.from(JSON.stringify({ p: payload, exp: Math.floor(now / 1000) + ttlSeconds })).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken<T>(token: string | undefined, secret: string, now = Date.now()): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as { p: T; exp: number };
    if (typeof parsed.exp !== "number" || parsed.exp < Math.floor(now / 1000)) return null;
    return parsed.p;
  } catch {
    return null;
  }
}
