-- Configurações padrão (neutras; o ADMIN ajusta em /admin/configuracoes).
insert into public.system_settings (chave, valor) values
  ('clinica', '{"nome":"Clínica Odontológica","telefone":"","whatsapp":"","endereco":"","horario_funcionamento":""}'),
  ('agenda', '{"timezone":"America/Sao_Paulo","duracao_padrao_minutos":30,"antecedencia_minima_minutos":60,"dias_max_antecedencia":60}'),
  ('horario_padrao', '{"dias":[{"dia_semana":1,"inicio":"08:00","fim":"18:00"},{"dia_semana":2,"inicio":"08:00","fim":"18:00"},{"dia_semana":3,"inicio":"08:00","fim":"18:00"},{"dia_semana":4,"inicio":"08:00","fim":"18:00"},{"dia_semana":5,"inicio":"08:00","fim":"16:00"}],"intervalo":{"inicio":"12:00","fim":"14:00"}}')
on conflict (chave) do nothing;
