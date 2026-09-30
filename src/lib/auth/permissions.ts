/**
 * Matriz de permissões (única fonte de verdade no app). O banco reforça o essencial via RLS/triggers.
 * Para criar um novo nível: 1) insira em `roles` (migration); 2) adicione-o em ROLE_PERMISSIONS.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "agenda.view",
  "appointments.view",
  "appointments.create",
  "appointments.edit",
  "appointments.update_status",
  "appointments.cancel",
  "appointments.reschedule",
  "patients.view",
  "patients.create",
  "patients.edit",
  "professionals.manage",
  "procedures.manage",
  "availability.manage",
  "blocks.manage",
  "excel.import",
  "excel.export",
  "settings.manage",
  "users.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type Role = "ADMIN" | "SECRETARIA";

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  SECRETARIA: [
    "dashboard.view",
    "agenda.view",
    "appointments.view",
    "appointments.create",
    "appointments.edit",
    "appointments.update_status",
    "patients.view",
    "patients.create",
  ],
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && Object.hasOwn(ROLE_PERMISSIONS, value);
}

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!isRole(role)) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}

export const APPOINTMENT_STATUSES = ["PENDENTE", "CONFIRMADO", "REALIZADO", "CANCELADO", "NAO_COMPARECEU"] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Quem pode colocar um agendamento em determinado status. Cancelar exige `appointments.cancel`. */
export function canSetStatus(role: string | null | undefined, status: AppointmentStatus): boolean {
  if (status === "CANCELADO") return hasPermission(role, "appointments.cancel");
  return hasPermission(role, "appointments.update_status");
}
