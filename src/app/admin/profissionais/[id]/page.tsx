import { notFound } from "next/navigation";
import { requirePagePermission } from "@/lib/auth/session";
import { Flash, type SearchParams } from "@/components/ui";
import { SubmitButton } from "@/components/ActionForm";
import { WEEKDAYS_PT, normalizeTime } from "@/lib/datetime";
import { uuid } from "@/validators/common";
import { addRuleAction, applyDefaultScheduleAction, deleteRuleAction, saveProfessionalAction } from "../actions";

export const metadata = { title: "Profissional" };

export default async function ProfissionalDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const staff = await requirePagePermission("professionals.manage");
  const { id } = await params;
  if (!uuid.safeParse(id).success) notFound();
  const [{ data: p }, { data: procs }, { data: links }, { data: rules }] = await Promise.all([
    staff.db.from("professionals").select("*").eq("id", id).maybeSingle(),
    staff.db.from("procedures").select("id, nome, ativo").order("nome"),
    staff.db.from("professional_procedures").select("procedure_id").eq("professional_id", id),
    staff.db.from("availability_rules").select("*").eq("professional_id", id).order("dia_semana").order("hora_inicio"),
  ]);
  if (!p) notFound();
  const linked = new Set((links ?? []).map((l) => l.procedure_id));
  return (
    <div className="space-y-6">
      <h1 className="h1">{p.nome}</h1>
      <Flash sp={await searchParams} />
      <section className="card max-w-xl">
        <h2 className="h2">Dados</h2>
        <form action={saveProfessionalAction} className="space-y-2">
          <input type="hidden" name="id" value={p.id} />
          <input name="nome" defaultValue={p.nome} required maxLength={120} aria-label="Nome" className="input" />
          <input name="registro_profissional" defaultValue={p.registro_profissional ?? ""} placeholder="Registro profissional" maxLength={40} className="input" />
          <input name="telefone" defaultValue={p.telefone ?? ""} placeholder="Telefone" maxLength={30} className="input" />
          <input name="email" type="email" defaultValue={p.email ?? ""} placeholder="E-mail" maxLength={200} className="input" />
          <fieldset><legend className="text-sm font-semibold">Procedimentos que realiza</legend>
            {(procs ?? []).map((pr) => <label key={pr.id} className="mr-3 inline-block text-sm"><input type="checkbox" name="procedure_ids" value={pr.id} defaultChecked={linked.has(pr.id)} /> {pr.nome}{pr.ativo ? "" : " (inativo)"}</label>)}
          </fieldset>
          <label className="block text-sm"><input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo</label>
          <SubmitButton>Salvar</SubmitButton>
        </form>
      </section>

      <section className="card">
        <h2 className="h2">Disponibilidade semanal</h2>
        <div className="table-wrap mb-3">
          <table className="tbl">
            <thead><tr><th>Dia</th><th>Tipo</th><th>Início</th><th>Fim</th><th /></tr></thead>
            <tbody>
              {(rules ?? []).length === 0 && <tr><td colSpan={5}>Nenhum horário cadastrado: este profissional não tem horários para agendamento.</td></tr>}
              {(rules ?? []).map((r) => (
                <tr key={r.id}><td>{WEEKDAYS_PT[r.dia_semana]}</td><td>{r.tipo === "INTERVALO" ? "Intervalo" : "Atendimento"}</td>
                  <td>{normalizeTime(r.hora_inicio)}</td><td>{normalizeTime(r.hora_fim)}</td>
                  <td><form action={deleteRuleAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="professional_id" value={p.id} /><SubmitButton className="btn btn-sm btn-danger" confirm="Remover este horário?">Remover</SubmitButton></form></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <form action={addRuleAction} className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input type="hidden" name="professional_id" value={p.id} />
          <select name="dia_semana" aria-label="Dia da semana" className="input">{WEEKDAYS_PT.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          <select name="tipo" aria-label="Tipo" className="input"><option value="TRABALHO">Atendimento</option><option value="INTERVALO">Intervalo</option></select>
          <input name="hora_inicio" type="time" required aria-label="Início" className="input" />
          <input name="hora_fim" type="time" required aria-label="Fim" className="input" />
          <SubmitButton>Adicionar</SubmitButton>
        </form>
        <form action={applyDefaultScheduleAction}>
          <input type="hidden" name="professional_id" value={p.id} />
          <SubmitButton className="btn btn-secondary btn-sm" confirm="Isto SUBSTITUI todos os horários semanais deste profissional pelo padrão da clínica. Continuar?">Aplicar horário padrão da clínica</SubmitButton>
        </form>
      </section>
    </div>
  );
}
