import { requirePagePermission } from "@/lib/auth/session";
import { Flash, type SearchParams } from "@/components/ui";
import { SubmitButton } from "@/components/ActionForm";
import { getSettings } from "@/services/settings";
import { WEEKDAYS_PT } from "@/lib/datetime";
import { saveAgendaAction, saveClinicAction, saveDefaultScheduleAction } from "./actions";

export const metadata = { title: "Configurações" };

export default async function ConfiguracoesPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("settings.manage");
  const s = await getSettings(staff.db);
  const byDay = new Map(s.horarioPadrao.dias.map((d) => [d.dia_semana, d]));
  return (
    <div className="space-y-6">
      <h1 className="h1">Configurações</h1>
      <Flash sp={await searchParams} />

      <section className="card max-w-xl">
        <h2 className="h2">Clínica</h2>
        <form action={saveClinicAction} className="space-y-2">
          <label className="label" htmlFor="nome">Nome</label><input id="nome" name="nome" defaultValue={s.clinica.nome} required maxLength={120} className="input" />
          <label className="label" htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" defaultValue={s.clinica.telefone} maxLength={30} className="input" />
          <label className="label" htmlFor="whatsapp">WhatsApp da clínica (com DDD; recebe a mensagem de agendamento)</label><input id="whatsapp" name="whatsapp" defaultValue={s.clinica.whatsapp} maxLength={20} className="input" />
          <label className="label" htmlFor="endereco">Endereço</label><input id="endereco" name="endereco" defaultValue={s.clinica.endereco} maxLength={300} className="input" />
          <label className="label" htmlFor="horario_funcionamento">Horário de funcionamento (texto exibido no site)</label><input id="horario_funcionamento" name="horario_funcionamento" defaultValue={s.clinica.horario_funcionamento} maxLength={300} className="input" />
          <SubmitButton>Salvar</SubmitButton>
        </form>
      </section>

      <section className="card max-w-xl">
        <h2 className="h2">Agenda</h2>
        <form action={saveAgendaAction} className="space-y-2">
          <label className="label" htmlFor="timezone">Fuso horário da clínica</label><input id="timezone" name="timezone" defaultValue={s.agenda.timezone} required className="input" />
          <label className="label" htmlFor="duracao_padrao_minutos">Duração padrão dos horários (min)</label><input id="duracao_padrao_minutos" name="duracao_padrao_minutos" type="number" min={5} max={240} step={5} defaultValue={s.agenda.duracao_padrao_minutos} className="input" />
          <label className="label" htmlFor="antecedencia_minima_minutos">Antecedência mínima para agendar pelo site (min)</label><input id="antecedencia_minima_minutos" name="antecedencia_minima_minutos" type="number" min={0} defaultValue={s.agenda.antecedencia_minima_minutos} className="input" />
          <label className="label" htmlFor="dias_max_antecedencia">Agendar com até quantos dias de antecedência</label><input id="dias_max_antecedencia" name="dias_max_antecedencia" type="number" min={1} max={365} defaultValue={s.agenda.dias_max_antecedencia} className="input" />
          <p className="text-xs text-muted">Alterar a duração padrão muda a grade de horários futuros. Agendamentos existentes não são afetados.</p>
          <SubmitButton>Salvar</SubmitButton>
        </form>
      </section>

      <section className="card">
        <h2 className="h2">Horário padrão da semana (modelo para novos profissionais)</h2>
        <form action={saveDefaultScheduleAction}>
          <div className="table-wrap"><table className="tbl"><thead><tr><th>Atende</th><th>Dia</th><th>Início</th><th>Fim</th></tr></thead><tbody>
            {WEEKDAYS_PT.map((name, d) => (
              <tr key={d}><td><input type="checkbox" name={`ativo_${d}`} defaultChecked={byDay.has(d)} aria-label={`Atende ${name}`} /></td><td>{name}</td>
                <td><input type="time" name={`inicio_${d}`} defaultValue={byDay.get(d)?.inicio ?? "08:00"} className="input w-auto" /></td>
                <td><input type="time" name={`fim_${d}`} defaultValue={byDay.get(d)?.fim ?? "18:00"} className="input w-auto" /></td></tr>
            ))}</tbody></table></div>
          <div className="my-3 flex flex-wrap items-center gap-2 text-sm">
            Intervalo: <input type="time" name="intervalo_inicio" defaultValue={s.horarioPadrao.intervalo?.inicio ?? ""} className="input w-auto" /> às <input type="time" name="intervalo_fim" defaultValue={s.horarioPadrao.intervalo?.fim ?? ""} className="input w-auto" />
            <span className="text-xs text-muted">(deixe em branco para não ter intervalo)</span>
          </div>
          <SubmitButton>Salvar horário padrão</SubmitButton>
        </form>
      </section>
    </div>
  );
}
