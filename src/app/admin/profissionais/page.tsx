import Link from "next/link";
import { requirePagePermission } from "@/lib/auth/session";
import { Flash, type SearchParams } from "@/components/ui";
import { SubmitButton } from "@/components/ActionForm";
import { saveProfessionalAction } from "./actions";

export const metadata = { title: "Profissionais" };

export default async function ProfissionaisPage({ searchParams }: { searchParams: SearchParams }) {
  const staff = await requirePagePermission("professionals.manage");
  const [{ data }, { data: procs }] = await Promise.all([
    staff.db.from("professionals").select("id, nome, registro_profissional, ativo").order("nome"),
    staff.db.from("procedures").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  return (
    <div>
      <h1 className="h1">Profissionais</h1>
      <Flash sp={await searchParams} />
      <div className="table-wrap mb-6">
        <table className="tbl">
          <thead><tr><th>Nome</th><th>Registro</th><th>Ativo</th><th /></tr></thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id}><td>{p.nome}</td><td>{p.registro_profissional}</td><td>{p.ativo ? "Sim" : "Não"}</td>
                <td><Link className="underline" href={`/admin/profissionais/${p.id}`}>Editar / disponibilidade</Link></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <section className="card max-w-xl">
        <h2 className="h2">Novo profissional</h2>
        <form action={saveProfessionalAction} className="space-y-2">
          <input name="nome" placeholder="Nome" required maxLength={120} className="input" />
          <input name="registro_profissional" placeholder="Registro profissional (CRO)" maxLength={40} className="input" />
          <input name="telefone" placeholder="Telefone" maxLength={30} className="input" />
          <input name="email" type="email" placeholder="E-mail" maxLength={200} className="input" />
          <fieldset><legend className="text-sm font-semibold">Procedimentos que realiza</legend>
            {(procs ?? []).map((p) => <label key={p.id} className="mr-3 inline-block text-sm"><input type="checkbox" name="procedure_ids" value={p.id} /> {p.nome}</label>)}
          </fieldset>
          <label className="block text-sm"><input type="checkbox" name="ativo" defaultChecked /> Ativo</label>
          <SubmitButton>Criar</SubmitButton>
        </form>
      </section>
    </div>
  );
}
