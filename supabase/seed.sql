-- =====================================================================
-- SEED SOMENTE PARA DESENVOLVIMENTO. Dados 100% fictícios. NÃO rodar em produção.
-- =====================================================================
insert into public.professionals (id, nome, registro_profissional, telefone, email) values
  ('a0000000-0000-4000-8000-000000000001', 'Dra. Maria Exemplo', 'CRO-XX 00001', '91900000001', 'maria@exemplo.test'),
  ('a0000000-0000-4000-8000-000000000002', 'Dr. Carlos Exemplo', 'CRO-XX 00002', '91900000002', 'carlos@exemplo.test')
on conflict do nothing;

insert into public.procedures (id, nome, descricao, duracao_minutos) values
  ('b0000000-0000-4000-8000-000000000001', 'Avaliação', 'Consulta inicial de avaliação', 30),
  ('b0000000-0000-4000-8000-000000000002', 'Limpeza', 'Profilaxia e remoção de tártaro', 30),
  ('b0000000-0000-4000-8000-000000000003', 'Clareamento', 'Clareamento dental em consultório', 60),
  ('b0000000-0000-4000-8000-000000000004', 'Restauração', 'Restauração dentária', 60),
  ('b0000000-0000-4000-8000-000000000005', 'Implante', 'Cirurgia de implante', 90),
  ('b0000000-0000-4000-8000-000000000006', 'Ortodontia', 'Manutenção de aparelho', 30),
  ('b0000000-0000-4000-8000-000000000007', 'Endodontia', 'Tratamento de canal', 90)
on conflict do nothing;

-- Dra. Maria faz tudo; Dr. Carlos não faz implante/endodontia
insert into public.professional_procedures (professional_id, procedure_id)
select 'a0000000-0000-4000-8000-000000000001', id from public.procedures
on conflict do nothing;
insert into public.professional_procedures (professional_id, procedure_id)
select 'a0000000-0000-4000-8000-000000000002', id from public.procedures
 where nome not in ('Implante', 'Endodontia')
on conflict do nothing;

-- Seg-Qui 08-18 (intervalo 12-14), Sex 08-16 (intervalo 12-14), sáb/dom sem atendimento
insert into public.availability_rules (professional_id, dia_semana, tipo, hora_inicio, hora_fim)
select p.id, d, 'TRABALHO', '08:00', case when d = 5 then '16:00'::time else '18:00'::time end
  from public.professionals p, generate_series(1, 5) d
 where p.id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
insert into public.availability_rules (professional_id, dia_semana, tipo, hora_inicio, hora_fim)
select p.id, d, 'INTERVALO', '12:00', '14:00'
  from public.professionals p, generate_series(1, 5) d
 where p.id in ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');

-- Bloqueios (exemplos do enunciado)
insert into public.blocked_dates (data, motivo) values ('2026-10-12', 'Feriado') on conflict do nothing;
insert into public.blocked_periods (data_inicio, data_fim, motivo) values ('2026-10-20', '2026-10-21', 'Congresso');

-- Pacientes fictícios
insert into public.patients (id, nome, telefone, email) values
  ('c0000000-0000-4000-8000-000000000001', 'João Silva (teste)', '91999990001', 'joao@exemplo.test'),
  ('c0000000-0000-4000-8000-000000000002', 'Ana Souza (teste)', '91999990002', null),
  ('c0000000-0000-4000-8000-000000000003', 'Pedro Lima (teste)', '91999990003', 'pedro@exemplo.test')
on conflict do nothing;

-- Agendamentos fictícios (datas relativas: segunda da próxima semana em diante)
insert into public.appointments (paciente_id, profissional_id, procedimento_id, data, hora_inicio, hora_fim, status, origem) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   date_trunc('week', current_date)::date + 7, '09:00', '09:30', 'CONFIRMADO', 'PAINEL'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003',
   date_trunc('week', current_date)::date + 8, '14:00', '15:00', 'PENDENTE', 'PUBLICO'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
   date_trunc('week', current_date)::date + 9, '10:00', '10:30', 'PENDENTE', 'PUBLICO');
