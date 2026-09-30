import { requirePagePermission } from "@/lib/auth/session";
import { Flash, type SearchParams } from "@/components/ui";
import { SubmitButton } from "@/components/ActionForm";
import { saveProcedureAction } from "./actions";

export const metadata = { title: "Procedimentos" };

export default async function ProcedimentosPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("procedures.manage");
  const { data } = await staff.db.from("procedures").select("*").order("nome");
  return (
    <div>
      <h1 className="h1">Procedimentos</h1>
      <Flash sp={await searchParams} />
      <p className="mb-3 text-sm text-muted">Procedimentos não são apagados (há histórico de agendamentos): desative-os desmarcando “Ativo”.</p>
      <div className="space-y-3">
        {(data ?? []).map((p) => (
          <form key={p.id} action={saveProcedureAction} className="card grid grid-cols-1 gap-2 sm:grid-cols-6">
            <input type="hidden" name="id" value={p.id} />
            <input name="nome" defaultValue={p.nome} required maxLength={120} aria-label="Nome" className="input sm:col-span-2" />
            <input name="descricao" defaultValue={p.descricao ?? ""} maxLength={500} aria-label="Descrição" className="input sm:col-span-2" />
            <input name="duracao_minutos" type="number" min={5} max={480} step={5} defaultValue={p.duracao_minutos} aria-label="Duração (min)" className="input" />
            <div className="flex items-center gap-2">
              <label className="text-sm"><input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Ativo</label>
              <SubmitButton className="btn btn-sm">Salvar</SubmitButton>
            </div>
          </form>
        ))}
      </div>
      <h2 className="h2 mt-6">Novo procedimento</h2>
      <form action={saveProcedureAction} className="card grid grid-cols-1 gap-2 sm:grid-cols-6">
        <input name="nome" placeholder="Nome" required maxLength={120} className="input sm:col-span-2" />
        <input name="descricao" placeholder="Descrição" maxLength={500} className="input sm:col-span-2" />
        <input name="duracao_minutos" type="number" min={5} max={480} step={5} defaultValue={30} aria-label="Duração (min)" className="input" />
        <div className="flex items-center gap-2"><label className="text-sm"><input type="checkbox" name="ativo" defaultChecked /> Ativo</label><SubmitButton className="btn btn-sm">Criar</SubmitButton></div>
      </form>
    </div>
  );
}
