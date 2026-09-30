"use server";

import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { throwIfDbError } from "@/lib/errors";
import { flashRedirect } from "@/lib/action";
import { blockedDateSchema, blockedPeriodSchema, formToObject } from "@/validators/schemas";
import { uuid } from "@/validators/common";

export async function addBlockedDateAction(fd: FormData) {
  return flashRedirect("/admin/bloqueios", async () => {
    const staff = await requirePermission("blocks.manage");
    const i = blockedDateSchema.parse(formToObject(fd));
    const { error } = await staff.db.from("blocked_dates").insert({ data: i.data, motivo: i.motivo, professional_id: i.professional_id ?? null });
    throwIfDbError(error);
    await writeAudit(staff, "CRIAR_BLOQUEIO", "blocked_dates", null, { data: i.data, professional_id: i.professional_id ?? null });
    return "Data bloqueada. Novos agendamentos nesta data serão impedidos.";
  });
}

export async function addBlockedPeriodAction(fd: FormData) {
  return flashRedirect("/admin/bloqueios", async () => {
    const staff = await requirePermission("blocks.manage");
    const i = blockedPeriodSchema.parse(formToObject(fd));
    const { error } = await staff.db.from("blocked_periods").insert({
      data_inicio: i.data_inicio, data_fim: i.data_fim, hora_inicio: i.hora_inicio ?? null, hora_fim: i.hora_fim ?? null,
      motivo: i.motivo, professional_id: i.professional_id ?? null,
    });
    throwIfDbError(error);
    await writeAudit(staff, "CRIAR_BLOQUEIO", "blocked_periods", null, { de: i.data_inicio, ate: i.data_fim, parcial: !!i.hora_inicio });
    return "Período bloqueado.";
  });
}

export async function deleteBlockAction(fd: FormData) {
  return flashRedirect("/admin/bloqueios", async () => {
    const staff = await requirePermission("blocks.manage");
    const id = uuid.parse(fd.get("id"));
    const table = fd.get("tipo") === "periodo" ? "blocked_periods" : "blocked_dates";
    const { error } = await staff.db.from(table).delete().eq("id", id);
    throwIfDbError(error);
    await writeAudit(staff, "REMOVER_BLOQUEIO", table, id);
    return "Bloqueio removido.";
  });
}
