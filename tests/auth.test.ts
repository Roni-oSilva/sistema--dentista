import { beforeEach, describe, expect, it, vi } from "vitest";

/** Testa as barreiras de autenticação/autorização do servidor com um cliente Supabase simulado. */
type Session = { user: { id: string; email: string } | null; profile: { nome: string; role: string; ativo: boolean } | null };
let session: Session = { user: null, profile: null };

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: session.profile }) }) }) }),
  }),
}));
vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: <T>(fn: T) => fn })); // sem cache entre testes
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { redirectTo: to });
  },
  unstable_rethrow: () => {},
}));

const as = (role: string | null, extra: Partial<NonNullable<Session["profile"]>> = {}): Session => ({
  user: { id: "u1", email: "u@t.test" },
  profile: role ? { nome: "Fulano", role, ativo: true, ...extra } : null,
});

describe("guardas de autenticação e permissão (servidor)", () => {
  let s: typeof import("@/lib/auth/session");
  beforeEach(async () => {
    session = { user: null, profile: null };
    s = await import("@/lib/auth/session");
  });

  it("sem login: requirePermission => UNAUTHENTICATED; requireStaff => redireciona ao login", async () => {
    await expect(s.requirePermission("agenda.view")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(s.requireStaff()).rejects.toMatchObject({ redirectTo: "/login" });
    expect(await s.getCurrentStaff()).toBeNull();
  });
  it("login sem perfil (conta criada no Auth mas não autorizada) não acessa nada", async () => {
    session = as(null);
    expect(await s.getCurrentStaff()).toBeNull();
    await expect(s.requirePermission("agenda.view")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
  it("perfil desativado perde o acesso", async () => {
    session = as("ADMIN", { ativo: false });
    expect(await s.getCurrentStaff()).toBeNull();
  });
  it("papel inválido no banco não acessa", async () => {
    session = as("ROOT");
    expect(await s.getCurrentStaff()).toBeNull();
  });
  it("SECRETARIA: permitido o que é dela, FORBIDDEN no resto (mensagem padrão)", async () => {
    session = as("SECRETARIA");
    await expect(s.requirePermission("appointments.create")).resolves.toMatchObject({ role: "SECRETARIA" });
    for (const p of ["excel.import", "settings.manage", "users.manage", "availability.manage", "appointments.cancel", "audit.view"] as const)
      await expect(s.requirePermission(p)).rejects.toMatchObject({ code: "FORBIDDEN", message: "Você não possui permissão para realizar esta ação." });
    await expect(s.requirePagePermission("excel.import")).rejects.toMatchObject({ redirectTo: "/admin/sem-permissao" });
  });
  it("ADMIN acessa tudo", async () => {
    session = as("ADMIN");
    for (const p of ["excel.import", "settings.manage", "users.manage", "appointments.cancel", "audit.view"] as const)
      await expect(s.requirePermission(p)).resolves.toMatchObject({ role: "ADMIN" });
  });
});

describe("helpers de segurança", () => {
  it("safeNext bloqueia open redirect", async () => {
    const { safeNext } = await import("@/lib/safe-redirect");
    expect(safeNext("/admin/agenda")).toBe("/admin/agenda");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "", null, undefined]) expect(safeNext(bad)).toBe("/admin");
  });
  it("assertSameOrigin: só aceita a mesma origem", async () => {
    const { assertSameOrigin } = await import("@/lib/http");
    const req = (origin: string | null, host = "app.test") => new Request("http://app.test/x", { method: "POST", headers: { ...(origin ? { origin } : {}), host } });
    expect(() => assertSameOrigin(req("http://app.test"))).not.toThrow();
    expect(() => assertSameOrigin(req("http://evil.test"))).toThrow();
    expect(() => assertSameOrigin(req(null))).toThrow();
  });
  it("mensagens de flash são assinadas: não dá para forjar", async () => {
    process.env.BOOKING_COOKIE_SECRET = "s".repeat(40);
    const { flashToken, readFlash } = await import("@/lib/flash");
    const t = flashToken("ok", "Salvo.");
    expect(readFlash({ f: t })).toEqual({ kind: "ok", msg: "Salvo." });
    expect(readFlash({ f: t.slice(0, -2) + "xx" })).toBeNull();
    expect(readFlash({ erro: "Sua conta foi bloqueada. Ligue 0800-FALSO" })).toBeNull();
  });
  it("erros do Postgres viram mensagens seguras (sem vazar detalhes)", async () => {
    const { mapDbError, MESSAGES } = await import("@/lib/errors");
    expect(mapDbError({ code: "P0001", message: "SLOT_TAKEN" }).message).toBe(MESSAGES.SLOT_TAKEN);
    expect(mapDbError({ code: "23P01", message: 'conflicting key value violates exclusion constraint "appointments_no_overlap"' }).message).toBe(MESSAGES.SLOT_TAKEN);
    expect(mapDbError({ code: "42501", message: "permission denied for table x" }).message).toBe(MESSAGES.FORBIDDEN);
    const generic = mapDbError({ code: "XX000", message: "relation \"secret_table\" stack trace at line 42" });
    expect(generic.message).toBe(MESSAGES.SAVE_FAILED);
    expect(generic.message).not.toMatch(/secret_table|stack/);
  });
});
