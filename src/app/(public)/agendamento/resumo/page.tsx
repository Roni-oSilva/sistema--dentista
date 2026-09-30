import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseBookingParams, readPatientCookie, stepUrl } from "@/lib/booking-flow";
import { ActionForm, SubmitButton } from "@/components/ActionForm";
import type { SearchParams } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { loadBookingTarget } from "@/services/booking";
import { formatBR } from "@/lib/datetime";
import { formatPhone } from "@/validators/common";
import { confirmBooking } from "../actions";

export const metadata = { title: "Resumo" };

export default async function ResumoPage({ searchParams }: { searchParams: SearchParams }) {
  const params = parseBookingParams(await searchParams);
  if (!params.procedimento || !params.profissional || !params.data || !params.horario) redirect("/agendamento/procedimento");
  const patient = await readPatientCookie();
  if (!patient) redirect(stepUrl("dados", params));
  let target;
  try {
    target = await loadBookingTarget(createSupabaseAdminClient(), params.procedimento, params.profissional);
  } catch (e) {
    if (e instanceof AppError) redirect("/agendamento/procedimento");
    throw e;
  }
  return (
    <div>
      <h1 className="h1">6. Resumo</h1>
      <dl className="card mb-4 space-y-1 text-sm">
        <div><dt className="inline font-semibold">Paciente: </dt><dd className="inline">{patient.nome}</dd></div>
        <div><dt className="inline font-semibold">WhatsApp: </dt><dd className="inline">{formatPhone(patient.telefone)}</dd></div>
        <div><dt className="inline font-semibold">Procedimento: </dt><dd className="inline">{target.procedure.nome} ({target.procedure.duracao_minutos} min)</dd></div>
        <div><dt className="inline font-semibold">Profissional: </dt><dd className="inline">{target.professional.nome}</dd></div>
        <div><dt className="inline font-semibold">Data: </dt><dd className="inline">{formatBR(params.data)}</dd></div>
        <div><dt className="inline font-semibold">Horário: </dt><dd className="inline">{params.horario}</dd></div>
      </dl>
      <ActionForm action={confirmBooking}>
        <input type="hidden" name="procedimento" value={params.procedimento} />
        <input type="hidden" name="profissional" value={params.profissional} />
        <input type="hidden" name="data" value={params.data} />
        <input type="hidden" name="horario" value={params.horario} />
        <SubmitButton>Confirmar agendamento</SubmitButton>
      </ActionForm>
      <p className="mt-4 text-sm">
        <Link href={stepUrl("dados", params)} className="underline">
          Corrigir dados
        </Link>
      </p>
    </div>
  );
}
