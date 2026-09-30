"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { AppError, throwIfDbError, toActionError, type ActionResult } from "@/lib/errors";
import { flashRedirect } from "@/lib/action";
import { flashParam } from "@/lib/flash";
import { formToObject, patientSchema } from "@/validators/schemas";
import { uuid } from "@/validators/common";

export async function createPatientAction(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const staff = await requirePermission("patients.create");
    const input = patientSchema.parse(formToObject(fd));
    const { data, error } = await staff.db.from("patients").insert(input).select("id").single();
    throwIfDbError(error);
    id = data!.id;
    await writeAudit(staff, "CRIAR_PACIENTE", "patients", id);
  } catch (e) {
    return toActionError(e);
  }
  revalidatePath("/admin/pacientes");
  redirect(`/admin/pacientes/${id}?${flashParam("ok", "Paciente cadastrado.")}`);
}

export async function updatePatientAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  return flashRedirect(`/admin/pacientes/${uuid.safeParse(id).success ? id : ""}`, async () => {
    const staff = await requirePermission("patients.edit");
    const input = patientSchema.parse(formToObject(fd));
    const { data, error } = await staff.db.from("patients").update(input).eq("id", uuid.parse(id)).select("id");
    throwIfDbError(error);
    if (!data?.length) throw new AppError("NOT_FOUND");
    await writeAudit(staff, "EDITAR_PACIENTE", "patients", id, { campos: Object.keys(input) });
    return "Paciente atualizado.";
  });
}
