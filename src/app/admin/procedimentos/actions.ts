"use server";

import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { AppError, throwIfDbError } from "@/lib/errors";
import { flashRedirect } from "@/lib/action";
import { formToObject, procedureSchema } from "@/validators/schemas";
import { uuid } from "@/validators/common";

export async function saveProcedureAction(fd: FormData) {
  return flashRedirect("/admin/procedimentos", async () => {
    const staff = await requirePermission("procedures.manage");
    const raw = formToObject(fd);
    const input = procedureSchema.parse(raw);
    if (raw.id) {
      const id = uuid.parse(raw.id);
      const { data, error } = await staff.db.from("procedures").update(input).eq("id", id).select("id");
      throwIfDbError(error);
      if (!data?.length) throw new AppError("NOT_FOUND");
      await writeAudit(staff, "EDITAR_PROCEDIMENTO", "procedures", id, { duracao_minutos: input.duracao_minutos, ativo: input.ativo });
      return "Procedimento atualizado.";
    }
    const { data, error } = await staff.db.from("procedures").insert(input).select("id").single();
    throwIfDbError(error);
    await writeAudit(staff, "CRIAR_PROCEDIMENTO", "procedures", data!.id);
    return "Procedimento criado.";
  });
}
