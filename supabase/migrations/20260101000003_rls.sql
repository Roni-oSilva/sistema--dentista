-- =====================================================================
-- Row Level Security. Política: ninguém (anon) lê nada diretamente.
-- O site público consulta disponibilidade SOMENTE via servidor Next.js
-- (service_role), que devolve apenas horários livres — nunca dados de
-- pacientes, agendamentos ou configurações administrativas.
-- =====================================================================

alter table public.roles enable row level security;
alter table public.profiles enable row level security;
alter table public.professionals enable row level security;
alter table public.procedures enable row level security;
alter table public.professional_procedures enable row level security;
alter table public.patients enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.blocked_periods enable row level security;
alter table public.schedule_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_settings enable row level security;
alter table public.import_batches enable row level security;
alter table public.rate_limits enable row level security;   -- sem policies = negado

-- anon não tem nenhum privilégio nas tabelas
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
-- nem apagar fisicamente registros críticos, nem alterar logs
revoke delete on public.appointments, public.patients, public.audit_logs, public.profiles from authenticated;
revoke update on public.audit_logs from authenticated;
revoke all on public.rate_limits from authenticated;

-- roles / profiles
create policy roles_select on public.roles for select to authenticated using (public.is_staff());
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- tabelas de cadastro/configuração: staff lê, ADMIN escreve
do $$
declare t text;
begin
  foreach t in array array['professionals','procedures','professional_procedures','availability_rules',
                           'blocked_dates','blocked_periods','schedule_slots','system_settings']
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_admin())', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_admin())', t || '_delete', t);
  end loop;
end $$;

-- pacientes: staff lê e cria; só ADMIN edita; ninguém apaga
create policy patients_select on public.patients for select to authenticated using (public.is_staff());
create policy patients_insert on public.patients for insert to authenticated with check (public.is_staff());
create policy patients_update on public.patients for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- agendamentos: staff lê/cria/atualiza (trigger restringe cancelar/remarcar a ADMIN); ninguém apaga
create policy appointments_select on public.appointments for select to authenticated using (public.is_staff());
create policy appointments_insert on public.appointments for insert to authenticated with check (public.is_staff());
create policy appointments_update on public.appointments for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- auditoria: staff insere linhas em seu próprio nome; só ADMIN lê; imutável
create policy audit_insert on public.audit_logs for insert to authenticated
  with check (public.is_staff() and user_id = auth.uid());
create policy audit_select on public.audit_logs for select to authenticated using (public.is_admin());

-- importações: somente ADMIN
create policy import_batches_all on public.import_batches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
