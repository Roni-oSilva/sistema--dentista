import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseBookingParams, stepUrl } from "@/lib/booking-flow";
import { Stepper } from "@/components/brand";
import { Flash, type SearchParams } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { getSettings } from "@/services/settings";
import { availableDates, loadBookingTarget } from "@/services/booking";
import { WEEKDAYS_PT, formatBR, weekdayOf } from "@/lib/datetime";

export const metadata = { title: "Escolha a data" };

export default async function DataPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const params = parseBookingParams(sp);
  if (!params.procedimento || !params.profissional) redirect("/agendamento/procedimento");
  const db = createSupabaseAdminClient();
  let target;
  try {
    target = await loadBookingTarget(db, params.procedimento, params.profissional);
  } catch (e) {
    if (e instanceof AppError) redirect("/agendamento/procedimento");
    throw e;
  }
  const settings = await getSettings(db);
  const dates = await availableDates(db, {
    settings,
    professionalId: target.professional.id,
    durationMin: target.procedure.duracao_minutos,
    aplicarJanela: true,
  });
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Stepper step={3} />
      <h1 className="h1">Escolha o dia</h1>
      <Flash sp={sp} />
      <p className="mb-4 text-sm lead">
        <b className="text-white">{target.procedure.nome}</b> · {target.professional.nome}
      </p>
      {dates.length === 0 && <p className="alert-info">Não há datas com horários livres nos próximos dias.</p>}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {dates.map((d) => (
          <li key={d}>
            <Link href={stepUrl("horario", { ...params, data: d, horario: undefined })} className="slot">
              {WEEKDAYS_PT[weekdayOf(d)].slice(0, 3)} {formatBR(d)}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-sm">
        <Link href={stepUrl("profissional", { procedimento: params.procedimento })} className="back">
          Voltar
        </Link>
      </p>
    </div>
  );
}
