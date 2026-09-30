import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stepUrl } from "@/lib/booking-flow";

export const metadata = { title: "Escolha o procedimento" };

export default async function ProcedimentoPage() {
  const db = createSupabaseAdminClient();
  // só procedimentos ativos que algum profissional ativo realiza
  const { data: procs } = await db
    .from("procedures")
    .select("id, nome, descricao, duracao_minutos, professional_procedures!inner(professionals!inner(ativo))")
    .eq("ativo", true)
    .eq("professional_procedures.professionals.ativo", true)
    .order("nome");
  return (
    <div>
      <h1 className="h1">1. Escolha o procedimento</h1>
      {(procs ?? []).length === 0 && <p className="alert-info">Nenhum procedimento disponível no momento.</p>}
      <ul className="space-y-2">
        {(procs ?? []).map((p) => (
          <li key={p.id} className="card">
            <Link href={stepUrl("profissional", { procedimento: p.id })} className="font-semibold underline">
              {p.nome}
            </Link>{" "}
            <span className="text-sm text-gray-600">({p.duracao_minutos} min)</span>
            {p.descricao && <p className="text-sm text-gray-700">{p.descricao}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
