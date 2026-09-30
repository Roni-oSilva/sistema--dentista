import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/lib/errors";

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function clientIpHash(): Promise<string> {
  const h = await headers();
  // Na Vercel, x-forwarded-for é definido pela plataforma (o primeiro valor é o cliente).
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "desconhecido";
  return hashValue(ip);
}

/**
 * Rate limit persistente no Postgres (funciona em serverless, onde memória não é compartilhada).
 * Lança AppError RATE_LIMITED ao exceder. Em falha do banco, NÃO bloqueia (fail-open) mas registra.
 */
export async function enforceRateLimit(bucket: string, key: string, max: number, windowSeconds: number) {
  const db = createSupabaseAdminClient();
  const { data, error } = await db.rpc("check_rate_limit", {
    p_chave: `${bucket}:${key}`,
    p_max: max,
    p_janela_segundos: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] falha", error.code);
    return;
  }
  if (data === false) throw new AppError("RATE_LIMITED");
}
