# Sistema de agendamento odontológico

Aplicação web para clínicas odontológicas: site público de agendamento + painel administrativo.
**Next.js (App Router) · TypeScript · Supabase (Auth + PostgreSQL) · Tailwind · Zod · ExcelJS** — pronto para **GitHub → Vercel → Supabase**.

> **Etapa 1 (este repositório): o motor do sistema.** Banco, autenticação, permissões, regras de agenda,
> Excel, auditoria, segurança e testes. A interface é propositalmente simples (funcional e responsiva).
> A etapa 2 será só UI/UX (identidade visual, calendário avançado, animações etc.) sobre este motor.

## Sumário
1. [Visão geral e decisões de arquitetura](#1-visão-geral-e-decisões-de-arquitetura)
2. [Instalação](#2-instalação)
3. [Configurar o Supabase](#3-configurar-o-supabase)
4. [Banco de dados e migrations](#4-banco-de-dados-e-migrations)
5. [Variáveis de ambiente (.env)](#5-variáveis-de-ambiente-env)
6. [Executar localmente](#6-executar-localmente)
7. [Criar o usuário administrador](#7-criar-o-usuário-administrador)
8. [Excel: importar, editar, exportar](#8-excel-importar-editar-exportar)
9. [Deploy na Vercel](#9-deploy-na-vercel)
10. [Testes](#10-testes)
11. [Segurança](#11-segurança)
12. [Estrutura do projeto](#12-estrutura-do-projeto)
13. [Limitações conhecidas e próximos passos](#13-limitações-conhecidas-e-próximos-passos)

---

## 1. Visão geral e decisões de arquitetura

| Tema | Decisão |
|---|---|
| **Sem conflito de horários** | Garantido **pelo banco**: `EXCLUDE USING gist (profissional_id WITH =, periodo WITH &&)` em `appointments` para status ativos (`PENDENTE/CONFIRMADO/REALIZADO`). Duas reservas simultâneas (ou sobrepostas por duração) → só uma passa; a outra recebe *"Este horário acabou de ser reservado. Escolha outro horário."* |
| **Datas e fuso** | A agenda usa **horário de parede da clínica**: colunas `date` + `time` (sem fuso) e strings `YYYY-MM-DD` / `HH:MM` no código. Nunca se faz `new Date("2026-10-07")` para datas da agenda, então **07/10 jamais vira 06/10**. O fuso (Configurações, padrão `America/Sao_Paulo`) só é usado para saber "agora/hoje". |
| **Disponibilidade** | Um único **motor puro** (`src/lib/agenda/engine.ts`) decide `DISPONIVEL / OCUPADO / BLOQUEADO` combinando: regra semanal (+ intervalos), bloqueios (dias/períodos/horários), exceções da planilha e agendamentos. Usado para exibir horários **e** revalidar no servidor. |
| **Planilha (Excel)** | `schedule_slots` guarda só **exceções** ao padrão semanal (`DISPONIVEL` abre um horário fora da regra, `BLOQUEADO` fecha um horário). `OCUPADO` é sempre derivado dos agendamentos. Importar/editar é normalizado: linha igual ao padrão não cria lixo. Bloqueios de feriado **sempre vencem** um "DISPONIVEL" manual. |
| **Transações** | Reserva, remarcação e aplicação da planilha/importação são **funções SQL** (uma transação): tudo ou nada, com auditoria gravada na mesma transação. |
| **Autorização em camadas** | (1) `proxy.ts` bloqueia `/admin` sem login; (2) `requirePermission()` em **toda** Server Action/Route; (3) **RLS + triggers** no banco reforçam o essencial mesmo se o app falhar. |
| **Site público** | O `anon` **não tem acesso a nenhuma tabela**. As páginas públicas rodam no servidor (service role) e devolvem só o necessário (procedimentos, profissionais, horários livres). Nada de dados de pacientes/agenda é exposto. |
| **Novos perfis** | Tabela `roles` + mapa `ROLE_PERMISSIONS` (`src/lib/auth/permissions.ts`). Para criar um perfil: insira em `roles` (migration) e liste as permissões no mapa. |
| **Sem CPF** | Coletamos só nome, telefone/WhatsApp e e-mail opcional (minimização de dados / LGPD). |
| **WhatsApp** | Link `wa.me` com mensagem pronta (`src/lib/whatsapp.ts`): aviso de novo agendamento à clínica, **confirmação** ao paciente (tela do agendamento) e **lembrete de amanhã** com 1 clique por paciente (Dashboard). Sem custo e sem API. A interface `NotificationProvider` permite trocar pela **WhatsApp Business API** sem mexer nas regras de negócio. |

### Permissões

| | ADMIN | SECRETARIA |
|---|:-:|:-:|
| Dashboard, ver agenda, ver agendamentos, ver pacientes | ✅ | ✅ |
| Criar/editar agendamentos, atualizar status (confirmar/realizado/não compareceu) | ✅ | ✅ |
| Cadastrar pacientes | ✅ | ✅ (criar) |
| Editar pacientes | ✅ | ❌ |
| **Cancelar / remarcar** | ✅ | ❌ |
| Profissionais, procedimentos, disponibilidade, bloqueios, planilha | ✅ | ❌ |
| Importar/exportar Excel | ✅ | ❌ |
| Configurações, usuários, auditoria | ✅ | ❌ |

Para dar a SECRETARIA mais poderes (ex.: cancelar), altere `ROLE_PERMISSIONS` **e** o trigger `appointments_guard` / as policies de RLS correspondentes — o banco também impõe estas regras.

---

## 2. Instalação

Requisitos: **Node.js 22** (`.nvmrc`), npm, conta no [Supabase](https://supabase.com) e (para deploy) na [Vercel](https://vercel.com). Opcional: [Supabase CLI](https://supabase.com/docs/guides/cli) e Docker para rodar tudo localmente.

```bash
git clone <seu-repositorio>
cd sistema--dentista
npm install
cp .env.example .env.local      # depois preencha (seção 5)
```

## 3. Configurar o Supabase

1. Crie um projeto em <https://supabase.com/dashboard>. Anote a senha do banco e escolha a região mais próxima (ex.: *South America – São Paulo*).
2. **Project Settings → API**: copie *Project URL*, *anon public key* e *service_role key* (seção 5).
3. **Authentication → Providers → Email**: mantenha "Email" ligado e **desative "Allow new users to sign up"** (somente administradores criam usuários). Mesmo que alguém crie conta, sem perfil ativo em `profiles` não acessa nada (RLS).
4. **Authentication → URL Configuration**:
   - *Site URL*: a URL pública do site (ex.: `https://seu-app.vercel.app`; em dev `http://localhost:3000`);
   - *Redirect URLs*: adicione `https://seu-app.vercel.app/auth/callback` e `http://localhost:3000/auth/callback` (recuperação de senha).
5. **Authentication → Emails**: para produção configure um SMTP próprio (o SMTP padrão do Supabase tem limite baixo). Personalize o template *Reset Password* se quiser.
6. **Authentication → Policies/Password**: exija senha forte (mín. 10).

## 4. Banco de dados e migrations

As migrations ficam em `supabase/migrations` (ordem cronológica) e **são a única fonte da estrutura do banco**:

| Arquivo | Conteúdo |
|---|---|
| `…0001_schema.sql` | tabelas, índices, constraint anti-conflito, triggers de `atualizado_em` |
| `…0002_functions.sql` | autorização (`is_admin`, `is_staff`), `book_appointment`, `reschedule_appointment`, `apply_schedule_ops`, `check_rate_limit`, trigger de proteção |
| `…0003_rls.sql` | RLS em **todas** as tabelas + revogação de privilégios |
| `…0004_default_settings.sql` | configurações padrão neutras |

**Opção A — Supabase CLI (recomendado):**

```bash
npm i -g supabase            # ou: npx supabase ...
supabase login
supabase link --project-ref <ref-do-projeto>
supabase db push             # aplica as migrations no projeto da nuvem
```

**Opção B — SQL Editor do painel:** cole e execute, **na ordem**, cada arquivo de `supabase/migrations/*.sql`.

**Desenvolvimento local completo** (Docker): `supabase start` e `supabase db reset` (aplica migrations **e** o seed).

**Seed (somente desenvolvimento):** `supabase/seed.sql` cria profissionais, procedimentos, horários, bloqueios (12/10/2026 feriado; 20–21/10/2026 congresso), pacientes e agendamentos **fictícios**. **Nunca rode em produção.**
Em um projeto de desenvolvimento na nuvem: cole o conteúdo de `seed.sql` no SQL Editor.

> Em produção, **não** rode o seed. Cadastre profissionais/procedimentos pelo painel.

## 5. Variáveis de ambiente (.env)

`cp .env.example .env.local` e preencha:

| Variável | Onde obter | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Settings → API | pública |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API | pública (sem acesso a dados: RLS nega tudo ao `anon`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API | **SECRETA**. Ignora RLS. Só no servidor. Nunca com prefixo `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_SITE_URL` | sua URL | usada no link de recuperação de senha |
| `BOOKING_COOKIE_SECRET` | `openssl rand -base64 48` | assina cookies do fluxo de agendamento e mensagens de aviso (≥ 32 caracteres) |

`.env*` está no `.gitignore` (só `.env.example`, sem valores, é versionado).

## 6. Executar localmente

```bash
npm run dev          # http://localhost:3000
npm run typecheck    # TypeScript
npm run lint
npm test             # testes unitários
npm run build && npm start   # build de produção
```

Rotas públicas: `/`, `/agendamento` → `/agendamento/procedimento` → `/profissional` → `/data` → `/horario` → `/dados` → `/resumo` → `/confirmado`.
Painel: `/login` → `/admin`.

## 7. Criar o usuário administrador

Com as migrations aplicadas e o `.env.local` preenchido:

```bash
npm run create-admin -- admin@suaclinica.com "Seu Nome" "SenhaForte123"
```

O script cria o usuário no **Supabase Auth** (a senha nunca é gravada em nossas tabelas) e o perfil `ADMIN`. Depois, em **/admin/usuarios**, o admin cria os demais (ex.: `SECRETARIA`).
Alternativa manual: crie o usuário em *Authentication → Users* e execute
`insert into profiles (id, nome, role) values ('<uuid-do-usuario>', 'Seu Nome', 'ADMIN');`.

Recuperar/alterar senha: *Esqueci minha senha* em `/login` (e-mail com link) e **Alterar senha** no topo do painel (exige a senha atual).

## 8. Excel: importar, editar, exportar

**Exportar** — `/admin/planilha` → **Baixar Excel** (período e profissional filtrados), ou `/admin/importar` (agenda, agendamentos, pacientes).
Colunas: `Data | Horário | Status | Profissional | Observação` (datas `DD/MM/AAAA`, horas `HH:MM`, gravadas como **texto** para não haver ambiguidade de fuso). Células que começam com `= + - @` são neutralizadas contra injeção de fórmulas.

**Editar no painel** — `/admin/planilha` lista a grade efetiva do período. Altere o status/observação de uma linha (cria uma *exceção*), adicione horários fora da regra ou use **Restaurar padrão** para remover a exceção. `OCUPADO` vem dos agendamentos e não é editável.

**Importar** — `/admin/importar`:
1. Envie o `.xlsx` (máx. 2 MB / 5 000 linhas). É validado (formato, colunas, datas, horários, status, profissional).
2. Veja a **pré-visualização**: *"Esta importação irá alterar X registros"* + **Novos / Alterados / Removidos / Conflitos** (+ inalterados, ignorados, erros). **Nada foi gravado ainda.**
3. Cada problema aparece com **linha, coluna, valor e motivo**. Linhas com erro/conflito **não** são importadas (nada é descartado em silêncio).
4. **Confirmar** aplica tudo **em uma única transação** (se algo falhar, nada é alterado). Você pode **Descartar**.

Regras: linhas `OCUPADO` são ignoradas; `BLOQUEADO` sobre horário com agendamento ativo é *conflito*; `DISPONIVEL` dentro de feriado/período bloqueado é *conflito*. **Remover ausentes** (opcional, desligado por padrão) apaga as exceções existentes no período/profissionais do arquivo que não estão na planilha — nunca apaga agendamentos, pacientes ou cadastros.
O Excel **não** é o backup: todos os dados vivem no banco (use também os backups do Supabase). Exporte pacientes e agendamentos quando quiser uma cópia.

## 9. Deploy na Vercel

1. Suba o repositório no GitHub (`git push`).
2. Na Vercel: **Add New → Project →** importe o repositório (framework: Next.js; build/output padrão).
3. **Settings → Environment Variables** — cadastre as 5 variáveis da seção 5 para **Production** e **Preview** (use, de preferência, um projeto Supabase separado para Preview/Development). Marque `SUPABASE_SERVICE_ROLE_KEY` e `BOOKING_COOKIE_SECRET` como *Sensitive*.
4. (Opcional) **Settings → Functions → Region**: escolha `gru1` (São Paulo) para ficar perto do Supabase.
5. **Deploy**. Depois ajuste no Supabase a *Site URL* e *Redirect URLs* (seção 3) para o domínio final.
6. Rode `npm run create-admin` (local, apontando para o projeto de produção) **uma vez**, ou crie o usuário conforme a seção 7.

Deploy contínuo: cada push na branch de produção publica; PRs geram *Preview Deployments*. O workflow `.github/workflows/ci.yml` roda tipos, lint, testes, build e os testes de banco.

## 10. Testes

```bash
npm test      # 57 testes unitários (+ integração, se TEST_DATABASE_URL etc. estiverem definidos)
```

| O que é coberto | Onde |
|---|---|
| Motor de disponibilidade (regras, intervalos, duração, bloqueios, exceções, antecedência) | `tests/engine.test.ts`, `tests/overrides.test.ts` |
| Datas/fuso (07/10 nunca vira 06/10), horários | `tests/datetime.test.ts` |
| Excel: importação válida/inválida (linha/coluna/valor/motivo), exportação e ida-e-volta, injeção de fórmula | `tests/excel.test.ts` |
| Permissões (matriz), guardas de login/perfil/permissão, open-redirect, CSRF (origem), mensagens assinadas, erros seguros | `tests/permissions.test.ts`, `tests/auth.test.ts`, `tests/misc.test.ts` |
| **Banco real**: migrations, RLS (anon / sem perfil / secretaria / admin), constraint anti-conflito, **20 reservas simultâneas → 1 vence**, sobreposição por duração, cancelar libera, remarcação atômica, planilha transacional (tudo-ou-nada), rate limit | `tests/db.integration.test.ts` |
| **Serviços + RLS via HTTP**: disponibilidade com dados reais, feriado/congresso, reservas concorrentes, remarcação, importação/exportação ponta a ponta | `tests/api.integration.test.ts` |
| **Navegador** (login, permissões, fluxo do paciente, **2 navegadores disputando o mesmo horário**, painel, Excel) | `tests/e2e/smoke.mjs` |

Como rodar as camadas de integração/E2E (Postgres descartável + PostgREST + Chromium): veja [`tests/e2e/README.md`](tests/e2e/README.md).
Sem infraestrutura, os testes de integração são simplesmente ignorados (`skipped`).

## 11. Segurança

- **Autenticação**: Supabase Auth (senhas nunca no nosso banco); sessão por cookie httpOnly renovada no `proxy.ts`; `getUser()` valida o JWT no servidor.
- **Autorização**: permissões por perfil no app **e** RLS/triggers no banco; usuário desativado perde acesso imediatamente; sem perfil = sem acesso.
- **RLS em todas as tabelas**; `anon` sem privilégios; funções sensíveis (`book_appointment` etc.) executáveis **somente** pelo `service_role`.
- **Segredos**: `SUPABASE_SERVICE_ROLE_KEY` só em `server-only` (`src/lib/env.ts`, `src/lib/supabase/admin.ts`); nada de chaves no código; `.env.example` sem valores.
- **Entrada**: Zod em formulários, parâmetros de URL, IDs, datas, horários e arquivos; textos com caracteres de controle removidos; a duração do procedimento e a disponibilidade **nunca** vêm do navegador; saída escapada pelo React.
- **Anti-automação**: rate limit persistente no Postgres (login por IP e por e-mail, agendamento por IP, recuperação de senha, troca de senha) + honeypot no formulário público. Em falha do banco o limite é *fail-open* (registrado em log).
- **CSRF**: Server Actions checam `Origin`; rotas de upload checam `Origin` e permissão; cookies `SameSite=Lax`.
- **Arquivos Excel**: limite de tamanho/linhas, verificação de assinatura ZIP, parse em memória, sem executar fórmulas; exportação neutraliza fórmulas.
- **Erros**: mensagens claras e seguras; detalhes internos só em log do servidor, nunca stack trace para o usuário. Mensagens pós-redirect são **assinadas** (não dá para forjar pela URL).
- **Auditoria** (`audit_logs`, append-only, só ADMIN lê): login, criar/remarcar/cancelar/alterar status, importação/exportação de Excel, alteração de disponibilidade/bloqueios/configurações, cadastros, usuários e senha. Guarda ids e campos alterados — **sem dados pessoais**.
- **LGPD**: dados mínimos, consentimento no formulário público, sem CPF, exclusão física de agendamentos/pacientes bloqueada (histórico preservado).
- Cabeçalhos de segurança básicos em `next.config.ts` (HSTS é aplicado pela Vercel).

## 12. Estrutura do projeto

```
src/
  app/                    rotas (App Router)
    (public)/             site público e fluxo /agendamento/*
    admin/                painel: dashboard, agenda, agendamentos, pacientes, profissionais,
                          procedimentos, bloqueios, planilha, importar, configurações, usuários, auditoria
    api/admin/            importação (prévia + confirmação) e exportação de Excel
    login, recuperar-senha, auth/   autenticação
  components/             UI compartilhada (ActionForm, tabelas, badges)
  lib/
    agenda/               motor de disponibilidade e normalização da planilha (puros, testados)
    auth/                 permissões e sessão
    excel/                leitura/validação e geração de XLSX
    supabase/             clientes (usuário, service role)
    datetime.ts errors.ts audit.ts rate-limit.ts whatsapp.ts signed-token.ts flash.ts ...
  services/               regras de negócio com acesso a dados (booking, agenda-data, schedule, settings...)
  validators/             esquemas Zod
  types/                  tipos
  proxy.ts                sessão + proteção de /admin
supabase/                 migrations versionadas, seed (dev), config.toml
scripts/create-admin.ts   cria o primeiro ADMIN
tests/                    unitários, integração e E2E
```

## 13. Limitações conhecidas e próximos passos

- **Interface** propositalmente simples → etapa 2 (UI/UX, calendário visual, animações, etc.).
- **Verificado neste repositório**: testes unitários, banco real (Postgres 16), serviços via PostgREST e um roteiro de navegador completo contra um **Supabase falso** (auth simulada). **Não** foi testado contra um projeto Supabase real na nuvem: no primeiro deploy, valide login, e-mail de recuperação de senha (SMTP/redirects) e `create-admin`.
- O rate limit usa `x-forwarded-for` (confiável na Vercel; em outra hospedagem, configure o proxy para sobrescrevê-lo).
- Não há envio automático de WhatsApp/e-mail de lembrete: o WhatsApp é por link. A interface `NotificationProvider` já prepara a integração com a WhatsApp Business API.
- Um paciente é identificado por telefone + nome; o fluxo público **nunca altera** cadastro existente (evita adulteração), só o painel edita.
- `exceljs` depende de `uuid` com um aviso de segurança (`npm audit`) que não afeta este uso (não é usado o modo com buffer).
