/**
 * Cria (ou promove) o primeiro usuário ADMIN. Uso:
 *   npm run create-admin -- email@clinica.com "Nome Completo" "SenhaForte123"
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente (.env.local).
 * A senha é enviada ao Supabase Auth; nunca é gravada em nossas tabelas.
 */
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });
config();

async function main() {
  const [email, nome, password] = process.argv.slice(2);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  if (!email || !nome || !password) throw new Error('Uso: npm run create-admin -- email "Nome" "Senha"');
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    throw new Error("A senha deve ter 10+ caracteres, com letras e números.");

  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  let userId: string | undefined;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    userId = list?.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    if (!userId) throw new Error(`Não foi possível criar o usuário: ${error.message}`);
    console.log("Usuário já existia no Auth; promovendo a ADMIN (a senha NÃO foi alterada).");
  } else {
    userId = data.user.id;
  }
  const { error: pErr } = await admin.from("profiles").upsert({ id: userId, nome, role: "ADMIN", ativo: true });
  if (pErr) throw new Error(`Falha ao criar perfil: ${pErr.message}. As migrations foram aplicadas?`);
  console.log(`ADMIN pronto: ${email}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
