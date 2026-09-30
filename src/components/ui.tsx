import type { ReactNode } from "react";

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

/** Lê mensagem de erro/sucesso vinda por querystring (redirects de ações). Texto sempre escapado pelo React. */
export function flash(sp: Record<string, string | string[] | undefined>) {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return { erro: first(sp.erro), ok: first(sp.ok) };
}

export function Flash({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { erro, ok } = flash(sp);
  return (
    <>
      {erro && <Notice kind="error">{erro.slice(0, 300)}</Notice>}
      {ok && <Notice kind="ok">{ok.slice(0, 300)}</Notice>}
    </>
  );
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
