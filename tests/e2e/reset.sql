-- Prepara o banco de teste para o roteiro E2E (usuários de teste + WhatsApp da clínica). SOMENTE TESTE.
truncate appointments, schedule_slots, audit_logs, import_batches, patients, rate_limits cascade;
delete from professionals where nome = 'Dra. Nova Teste';
delete from blocked_dates where data = '2026-12-25';
delete from profiles;
delete from auth.users;
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'admin@test.test'),
  ('22222222-2222-4222-8222-222222222222', 'sec@test.test');
insert into profiles (id, nome, role) values
  ('11111111-1111-4111-8111-111111111111', 'Admin Teste', 'ADMIN'),
  ('22222222-2222-4222-8222-222222222222', 'Secretaria Teste', 'SECRETARIA');
update system_settings set valor = jsonb_set(valor, '{whatsapp}', '"91988887777"') where chave = 'clinica';
update system_settings set valor = jsonb_set(valor, '{nome}', '"Clínica Odontológica"') where chave = 'clinica';
