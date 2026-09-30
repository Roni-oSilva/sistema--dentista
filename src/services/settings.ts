import type { SupabaseClient } from "@supabase/supabase-js";
import { agendaSettingsSchema, clinicSettingsSchema, horarioPadraoSchema } from "@/validators/schemas";
import type { AppSettings } from "@/types";

export const DEFAULT_SETTINGS: AppSettings = {
  clinica: { nome: "Clínica Odontológica", telefone: "", whatsapp: "", endereco: "", horario_funcionamento: "" },
  agenda: { timezone: "America/Sao_Paulo", duracao_padrao_minutos: 30, antecedencia_minima_minutos: 60, dias_max_antecedencia: 60 },
  horarioPadrao: { dias: [], intervalo: null },
};

/** Lê as configurações; valores ausentes/inválidos caem no padrão (nunca quebra a agenda). */
export async function getSettings(db: SupabaseClient): Promise<AppSettings> {
  const { data } = await db.from("system_settings").select("chave, valor");
  const byKey = new Map((data ?? []).map((r) => [r.chave as string, r.valor]));
  const clinica = clinicSettingsSchema.safeParse(byKey.get("clinica"));
  const agenda = agendaSettingsSchema.safeParse(byKey.get("agenda"));
  const horario = horarioPadraoSchema.safeParse(byKey.get("horario_padrao"));
  return {
    clinica: clinica.success ? clinica.data : DEFAULT_SETTINGS.clinica,
    agenda: agenda.success ? agenda.data : DEFAULT_SETTINGS.agenda,
    horarioPadrao: horario.success ? horario.data : DEFAULT_SETTINGS.horarioPadrao,
  };
}

/** Somente o que o site público pode ver. */
export function publicClinicInfo(s: AppSettings) {
  const { nome, telefone, whatsapp, endereco, horario_funcionamento } = s.clinica;
  return { nome, telefone, whatsapp, endereco, horario_funcionamento };
}
