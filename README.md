# Agendamento odontológico

Site público de agendamento + painel da clínica. Next.js, Supabase (banco + login), Vercel (hospedagem).

## Como colocar online

### 1. Supabase (banco e login)
1. Crie um projeto em <https://supabase.com/dashboard>.
2. **SQL Editor**: cole e execute, **nesta ordem**, cada arquivo de `supabase/migrations/`:
   `…0001_schema.sql`, `…0002_functions.sql`, `…0003_rls.sql`, `…0004_default_settings.sql`.
3. **Project Settings → API**: anote *Project URL*, *anon public key* e *service_role key*.
4. **Authentication → Providers → Email**: desative *Allow new users to sign up*.

### 2. Vercel (site)
1. Suba este repositório no GitHub e, na Vercel, **Add New → Project** e importe-o.
2. Em **Settings → Environment Variables**, cadastre (Production):

   | Variável | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**secreta**) |
   | `NEXT_PUBLIC_SITE_URL` | endereço final do site, ex.: `https://seu-site.vercel.app` |
   | `BOOKING_COOKIE_SECRET` | texto aleatório com 32+ caracteres (gere com `openssl rand -base64 48`) |

3. **Deploy**.

### 3. Liberar o login e criar o administrador
1. Supabase → **Authentication → URL Configuration**: em *Site URL* coloque o endereço do site e adicione em *Redirect URLs*: `https://seu-site.vercel.app/auth/callback`.
2. Supabase → **Authentication → Users → Add user**: crie o e-mail e a senha do administrador (marque *Auto Confirm User*) e copie o **User UID**.
3. No **SQL Editor** execute (troque o UID e o nome):
   ```sql
   insert into profiles (id, nome, role) values ('COLE-O-USER-UID', 'Seu Nome', 'ADMIN');
   ```
4. Entre em `https://seu-site.vercel.app/login`.

### 4. Configurar a clínica
No painel: **Configurações** (nome, telefone, WhatsApp, endereço), **Procedimentos**, **Profissionais** (marque os procedimentos de cada um e aplique o horário padrão), **Bloqueios** (feriados). Crie a secretaria em **Usuários**.

Para rodar localmente: copie `.env.example` para `.env.local`, preencha e use `npm install && npm run dev`.
