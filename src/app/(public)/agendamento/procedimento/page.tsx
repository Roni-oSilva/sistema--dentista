import Link from "next/link";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stepUrl } from "@/lib/booking-flow";
import { Arrow, Stepper } from "@/components/brand";

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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Stepper step={1} />
      <h1 className="h1">Qual procedimento você precisa?</h1>
      {(procs ?? []).length === 0 && <p className="alert-info">Nenhum procedimento disponível no momento.</p>}
      <ul className="space-y-2">
        {(procs ?? []).map((p) => (
          <li key={p.id}>
            <Link href={stepUrl("profissional", { procedimento: p.id })} className="opt">
              <span>
                <span className="opt-title block">{p.nome}</span>
                <span className="text-sm text-muted">{p.duracao_minutos} min{p.descricao ? ` · ${p.descricao}` : ""}</span>
              </span>
              <Arrow />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
