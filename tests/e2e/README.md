# Testes de integração e E2E (sem depender do Supabase em nuvem)

Há três camadas de teste. Só a primeira roda sem nenhuma infraestrutura:

| Camada | Arquivo(s) | Precisa de |
|---|---|---|
| Unitários (regras puras: motor de agenda, datas/fuso, Excel, permissões, validação, guardas de auth) | `tests/*.test.ts` | nada — `npm test` |
| Banco real (migrations, RLS, constraint anti-conflito, **concorrência**, transações) | `tests/db.integration.test.ts` | Postgres 15+ com `btree_gist` → `TEST_DATABASE_URL` |
| Serviços + RLS via HTTP (supabase-js → PostgREST → Postgres) | `tests/api.integration.test.ts` | Postgres + PostgREST → `TEST_DATABASE_URL`, `TEST_POSTGREST_URL`, `TEST_JWT_SECRET` |
| Navegador (login, permissões, fluxo do paciente, corrida entre 2 navegadores, Excel, painel) | `tests/e2e/smoke.mjs` | as anteriores + app rodando + `fake-supabase.mjs` + Chromium |

> **Use sempre um Postgres descartável** (Docker, container local). Os testes criam/apagam dados. **Nunca** aponte para o banco de produção.

## 1. Banco descartável + testes de banco

```bash
docker run -d --name pgtest -e POSTGRES_HOST_AUTH_METHOD=trust -p 54329:5432 postgres:16
export TEST_DATABASE_URL=postgres://postgres@localhost:54329/postgres
npm test            # roda unitários + db.integration (cria e apaga um banco próprio)
```

## 2. PostgREST + testes de serviços

```bash
# banco "t_api" com o esquema do Supabase emulado + migrations + seed
psql "$TEST_DATABASE_URL" -c "create database t_api"
export API_DB=postgres://postgres@localhost:54329/t_api
psql -v ON_ERROR_STOP=1 "$API_DB" -f tests/db-bootstrap.sql
for f in supabase/migrations/*.sql supabase/seed.sql; do psql -v ON_ERROR_STOP=1 "$API_DB" -f "$f"; done

# PostgREST (binário estático: https://github.com/PostgREST/postgrest/releases) ou docker postgrest/postgrest
cat > /tmp/pgrst.conf <<CONF
db-uri = "postgres://authenticator@localhost:54329/t_api"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "test-secret-test-secret-test-secret-123456"
server-port = 54330
CONF
postgrest /tmp/pgrst.conf &

TEST_DATABASE_URL=$API_DB TEST_POSTGREST_URL=http://localhost:54330 \
TEST_JWT_SECRET=test-secret-test-secret-test-secret-123456 npm test
```

## 3. E2E no navegador (Supabase falso)

`fake-supabase.mjs` implementa só o necessário do GoTrue (login/refresh/user) e repassa `/rest/v1` ao PostgREST.

```bash
export JWT_SECRET=test-secret-test-secret-test-secret-123456
eval "$(node tests/e2e/make-keys.mjs)"            # define ANON e SERVICE
psql "$API_DB" -f tests/e2e/reset.sql
node tests/e2e/fake-supabase.mjs &                 # :54331

NEXT_PUBLIC_SUPABASE_URL=http://localhost:54331 NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON \
SUPABASE_SERVICE_ROLE_KEY=$SERVICE NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
BOOKING_COOKIE_SECRET=0123456789abcdef0123456789abcdef0123456789 \
  sh -c 'npx next build && npx next start -p 3100' &

CHROME_PATH=/caminho/do/chromium DATABASE_URL=$API_DB node tests/e2e/smoke.mjs
```

O roteiro verifica (≈ 70 checagens): fluxo público completo + link do WhatsApp, **dois navegadores disputando o mesmo horário**
(só um confirma; o outro vê "Este horário acabou de ser reservado. Escolha outro horário."), parâmetros manipulados, login
(erro/sucesso/logout/auditoria), todas as telas do painel, criar/remarcar/cancelar, planilha, bloqueios, importação Excel
(resumo, erros, confirmação), exportação, e as restrições da SECRETARIA.
