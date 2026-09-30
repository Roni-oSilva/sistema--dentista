import { requirePagePermission } from "@/lib/auth/session";
import { ActionForm, Field, SubmitButton } from "@/components/ActionForm";
import { first, type SearchParams } from "@/components/ui";
import { getSettings } from "@/services/settings";
import { availableTimes } from "@/services/booking";
import { createAppointmentAction } from "../actions";
import { isValidYmd } from "@/lib/datetime";
import { uuid } from "@/validators/common";
import { formatPhone } from "@/validators/common";

export const metadata = { title: "Novo agendamento" };

const okUuid = (v?: string) => (v && uuid.safeParse(v).success ? v : undefined);

export default async function NovoAgendamentoPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("appointments.create");
  const sp = await searchParams;
  const procId = okUuid(first(sp.procedimento));
  const proId = okUuid(first(sp.profissional));
  const dataRaw = first(sp.data);
  const data = isValidYmd(dataRaw) ? dataRaw : undefined;
  const horario = first(sp.horario);
  const q = (first(sp.q) ?? "").trim().slice(0, 60);

  const [{ data: procs }, { data: pros }, { data: links }] = await Promise.all([
    staff.db.from("procedures").select("id, nome, duracao_minutos").eq("ativo", true).order("nome"),
    staff.db.from("professionals").select("id, nome").eq("ativo", true).order("nome"),
    staff.db.from("professional_procedures").select("professional_id, procedure_id"),
  ]);
  const allowedPros = (pros ?? []).filter((p) => !procId || (links ?? []).some((l) => l.professional_id === p.id && l.procedure_id === procId));
  const proc = (procs ?? []).find((p) => p.id === procId);

  let times: string[] = [];
  if (proc && proId && data && allowedPros.some((p) => p.id === proId)) {
    times = await availableTimes(staff.db, data, {
      settings: await getSettings(staff.db),
      professionalId: proId,
      durationMin: proc.duracao_minutos,
      aplicarJanela: false,
    });
  }

  let patients: { id: string; nome: string; telefone: string }[] = [];
  if (q.length >= 2) {
    const safe = q.replace(/[%,()]/g, " ");
    const digits = q.replace(/\D/g, "");
    const { data: found } = await staff.db
      .from("patients").select("id, nome, telefone")
      .or(`nome.ilike.%${safe}%${digits.length >= 4 ? `,telefone.ilike.%${digits}%` : ""}`)
      .order("nome").limit(20);
    patients = found ?? [];
  }

  return (
    <div>
      <h1 className="h1">Novo agendamento</h1>
      <form method="get" className="card mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <label className="label" htmlFor="procedimento">Procedimento</label>
          <select id="procedimento" name="procedimento" defaultValue={procId ?? ""} className="input" required>
            <option value="" disabled>Selecione</option>
            {(procs ?? []).map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.duracao_minutos} min)</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="profissional">Profissional</label>
          <select id="profissional" name="profissional" defaultValue={proId ?? ""} className="input" required>
            <option value="" disabled>Selecione</option>
            {allowedPros.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
        <div><label className="label" htmlFor="data">Data</label><input id="data" name="data" type="date" defaultValue={data} className="input" required /></div>
        <div className="flex items-end"><button className="btn">Ver horários</button></div>
        {q && <input type="hidden" name="q" value={q} />}
      </form>

      {proc && proId && data && (
        <div className="card">
          {times.length === 0 ? (
            <p className="alert-info">Nenhum horário livre para este procedimento nesta data.</p>
          ) : (
            <ActionForm action={createAppointmentAction}>
              <input type="hidden" name="procedimento_id" value={proc.id} />
              <input type="hidden" name="profissional_id" value={proId} />
              <input type="hidden" name="data" value={data} />
              <Field label="Horário" name="hora_inicio">
                <select id="hora_inicio" name="hora_inicio" defaultValue={times.includes(horario ?? "") ? horario : times[0]} className="input" required>
                  {times.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>

              <fieldset className="mb-3 rounded border border-gray-300 p-3">
                <legend className="px-1 text-sm font-semibold">Paciente existente</legend>
                <div className="mb-2 flex gap-2">
                  <input form="busca" name="q" defaultValue={q} placeholder="Buscar por nome ou telefone" className="input" />
                  <button form="busca" className="btn btn-secondary">Buscar</button>
                </div>
                <select name="paciente_id" className="input" defaultValue="">
                  <option value="">— Novo paciente (preencha abaixo) —</option>
                  {patients.map((p) => <option key={p.id} value={p.id}>{p.nome} — {formatPhone(p.telefone)}</option>)}
                </select>
              </fieldset>

              <fieldset className="mb-3 rounded border border-gray-300 p-3">
                <legend className="px-1 text-sm font-semibold">Novo paciente</legend>
                <Field label="Nome" name="nome"><input id="nome" name="nome" maxLength={120} className="input" /></Field>
                <Field label="Telefone/WhatsApp" name="telefone"><input id="telefone" name="telefone" type="tel" maxLength={20} className="input" /></Field>
                <Field label="E-mail (opcional)" name="email"><input id="email" name="email" type="email" maxLength={200} className="input" /></Field>
              </fieldset>

              <Field label="Status inicial" name="status">
                <select id="status" name="status" defaultValue="CONFIRMADO" className="input">
                  <option value="CONFIRMADO">CONFIRMADO</option><option value="PENDENTE">PENDENTE</option>
                </select>
              </Field>
              <Field label="Observação" name="observacao"><textarea id="observacao" name="observacao" maxLength={500} rows={2} className="input" /></Field>
              <SubmitButton>Criar agendamento</SubmitButton>
            </ActionForm>
          )}
          {/* formulário separado só para a busca de pacientes (GET), preservando a seleção */}
          <form id="busca" method="get">
            <input type="hidden" name="procedimento" value={proc.id} />
            <input type="hidden" name="profissional" value={proId} />
            <input type="hidden" name="data" value={data} />
          </form>
        </div>
      )}
    </div>
  );
}
