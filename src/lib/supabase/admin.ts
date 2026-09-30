import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Cliente com service_role: IGNORA RLS. Só usar no servidor, depois de autorizar o ator,
 * ou em fluxos públicos que devolvem apenas dados não sensíveis.
 */
export function createSupabaseAdminClient() {
  return createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
