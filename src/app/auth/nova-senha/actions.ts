"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppError, toActionError, type ActionResult } from "@/lib/errors";
import { passwordSchema } from "@/validators/schemas";
import { z } from "zod";

const schema = z
  .object({ nova: passwordSchema, confirmar: z.string() })
  .refine((v) => v.nova === v.confirmar, { message: "As senhas não conferem", path: ["confirmar"] });

/** Define nova senha após link de recuperação (exige o cookie criado pelo /auth/callback). */
export async function setNewPassword(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const store = await cookies();
    if (store.get("pw_recovery")?.value !== "1") throw new AppError("FORBIDDEN");
    const input = schema.parse({ nova: fd.get("nova"), confirmar: fd.get("confirmar") });
    const db = await createSupabaseServerClient();
    const { data } = await db.auth.getUser();
    if (!data.user) throw new AppError("UNAUTHENTICATED");
    const { error } = await db.auth.updateUser({ password: input.nova });
    if (error) return { ok: false, error: "Não foi possível alterar a senha. Tente uma senha diferente." };
    await db.from("audit_logs").insert({ user_id: data.user.id, acao: "RECUPERAR_SENHA", entidade: "auth", entidade_id: data.user.id, detalhes: {} });
    store.delete("pw_recovery");
    await db.auth.signOut(); // força novo login com a senha nova
    redirect(`/login?ok=${encodeURIComponent("Senha alterada. Entre com a nova senha.")}`);
  } catch (e) {
    return toActionError(e);
  }
}
