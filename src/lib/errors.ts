import { ZodError } from "zod";
import { unstable_rethrow } from "next/navigation";

export const MESSAGES = {
  SLOT_TAKEN: "Este horário acabou de ser reservado. Escolha outro horário.",
  SLOT_UNAVAILABLE: "Este horário não está mais disponível.",
  FORBIDDEN: "Você não possui permissão para realizar esta ação.",
  UNAUTHENTICATED: "Sua sessão expirou. Entre novamente.",
  NOT_FOUND: "Registro não encontrado.",
  INVALID_FILE: "Arquivo Excel inválido.",
  RATE_LIMITED: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  SAVE_FAILED: "Não foi possível salvar. Tente novamente.",
  BOOKING_FAILED: "Não foi possível salvar o agendamento.",
  INVALID_INPUT: "Dados inválidos. Verifique os campos e tente novamente.",
  CONFLICT: "Esta operação conflita com agendamentos existentes.",
  INVALID_STATE: "Esta operação não é permitida para o estado atual do agendamento.",
  UNKNOWN: "Ocorreu um erro inesperado. Tente novamente.",
} as const;

export type ErrorCode = keyof typeof MESSAGES;

/** Erro "esperado": a mensagem é segura para mostrar ao usuário. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message?: string,
  ) {
    super(message ?? MESSAGES[code]);
    this.name = "AppError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T = undefined>(message?: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}

interface DbErrorLike {
  code?: string;
  message?: string;
}

/** Converte erros do Postgres/PostgREST em AppError. Nunca vaza detalhes internos. */
export function mapDbError(err: DbErrorLike | null | undefined, fallback: ErrorCode = "SAVE_FAILED"): AppError {
  const msg = err?.message ?? "";
  if (msg.includes("SLOT_TAKEN") || err?.code === "23P01") return new AppError("SLOT_TAKEN");
  if (msg.includes("CONFLICT_APPOINTMENT"))
    return new AppError("CONFLICT", "Existe agendamento ativo neste horário. Cancele ou remarque antes de bloqueá-lo.");
  if (msg.includes("INVALID_STATE")) return new AppError("INVALID_STATE");
  if (msg.includes("NOT_FOUND")) return new AppError("NOT_FOUND");
  if (msg.includes("INVALID_INPUT")) return new AppError("INVALID_INPUT");
  if (err?.code === "42501" || msg.includes("FORBIDDEN") || /row-level security/i.test(msg))
    return new AppError("FORBIDDEN");
  if (err?.code === "23505") return new AppError("CONFLICT", "Já existe um registro com estes dados.");
  if (err?.code === "23503")
    return new AppError("CONFLICT", "Este registro está vinculado a outros dados e não pode ser removido.");
  console.error("[db-error]", err?.code, msg);
  return new AppError(fallback);
}

export function throwIfDbError(err: DbErrorLike | null | undefined, fallback: ErrorCode = "SAVE_FAILED"): void {
  if (err) throw mapDbError(err, fallback);
}

export function zodFieldErrors(e: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Converte qualquer exceção em resultado seguro para o usuário (sem stack trace). */
export function toActionError(e: unknown): ActionResult<never> {
  unstable_rethrow(e); // deixa passar redirect()/notFound()
  if (e instanceof ZodError) {
    const fieldErrors = zodFieldErrors(e);
    return { ok: false, error: Object.values(fieldErrors)[0] ?? MESSAGES.INVALID_INPUT, fieldErrors };
  }
  if (e instanceof AppError) return { ok: false, error: e.message };
  console.error("[action-error]", e);
  return { ok: false, error: MESSAGES.UNKNOWN };
}
