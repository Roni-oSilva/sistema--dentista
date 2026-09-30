"use server";

import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { AppError, throwIfDbError } from "@/lib/errors";
import { flashRedirect } from "@/lib/action";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { formToObject, userCreateSchema, userUpdateSchema } from "@/validators/schemas";

export async function createUserAction(fd: FormData) {
  return flashRedirect("/admin/usuarios", async () => {
    const staff = await requirePermission("users.manage");
    const input = userCreateSchema.parse(formToObject(fd));
    const admin = createSupabaseAdminClient();
    // a senha é gerenciada pelo Supabase Auth (nunca guardamos senhas no nosso banco)
    const { data, error } = await admin.auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true });
    if (error || !data.user) throw new AppError("CONFLICT", "Não foi possível criar o usuário (o e-mail já pode estar em uso).");
    const { error: pErr } = await admin.from("profiles").insert({ id: data.user.id, nome: input.nome, role: input.role });
    if (pErr) {
      await admin.auth.admin.deleteUser(data.user.id); // não deixa usuário sem perfil
      throwIfDbError(pErr);
    }
    await writeAudit(staff, "CRIAR_USUARIO", "profiles", data.user.id, { role: input.role });
    return "Usuário criado. Informe a senha inicial a ele por um canal seguro e peça para alterá-la.";
  });
}

export async function updateUserAction(fd: FormData) {
  return flashRedirect("/admin/usuarios", async () => {
    const staff = await requirePermission("users.manage");
    const input = userUpdateSchema.parse(formToObject(fd));
    if (input.id === staff.id && (!input.ativo || input.role !== "ADMIN"))
      throw new AppError("INVALID_INPUT", "Você não pode desativar nem rebaixar a si mesmo.");
    const { data, error } = await staff.db.from("profiles").update({ role: input.role, ativo: input.ativo }).eq("id", input.id).select("id");
    throwIfDbError(error);
    if (!data?.length) throw new AppError("NOT_FOUND");
    await writeAudit(staff, "ALTERAR_USUARIO", "profiles", input.id, { role: input.role, ativo: input.ativo });
    return "Usuário atualizado.";
  });
}
