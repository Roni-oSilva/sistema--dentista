import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/permissions";
import { AppointmentTable } from "@/components/AppointmentTable";
import { Flash, type SearchParams } from "@/components/ui";
import { SubmitButton } from "@/components/ActionForm";
import { listAppointments } from "@/services/appointments";
import { formatPhone, uuid } from "@/validators/common";
import { updatePatientAction } from "../actions";

export const metadata = { title: "Paciente" };

export default async function PacienteDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const staff = await requirePagePermission("patients.view");
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const { data: p } = await staff.db.from("patients").select("id, nome, telefone, email, observacao").eq("id", id).maybeSingle();
  if (!p) notFound();
  const history = await listAppointments(staff.db, { patientId: id, desc: true, limit: 200 });
  const canEdit = hasPermission(staff.role, "patients.edit");
  return (
    <div className="space-y-4">
      <h1 className="h1">{p.nome}</h1>
      <Flash sp={await searchParams} />
      <section className="card max-w-md">
        <h2 className="h2">Dados</h2>
        {canEdit ? (
          <form action={updatePatientAction}>
            <input type="hidden" name="id" value={p.id} />
            <label className="label" htmlFor="nome">Nome</label><input id="nome" name="nome" defaultValue={p.nome} required maxLength={120} className="input mb-2" />
            <label className="label" htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" defaultValue={formatPhone(p.telefone)} required maxLength={20} className="input mb-2" />
            <label className="label" htmlFor="email">E-mail</label><input id="email" name="email" type="email" defaultValue={p.email ?? ""} maxLength={200} className="input mb-2" />
            <label className="label" htmlFor="observacao">Observação</label><textarea id="observacao" name="observacao" defaultValue={p.observacao ?? ""} maxLength={1000} rows={2} className="input mb-2" />
            <SubmitButton>Salvar</SubmitButton>
          </form>
        ) : (
          <dl className="text-sm"><p>Telefone: {formatPhone(p.telefone)}</p><p>E-mail: {p.email ?? "—"}</p><p>Observação: {p.observacao ?? "—"}</p></dl>
        )}
      </section>
      <section>
        <h2 className="h2">Histórico de agendamentos</h2>
        <AppointmentTable rows={history} />
      </section>
    </div>
  );
}
