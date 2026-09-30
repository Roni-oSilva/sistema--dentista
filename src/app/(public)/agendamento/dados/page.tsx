import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseBookingParams, stepUrl } from "@/lib/booking-flow";
import { Stepper } from "@/components/brand";
import { ActionForm, Field, SubmitButton } from "@/components/ActionForm";
import type { SearchParams } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { loadBookingTarget } from "@/services/booking";
import { formatBR } from "@/lib/datetime";
import { submitPatientData } from "../actions";

export const metadata = { title: "Seus dados" };

export default async function DadosPage({ searchParams }: { searchParams: SearchParams }) {
  const params = parseBookingParams(await searchParams);
  if (!params.procedimento || !params.profissional) redirect("/agendamento/procedimento");
  if (!params.data) redirect(stepUrl("data", params));
  if (!params.horario) redirect(stepUrl("horario", params));
  let target;
  try {
    target = await loadBookingTarget(createSupabaseAdminClient(), params.procedimento, params.profissional);
  } catch (e) {
    if (e instanceof AppError) redirect("/agendamento/procedimento");
    throw e;
  }
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <Stepper step={5} />
      <h1 className="h1">Seus dados</h1>
      <p className="mb-4 text-sm lead">
        <b className="text-white">{target.procedure.nome}</b> · {target.professional.nome} · {formatBR(params.data)} às {params.horario}
      </p>
      <div className="card">
        <ActionForm action={submitPatientData}>
          <input type="hidden" name="procedimento" value={params.procedimento} />
          <input type="hidden" name="profissional" value={params.profissional} />
          <input type="hidden" name="data" value={params.data} />
          <input type="hidden" name="horario" value={params.horario} />
          {/* honeypot: invisível para pessoas */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
            <label>
              Não preencha <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
          </div>
          <Field label="Nome completo" name="nome">
            <input id="nome" name="nome" required minLength={2} maxLength={120} autoComplete="name" className="input" />
          </Field>
          <Field label="WhatsApp (com DDD)" name="telefone">
            <input id="telefone" name="telefone" type="tel" required maxLength={20} autoComplete="tel" placeholder="(91) 99999-9999" className="input" />
          </Field>
          <Field label="E-mail (opcional)" name="email">
            <input id="email" name="email" type="email" maxLength={200} autoComplete="email" className="input" />
          </Field>
          <label className="mb-3 flex items-start gap-2 text-sm">
            <input type="checkbox" name="consentimento" required className="mt-1" />
            <span>Concordo em informar meus dados para fins de agendamento e contato pela clínica.</span>
          </label>
          <SubmitButton>Continuar</SubmitButton>
        </ActionForm>
      </div>
      <p className="mt-4 text-sm">
        <Link href={stepUrl("horario", { ...params, horario: undefined })} className="back">
          Voltar
        </Link>
      </p>
    </div>
  );
}
