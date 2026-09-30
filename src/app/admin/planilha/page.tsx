import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { Flash, StatusBadge, first, type SearchParams } from "@/components/ui";
import { SubmitButton } from "@/components/ActionForm";
import { getSettings } from "@/services/settings";
import { loadAgendaBundle } from "@/services/agenda-data";
import { sheetRows } from "@/services/schedule";
import { addDays, diffDays, formatBR, isValidYmd, nowInZone } from "@/lib/datetime";
import { hasPermission } from "@/lib/auth/permissions";
import { uuid } from "@/validators/common";
import { deleteSlotAction, saveSlotAction } from "./actions";

export const metadata = { title: "Planilha de disponibilidade" };
const MAX_DAYS = 31;

export default async function PlanilhaPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("availability.manage");
  const sp = await searchParams;
  const settings = await getSettings(staff.db);
  const today = nowInZone(settings.agenda.timezone).date;
  const de = isValidYmd(first(sp.de)) ? first(sp.de)! : today;
  let ate = isValidYmd(first(sp.ate)) ? first(sp.ate)! : addDays(de, 6);
  if (ate < de) ate = de;
  if (diffDays(de, ate) >= MAX_DAYS) ate = addDays(de, MAX_DAYS - 1);

  const { data: pros } = await staff.db.from("professionals").select("id, nome").eq("ativo", true).order("nome");
  const proRaw = first(sp.profissional);
  const pro = (pros ?? []).find((p) => p.id === proRaw && uuid.safeParse(proRaw).success) ?? (pros ?? [])[0];
  if (!pro) return <p className="alert-info">Cadastre um profissional primeiro.</p>;

  const bundle = await loadAgendaBundle(staff.db, pro.id, de, ate, settings.agenda.duracao_padrao_minutos);
  const rows = sheetRows(bundle);
  const filter = (
    <>
      <input type="hidden" name="f_profissional" value={pro.id} />
      <input type="hidden" name="f_de" value={de} />
      <input type="hidden" name="f_ate" value={ate} />
    </>
  );
  const exportHref = `/api/admin/export/agenda?profissional=${pro.id}&de=${de}&ate=${ate}`;

  return (
    <div>
      <h1 className="h1">Planilha de disponibilidade</h1>
      <Flash sp={sp} />
      <p className="mb-3 text-sm text-gray-700">
        Mostra a grade efetiva (regra semanal + exceções + agendamentos). Alterar uma linha cria uma <em>exceção</em> para aquele horário;
        “Restaurar padrão” remove a exceção. OCUPADO vem dos agendamentos e não é editável aqui.
      </p>
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3">
        <div><label className="label" htmlFor="profissional">Profissional</label>
          <select id="profissional" name="profissional" defaultValue={pro.id} className="input">{(pros ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
        <div><label className="label" htmlFor="de">De</label><input id="de" name="de" type="date" defaultValue={de} className="input" /></div>
        <div><label className="label" htmlFor="ate">Até (máx. {MAX_DAYS} dias)</label><input id="ate" name="ate" type="date" defaultValue={ate} className="input" /></div>
        <button className="btn">Atualizar</button>
        {hasPermission(staff.role, "excel.export") && <a href={exportHref} className="btn btn-secondary">Baixar Excel</a>}
        {hasPermission(staff.role, "excel.import") && <Link href="/admin/importar" className="btn btn-secondary">Importar Excel</Link>}
      </form>

      <section className="card mb-4">
        <h2 className="h2">Adicionar / alterar horário</h2>
        <form action={saveSlotAction} className="grid grid-cols-2 gap-2 sm:grid-cols-6">
          {filter}
          <input type="hidden" name="professional_id" value={pro.id} />
          <input name="data" type="date" required defaultValue={de} aria-label="Data" className="input" />
          <input name="hora_inicio" type="time" required aria-label="Horário" className="input" />
          <select name="status" aria-label="Status" className="input"><option>DISPONIVEL</option><option>BLOQUEADO</option></select>
          <input name="observacao" maxLength={300} placeholder="Observação" aria-label="Observação" className="input sm:col-span-2" />
          <SubmitButton>Salvar</SubmitButton>
        </form>
      </section>

      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th>Data</th><th>Horário</th><th>Status</th><th>Profissional</th><th>Observação</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6}>Sem horários no período (verifique a disponibilidade semanal do profissional).</td></tr>}
            {rows.map((r) => (
              <tr key={`${r.data}-${r.hora}`}>
                <td>{formatBR(r.data)}</td>
                <td>{r.hora}</td>
                <td><StatusBadge status={r.status} />{r.origem === "EXCECAO" && <span className="ml-1 text-xs text-gray-600">(exceção)</span>}</td>
                <td>{pro.nome}</td>
                <td colSpan={2}>
                  {r.status === "OCUPADO" ? (
                    <span className="text-xs text-gray-600">Agendamento ativo</span>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <form action={saveSlotAction} className="flex flex-wrap gap-2">
                        {filter}
                        <input type="hidden" name="professional_id" value={pro.id} />
                        <input type="hidden" name="data" value={r.data} />
                        <input type="hidden" name="hora_inicio" value={r.hora} />
                        <select name="status" defaultValue={r.status} aria-label="Status" className="input w-auto"><option>DISPONIVEL</option><option>BLOQUEADO</option></select>
                        <input name="observacao" defaultValue={r.observacao ?? ""} maxLength={300} aria-label="Observação" className="input w-auto" />
                        <SubmitButton className="btn btn-sm">Salvar</SubmitButton>
                      </form>
                      {r.origem === "EXCECAO" && (
                        <form action={deleteSlotAction}>
                          {filter}
                          <input type="hidden" name="professional_id" value={pro.id} />
                          <input type="hidden" name="data" value={r.data} />
                          <input type="hidden" name="hora_inicio" value={r.hora} />
                          <SubmitButton className="btn btn-sm btn-secondary" confirm="Remover a exceção deste horário?">Restaurar padrão</SubmitButton>
                        </form>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
