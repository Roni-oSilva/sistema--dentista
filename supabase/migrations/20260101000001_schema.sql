-- =====================================================================
-- Sistema de agendamento odontológico — esquema base
-- Convenções:
--   * Datas/horários da agenda são "horário de parede" da clínica:
--     colunas `date` e `time` SEM fuso. O fuso (system_settings.timezone)
--     só é usado para saber "agora/hoje". Isso evita o bug 07/10 -> 06/10.
--   * Nada de dados da agenda é apagado fisicamente (cancelamento = status).
-- =====================================================================

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------- utilitário ----------
create or replace function public.set_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end $$;

-- ---------- perfis / papéis ----------
create table public.roles (
  codigo text primary key,
  descricao text not null
);
insert into public.roles (codigo, descricao) values
  ('ADMIN', 'Administrador: acesso total'),
  ('SECRETARIA', 'Secretaria: agenda, agendamentos e pacientes');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  role text not null references public.roles (codigo),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create trigger trg_profiles_upd before update on public.profiles
  for each row execute function public.set_atualizado_em();

-- ---------- profissionais ----------
create table public.professionals (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  registro_profissional text check (char_length(registro_profissional) <= 40),
  telefone text check (char_length(telefone) <= 30),
  email text check (char_length(email) <= 200),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index professionals_nome_uq on public.professionals (lower(btrim(nome)));
create trigger trg_professionals_upd before update on public.professionals
  for each row execute function public.set_atualizado_em();

-- ---------- procedimentos ----------
create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  descricao text check (char_length(descricao) <= 500),
  duracao_minutos integer not null check (duracao_minutos between 5 and 480),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index procedures_nome_uq on public.procedures (lower(btrim(nome)));
create trigger trg_procedures_upd before update on public.procedures
  for each row execute function public.set_atualizado_em();

-- quais profissionais realizam quais procedimentos
create table public.professional_procedures (
  professional_id uuid not null references public.professionals (id) on delete cascade,
  procedure_id uuid not null references public.procedures (id) on delete cascade,
  primary key (professional_id, procedure_id)
);
create index professional_procedures_proc_idx on public.professional_procedures (procedure_id);

-- ---------- pacientes ----------
-- Só coletamos o necessário (sem CPF). telefone = somente dígitos (DDD + número, com ou sem 55).
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 120),
  telefone text not null check (telefone ~ '^[0-9]{10,13}$'),
  email text check (char_length(email) <= 200),
  observacao text check (char_length(observacao) <= 1000),
  nome_chave text generated always as (lower(btrim(nome))) stored,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index patients_telefone_nome_uq on public.patients (telefone, nome_chave);
create index patients_nome_idx on public.patients (nome_chave);
create trigger trg_patients_upd before update on public.patients
  for each row execute function public.set_atualizado_em();

-- ---------- disponibilidade semanal ----------
-- dia_semana: 0 = domingo ... 6 = sábado
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  tipo text not null check (tipo in ('TRABALHO', 'INTERVALO')),
  hora_inicio time not null,
  hora_fim time not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (hora_fim > hora_inicio)
);
create index availability_rules_prof_idx on public.availability_rules (professional_id, dia_semana);
create trigger trg_availability_rules_upd before update on public.availability_rules
  for each row execute function public.set_atualizado_em();

