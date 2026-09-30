"use server";

import { requirePermission } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { flashRedirect } from "@/lib/action";
import { isValidYmd, minToTime } from "@/lib/datetime";
import { formToObject, slotKeySchema, slotRowSchema } from "@/validators/schemas";
import { getSettings } from "@/services/settings";
import { loadAgendaBundle } from "@/services/agenda-data";
import { applyScheduleOps, planRow, type ScheduleOp } from "@/services/schedule";
import { uuid } from "@/validators/common";

function backUrl(fd: FormData): string {
  const pid = String(fd.get("f_profissional") ?? "");
  const de = String(fd.get("f_de") ?? "");
  const ate = String(fd.get("f_ate") ?? "");
  const q = new URLSearchParams();
  if (uuid.safeParse(pid).success) q.set("profissional", pid);
  if (isValidYmd(de)) q.set("de", de);
  if (isValidYmd(ate)) q.set("ate", ate);
  return `/admin/planilha?${q.toString()}`;
}

/** Salva uma linha da planilha (adicionar/editar). Usa a mesma normalização da importação. */
export async function saveSlotAction(fd: FormData) {
  return flashRedirect(backUrl(fd), async () => {
    const staff = await requirePermission("availability.manage");
    const row = slotRowSchema.parse(formToObject(fd));
    const settings = await getSettings(staff.db);
    const slotMin = settings.agenda.duracao_padrao_minutos;
    const bundle = await loadAgendaBundle(staff.db, row.professional_id, row.data, row.data, slotMin);
    const { plan, end } = planRow(bundle, row.data, row.hora_inicio, { status: row.status, observacao: row.observacao });
    if (plan.kind === "conflito") throw new AppError("CONFLICT", plan.reason);
    if (plan.kind === "inalterado" || !plan.op) return "Sem alterações: já é o comportamento padrão deste horário.";
    const op: ScheduleOp =
      plan.op === "delete"
        ? { op: "delete", professional_id: row.professional_id, data: row.data, hora_inicio: row.hora_inicio }
        : { op: "upsert", professional_id: row.professional_id, data: row.data, hora_inicio: row.hora_inicio, hora_fim: minToTime(end), status: row.status, observacao: row.observacao };
    await applyScheduleOps([op], staff.id, "EDITAR_DISPONIBILIDADE", { data: row.data, hora: row.hora_inicio, status: row.status });
    return "Linha salva.";
  });
}

/** Remove a exceção da linha ("restaurar padrão"). */
export async function deleteSlotAction(fd: FormData) {
  return flashRedirect(backUrl(fd), async () => {
    const staff = await requirePermission("availability.manage");
    const key = slotKeySchema.parse(formToObject(fd));
    await applyScheduleOps([{ op: "delete", ...key }], staff.id, "EDITAR_DISPONIBILIDADE", { data: key.data, hora: key.hora_inicio, acao: "restaurar_padrao" });
    return "Exceção removida; o horário voltou ao padrão da regra semanal.";
  });
}

