import { z } from "zod";
import { timeToMin } from "@/lib/datetime";
import { checkbox, emailOptional, hhmm, optionalText, phone, text, uuid, ymd } from "./common";

const intFrom = (min: number, max: number, label: string) =>
  z.coerce.number({ error: `${label} inválido` }).int(`${label} deve ser inteiro`).min(min, `${label} mínimo: ${min}`).max(max, `${label} máximo: ${max}`);

const uuidList = z.preprocess(
  (v) => (Array.isArray(v) ? v : v === undefined || v === "" ? [] : [v]),
  z.array(uuid).max(100),
);

const ordered = <T extends { hora_inicio: string; hora_fim: string }>(v: T) =>
  timeToMin(v.hora_fim) > timeToMin(v.hora_inicio);

export const procedureSchema = z.object({
  nome: text(120, 2),
  descricao: optionalText(500),
  duracao_minutos: intFrom(5, 480, "Duração"),
  ativo: checkbox,
});

export const professionalSchema = z.object({
  nome: text(120, 2),
  registro_profissional: optionalText(40),
  telefone: optionalText(30),
  email: emailOptional,
  ativo: checkbox,
  procedure_ids: uuidList,
});

export const patientSchema = z.object({
  nome: text(120, 2),
  telefone: phone,
  email: emailOptional,
  observacao: optionalText(1000),
});

/** Paciente no site público: só o mínimo necessário + consentimento + honeypot anti-bot. */
export const publicPatientSchema = z.object({
  nome: text(120, 2),
  telefone: phone,
  email: emailOptional,
  consentimento: checkbox.refine((v) => v === true, "É necessário concordar com o uso dos dados para agendar."),
  website: z.string().max(0).optional(), // honeypot: humanos não preenchem
});

export const ruleSchema = z
  .object({
    professional_id: uuid,
    dia_semana: intFrom(0, 6, "Dia da semana"),
    tipo: z.enum(["TRABALHO", "INTERVALO"]),
    hora_inicio: hhmm,
    hora_fim: hhmm,
  })
  .refine(ordered, { message: "O horário final deve ser maior que o inicial", path: ["hora_fim"] });

export const blockedDateSchema = z.object({
  data: ymd,
  motivo: optionalText(200),
  professional_id: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
});

export const blockedPeriodSchema = z
  .object({
    data_inicio: ymd,
    data_fim: ymd,
    hora_inicio: z.preprocess((v) => (v === "" ? undefined : v), hhmm.optional()),
    hora_fim: z.preprocess((v) => (v === "" ? undefined : v), hhmm.optional()),
    motivo: optionalText(200),
    professional_id: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  })
  .refine((v) => v.data_fim >= v.data_inicio, { message: "A data final deve ser igual ou posterior à inicial", path: ["data_fim"] })
  .refine((v) => (v.hora_inicio === undefined) === (v.hora_fim === undefined), {
    message: "Informe os dois horários ou nenhum (dia inteiro)",
    path: ["hora_fim"],
  })
  .refine((v) => v.hora_inicio === undefined || v.hora_fim === undefined || timeToMin(v.hora_fim) > timeToMin(v.hora_inicio), {
    message: "O horário final deve ser maior que o inicial",
    path: ["hora_fim"],
  });

export const slotRowSchema = z.object({
  professional_id: uuid,
  data: ymd,
  hora_inicio: hhmm,
  status: z.enum(["DISPONIVEL", "BLOQUEADO"], { error: "Status inválido (use DISPONIVEL ou BLOQUEADO)" }),
  observacao: optionalText(300),
});

export const slotKeySchema = z.object({ professional_id: uuid, data: ymd, hora_inicio: hhmm });

export const appointmentCreateSchema = z.object({
  paciente_id: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()),
  nome: z.preprocess((v) => v ?? "", text(120)),
  telefone: z.preprocess((v) => v ?? "", z.string()),
  email: emailOptional,
  profissional_id: uuid,
  procedimento_id: uuid,
  data: ymd,
  hora_inicio: hhmm,
  status: z.enum(["PENDENTE", "CONFIRMADO"]).default("CONFIRMADO"),
  observacao: optionalText(500),
});

export const rescheduleSchema = z.object({
  id: uuid,
  data: ymd,
  hora_inicio: hhmm,
  profissional_id: uuid,
});

export const statusChangeSchema = z.object({
  id: uuid,
  status: z.enum(["PENDENTE", "CONFIRMADO", "REALIZADO", "CANCELADO", "NAO_COMPARECEU"]),
});

export const appointmentNoteSchema = z.object({ id: uuid, observacao: optionalText(500) });

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres")
  .max(72, "A senha deve ter no máximo 72 caracteres")
  .regex(/[A-Za-z]/, "A senha deve conter letras")
  .regex(/[0-9]/, "A senha deve conter números");

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  password: z.string().min(1, "Informe a senha").max(200),
});

export const changePasswordSchema = z
  .object({ atual: z.string().min(1, "Informe a senha atual"), nova: passwordSchema, confirmar: z.string() })
  .refine((v) => v.nova === v.confirmar, { message: "As senhas não conferem", path: ["confirmar"] });

export const userCreateSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido").max(200),
  nome: text(120, 2),
  role: z.enum(["ADMIN", "SECRETARIA"]),
  password: passwordSchema,
});

export const userUpdateSchema = z.object({
  id: uuid,
  role: z.enum(["ADMIN", "SECRETARIA"]),
  ativo: checkbox,
});

const timezone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "Fuso horário inválido");

export const clinicSettingsSchema = z.object({
  nome: text(120, 2),
  telefone: text(30),
  whatsapp: z.string().transform((v) => v.replace(/\D/g, "")).pipe(z.string().regex(/^(|\d{10,13})$/, "WhatsApp inválido")),
  endereco: text(300),
  horario_funcionamento: text(300),
});

export const agendaSettingsSchema = z.object({
  timezone,
  duracao_padrao_minutos: intFrom(5, 240, "Duração padrão"),
  antecedencia_minima_minutos: intFrom(0, 10080, "Antecedência mínima"),
  dias_max_antecedencia: intFrom(1, 365, "Antecedência máxima (dias)"),
});

export const horarioPadraoSchema = z.object({
  dias: z.array(z.object({ dia_semana: intFrom(0, 6, "Dia"), inicio: hhmm, fim: hhmm })).max(7),
  intervalo: z.object({ inicio: hhmm, fim: hhmm }).nullable(),
});

export const publicBookingParamsSchema = z.object({
  procedimento: uuid.optional(),
  profissional: uuid.optional(),
  data: ymd.optional(),
  horario: hhmm.optional(),
});

export type PublicBookingParams = z.infer<typeof publicBookingParamsSchema>;

/** FormData -> objeto (chaves repetidas viram array; arquivos são ignorados). */
export function formToObject(fd: FormData): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(fd.keys())) {
    const values = fd.getAll(key).filter((v): v is string => typeof v === "string");
    if (values.length === 0) continue;
    out[key] = values.length === 1 ? values[0] : values;
  }
  return out;
}
