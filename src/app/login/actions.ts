"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIpHash, enforceRateLimit, hashValue } from "@/lib/rate-limit";
import { toActionError, type ActionResult } from "@/lib/errors";
import { loginSchema, formToObject } from "@/validators/schemas";
import { isRole } from "@/lib/auth/permissions";
import { safeNext } from "@/lib/safe-redirect";

const BAD_CREDENTIALS = "E-mail ou senha incorretos.";

export async function loginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const input = loginSchema.parse(formToObject(fd));
    const ip = await clientIpHash();
    // limita por IP e por e-mail (tentativas de força bruta)
    await enforceRateLimit("login-ip", ip, 20, 900);
    await enforceRateLimit("login-email", hashValue(input.email), 8, 900);

    const db = await createSupabaseServerClient();
    const { data, error } = await db.auth.signInWithPassword(input);
    if (error || !data.user) return { ok: false, error: BAD_CREDENTIALS };

    const { data: profile } = await db.from("profiles").select("role, ativo").eq("id", data.user.id).maybeSingle();
    if (!profile || !profile.ativo || !isRole(profile.role)) {
      await db.auth.signOut();
      return { ok: false, error: "Você não possui permissão para acessar o painel." };
    }
    await db.from("audit_logs").insert({ user_id: data.user.id, acao: "LOGIN", entidade: "auth", entidade_id: data.user.id, detalhes: {} });
    redirect(safeNext(String(fd.get("next") ?? "")));
  } catch (e) {
    return toActionError(e);
  }
}

export async function logoutAction() {
  const db = await createSupabaseServerClient();
  await db.auth.signOut();
  redirect("/login");
}
