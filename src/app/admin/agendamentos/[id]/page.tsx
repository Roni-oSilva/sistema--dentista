import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/session";
import { canSetStatus, APPOINTMENT_STATUSES, hasPermission } from "@/lib/auth/permissions";
import { Flash, StatusBadge, first, type SearchParams } from "@/components/ui";
import { SubmitButton } from "@/components/ActionForm";
import { getAppointment } from "@/services/appointments";
import { getSettings } from "@/services/settings";
import { availableTimes } from "@/services/booking";
import { formatBR, isValidYmd, normalizeTime } from "@/lib/datetime";
import { formatPhone, uuid } from "@/validators/common";
import { buildPatientConfirmation, buildWhatsAppLink } from "@/lib/whatsapp";
import { changeStatusAction, rescheduleAction, updateNoteAction } from "../actions";

export const metadata = { title: "Agendamento" };

export default async function AgendamentoDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const staff = await requirePagePermission("appointments.view");
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const sp = await searchParams;
  const a = await getAppointment(staff.db, id);
  if (!a) notFound();

  const canReschedule = hasPermission(staff.role, "appointments.reschedule") && ["PENDENTE", "CONFIRMADO"].includes(a.status);
  const novaData = isValidYmd(first(sp.data)) ? first(sp.data) : undefined;
  const { data: pros } = canReschedule
    ? await staff.db
        .from("professionals").select("id, nome, professional_procedures!inner(procedure_id)")
        .eq("ativo", true).eq("professional_procedures.procedure_id", a.procedimento_id).order("nome")
    : { data: [] };
  const novoProId = (pros ?? []).find((p) => p.id === first(sp.profissional))?.id ?? a.profissional_id;

  let times: string[] = [];
  if (canReschedule && novaData && a.procedimento) {
    times = await availableTimes(staff.db, novaData, {
      settings: await getSettings(staff.db),
      professionalId: novoProId,
      durationMin: a.procedimento.duracao_minutos,
      aplicarJanela: false,
      ignoreAppointmentId: a.id,
    });
  }
  const waLink = a.paciente
    ? buildWhatsAppLink(
        a.paciente.telefone,
        buildPatientConfirmation({
          clinica: (await getSettings(staff.db)).clinica.nome,
          paciente: a.paciente.nome,
          procedimento: a.procedimento?.nome ?? "",
          profissional: a.profissional?.nome ?? "",
          data: a.data,
          hora: normalizeTime(a.hora_inicio),
        }),
      )
    : null;

  return (
    <div className="space-y-4">
      <h1 className="h1">Agendamento</h1>
      <Flash sp={sp} />
      <div className="card text-sm">
        <p><b>Paciente:</b> <Link className="underline" href={`/admin/pacientes/${a.paciente_id}`}>{a.paciente?.nome}</Link> — {a.paciente && formatPhone(a.paciente.telefone)}{" "}
          {waLink && <a className="btn btn-sm" href={waLink} target="_blank" rel="noopener noreferrer">Enviar confirmação no WhatsApp</a>}</p>
        <p><b>Procedimento:</b> {a.procedimento?.nome} ({a.procedimento?.duracao_minutos} min)</p>
        <p><b>Profissional:</b> {a.profissional?.nome}</p>
        <p><b>Data:</b> {formatBR(a.data)} <b>Horário:</b> {normalizeTime(a.hora_inicio)}–{normalizeTime(a.hora_fim)}</p>
        <p><b>Status:</b> <StatusBadge status={a.status} /> <span className="text-gray-600">(origem: {a.origem})</span></p>
      </div>

      <section className="card">
        <h2 className="h2">Atualizar status</h2>
        <div className="flex flex-wrap gap-2">
          {APPOINTMENT_STATUSES.filter((s) => s !== a.status && canSetStatus(staff.role, s)).map((s) => (
            <form key={s} action={changeStatusAction}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="status" value={s} />
              <SubmitButton className={`btn btn-sm ${s === "CANCELADO" ? "btn-danger" : "btn-secondary"}`} confirm={s === "CANCELADO" ? "Cancelar este agendamento? O horário será liberado." : undefined}>
                {s === "CANCELADO" ? "Cancelar consulta" : `Marcar ${s}`}
              </SubmitButton>
            </form>
          ))}
        </div>
      </section>

      {hasPermission(staff.role, "appointments.edit") && (
        <section className="card">
          <h2 className="h2">Observação</h2>
          <form action={updateNoteAction}>
            <input type="hidden" name="id" value={a.id} />
            <textarea name="observacao" defaultValue={a.observacao ?? ""} maxLength={500} rows={2} className="input mb-2" />
            <SubmitButton className="btn btn-sm">Salvar observação</SubmitButton>
          </form>
        </section>
      )}

      {canReschedule && (
        <section className="card">
          <h2 className="h2">Remarcar</h2>
          <form method="get" className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="profissional">Profissional</label>
              <select id="profissional" name="profissional" defaultValue={novoProId} className="input">
                {(pros ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div><label className="label" htmlFor="data">Nova data</label><input id="data" name="data" type="date" defaultValue={novaData} required className="input" /></div>
            <div className="flex items-end"><button className="btn btn-secondary">Ver horários</button></div>
          </form>
          {novaData && (times.length === 0 ? (
            <p className="alert-info">Sem horários livres em {formatBR(novaData)}.</p>
          ) : (
            <form action={rescheduleAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="data" value={novaData} />
              <input type="hidden" name="profissional_id" value={novoProId} />
              <div>
                <label className="label" htmlFor="hora_inicio">Novo horário</label>
                <select id="hora_inicio" name="hora_inicio" className="input">{times.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <SubmitButton>Remarcar</SubmitButton>
            </form>
          ))}
        </section>
      )}
    </div>
  );
}
