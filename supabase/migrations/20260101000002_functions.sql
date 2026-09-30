-- =====================================================================
-- Funções de autorização, rate limit e operações transacionais.
-- As funções "de escrita" só podem ser executadas pelo service_role
-- (servidor Next.js), depois que o servidor autenticou/autorizou o ator.
-- =====================================================================

-- ---------- helpers de autorização (usados pelo RLS) ----------
create or replace function public.app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and ativo
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('ADMIN', 'SECRETARIA'), false)
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() = 'ADMIN', false)
$$;

-- ---------- rate limit atômico ----------
create or replace function public.check_rate_limit(p_chave text, p_max integer, p_janela_segundos integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.rate_limits as r (chave, contagem, janela_inicio)
  values (p_chave, 1, now())
  on conflict (chave) do update set
    contagem = case when r.janela_inicio < now() - make_interval(secs => p_janela_segundos)
                    then 1 else r.contagem + 1 end,
    janela_inicio = case when r.janela_inicio < now() - make_interval(secs => p_janela_segundos)
                         then now() else r.janela_inicio end
  returning contagem into v_count;
  return v_count <= p_max;
end $$;

-- ---------- guarda de atualização de agendamentos ----------
-- Usuário final (JWT) que NÃO é ADMIN não pode cancelar nem remarcar/trocar vínculos.
-- (service_role / conexões sem JWT passam: o servidor já autorizou a ação.)
create or replace function public.appointments_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.status = 'CANCELADO' and old.status <> 'CANCELADO' then
      raise exception 'FORBIDDEN: apenas ADMIN pode cancelar' using errcode = '42501';
    end if;
    if old.status = 'CANCELADO' and new.status <> 'CANCELADO' then
      raise exception 'FORBIDDEN: apenas ADMIN pode reativar' using errcode = '42501';
    end if;
    if new.data is distinct from old.data
       or new.hora_inicio is distinct from old.hora_inicio
       or new.hora_fim is distinct from old.hora_fim
       or new.profissional_id is distinct from old.profissional_id
       or new.procedimento_id is distinct from old.procedimento_id
       or new.paciente_id is distinct from old.paciente_id then
      raise exception 'FORBIDDEN: apenas ADMIN pode remarcar' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger trg_appointments_guard before update on public.appointments
  for each row execute function public.appointments_guard();

-- ---------- auditoria interna ----------
create or replace function public.write_audit(p_user uuid, p_acao text, p_entidade text, p_entidade_id text, p_detalhes jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_logs (user_id, acao, entidade, entidade_id, detalhes)
  values (p_user, p_acao, p_entidade, p_entidade_id, coalesce(p_detalhes, '{}'::jsonb))
$$;

-- ---------- reservar horário (transacional) ----------
-- Cria/reutiliza o paciente e o agendamento numa única transação.
-- Conflito => exceção 'SLOT_TAKEN' (a constraint de exclusão é a fonte da verdade).
create or replace function public.book_appointment(
  p_paciente_id uuid,
  p_nome text,
  p_telefone text,
  p_email text,
  p_profissional_id uuid,
  p_procedimento_id uuid,
  p_data date,
  p_hora_inicio time,
  p_hora_fim time,
  p_status text,
  p_observacao text,
  p_origem text,
  p_actor uuid
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_paciente uuid := p_paciente_id;
  v_duracao integer;
  v_id uuid;
begin
  if p_origem not in ('PUBLICO', 'PAINEL') then
    raise exception 'INVALID_INPUT: origem';
  end if;
  if p_status not in ('PENDENTE', 'CONFIRMADO') then
    raise exception 'INVALID_INPUT: status inicial';
  end if;

  select duracao_minutos into v_duracao from public.procedures where id = p_procedimento_id and ativo;
  if v_duracao is null then
    raise exception 'INVALID_INPUT: procedimento inexistente ou inativo';
  end if;
  if not exists (select 1 from public.professionals where id = p_profissional_id and ativo) then
    raise exception 'INVALID_INPUT: profissional inexistente ou inativo';
  end if;
  if not exists (select 1 from public.professional_procedures
                 where professional_id = p_profissional_id and procedure_id = p_procedimento_id) then
    raise exception 'INVALID_INPUT: profissional não realiza este procedimento';
  end if;
  -- a duração vem do procedimento, nunca do navegador
  if extract(epoch from (p_hora_fim - p_hora_inicio)) <> v_duracao * 60 then
    raise exception 'INVALID_INPUT: duração incompatível com o procedimento';
  end if;

  if v_paciente is null then
    -- nunca atualiza dados de paciente existente por fluxo público (evita adulteração)
    insert into public.patients (nome, telefone, email)
    values (p_nome, p_telefone, nullif(p_email, ''))
    on conflict (telefone, nome_chave) do nothing
    returning id into v_paciente;
    if v_paciente is null then
      select id into v_paciente from public.patients
       where telefone = p_telefone and nome_chave = lower(btrim(p_nome));
    end if;
  elsif not exists (select 1 from public.patients where id = v_paciente) then
    raise exception 'INVALID_INPUT: paciente inexistente';
  end if;

  begin
    insert into public.appointments
      (paciente_id, profissional_id, procedimento_id, data, hora_inicio, hora_fim, status, observacao, origem, criado_por)
    values
      (v_paciente, p_profissional_id, p_procedimento_id, p_data, p_hora_inicio, p_hora_fim, p_status,
       nullif(p_observacao, ''), p_origem, p_actor)
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  perform public.write_audit(p_actor, 'CRIAR_AGENDAMENTO', 'appointments', v_id::text,
    jsonb_build_object('origem', p_origem, 'data', p_data, 'hora_inicio', p_hora_inicio,
                       'profissional_id', p_profissional_id, 'procedimento_id', p_procedimento_id));
  return v_id;
end $$;

-- ---------- remarcar (transacional) ----------
create or replace function public.reschedule_appointment(
  p_id uuid,
  p_data date,
  p_hora_inicio time,
  p_hora_fim time,
  p_profissional_id uuid,
  p_actor uuid
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_old public.appointments%rowtype;
  v_duracao integer;
begin
  select * into v_old from public.appointments where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_old.status not in ('PENDENTE', 'CONFIRMADO') then
    raise exception 'INVALID_STATE: só é possível remarcar agendamentos pendentes ou confirmados';
  end if;
  select duracao_minutos into v_duracao from public.procedures where id = v_old.procedimento_id;
  if extract(epoch from (p_hora_fim - p_hora_inicio)) <> v_duracao * 60 then
    raise exception 'INVALID_INPUT: duração incompatível com o procedimento';
  end if;
  if not exists (select 1 from public.professionals where id = p_profissional_id and ativo)
     or not exists (select 1 from public.professional_procedures
                    where professional_id = p_profissional_id and procedure_id = v_old.procedimento_id) then
    raise exception 'INVALID_INPUT: profissional inválido para este procedimento';
  end if;

  begin
    update public.appointments
       set data = p_data, hora_inicio = p_hora_inicio, hora_fim = p_hora_fim,
           profissional_id = p_profissional_id
     where id = p_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  perform public.write_audit(p_actor, 'REMARCAR_AGENDAMENTO', 'appointments', p_id::text,
    jsonb_build_object('de', jsonb_build_object('data', v_old.data, 'hora_inicio', v_old.hora_inicio,
                                                'profissional_id', v_old.profissional_id),
                       'para', jsonb_build_object('data', p_data, 'hora_inicio', p_hora_inicio,
                                                  'profissional_id', p_profissional_id)));
end $$;

-- ---------- aplicar operações da planilha (transacional) ----------
-- p_ops: [{op:'upsert', professional_id, data, hora_inicio, hora_fim, status, observacao}
--         {op:'delete', professional_id, data, hora_inicio}]
-- Qualquer falha desfaz TUDO (função = uma transação).
create or replace function public.apply_schedule_ops(p_ops jsonb, p_actor uuid, p_acao text, p_detalhes jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  o jsonb;
  v_up integer := 0;
  v_del integer := 0;
  v_n integer;
begin
  if jsonb_typeof(p_ops) <> 'array' then
    raise exception 'INVALID_INPUT: ops';
  end if;
  for o in select * from jsonb_array_elements(p_ops) loop
    if o->>'op' = 'upsert' then
      if o->>'status' = 'BLOQUEADO' and exists (
        select 1 from public.appointments a
         where a.profissional_id = (o->>'professional_id')::uuid
           and a.data = (o->>'data')::date
           and a.status in ('PENDENTE', 'CONFIRMADO', 'REALIZADO')
           and a.hora_inicio < (o->>'hora_fim')::time
           and a.hora_fim > (o->>'hora_inicio')::time) then
        raise exception 'CONFLICT_APPOINTMENT: % %', o->>'data', o->>'hora_inicio';
      end if;
      insert into public.schedule_slots (professional_id, data, hora_inicio, hora_fim, status, observacao)
      values ((o->>'professional_id')::uuid, (o->>'data')::date, (o->>'hora_inicio')::time,
              (o->>'hora_fim')::time, o->>'status', nullif(o->>'observacao', ''))
      on conflict (professional_id, data, hora_inicio) do update
        set hora_fim = excluded.hora_fim, status = excluded.status, observacao = excluded.observacao;
      v_up := v_up + 1;
    elsif o->>'op' = 'delete' then
      delete from public.schedule_slots
       where professional_id = (o->>'professional_id')::uuid
         and data = (o->>'data')::date and hora_inicio = (o->>'hora_inicio')::time;
      get diagnostics v_n = row_count;
      v_del := v_del + v_n;
    else
      raise exception 'INVALID_INPUT: op desconhecida';
    end if;
  end loop;

  perform public.write_audit(p_actor, p_acao, 'schedule_slots', null,
    coalesce(p_detalhes, '{}'::jsonb) || jsonb_build_object('gravados', v_up, 'removidos', v_del));
  return jsonb_build_object('gravados', v_up, 'removidos', v_del);
end $$;

-- ---------- permissões de execução ----------
revoke all on function public.book_appointment(uuid, text, text, text, uuid, uuid, date, time, time, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.reschedule_appointment(uuid, date, time, time, uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_schedule_ops(jsonb, uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.write_audit(uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.book_appointment(uuid, text, text, text, uuid, uuid, date, time, time, text, text, text, uuid) to service_role;
grant execute on function public.reschedule_appointment(uuid, date, time, time, uuid, uuid) to service_role;
grant execute on function public.apply_schedule_ops(jsonb, uuid, text, jsonb) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.write_audit(uuid, text, text, text, jsonb) to service_role;
revoke all on function public.app_role() from public, anon;
revoke all on function public.is_staff() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.app_role() to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;

-- funções de trigger não devem ser chamáveis via API
revoke all on function public.set_atualizado_em() from public, anon, authenticated;
revoke all on function public.appointments_guard() from public, anon, authenticated;
