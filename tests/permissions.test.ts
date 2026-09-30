import { describe, expect, it } from "vitest";
import { canSetStatus, hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

describe("permissões", () => {
  it("ADMIN tem tudo", () => {
    for (const p of PERMISSIONS) expect(hasPermission("ADMIN", p)).toBe(true);
  });
  it("SECRETARIA: agenda, agendamentos, pacientes (ver/criar), status", () => {
    for (const p of ["agenda.view", "appointments.view", "appointments.create", "appointments.edit", "appointments.update_status", "patients.view", "patients.create", "dashboard.view"] as const)
      expect(hasPermission("SECRETARIA", p)).toBe(true);
  });
  it("SECRETARIA não importa Excel, não edita disponibilidade/cadastros/configurações, não cancela nem remarca", () => {
    for (const p of ["excel.import", "excel.export", "availability.manage", "blocks.manage", "professionals.manage", "procedures.manage", "settings.manage", "users.manage", "audit.view", "appointments.cancel", "appointments.reschedule", "patients.edit"] as const)
      expect(hasPermission("SECRETARIA", p)).toBe(false);
  });
  it("papel desconhecido/nulo não tem nenhuma permissão", () => {
    expect(hasPermission(null, "agenda.view")).toBe(false);
    expect(hasPermission("HACKER", "agenda.view")).toBe(false);
    expect(hasPermission("__proto__", "agenda.view")).toBe(false);
  });
  it("status: só ADMIN cancela", () => {
    expect(canSetStatus("ADMIN", "CANCELADO")).toBe(true);
    expect(canSetStatus("SECRETARIA", "CANCELADO")).toBe(false);
    expect(canSetStatus("SECRETARIA", "CONFIRMADO")).toBe(true);
    expect(canSetStatus("SECRETARIA", "NAO_COMPARECEU")).toBe(true);
    expect(canSetStatus(undefined, "CONFIRMADO")).toBe(false);
  });
});
