import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { AppointmentTable } from "@/components/AppointmentTable";
import { Flash, first, type SearchParams } from "@/components/ui";
import { listAppointments } from "@/services/appointments";
import { APPOINTMENT_STATUSES, hasPermission } from "@/lib/auth/permissions";
import { isValidYmd } from "@/lib/datetime";

export const metadata = { title: "Agendamentos" };

export default async function AgendamentosPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("appointments.view");
  const sp = await searchParams;
  const from = isValidYmd(first(sp.de)) ? first(sp.de) : undefined;
  const to = isValidYmd(first(sp.ate)) ? first(sp.ate) : undefined;
  const st = first(sp.status);
  const status = (APPOINTMENT_STATUSES as readonly string[]).includes(st ?? "") ? st : undefined;
  const rows = await listAppointments(staff.db, { from, to, status, desc: !from, limit: 200 });
  return (
    <div>
      <h1 className="h1">Agendamentos</h1>
      <Flash sp={sp} />
      <form method="get" className="card mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div><label className="label" htmlFor="de">De</label><input id="de" name="de" type="date" defaultValue={from} className="input" /></div>
        <div><label className="label" htmlFor="ate">Até</label><input id="ate" name="ate" type="date" defaultValue={to} className="input" /></div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" defaultValue={status ?? ""} className="input">
            <option value="">Todos</option>
            {APPOINTMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button className="btn">Filtrar</button>
          {hasPermission(staff.role, "appointments.create") && <Link href="/admin/agendamentos/novo" className="btn btn-secondary">Novo</Link>}
          {hasPermission(staff.role, "excel.export") && <a href="/api/admin/export/agendamentos" className="btn btn-secondary">Baixar Excel</a>}
        </div>
      </form>
      <AppointmentTable rows={rows} />
      {rows.length >= 200 && <p className="mt-2 text-xs text-gray-600">Mostrando os 200 primeiros. Use os filtros para refinar.</p>}
    </div>
  );
}
