import { requirePagePermission } from "@/lib/auth/session";
import { first, type SearchParams } from "@/components/ui";
import { getSettings } from "@/services/settings";

export const metadata = { title: "Auditoria" };

export default async function AuditoriaPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("audit.view");
  const acao = (first((await searchParams).acao) ?? "").replace(/[^A-Z_]/g, "").slice(0, 60);
  let q = staff.db.from("audit_logs").select("id, acao, entidade, entidade_id, detalhes, criado_em, usuario:profiles(nome)").order("id", { ascending: false }).limit(200);
  if (acao) q = q.eq("acao", acao);
  const [{ data }, settings] = await Promise.all([q, getSettings(staff.db)]);
  return (
    <div>
      <h1 className="h1">Auditoria</h1>
      <form method="get" className="card mb-4 flex gap-2"><input name="acao" defaultValue={acao} placeholder="Filtrar por ação (ex.: CANCELAR_AGENDAMENTO)" className="input max-w-sm" /><button className="btn">Filtrar</button></form>
      <div className="table-wrap"><table className="tbl"><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Detalhes</th></tr></thead><tbody>
        {(data ?? []).map((l) => (
          <tr key={l.id}>
            <td>{new Date(l.criado_em).toLocaleString("pt-BR", { timeZone: settings.agenda.timezone })}</td>
            <td>{(l.usuario as unknown as { nome: string } | null)?.nome ?? "(público/sistema)"}</td>
            <td>{l.acao}</td><td>{l.entidade}{l.entidade_id ? ` ${String(l.entidade_id).slice(0, 8)}` : ""}</td>
            <td className="max-w-xs break-words text-xs">{JSON.stringify(l.detalhes)}</td>
          </tr>
        ))}</tbody></table></div>
    </div>
  );
}
