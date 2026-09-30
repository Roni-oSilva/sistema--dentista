import type { ReactNode } from "react";
import { readFlash } from "@/lib/flash";

const STATUS_STYLE: Record<string, string> = {
  PENDENTE: "bg-yellow-100 text-yellow-900",
  CONFIRMADO: "bg-blue-100 text-blue-900",
  REALIZADO: "bg-green-100 text-green-900",
  CANCELADO: "bg-red-100 text-red-900",
  NAO_COMPARECEU: "bg-gray-200 text-gray-800",
  DISPONIVEL: "bg-green-100 text-green-900",
  OCUPADO: "bg-blue-100 text-blue-900",
  BLOQUEADO: "bg-red-100 text-red-900",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge ${STATUS_STYLE[status] ?? "bg-gray-100"}`}>{status.replace("_", " ")}</span>;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "ok"; children: ReactNode }) {
  return <p className={`alert-${kind} mb-4`}>{children}</p>;
}

/** Mensagem pós-redirect (assinada em lib/flash.ts; não dá para forjar pela URL). */
export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const f = readFlash(sp);
  if (!f) return null;
  return <Notice kind={f.kind === "erro" ? "error" : "ok"}>{f.msg}</Notice>;
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
