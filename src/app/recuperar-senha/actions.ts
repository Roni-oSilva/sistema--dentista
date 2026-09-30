"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clientIpHash, enforceRateLimit, hashValue } from "@/lib/rate-limit";
import { toActionError, type ActionResult } from "@/lib/errors";
import { env } from "@/lib/env";
import { z } from "zod";

export async function requestPasswordReset(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  try {
    const email = z.string().trim().toLowerCase().email("E-mail inválido").max(200).parse(fd.get("email"));
    await enforceRateLimit("reset-ip", await clientIpHash(), 10, 3600);
    await enforceRateLimit("reset-email", hashValue(email), 3, 3600);
    const db = await createSupabaseServerClient();
    await db.auth.resetPasswordForEmail(email, { redirectTo: `${env.siteUrl}/auth/callback?next=/auth/nova-senha` });
    // Resposta idêntica exista o e-mail ou não (evita enumeração de usuários).
    return { ok: true, message: "Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha." };
  } catch (e) {
    return toActionError(e);
  }
}
