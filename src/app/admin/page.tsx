import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { getSettings } from "@/services/settings";
import { listAppointments } from "@/services/appointments";
import { AppointmentTable } from "@/components/AppointmentTable";
import { addDays, formatBR, nowInZone, normalizeTime } from "@/lib/datetime";
import { buildReminder, buildWhatsAppLink } from "@/lib/whatsapp";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const staff = await requirePagePermission("dashboard.view");
  const settings = await getSettings(staff.db);
  const { date: today } = nowInZone(settings.agenda.timezone);

  const tomorrow = addDays(today, 1);
  const [todayRows, upcoming, pendingFuture, tomorrowRows] = await Promise.all([
    listAppointments(staff.db, { from: today, to: today, limit: 500 }),
    listAppointments(staff.db, { from: today, limit: 100 }),
    listAppointments(staff.db, { from: today, status: "PENDENTE", limit: 500 }),
    listAppointments(staff.db, { from: tomorrow, to: tomorrow, limit: 200 }),
  ]);
  const reminders = tomorrowRows.filter((a) => ["PENDENTE", "CONFIRMADO"].includes(a.status));
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
      <h1 className="h1">Hoje, {formatBR(today)}</h1>
      <ul className="stagger mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([label, n]) => (
          <li key={label} className="card">
            <p className="text-xs font-semibold text-muted">{label}</p>
            <p className="display mt-1 text-4xl text-royal">{n}</p>
          </li>
        ))}
      </ul>

      <h2 className="h2">Agenda do dia</h2>
      <div className="mb-6">
        <AppointmentTable rows={todayRows} showDate={false} />
      </div>

      <h2 className="h2">Lembretes de amanhã ({formatBR(tomorrow)})</h2>
      <div className="card mb-6 text-sm">
        {reminders.length === 0 ? (
          <p>Nenhuma consulta amanhã.</p>
        ) : (
          <ul className="space-y-2">
            {reminders.map((a) => {
              const link = a.paciente
                ? buildWhatsAppLink(
                    a.paciente.telefone,
                    buildReminder({
                      clinica: settings.clinica.nome,
                      paciente: a.paciente.nome,
                      procedimento: a.procedimento?.nome ?? "",
                      profissional: a.profissional?.nome ?? "",
                      data: a.data,
                      hora: normalizeTime(a.hora_inicio),
                    }),
                  )
                : null;
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <span>{normalizeTime(a.hora_inicio)} — {a.paciente?.nome} ({a.procedimento?.nome})</span>
                  {link && <a href={link} target="_blank" rel="noopener noreferrer" className="btn btn-sm">Enviar lembrete no WhatsApp</a>}
                </li>
              );
            })}
          </ul>
        )}
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
