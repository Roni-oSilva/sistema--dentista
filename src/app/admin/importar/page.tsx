import { requirePagePermission } from "@/lib/auth/session";
import { ImportClient } from "@/components/ImportClient";
import { formatBR } from "@/lib/datetime";

export const metadata = { title: "Importar Excel" };

export default async function ImportarPage() {
  const staff = await requirePagePermission("excel.import");
  const { data: batches } = await staff.db
    .from("import_batches").select("id, nome_arquivo, status, resumo, criado_em").order("criado_em", { ascending: false }).limit(10);
  return (
    <div className="space-y-6">
      <h1 className="h1">Importar / exportar Excel</h1>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-secondary" href="/api/admin/export/agenda">Baixar Excel da agenda (próximos 30 dias)</a>
        <a className="btn btn-secondary" href="/api/admin/export/agendamentos">Baixar agendamentos</a>
        <a className="btn btn-secondary" href="/api/admin/export/pacientes">Baixar pacientes</a>
      </div>
      <ImportClient />
      <section>
        <h2 className="h2">Últimas importações</h2>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>Data</th><th>Arquivo</th><th>Status</th><th>Novos/Alterados</th></tr></thead><tbody>
          {(batches ?? []).map((b) => (
            <tr key={b.id}><td>{formatBR(String(b.criado_em).slice(0, 10))}</td><td>{b.nome_arquivo}</td><td>{b.status}</td>
              <td>{(b.resumo as { novos?: number })?.novos ?? 0} / {(b.resumo as { alterados?: number })?.alterados ?? 0}</td></tr>
          ))}</tbody></table></div>
      </section>
    </div>
  );
}
