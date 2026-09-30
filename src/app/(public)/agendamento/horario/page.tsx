import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { parseBookingParams, stepUrl } from "@/lib/booking-flow";
import { Flash, type SearchParams } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { getSettings } from "@/services/settings";
import { availableTimes, loadBookingTarget } from "@/services/booking";
import { WEEKDAYS_PT, formatBR, weekdayOf } from "@/lib/datetime";

export const metadata = { title: "Escolha o horário" };

export default async function HorarioPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const params = parseBookingParams(sp);
  if (!params.procedimento || !params.profissional) redirect("/agendamento/procedimento");
  if (!params.data) redirect(stepUrl("data", params));
  const db = createSupabaseAdminClient();
  let target;
  try {
    target = await loadBookingTarget(db, params.procedimento, params.profissional);
  } catch (e) {
    if (e instanceof AppError) redirect("/agendamento/procedimento");
    throw e;
  }
  const times = await availableTimes(db, params.data, {
    settings: await getSettings(db),
    professionalId: target.professional.id,
    durationMin: target.procedure.duracao_minutos,
    aplicarJanela: true,
  });
  return (
    <div>
      <h1 className="h1">4. Escolha o horário</h1>
      <Flash sp={sp} />
      <p className="mb-3 text-sm">
        {target.procedure.nome} — {target.professional.nome} — {WEEKDAYS_PT[weekdayOf(params.data)]}, {formatBR(params.data)}
      </p>
      {times.length === 0 && <p className="alert-info">Não há horários livres nesta data. Escolha outra data.</p>}
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {times.map((t) => (
          <li key={t}>
            <Link href={stepUrl("dados", { ...params, horario: t })} className="btn btn-secondary w-full">
              {t}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">
        <Link href={stepUrl("data", { ...params, data: undefined })} className="underline">
          Escolher outra data
        </Link>
      </p>
    </div>
  );
}
