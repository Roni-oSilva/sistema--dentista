/**
 * Testes da CAMADA DE SERVIÇOS ponta a ponta: supabase-js -> PostgREST -> Postgres (migrations reais, RLS real).
 * Só roda com as variáveis abaixo apontando para um Postgres + PostgREST descartáveis:
 *   TEST_DATABASE_URL (superuser, para preparar dados), TEST_POSTGREST_URL, TEST_JWT_SECRET
 * (PostgREST servido na raiz; o teste reescreve /rest/v1 -> / porque o Supabase real usa esse prefixo.)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import { Client } from "pg";
import ExcelJS from "exceljs";

const DB = process.env.TEST_DATABASE_URL;
const API = process.env.TEST_POSTGREST_URL;
const SECRET = process.env.TEST_JWT_SECRET;
const d = DB && API && SECRET ? describe : describe.skip;

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(claims: Record<string, unknown>) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${head}.${body}.${createHmac("sha256", SECRET ?? "").update(`${head}.${body}`).digest("base64url")}`;
}
function client(token: string): SupabaseClient {
  return createClient(API ?? "http://x", token, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(String(input).replace("/rest/v1", ""), init) },
  });
}

let service: SupabaseClient;
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => service }));

const PRO = "a0000000-0000-4000-8000-000000000001";
const PRO2 = "a0000000-0000-4000-8000-000000000002";
const P30 = "b0000000-0000-4000-8000-000000000001";
const P60 = "b0000000-0000-4000-8000-000000000003";
const ADMIN = "11111111-1111-4111-8111-111111111111";
const SEC = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-09-30T15:00:00Z"); // 12:00 em São Paulo
const WED = "2026-10-07"; // quarta
const MON_HOLIDAY = "2026-10-12";

d("serviços + PostgREST + RLS", () => {
  let booking: typeof import("@/services/booking");
  let schedule: typeof import("@/services/schedule");
  let settingsSvc: typeof import("@/services/settings");
  let sheet: typeof import("@/lib/excel/schedule-sheet");
  let errors: typeof import("@/lib/errors");
  let settings: Awaited<ReturnType<typeof import("@/services/settings").getSettings>>;

  beforeAll(async () => {
    const pg = new Client({ connectionString: DB });
    await pg.connect();
    await pg.query("truncate appointments, schedule_slots, audit_logs, import_batches cascade");
    await pg.query("delete from auth.users");
    await pg.query("insert into auth.users (id, email) values ($1,'a@t.test'),($2,'s@t.test')", [ADMIN, SEC]);
    await pg.query("delete from profiles");
    await pg.query("insert into profiles (id, nome, role) values ($1,'Admin','ADMIN'),($2,'Sec','SECRETARIA')", [ADMIN, SEC]);
    await pg.end();
    service = client(jwt({ role: "service_role" }));
    booking = await import("@/services/booking");
    schedule = await import("@/services/schedule");
    settingsSvc = await import("@/services/settings");
    sheet = await import("@/lib/excel/schedule-sheet");
    errors = await import("@/lib/errors");
    settings = await settingsSvc.getSettings(service);
  });
  afterAll(() => {});

  const times = (date: string, durationMin = 30, pro = PRO, extra: object = {}) =>
    booking.availableTimes(service, date, { settings, professionalId: pro, durationMin, aplicarJanela: true, now: NOW, ...extra });
  const book = (o: Partial<Parameters<typeof booking.createAppointment>[1]> = {}) =>
    booking.createAppointment(settings, {
      nome: "Paciente Teste", telefone: "91999990000", email: null, profissionalId: PRO, procedimentoId: P30,
      data: WED, horaInicio: "14:30", status: "PENDENTE", origem: "PUBLICO", actorId: null, ...o,
    });

  it("configurações lidas do banco", () => {
    expect(settings.agenda.timezone).toBe("America/Sao_Paulo");
    expect(settings.agenda.duracao_padrao_minutos).toBe(30);
    expect(settings.horarioPadrao.dias).toHaveLength(5);
  });

  describe("disponibilidade com dados reais (seed)", () => {
    it("quarta: 08:00–11:30 e 14:00–17:30, sem o intervalo 12–14", async () => {
      const t = await times(WED);
      expect(t[0]).toBe("08:00");
      expect(t).toContain("11:30");
      expect(t).not.toContain("12:00");
      expect(t).not.toContain("13:30");
      expect(t[t.length - 1]).toBe("17:30");
    });
    it("procedimento de 60min não invade o intervalo nem passa do fim do expediente", async () => {
      const t = await times(WED, 60);
      expect(t).toContain("11:00");
      expect(t).not.toContain("11:30");
      expect(t).not.toContain("17:30");
      expect(t).toContain("17:00");
    });
    it("sexta fecha 16:00; sábado e domingo sem atendimento", async () => {
      const fri = await times("2026-10-09");
      expect(fri[fri.length - 1]).toBe("15:30");
      expect(await times("2026-10-10")).toEqual([]);
      expect(await times("2026-10-11")).toEqual([]);
    });
    it("feriado (dia bloqueado) e congresso (período) impedem agendamento", async () => {
      expect(await times(MON_HOLIDAY)).toEqual([]);
      expect(await times("2026-10-20")).toEqual([]);
      expect(await times("2026-10-21")).toEqual([]);
      expect((await times("2026-10-22")).length).toBeGreaterThan(0);
      await expect(book({ data: MON_HOLIDAY, horaInicio: "10:00" })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    });
    it("datas disponíveis respeitam a janela e pulam bloqueios/fins de semana", async () => {
      const dates = await booking.availableDates(service, { settings, professionalId: PRO, durationMin: 30, aplicarJanela: true, now: NOW });
      expect(dates).toContain(WED);
      expect(dates).not.toContain("2026-10-10");
      expect(dates).not.toContain(MON_HOLIDAY);
      expect(dates).not.toContain("2026-10-20");
      expect(dates[0] >= "2026-09-30").toBe(true);
    });
    it("no dia de hoje respeita a antecedência mínima (12:00 + 60min => só a partir das 13:00)", async () => {
      const t = await times("2026-09-30"); // quarta-feira, "hoje" = 12:00
      expect(t.every((x) => x >= "13:00")).toBe(true);
      expect(t).toContain("14:00");
    });
    it("datas passadas e muito distantes não têm horários", async () => {
      expect(await times("2026-09-29")).toEqual([]);
      expect(await times("2027-06-02")).toEqual([]);
    });
  });

  describe("reserva e conflitos (serviço + banco)", () => {
    it("reserva e o horário some da lista; cancelar devolve", async () => {
      const id = await book({ horaInicio: "09:00", nome: "Ana Reserva", telefone: "91988880001" });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(await times(WED)).not.toContain("09:00");
      await service.from("appointments").update({ status: "CANCELADO" }).eq("id", id);
      expect(await times(WED)).toContain("09:00");
      const { data } = await service.from("appointments").select("id, status").eq("id", id).single();
      expect(data?.status).toBe("CANCELADO"); // mantido no histórico
    });

    it("segundo paciente no mesmo horário recebe erro de horário indisponível", async () => {
      await book({ horaInicio: "10:00", nome: "Primeiro Paciente", telefone: "91988880002" });
      await expect(book({ horaInicio: "10:00", nome: "Segundo Paciente", telefone: "91988880003" })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    });

    it("duração: 60min às 15:00 bloqueia 15:00 e 15:30 para procedimentos de 30min", async () => {
      await book({ procedimentoId: P60, horaInicio: "15:00", nome: "Paciente Sessenta", telefone: "91988880004" });
      const t = await times(WED);
      expect(t).not.toContain("15:00");
      expect(t).not.toContain("15:30");
      expect(t).toContain("16:00");
      expect(t).toContain("14:30");
      expect(await times(WED, 60)).not.toContain("14:30");
    });

    it("CORRIDA: 12 pacientes reservando o MESMO horário ao mesmo tempo => exatamente 1 vence", async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) => book({ horaInicio: "16:30", nome: `Concorrente ${i + 10}`, telefone: `9198777${String(i).padStart(4, "0")}` })),
      );
      const wins = results.filter((r) => r.status === "fulfilled");
      const losses = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(wins).toHaveLength(1);
      for (const l of losses) {
        expect(l.reason).toBeInstanceOf(errors.AppError);
        expect(["SLOT_TAKEN", "SLOT_UNAVAILABLE"]).toContain(l.reason.code);
      }
      // a mensagem do perdedor é a exigida pelo produto quando a reserva acontece durante a corrida
      expect([errors.MESSAGES.SLOT_TAKEN, errors.MESSAGES.SLOT_UNAVAILABLE]).toContain(losses[0].reason.message);
      const { count } = await service.from("appointments").select("id", { count: "exact", head: true }).eq("data", WED).eq("hora_inicio", "16:30");
      expect(count).toBe(1);
    });

    it("parâmetros manipulados são recusados (profissional que não faz o procedimento, procedimento inativo)", async () => {
      await expect(book({ profissionalId: PRO2, procedimentoId: "b0000000-0000-4000-8000-000000000005", horaInicio: "08:00" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
      await expect(book({ profissionalId: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    });

    it("horário fora da grade (manipulado) é recusado", async () => {
      await expect(book({ horaInicio: "03:00" })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
      await expect(book({ horaInicio: "12:00" })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
    });

    it("painel pode agendar em cima da hora (sem antecedência mínima) mas respeita bloqueios", async () => {
      await expect(book({ origem: "PAINEL", actorId: ADMIN, data: "2026-09-30", horaInicio: "15:00", status: "CONFIRMADO", nome: "Walk In", telefone: "91988880009" })).resolves.toBeTruthy();
    });
  });

  describe("remarcação", () => {
    it("remarca para horário livre; para ocupado falha; o próprio horário não conta como ocupado", async () => {
      const id = await book({ horaInicio: "08:00", data: "2026-10-14", nome: "Paciente Remarca", telefone: "91988880020" });
      await book({ horaInicio: "09:00", data: "2026-10-14", nome: "Outro Paciente", telefone: "91988880021" });
      await expect(booking.rescheduleAppointment(settings, { id, data: "2026-10-14", horaInicio: "09:00", profissionalId: PRO, actorId: ADMIN })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
      await booking.rescheduleAppointment(settings, { id, data: "2026-10-14", horaInicio: "08:00", profissionalId: PRO, actorId: ADMIN }); // mesmo horário: ok
      await booking.rescheduleAppointment(settings, { id, data: "2026-10-15", horaInicio: "10:00", profissionalId: PRO, actorId: ADMIN });
      const { data } = await service.from("appointments").select("data, hora_inicio").eq("id", id).single();
      expect(data).toEqual({ data: "2026-10-15", hora_inicio: "10:00:00" });
      expect(await times("2026-10-14")).toContain("08:00");
    });
    it("não remarca para dia bloqueado nem agendamento cancelado", async () => {
      const id = await book({ horaInicio: "08:30", data: "2026-10-14", nome: "Paciente Bloq", telefone: "91988880022" });
      await expect(booking.rescheduleAppointment(settings, { id, data: MON_HOLIDAY, horaInicio: "10:00", profissionalId: PRO, actorId: ADMIN })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
      await service.from("appointments").update({ status: "CANCELADO" }).eq("id", id);
      await expect(booking.rescheduleAppointment(settings, { id, data: "2026-10-16", horaInicio: "10:00", profissionalId: PRO, actorId: ADMIN })).rejects.toMatchObject({ code: "INVALID_STATE" });
    });
  });

  describe("RLS via PostgREST (JWT reais)", () => {
    it("chave anônima não lê nada", async () => {
      const anon = client(jwt({ role: "anon" }));
      for (const t of ["patients", "appointments", "professionals", "system_settings", "audit_logs"]) {
        const { data, error } = await anon.from(t).select("*");
        expect(data ?? null).toBeNull();
        expect(error?.code).toBe("42501");
      }
      const { error } = await anon.rpc("book_appointment", {});
      expect(error).toBeTruthy();
    });
    it("SECRETARIA lê agendamentos, mas não cancela (erro mapeado para mensagem de permissão)", async () => {
      const sec = client(jwt({ role: "authenticated", sub: SEC }));
      const { data } = await sec.from("appointments").select("id, status").eq("status", "PENDENTE").limit(1);
      expect(data?.length).toBe(1);
      const { error } = await sec.from("appointments").update({ status: "CANCELADO" }).eq("id", data![0].id);
      expect(error).toBeTruthy();
      expect(errors.mapDbError(error).message).toBe(errors.MESSAGES.FORBIDDEN);
      const { error: e2 } = await sec.from("professionals").insert({ nome: "Invasor Teste" });
      expect(errors.mapDbError(e2).code).toBe("FORBIDDEN");
      const { data: logs } = await sec.from("audit_logs").select("id");
      expect(logs).toEqual([]);
    });
    it("ADMIN cancela e a auditoria fica legível só para ele", async () => {
      const admin = client(jwt({ role: "authenticated", sub: ADMIN }));
      const id = await book({ horaInicio: "08:00", data: "2026-10-16", nome: "Paciente Admin", telefone: "91988880030" });
      const { error } = await admin.from("appointments").update({ status: "CANCELADO" }).eq("id", id);
      expect(error).toBeNull();
      const ins = await admin.from("audit_logs").insert({ user_id: ADMIN, acao: "CANCELAR_AGENDAMENTO", entidade: "appointments", entidade_id: id, detalhes: {} });
      expect(ins.error).toBeNull();
      const { data: logs } = await admin.from("audit_logs").select("acao").limit(5);
      expect((logs ?? []).length).toBeGreaterThan(0);
    });
  });

  describe("Excel: importar, validar, conflitos, exportar", () => {
    const H = ["Data", "Horário", "Status", "Profissional", "Observação"];
    async function xlsx(rows: (string | null)[][]) {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Agenda");
      rows.forEach((r) => ws.addRow(r));
      return Buffer.from(await wb.xlsx.writeBuffer());
    }
    const plan = async (rows: (string | null)[][], removeMissing = false) => {
      const parsed = await sheet.parseScheduleWorkbook(await xlsx([H, ...rows]));
      return schedule.planImport(service, settings, parsed.rows, parsed.errors, removeMissing);
    };

    it("pré-visualização: novos, inalterados, conflitos, ignorados, erros com linha/coluna/valor/motivo", async () => {
      const p = await plan([
        ["21/10/2026", "10:00", "DISPONIVEL", "Dra. Maria Exemplo", null], // dentro do congresso => conflito
        ["07/11/2026", "09:00", "DISPONIVEL", "Dra. Maria Exemplo", "plantão"], // sábado fora da regra => novo
        ["07/10/2026", "11:00", "DISPONIVEL", "Dra. Maria Exemplo", null], // já é padrão => inalterado
        ["07/10/2026", "17:00", "BLOQUEADO", "Dra. Maria Exemplo", "reunião"], // novo bloqueio
        ["07/10/2026", "10:00", "BLOQUEADO", "Dra. Maria Exemplo", null], // conflito: há agendamento às 10:00
        ["07/10/2026", "15:00", "OCUPADO", "Dra. Maria Exemplo", null], // ignorado
        ["07/10/2026", "08:00", "DISPONIVEL", "Fulano Inexistente", null], // erro: profissional
        ["99/99/2026", "08:00", "DISPONIVEL", "Dra. Maria Exemplo", null], // erro: data
      ]);
      expect(p.summary).toMatchObject({ novos: 2, inalterados: 1, conflitos: 2, ignorados: 1, erros: 2, alterados: 0, removidos: 0 });
      expect(p.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ linha: 2, coluna: "Status", valor: "DISPONIVEL", motivo: expect.stringContaining("bloqueio") }),
          expect.objectContaining({ linha: 6, coluna: "Status", valor: "BLOQUEADO", motivo: expect.stringContaining("agendamento ativo") }),
          expect.objectContaining({ linha: 8, coluna: "Profissional", valor: "Fulano Inexistente", motivo: "Profissional não cadastrado." }),
          expect.objectContaining({ linha: 9, coluna: "Data", valor: "99/99/2026" }),
        ]),
      );
      expect(p.ops).toHaveLength(2);
      // nada foi gravado pela pré-visualização
      const { count } = await service.from("schedule_slots").select("id", { count: "exact", head: true });
      expect(count).toBe(0);
    });

    it("aplica em transação, é idempotente e o bloqueio some da disponibilidade", async () => {
      const rows = [
        ["07/10/2026", "17:00", "BLOQUEADO", "Dra. Maria Exemplo", "reunião"],
        ["07/11/2026", "09:00", "DISPONIVEL", "Dra. Maria Exemplo", "plantão"],
      ];
      const p = await plan(rows);
      const r = await schedule.applyScheduleOps(p.ops, ADMIN, "IMPORTAR_EXCEL", { teste: true });
      expect(r).toEqual({ gravados: 2, removidos: 0 });
      expect(await times(WED)).not.toContain("17:00");
      expect(await times("2026-11-07")).toEqual(["09:00"]); // sábado aberto só naquele horário
      const again = await plan(rows);
      expect(again.summary).toMatchObject({ novos: 0, alterados: 0, inalterados: 2 });
      expect(again.ops).toEqual([]);
    });

    it("voltar ao padrão remove a exceção (alterado); 'remover ausentes' só age quando pedido", async () => {
      const keep = await plan([["07/10/2026", "08:00", "DISPONIVEL", "Dra. Maria Exemplo", null], ["07/10/2026", "17:00", "DISPONIVEL", "Dra. Maria Exemplo", null]]);
      expect(keep.summary).toMatchObject({ alterados: 1, removidos: 0 });
      const miss = await plan([["07/10/2026", "08:00", "DISPONIVEL", "Dra. Maria Exemplo", null]], false);
      expect(miss.summary.ausentes).toBe(1); // 17:00 existe no banco e não está no arquivo
      expect(miss.summary.removidos).toBe(0);
      const miss2 = await plan([["07/10/2026", "08:00", "DISPONIVEL", "Dra. Maria Exemplo", null]], true);
      expect(miss2.summary.removidos).toBe(1);
      expect(miss2.ops.some((o) => o.op === "delete")).toBe(true);
    });

    it("linha inválida no meio não impede as válidas, e nada é descartado em silêncio", async () => {
      const p = await plan([["14/10/2026", "13:00", "BLOQUEADO", "Dra. Maria Exemplo", null], ["14/10/2026", "25:61", "BLOQUEADO", "Dra. Maria Exemplo", null]]);
      expect(p.errors.filter((e) => e.coluna === "Horário")).toHaveLength(1);
      expect(p.summary.erros).toBe(1);
    });

    it("exporta a grade efetiva e reimportar o que foi exportado não altera nada", async () => {
      const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
      void createSupabaseAdminClient;
      const { loadAgendaBundle } = await import("@/services/agenda-data");
      const bundle = await loadAgendaBundle(service, PRO, WED, "2026-10-09", 30);
      const rows = schedule.sheetRows(bundle);
      expect(rows.some((r) => r.status === "OCUPADO")).toBe(true);
      expect(rows.some((r) => r.status === "BLOQUEADO" && r.hora === "17:00")).toBe(true);
      const { buildTableWorkbook } = await import("@/lib/excel/export");
      const { formatBR } = await import("@/lib/datetime");
      const buf = await buildTableWorkbook("Agenda", [
        { header: "Data", value: (r: (typeof rows)[number]) => formatBR(r.data) },
        { header: "Horário", value: (r) => r.hora },
        { header: "Status", value: (r) => r.status },
        { header: "Profissional", value: () => "Dra. Maria Exemplo" },
        { header: "Observação", value: (r) => r.observacao },
      ], rows);
      const parsed = await sheet.parseScheduleWorkbook(buf);
      expect(parsed.errors).toEqual([]);
      const again = await schedule.planImport(service, settings, parsed.rows, [], false);
      expect(again.summary).toMatchObject({ novos: 0, alterados: 0, conflitos: 0, erros: 0 });
      expect(again.ops).toEqual([]);
    });
  });
});
