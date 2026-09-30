"use server";

import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { clientIpHash, enforceRateLimit } from "@/lib/rate-limit";
import { AppError, MESSAGES, toActionError, type ActionResult } from "@/lib/errors";
import { formToObject, publicBookingParamsSchema, publicPatientSchema } from "@/validators/schemas";
import { getSettings } from "@/services/settings";
import { availableTimes, createAppointment, loadBookingTarget } from "@/services/booking";
import { readPatientCookie, saveDoneCookie, savePatientCookie, stepUrl } from "@/lib/booking-flow";
import { z } from "zod";

const fullParams = publicBookingParamsSchema.required();

async function assertStillAvailable(p: z.infer<typeof fullParams>) {
  const db = createSupabaseAdminClient();
  const settings = await getSettings(db);
  const { procedure } = await loadBookingTarget(db, p.procedimento, p.profissional);
  const times = await availableTimes(db, p.data, {
    settings,
    professionalId: p.profissional,
    durationMin: procedure.duracao_minutos,
    aplicarJanela: true,
  });
  if (!times.includes(p.horario)) throw new AppError("SLOT_UNAVAILABLE");
  return settings;
}

/** Passo "dados": valida paciente + revalida o horário e segue para o resumo. */
export async function submitPatientData(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let params: z.infer<typeof fullParams>;
  try {
    const raw = formToObject(fd);
    params = fullParams.parse(raw);
    const patient = publicPatientSchema.parse(raw);
    await enforceRateLimit("book-data", await clientIpHash(), 30, 3600);
    await assertStillAvailable(params);
    await savePatientCookie({ nome: patient.nome, telefone: patient.telefone, email: patient.email });
  } catch (e) {
    if (e instanceof AppError && e.code === "SLOT_UNAVAILABLE") {
      const p = publicBookingParamsSchema.safeParse(formToObject(fd));
      redirect(stepUrl("horario", p.success ? { ...p.data, horario: undefined } : {}, { erro: MESSAGES.SLOT_UNAVAILABLE }));
    }
    return toActionError(e);
  }
  redirect(stepUrl("resumo", params));
}

/** Passo "resumo": confirmação definitiva. Toda a validação é refeita aqui, no servidor. */
export async function confirmBooking(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id: string;
  let params: z.infer<typeof fullParams> | null = null;
  try {
    params = fullParams.parse(formToObject(fd));
    const patient = await readPatientCookie();
    if (!patient) throw new AppError("INVALID_INPUT", "Sua sessão de agendamento expirou. Preencha seus dados novamente.");
    await enforceRateLimit("book-confirm", await clientIpHash(), 8, 3600);
    const settings = await assertStillAvailable(params);
    id = await createAppointment(settings, {
      nome: patient.nome,
      telefone: patient.telefone,
      email: patient.email,
      profissionalId: params.profissional,
      procedimentoId: params.procedimento,
      data: params.data,
      horaInicio: params.horario,
      status: "PENDENTE",
      origem: "PUBLICO",
      actorId: null,
    });
    await saveDoneCookie(id);
  } catch (e) {
    if (e instanceof AppError && (e.code === "SLOT_TAKEN" || e.code === "SLOT_UNAVAILABLE") && params) {
      redirect(stepUrl("horario", { ...params, horario: undefined }, { erro: MESSAGES.SLOT_TAKEN }));
    }
    return toActionError(e);
  }
  redirect(`/agendamento/confirmado`);
}
