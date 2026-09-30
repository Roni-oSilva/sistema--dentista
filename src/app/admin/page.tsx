import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { getSettings } from "@/services/settings";
import { listAppointments } from "@/services/appointments";
import { AppointmentTable } from "@/components/AppointmentTable";
import { formatBR, nowInZone } from "@/lib/datetime";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const staff = await requirePagePermission("dashboard.view");
  const settings = await getSettings(staff.db);
  const { date: today } = nowInZone(settings.agenda.timezone);

  const [todayRows, upcoming, pendingFuture] = await Promise.all([
    listAppointments(staff.db, { from: today, to: today, limit: 500 }),
    listAppointments(staff.db, { from: today, limit: 100 }),
    listAppointments(staff.db, { from: today, status: "PENDENTE", limit: 500 }),
  ]);
  const count = (s: string) => todayRows.filter((a) => a.status === s).length;
  const next = upcoming.filter((a) => ["PENDENTE", "CONFIRMADO"].includes(a.status)).slice(0, 10);

  const stats = [
    ["Consultas hoje", todayRows.filter((a) => a.status !== "CANCELADO").length],
    ["Pendentes (hoje em diante)", pendingFuture.length],
    ["Confirmadas hoje", count("CONFIRMADO")],
    ["Realizadas hoje", count("REALIZADO")],
    ["Cancelamentos hoje", count("CANCELADO")],
  ] as const;

  return (
    <div>
      <h1 className="h1">Dashboard — {formatBR(today)}</h1>
      <ul className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, n]) => (
          <li key={label} className="card">
            <p className="text-xs text-gray-600">{label}</p>
            <p className="text-2xl font-bold">{n}</p>
          </li>
        ))}
      </ul>

      <h2 className="h2">Agenda do dia</h2>
      <div className="mb-6">
        <AppointmentTable rows={todayRows} showDate={false} />
      </div>

      <h2 className="h2">Próximos atendimentos</h2>
      <AppointmentTable rows={next} />

      <p className="mt-4 flex flex-wrap gap-2">
        <Link href="/admin/agenda" className="btn btn-secondary">Abrir agenda</Link>
        {hasPermission(staff.role, "appointments.create") && (
          <Link href="/admin/agendamentos/novo" className="btn">Novo agendamento</Link>
        )}
      </p>
    </div>
  );
}
