import { requirePagePermission } from "@/lib/auth/session";
import { Flash, type SearchParams } from "@/components/ui";
import { SubmitButton } from "@/components/ActionForm";
import { formatBR, normalizeTime } from "@/lib/datetime";
import { addBlockedDateAction, addBlockedPeriodAction, deleteBlockAction } from "./actions";

export const metadata = { title: "Bloqueios" };

export default async function BloqueiosPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("blocks.manage");
  const [{ data: dates }, { data: periods }, { data: pros }] = await Promise.all([
    staff.db.from("blocked_dates").select("id, data, motivo, professional:professionals(nome)").order("data", { ascending: false }).limit(200),
    staff.db.from("blocked_periods").select("id, data_inicio, data_fim, hora_inicio, hora_fim, motivo, professional:professionals(nome)").order("data_inicio", { ascending: false }).limit(200),
    staff.db.from("professionals").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  const proSelect = (
    <select name="professional_id" aria-label="Profissional" className="input" defaultValue="">
      <option value="">Clínica toda</option>
      {(pros ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
    </select>
  );
  const who = (x: unknown) => (x as { nome: string } | null)?.nome ?? "Clínica toda";
  return (
    <div className="space-y-6">
      <h1 className="h1">Bloqueios</h1>
      <Flash sp={await searchParams} />
      <p className="text-sm text-muted">Bloqueios impedem novos agendamentos. Agendamentos já existentes não são cancelados automaticamente: cancele ou remarque-os.</p>

      <section className="card">
        <h2 className="h2">Bloquear dia completo</h2>
        <form action={addBlockedDateAction} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input name="data" type="date" required aria-label="Data" className="input" />
          <input name="motivo" placeholder="Motivo (ex.: feriado)" maxLength={200} className="input" />
          {proSelect}
          <SubmitButton>Bloquear</SubmitButton>
        </form>
      </section>

      <section className="card">
        <h2 className="h2">Bloquear período / horários</h2>
        <form action={addBlockedPeriodAction} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div><label className="label" htmlFor="data_inicio">De</label><input id="data_inicio" name="data_inicio" type="date" required className="input" /></div>
          <div><label className="label" htmlFor="data_fim">Até</label><input id="data_fim" name="data_fim" type="date" required className="input" /></div>
          <div><label className="label" htmlFor="hora_inicio">Hora início (opcional)</label><input id="hora_inicio" name="hora_inicio" type="time" className="input" /></div>
          <div><label className="label" htmlFor="hora_fim">Hora fim (opcional)</label><input id="hora_fim" name="hora_fim" type="time" className="input" /></div>
          <input name="motivo" placeholder="Motivo (ex.: congresso)" maxLength={200} className="input sm:col-span-2" />
          {proSelect}
          <SubmitButton>Bloquear</SubmitButton>
        </form>
        <p className="mt-1 text-xs text-muted">Sem horários = dias inteiros. Com horários = apenas essa faixa em cada dia do período.</p>
      </section>

      <section>
        <h2 className="h2">Dias bloqueados</h2>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>Data</th><th>Motivo</th><th>Quem</th><th /></tr></thead><tbody>
          {(dates ?? []).map((d) => (
            <tr key={d.id}><td>{formatBR(d.data)}</td><td>{d.motivo}</td><td>{who(d.professional)}</td>
              <td><form action={deleteBlockAction}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="tipo" value="data" /><SubmitButton className="btn btn-sm btn-danger" confirm="Remover bloqueio?">Remover</SubmitButton></form></td></tr>
          ))}</tbody></table></div>
      </section>
      <section>
        <h2 className="h2">Períodos bloqueados</h2>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>Período</th><th>Horário</th><th>Motivo</th><th>Quem</th><th /></tr></thead><tbody>
          {(periods ?? []).map((p) => (
            <tr key={p.id}><td>{formatBR(p.data_inicio)} a {formatBR(p.data_fim)}</td>
              <td>{p.hora_inicio ? `${normalizeTime(p.hora_inicio)}–${normalizeTime(p.hora_fim!)}` : "Dia inteiro"}</td><td>{p.motivo}</td><td>{who(p.professional)}</td>
              <td><form action={deleteBlockAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="tipo" value="periodo" /><SubmitButton className="btn btn-sm btn-danger" confirm="Remover bloqueio?">Remover</SubmitButton></form></td></tr>
          ))}</tbody></table></div>
      </section>
    </div>
  );
}
