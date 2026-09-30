import "server-only";
import type { Staff } from "@/lib/auth/session";

/**
 * Registra ação administrativa. Grava com a sessão do próprio usuário (RLS: user_id = auth.uid()),
 * a tabela é append-only. `detalhes` deve conter só o necessário (ids, campos alterados) — nunca PII.
 * Operações críticas de agenda (criar/remarcar/importar) gravam a auditoria DENTRO da transação do banco.
 */
export async function writeAudit(
  staff: Pick<Staff, "id" | "db">,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  detalhes: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await staff.db.from("audit_logs").insert({
    user_id: staff.id,
    acao,
    entidade,
    entidade_id: entidadeId,
    detalhes,
  });
  if (error) console.error("[audit] falha ao registrar", acao, error.code);
}
