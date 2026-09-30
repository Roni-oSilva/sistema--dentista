import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseBookingParams, stepUrl } from "@/lib/booking-flow";
import { Arrow, Stepper } from "@/components/brand";
import type { SearchParams } from "@/components/ui";

export const metadata = { title: "Escolha o profissional" };

export default async function ProfissionalPage({ searchParams }: { searchParams: SearchParams }) {
  const params = parseBookingParams(await searchParams);
  if (!params.procedimento) redirect("/agendamento/procedimento");
  const db = createSupabaseAdminClient();
  const { data: proc } = await db.from("procedures").select("id, nome").eq("id", params.procedimento).eq("ativo", true).maybeSingle();
  if (!proc) redirect("/agendamento/procedimento");
  const { data: pros } = await db
    .from("professionals")
    .select("id, nome, professional_procedures!inner(procedure_id)")
    .eq("ativo", true)
    .eq("professional_procedures.procedure_id", proc.id)
    .order("nome");
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Stepper step={2} />
      <h1 className="h1">Com qual profissional?</h1>
      <p className="mb-4 text-sm text-muted">Procedimento: <b className="text-ink">{proc.nome}</b></p>
      {(pros ?? []).length === 0 && <p className="alert-info">Nenhum profissional disponível para este procedimento.</p>}
      <ul className="space-y-2">
        {(pros ?? []).map((p) => (
          <li key={p.id}>
            <Link href={stepUrl("data", { procedimento: proc.id, profissional: p.id })} className="opt">
              <span className="opt-title">{p.nome}</span>
              <Arrow />
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm">
        <Link href="/agendamento/procedimento" className="font-semibold text-royal underline">
          Voltar
        </Link>
      </p>
    </div>
  );
}
