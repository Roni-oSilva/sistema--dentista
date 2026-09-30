import type { AppointmentStatus } from "@/lib/auth/permissions";

export interface ClinicSettings {
  nome: string;
  telefone: string;
  whatsapp: string;
  endereco: string;
  horario_funcionamento: string;
}

export interface AgendaSettings {
  timezone: string;
  duracao_padrao_minutos: number;
  antecedencia_minima_minutos: number;
  dias_max_antecedencia: number;
}

export interface HorarioPadrao {
  dias: { dia_semana: number; inicio: string; fim: string }[];
  intervalo: { inicio: string; fim: string } | null;
}

export interface AppSettings {
  clinica: ClinicSettings;
  agenda: AgendaSettings;
  horarioPadrao: HorarioPadrao;
}

export interface Procedure {
  id: string;
  nome: string;
  descricao: string | null;
  duracao_minutos: number;
  ativo: boolean;
}

export interface Professional {
  id: string;
  nome: string;
  registro_profissional: string | null;
  telefone: string | null;
  email: string | null;
  ativo: boolean;
}

export interface Patient {
  id: string;
  nome: string;
  telefone: string;
  email: string | null;
  observacao: string | null;
  criado_em: string;
}

export interface AppointmentRow {
  id: string;
  paciente_id: string;
  profissional_id: string;
  procedimento_id: string;
  data: string;
  hora_inicio: string;
  hora_fim: string;
  status: AppointmentStatus;
  observacao: string | null;
  origem: "PUBLICO" | "PAINEL";
  paciente: { nome: string; telefone: string } | null;
  profissional: { nome: string } | null;
  procedimento: { nome: string; duracao_minutos: number } | null;
}
