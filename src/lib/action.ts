import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { toActionError } from "@/lib/errors";
import { flashParam } from "@/lib/flash";

/**
 * Executa uma mutação e volta para `back` com ?ok= / ?erro= (mensagens seguras, sem stack trace).
 * `fn` deve autorizar (requirePermission), validar (zod) e devolver a mensagem de sucesso.
 */
export async function flashRedirect(back: string, fn: () => Promise<string>): Promise<never> {
  let q: string;
  try {
    q = flashParam("ok", await fn());
  } catch (e) {
    const r = toActionError(e);
    q = flashParam("erro", r.ok ? "Erro" : r.error);
  }
  revalidatePath("/admin", "layout");
  redirect(`${back}${back.includes("?") ? "&" : "?"}${q}`);
}
