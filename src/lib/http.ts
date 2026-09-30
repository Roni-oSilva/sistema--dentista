import "server-only";
import { NextResponse } from "next/server";
import { AppError, MESSAGES, toActionError } from "@/lib/errors";

/** Rejeita POSTs de outra origem (defesa extra contra CSRF além do cookie SameSite). */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) throw new AppError("FORBIDDEN");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new AppError("FORBIDDEN");
  }
  if (originHost !== host) throw new AppError("FORBIDDEN");
}

/** Converte exceção em resposta JSON segura (sem stack trace). */
export function errorResponse(e: unknown) {
  const r = toActionError(e);
  const code = e instanceof AppError ? e.code : "UNKNOWN";
  const status = code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "RATE_LIMITED" ? 429 : code === "UNKNOWN" ? 500 : 400;
  return NextResponse.json({ ok: false, error: r.ok ? MESSAGES.UNKNOWN : r.error }, { status });
}