-- ---------- bloqueios ----------
-- professional_id nulo = vale para a clínica inteira
create table public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  motivo text check (char_length(motivo) <= 200),
  professional_id uuid references public.professionals (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create unique index blocked_dates_uq on public.blocked_dates
  (data, coalesce(professional_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- período de dias; se hora_inicio/hora_fim forem nulos, bloqueia os dias inteiros;
-- caso contrário bloqueia aquela faixa de horário em cada dia do período.
create table public.blocked_periods (
  id uuid primary key default gen_random_uuid(),
  data_inicio date not null,
  data_fim date not null,
  hora_inicio time,
  hora_fim time,
  motivo text check (char_length(motivo) <= 200),
  professional_id uuid references public.professionals (id) on delete cascade,
  criado_em timestamptz not null default now(),
  check (data_fim >= data_inicio),
  check ((hora_inicio is null and hora_fim is null)
      or (hora_inicio is not null and hora_fim is not null and hora_fim > hora_inicio))
);
create index blocked_periods_datas_idx on public.blocked_periods (data_inicio, data_fim);

-- ---------- "planilha": exceções pontuais de disponibilidade ----------
-- Só guarda o que DIFERE da regra semanal:
--   DISPONIVEL = abre um horário fora da regra;  BLOQUEADO = fecha um horário da regra.
-- OCUPADO nunca é gravado aqui: é derivado dos agendamentos.
create table public.schedule_slots (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals (id) on delete cascade,
  data date not null,
  hora_inicio time not null,
  hora_fim time not null,
  status text not null check (status in ('DISPONIVEL', 'BLOQUEADO')),
  observacao text check (char_length(observacao) <= 300),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (hora_fim > hora_inicio),
  unique (professional_id, data, hora_inicio)
);
create index schedule_slots_data_idx on public.schedule_slots (data, professional_id);
create trigger trg_schedule_slots_upd before update on public.schedule_slots
  for each row execute function public.set_atualizado_em();

-- ---------- agendamentos ----------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.patients (id),
  profissional_id uuid not null references public.professionals (id),
  procedimento_id uuid not null references public.procedures (id),
  data date not null,
  hora_inicio time not null,
  hora_fim time not null,
  status text not null default 'PENDENTE'
    check (status in ('PENDENTE', 'CONFIRMADO', 'REALIZADO', 'CANCELADO', 'NAO_COMPARECEU')),
  observacao text check (char_length(observacao) <= 500),
  origem text not null default 'PAINEL' check (origem in ('PUBLICO', 'PAINEL')),
  criado_por uuid references public.profiles (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- intervalo em horário de parede (sem fuso) usado pela constraint anti-conflito
  periodo tsrange generated always as (tsrange(data + hora_inicio, data + hora_fim, '[)')) stored,
  check (hora_fim > hora_inicio),
  -- REGRA CRÍTICA: um profissional não pode ter dois agendamentos ativos sobrepostos.
  -- Garantido pelo banco, independentemente de frontend/backend/concorrência.
  constraint appointments_no_overlap exclude using gist
    (profissional_id with =, periodo with &&)
    where (status in ('PENDENTE', 'CONFIRMADO', 'REALIZADO'))
);
create index appointments_data_prof_idx on public.appointments (data, profissional_id);
create index appointments_paciente_idx on public.appointments (paciente_id, data desc);
create index appointments_status_data_idx on public.appointments (status, data);
create trigger trg_appointments_upd before update on public.appointments
  for each row execute function public.set_atualizado_em();

-- ---------- auditoria (append-only) ----------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete set null,
  acao text not null check (char_length(acao) <= 60),
  entidade text not null check (char_length(entidade) <= 60),
  entidade_id text check (char_length(entidade_id) <= 80),
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);
create index audit_logs_criado_idx on public.audit_logs (criado_em desc);
create index audit_logs_entidade_idx on public.audit_logs (entidade, entidade_id);

-- ---------- configurações ----------
create table public.system_settings (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles (id) on delete set null
);

-- ---------- importações de Excel (pré-visualização + confirmação) ----------
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  criado_por uuid references public.profiles (id) on delete set null,
  nome_arquivo text not null check (char_length(nome_arquivo) <= 200),
  status text not null default 'PREVIEW' check (status in ('PREVIEW', 'APLICADO', 'CANCELADO')),
  operacoes jsonb not null default '[]'::jsonb,
  resumo jsonb not null default '{}'::jsonb,
  erros jsonb not null default '[]'::jsonb,
  remover_ausentes boolean not null default false,
  criado_em timestamptz not null default now(),
  aplicado_em timestamptz
);
create index import_batches_criado_idx on public.import_batches (criado_em desc);

-- ---------- rate limit (chave = ação + hash do IP) ----------
create table public.rate_limits (
  chave text primary key,
  contagem integer not null,
  janela_inicio timestamptz not null default now()
);
