import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { Flash, StatusBadge, first, type SearchParams } from "@/components/ui";
import { getSettings } from "@/services/settings";
import { loadAgendaBundle, slotsFor } from "@/services/agenda-data";
import { listAppointments } from "@/services/appointments";
import { WEEKDAYS_PT, addDays, formatBR, isValidYmd, nowInZone, normalizeTime, weekdayOf } from "@/lib/datetime";
import { hasPermission } from "@/lib/auth/permissions";
import { uuid } from "@/validators/common";

export const metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("agenda.view");
  const sp = await searchParams;
  const settings = await getSettings(staff.db);
  const today = nowInZone(settings.agenda.timezone).date;
  const dateRaw = first(sp.data);
  const data = isValidYmd(dateRaw) ? dateRaw : today;

  const { data: pros } = await staff.db.from("professionals").select("id, nome").eq("ativo", true).order("nome");
  const proRaw = first(sp.profissional);
  const pro = (pros ?? []).find((p) => p.id === proRaw && uuid.safeParse(proRaw).success) ?? (pros ?? [])[0];

  if (!pro) return <p className="alert-info">Cadastre um profissional para usar a agenda.</p>;

  const [bundle, appts] = await Promise.all([
    loadAgendaBundle(staff.db, pro.id, data, data, settings.agenda.duracao_padrao_minutos),
    listAppointments(staff.db, { from: data, to: data, professionalId: pro.id, limit: 200 }),
  ]);
  const slots = slotsFor(bundle, data);
  const apptById = new Map(appts.map((a) => [a.id, a]));
  const q = (d: string) => `/admin/agenda?data=${d}&profissional=${pro.id}`;

  return (
    <div>
      <h1 className="h1">Agenda — {WEEKDAYS_PT[weekdayOf(data)]}, {formatBR(data)}</h1>
      <Flash sp={sp} />
      <form method="get" className="card mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="profissional">Profissional</label>
          <select id="profissional" name="profissional" defaultValue={pro.id} className="input">{(pros ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        </div>
        <div><label className="label" htmlFor="data">Data</label><input id="data" name="data" type="date" defaultValue={data} className="input" /></div>
        <button className="btn">Ir</button>
        <Link href={q(addDays(data, -1))} className="btn btn-secondary">← Dia anterior</Link>
        <Link href={q(today)} className="btn btn-secondary">Hoje</Link>
        <Link href={q(addDays(data, 1))} className="btn btn-secondary">Próximo dia →</Link>
      </form>

      {slots.length === 0 ? (
        <p className="alert-info">Sem atendimento neste dia para este profissional.</p>
      ) : (
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Horário</th><th>Situação</th><th>Detalhes</th><th /></tr></thead>
            <tbody>
              {slots.map((s) => {
                const a = s.appointmentId ? apptById.get(s.appointmentId) : undefined;
                return (
                  <tr key={s.hora}>
                    <td>{s.hora}</td>
                    <td><StatusBadge status={s.status} /></td>
                    <td>
                      {a ? <>{a.paciente?.nome} — {a.procedimento?.nome} <StatusBadge status={a.status} /></> : s.motivo ?? s.excecao?.observacao ?? ""}
                    </td>
                    <td>
                      {a && <Link className="font-semibold text-royal underline" href={`/admin/agendamentos/${a.id}`}>Abrir</Link>}
                      {!a && s.status === "DISPONIVEL" && hasPermission(staff.role, "appointments.create") && (
                        <Link className="font-semibold text-royal underline" href={`/admin/agendamentos/novo?profissional=${pro.id}&data=${data}&horario=${s.hora}`}>Agendar</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="h2 mt-6">Consultas do dia</h2>
      {appts.filter((a) => a.status !== "CANCELADO").length === 0 ? <p className="alert-info">Nenhuma consulta.</p> : (
        <ul className="list-disc pl-5 text-sm">
          {appts.map((a) => <li key={a.id}>{normalizeTime(a.hora_inicio)}–{normalizeTime(a.hora_fim)} {a.paciente?.nome} ({a.procedimento?.nome}) <StatusBadge status={a.status} /></li>)}
        </ul>
      )}
    </div>
  );
}
