"use server";

import { createClient } from "@supabase/supabase-js";
import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { env } from "@/lib/env";
import { enforceRateLimit, hashValue } from "@/lib/rate-limit";
import { changePasswordSchema, formToObject } from "@/validators/schemas";

export async function changePasswordAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const staff = await requirePermission("dashboard.view");
    const input = changePasswordSchema.parse(formToObject(fd));
    await enforceRateLimit("chgpw", hashValue(staff.id), 5, 900);
    // confere a senha atual com um cliente isolado (não mexe na sessão atual)
    const probe = createClient(env.supabaseUrl, env.supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: badPw } = await probe.auth.signInWithPassword({ email: staff.email, password: input.atual });
    if (badPw) throw new AppError("INVALID_INPUT", "Senha atual incorreta.");
    const { error } = await staff.db.auth.updateUser({ password: input.nova });
    if (error) throw new AppError("SAVE_FAILED", "Não foi possível alterar a senha. Escolha uma senha diferente da atual.");
    await writeAudit(staff, "ALTERAR_SENHA", "auth", staff.id);
    return { ok: true, message: "Senha alterada com sucesso." };
  } catch (e) {
    return toActionError(e);
  }
}
