/**
 * Testes de integração contra um Postgres REAL (migrations + RLS + constraints + concorrência).
 * Rodam somente com TEST_DATABASE_URL (um Postgres descartável; o teste cria e apaga um banco próprio).
 *   TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client, Pool } from "pg";
import fs from "node:fs";
import path from "node:path";

const URL = process.env.TEST_DATABASE_URL;
const d = URL ? describe : describe.skip;

const PRO = "a0000000-0000-4000-8000-000000000001";
const PRO2 = "a0000000-0000-4000-8000-000000000002";
const PROC30 = "b0000000-0000-4000-8000-000000000001"; // Avaliação 30min
const PROC60 = "b0000000-0000-4000-8000-000000000003"; // Clareamento 60min
const PROC90 = "b0000000-0000-4000-8000-000000000005"; // Implante 90min (só Dra. Maria)
const ADMIN = "11111111-1111-4111-8111-111111111111";
const SEC = "22222222-2222-4222-8222-222222222222";
const NOPROFILE = "33333333-3333-4333-8333-333333333333";

const dbName = `t_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
let admin: Client;
let pool: Pool;

function urlFor(db: string) {
  const u = new globalThis.URL(URL!);
  u.pathname = `/${db}`;
  return u.toString();
}
const sql = (f: string) => fs.readFileSync(path.resolve(import.meta.dirname, f), "utf8");

async function book(c: { query: Pool["query"] }, o: Partial<Record<string, unknown>> = {}) {
  const a = { pac: null, nome: "Paciente Teste", tel: "91999990000", email: null, pro: PRO, proc: PROC30, data: "2026-10-07", ini: "14:30", fim: "15:00", status: "PENDENTE", obs: null, origem: "PUBLICO", actor: null, ...o };
  return c.query("select public.book_appointment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) as id",
    [a.pac, a.nome, a.tel, a.email, a.pro, a.proc, a.data, a.ini, a.fim, a.status, a.obs, a.origem, a.actor]);
}

/** Executa `fn` numa transação com papel/usuário simulados (como o PostgREST faz) e faz ROLLBACK. */
async function asUser<T>(role: "anon" | "authenticated", uid: string | null, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: urlFor(dbName) });
  await c.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid ?? ""]);
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    await c.end();
  }
}
/** UPDATE/DELETE em linhas que o RLS esconde não dá erro: afeta 0 linhas. Ambos os casos = bloqueado. */
const blocked = async (p: Promise<{ rowCount: number | null }>) => {
  try {
    expect((await p).rowCount).toBe(0);
  } catch (e) {
    expect(String((e as Error).message)).toMatch(/permission denied|row-level security|FORBIDDEN/);
  }
};
const denied = async (p: Promise<unknown>) => {
  await expect(p).rejects.toMatchObject({ message: expect.stringMatching(/permission denied|row-level security|FORBIDDEN/) });
};

d("banco de dados (Postgres real)", () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: URL });
    await admin.connect();
    await admin.query(`create database ${dbName}`);
    const c = new Client({ connectionString: urlFor(dbName) });
    await c.connect();
    await c.query(sql("db-bootstrap.sql"));
    for (const f of fs.readdirSync(path.resolve(import.meta.dirname, "../supabase/migrations")).sort())
      await c.query(sql(`../supabase/migrations/${f}`));
    await c.query(sql("../supabase/seed.sql"));
    await c.query("delete from appointments"); // agenda limpa; cadastros do seed ficam
    await c.query("insert into auth.users (id, email) values ($1,'admin@teste.test'),($2,'sec@teste.test'),($3,'x@teste.test')", [ADMIN, SEC, NOPROFILE]);
    await c.query("insert into profiles (id, nome, role) values ($1,'Admin Teste','ADMIN'),($2,'Sec Teste','SECRETARIA')", [ADMIN, SEC]);
    await c.end();
    pool = new Pool({ connectionString: urlFor(dbName), max: 25 });
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`drop database if exists ${dbName} with (force)`);
    await admin?.end();
  });

  it("migrations criam todas as tabelas com RLS ligado", async () => {
    const { rows } = await pool.query("select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'");
    const names = rows.map((r) => r.relname);
    for (const t of ["profiles", "professionals", "patients", "procedures", "availability_rules", "blocked_dates", "blocked_periods", "appointments", "audit_logs", "system_settings", "schedule_slots", "import_batches", "rate_limits"])
      expect(names).toContain(t);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  describe("conflito de horário (regra crítica)", () => {
    it("segundo agendamento no mesmo horário recebe SLOT_TAKEN", async () => {
      await book(pool, { data: "2026-11-02", ini: "10:00", fim: "10:30" });
      await expect(book(pool, { nome: "Outro", tel: "91999990001", data: "2026-11-02", ini: "10:00", fim: "10:30" })).rejects.toThrow("SLOT_TAKEN");
    });
    it("sobreposição parcial por duração também é barrada (60min sobre 30min)", async () => {
      await book(pool, { data: "2026-11-03", ini: "09:30", fim: "10:00" });
      await expect(book(pool, { proc: PROC60, nome: "Paciente B", tel: "91999990002", data: "2026-11-03", ini: "09:00", fim: "10:00" })).rejects.toThrow("SLOT_TAKEN");
      await book(pool, { proc: PROC60, nome: "Paciente B", tel: "91999990002", data: "2026-11-03", ini: "10:00", fim: "11:00" }); // colado, sem sobrepor: ok
    });
    it("profissionais diferentes podem ter o mesmo horário", async () => {
      await book(pool, { pro: PRO, data: "2026-11-04", ini: "10:00", fim: "10:30" });
      await book(pool, { pro: PRO2, nome: "Paciente C", tel: "91999990003", data: "2026-11-04", ini: "10:00", fim: "10:30" });
    });
    it("20 pacientes tentando o MESMO horário ao mesmo tempo: só 1 consegue", async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => book(pool, { nome: `Concorrente ${i}`, tel: `9199000${String(i).padStart(4, "0")}`, data: "2026-11-05", ini: "14:30", fim: "15:00" })),
      );
      const okCount = results.filter((r) => r.status === "fulfilled").length;
      const taken = results.filter((r) => r.status === "rejected" && /SLOT_TAKEN/.test(String((r as PromiseRejectedResult).reason?.message)));
      expect(okCount).toBe(1);
      expect(taken).toHaveLength(19);
      const { rows } = await pool.query("select count(*)::int n from appointments where data='2026-11-05' and hora_inicio='14:30'");
      expect(rows[0].n).toBe(1);
    });
    it("concorrência com horários sobrepostos deslocados: nunca dois ativos sobrepostos", async () => {
      const slots = [["09:00", "10:00"], ["09:30", "10:30"], ["10:00", "11:00"], ["09:15", "10:15"], ["10:30", "11:30"], ["08:30", "09:30"]];
      await Promise.allSettled(slots.map(([ini, fim], i) => book(pool, { proc: PROC60, nome: `P${i}`, tel: `9198000${i}00`.slice(0, 11), data: "2026-11-06", ini, fim })));
      const { rows } = await pool.query(`select count(*)::int n from appointments a join appointments b
        on a.profissional_id=b.profissional_id and a.id<b.id and a.periodo && b.periodo
        and a.status in ('PENDENTE','CONFIRMADO','REALIZADO') and b.status in ('PENDENTE','CONFIRMADO','REALIZADO') where a.data='2026-11-06'`);
      expect(rows[0].n).toBe(0);
    });
    it("cancelar libera o horário e mantém o registro (sem apagar)", async () => {
      const { rows: [a] } = await book(pool, { data: "2026-11-09", ini: "08:00", fim: "08:30" });
      await pool.query("update appointments set status='CANCELADO' where id=$1", [a.id]);
      await book(pool, { nome: "Novo", tel: "91999990099", data: "2026-11-09", ini: "08:00", fim: "08:30" });
      const { rows } = await pool.query("select status from appointments where id=$1", [a.id]);
      expect(rows[0].status).toBe("CANCELADO");
    });
    it("agendamentos não podem ser apagados por usuários (nem admin)", async () => {
      await asUser("authenticated", ADMIN, async (c) => denied(c.query("delete from appointments")));
    });
  });

  describe("validações dentro do banco (não confia no navegador)", () => {
    it("duração precisa bater com o procedimento", async () => {
      await expect(book(pool, { data: "2026-11-10", ini: "10:00", fim: "10:45" })).rejects.toThrow("INVALID_INPUT");
    });
    it("profissional precisa realizar o procedimento", async () => {
      await expect(book(pool, { pro: PRO2, proc: PROC90, data: "2026-11-10", ini: "10:00", fim: "11:30" })).rejects.toThrow("INVALID_INPUT");
    });
    it("profissional/procedimento inativos são recusados", async () => {
      await pool.query("update professionals set ativo=false where id=$1", [PRO2]);
      await expect(book(pool, { pro: PRO2, data: "2026-11-10", ini: "10:00", fim: "10:30" })).rejects.toThrow("INVALID_INPUT");
      await pool.query("update professionals set ativo=true where id=$1", [PRO2]);
    });
    it("status inicial inválido e origem inválida são recusados", async () => {
      await expect(book(pool, { status: "REALIZADO", data: "2026-11-10" })).rejects.toThrow("INVALID_INPUT");
      await expect(book(pool, { origem: "HACK", data: "2026-11-10" })).rejects.toThrow("INVALID_INPUT");
    });
    it("fluxo público não altera paciente existente (mesmo telefone+nome)", async () => {
      await pool.query("insert into patients (nome, telefone, email) values ('Fulano Fixo','91977770000','original@teste.test')");
      await book(pool, { nome: "fulano fixo", tel: "91977770000", email: "atacante@evil.test", data: "2026-11-11", ini: "10:00", fim: "10:30" });
      const { rows } = await pool.query("select email from patients where telefone='91977770000'");
      expect(rows).toEqual([{ email: "original@teste.test" }]);
    });
    it("auditoria é gravada na mesma transação do agendamento", async () => {
      const { rows } = await pool.query("select count(*)::int n from audit_logs where acao='CRIAR_AGENDAMENTO'");
      expect(rows[0].n).toBeGreaterThan(5);
    });
  });

  describe("remarcação", () => {
    it("move para horário livre; para horário ocupado falha e nada muda", async () => {
      const { rows: [a] } = await book(pool, { data: "2026-11-12", ini: "09:00", fim: "09:30", nome: "R1", tel: "91955550001" });
      await book(pool, { data: "2026-11-12", ini: "10:00", fim: "10:30", nome: "R2", tel: "91955550002" });
      await expect(pool.query("select public.reschedule_appointment($1,'2026-11-12','10:00','10:30',$2,$3)", [a.id, PRO, ADMIN])).rejects.toThrow("SLOT_TAKEN");
      let r = await pool.query("select hora_inicio from appointments where id=$1", [a.id]);
      expect(r.rows[0].hora_inicio).toBe("09:00:00");
      await pool.query("select public.reschedule_appointment($1,'2026-11-13','11:00','11:30',$2,$3)", [a.id, PRO, ADMIN]);
      r = await pool.query("select data::text d, hora_inicio from appointments where id=$1", [a.id]);
      expect(r.rows[0]).toEqual({ d: "2026-11-13", hora_inicio: "11:00:00" });
      const { rows } = await pool.query("select user_id from audit_logs where acao='REMARCAR_AGENDAMENTO' and entidade_id=$1", [a.id]);
      expect(rows[0].user_id).toBe(ADMIN);
    });
    it("remarcar sobrepondo o próprio horário é permitido (mover 30min)", async () => {
      const { rows: [a] } = await book(pool, { proc: PROC60, data: "2026-11-16", ini: "09:00", fim: "10:00", nome: "R3", tel: "91955550003" });
      await pool.query("select public.reschedule_appointment($1,'2026-11-16','09:30','10:30',$2,$3)", [a.id, PRO, ADMIN]);
    });
    it("cancelado não pode ser remarcado", async () => {
      const { rows: [a] } = await book(pool, { data: "2026-11-17", ini: "09:00", fim: "09:30", nome: "R4", tel: "91955550004" });
      await pool.query("update appointments set status='CANCELADO' where id=$1", [a.id]);
      await expect(pool.query("select public.reschedule_appointment($1,'2026-11-18','09:00','09:30',$2,$3)", [a.id, PRO, ADMIN])).rejects.toThrow("INVALID_STATE");
    });
  });

  describe("RLS e permissões no banco", () => {
    it("anon não lê nem escreve nada", async () => {
      for (const t of ["patients", "appointments", "professionals", "procedures", "system_settings", "audit_logs", "profiles", "availability_rules", "blocked_dates"])
        await asUser("anon", null, (c) => denied(c.query(`select * from ${t}`)));
      await asUser("anon", null, (c) => denied(c.query("insert into patients (nome, telefone) values ('x y','91999999999')")));
      await asUser("anon", null, (c) => denied(c.query("select public.book_appointment(null,'a b','91999999999',null,$1,$2,'2026-12-01','10:00','10:30','PENDENTE',null,'PUBLICO',null)", [PRO, PROC30])));
      await asUser("anon", null, (c) => denied(c.query("select public.check_rate_limit('x',1,1)")));
    });
    it("autenticado SEM perfil não enxerga dados", async () => {
      await asUser("authenticated", NOPROFILE, async (c) => {
        expect((await c.query("select * from patients")).rowCount).toBe(0);
        expect((await c.query("select * from appointments")).rowCount).toBe(0);
        await denied(c.query("insert into patients (nome, telefone) values ('x y','91999999999')"));
      });
    });
    it("SECRETARIA: lê agenda/pacientes, cria paciente, atualiza status; não cancela/remarca/edita cadastros", async () => {
      const { rows: [a] } = await book(pool, { data: "2026-11-19", ini: "09:00", fim: "09:30", nome: "S1", tel: "91955550010" });
      await asUser("authenticated", SEC, async (c) => {
        expect(((await c.query("select * from appointments")).rowCount ?? 0)).toBeGreaterThan(0);
        expect(((await c.query("select * from patients")).rowCount ?? 0)).toBeGreaterThan(0);
        await c.query("insert into patients (nome, telefone) values ('Nova Pessoa','91955551111')");
        await c.query("update appointments set status='CONFIRMADO' where id=$1", [a.id]);
        await denied(c.query("update appointments set status='CANCELADO' where id=$1", [a.id]));
      });
      await asUser("authenticated", SEC, async (c) => denied(c.query("update appointments set data='2026-11-20' where id=$1", [a.id])));
      await asUser("authenticated", SEC, async (c) => denied(c.query("insert into professionals (nome) values ('Fake Doutor')")));
      await asUser("authenticated", SEC, async (c) => blocked(c.query("update procedures set duracao_minutos=5")));
      await asUser("authenticated", SEC, async (c) => denied(c.query("insert into blocked_dates (data) values ('2026-12-25')")));
      await asUser("authenticated", SEC, async (c) => blocked(c.query("update system_settings set valor='{}'")));
      await asUser("authenticated", SEC, async (c) => {
        expect((await c.query("select * from audit_logs")).rowCount).toBe(0); // RLS filtra: só ADMIN lê
      });
      await asUser("authenticated", SEC, async (c) => {
        const r = await c.query("update patients set nome='Hackeada' where true");
        expect(r.rowCount).toBe(0); // só ADMIN edita pacientes
      });
      await asUser("authenticated", SEC, async (c) => blocked(c.query("update profiles set role='ADMIN' where id=$1", [SEC])));
    });
    it("ADMIN: cancela, edita cadastros e lê auditoria; não apaga nem altera logs", async () => {
      const { rows: [a] } = await book(pool, { data: "2026-11-19", ini: "10:00", fim: "10:30", nome: "S2", tel: "91955550011" });
      await asUser("authenticated", ADMIN, async (c) => {
        await c.query("update appointments set status='CANCELADO' where id=$1", [a.id]);
        await c.query("update procedures set descricao='ok' where id=$1", [PROC30]);
        expect(((await c.query("select * from audit_logs")).rowCount ?? 0)).toBeGreaterThan(0);
        await c.query("insert into audit_logs (user_id, acao, entidade) values ($1,'TESTE','x')", [ADMIN]);
      });
      await asUser("authenticated", ADMIN, async (c) => denied(c.query("update audit_logs set acao='X'")));
      await asUser("authenticated", ADMIN, async (c) => denied(c.query("delete from audit_logs")));
    });
    it("auditoria: não dá para registrar em nome de outro usuário", async () => {
      await asUser("authenticated", SEC, async (c) => denied(c.query("insert into audit_logs (user_id, acao, entidade) values ($1,'FORJADO','x')", [ADMIN])));
    });
    it("usuário desativado perde acesso imediatamente", async () => {
      await pool.query("update profiles set ativo=false where id=$1", [SEC]);
      await asUser("authenticated", SEC, async (c) => expect((await c.query("select * from patients")).rowCount).toBe(0));
      await pool.query("update profiles set ativo=true where id=$1", [SEC]);
    });
  });

  describe("planilha: operações transacionais", () => {
    const addMin = (h: string) => { const t = Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) + 30; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
    const up = (hora: string, status = "BLOQUEADO") => ({ op: "upsert", professional_id: PRO, data: "2026-12-01", hora_inicio: hora, hora_fim: addMin(hora), status, observacao: null });
    it("aplica upsert e delete; registra auditoria", async () => {
      const r = await pool.query("select public.apply_schedule_ops($1::jsonb,$2,'EDITAR_DISPONIBILIDADE','{}'::jsonb) as r", [JSON.stringify([up("09:00"), up("09:30")]), ADMIN]);
      expect(r.rows[0].r).toEqual({ gravados: 2, removidos: 0 });
      const del = await pool.query("select public.apply_schedule_ops($1::jsonb,$2,'EDITAR_DISPONIBILIDADE','{}'::jsonb) as r", [JSON.stringify([{ op: "delete", professional_id: PRO, data: "2026-12-01", hora_inicio: "09:30" }]), ADMIN]);
      expect(del.rows[0].r).toEqual({ gravados: 0, removidos: 1 });
    });
    it("uma operação inválida desfaz TODAS (nada parcial)", async () => {
      const before = (await pool.query("select count(*)::int n from schedule_slots")).rows[0].n;
      await expect(pool.query("select public.apply_schedule_ops($1::jsonb,$2,'IMPORTAR_EXCEL','{}'::jsonb)", [JSON.stringify([up("10:00"), up("10:30"), { op: "explode" }]), ADMIN])).rejects.toThrow();
      await expect(pool.query("select public.apply_schedule_ops($1::jsonb,$2,'IMPORTAR_EXCEL','{}'::jsonb)", [JSON.stringify([up("11:00"), { ...up("11:30"), status: "OCUPADO" }]), ADMIN])).rejects.toThrow(); // check constraint
      expect((await pool.query("select count(*)::int n from schedule_slots")).rows[0].n).toBe(before);
    });
    it("não bloqueia horário com agendamento ativo (desfaz tudo)", async () => {
      await book(pool, { data: "2026-12-02", ini: "09:00", fim: "09:30", nome: "Paciente P", tel: "91955550020" });
      const before = (await pool.query("select count(*)::int n from schedule_slots")).rows[0].n;
      const ops = [{ ...up("08:00"), data: "2026-12-02" }, { ...up("09:00"), data: "2026-12-02", hora_fim: "09:30" }];
      await expect(pool.query("select public.apply_schedule_ops($1::jsonb,$2,'IMPORTAR_EXCEL','{}'::jsonb)", [JSON.stringify(ops), ADMIN])).rejects.toThrow("CONFLICT_APPOINTMENT");
      expect((await pool.query("select count(*)::int n from schedule_slots")).rows[0].n).toBe(before);
    });
  });

  it("rate limit: bloqueia após o máximo e reabre a janela", async () => {
    const r: boolean[] = [];
    for (let i = 0; i < 5; i++) r.push((await pool.query("select public.check_rate_limit('t:ip1',3,60) as ok")).rows[0].ok);
    expect(r).toEqual([true, true, true, false, false]);
    expect((await pool.query("select public.check_rate_limit('t:ip2',3,60) as ok")).rows[0].ok).toBe(true); // outro IP não afetado
    await pool.query("update rate_limits set janela_inicio = now() - interval '2 minutes' where chave='t:ip1'");
    expect((await pool.query("select public.check_rate_limit('t:ip1',3,60) as ok")).rows[0].ok).toBe(true);
  });

  it("datas ficam exatamente como gravadas, mesmo com o fuso da sessão diferente (sem 07/10 -> 06/10)", async () => {
    const c = new Client({ connectionString: urlFor(dbName) });
    await c.connect();
    try {
      for (const tz of ["America/Sao_Paulo", "UTC", "Pacific/Auckland"]) {
        await c.query(`set timezone = '${tz}'`);
        const nome = `Tz ${tz.length}`;
        const tel = `9195555${String(tz.length).padStart(4, "0")}`;
        await book(c as unknown as Pool, { data: "2026-10-07", ini: "23:30", fim: "23:59", nome, tel, proc: PROC30 }).catch(() => null);
      }
      await c.query("set timezone = 'Pacific/Auckland'");
      await c.query("insert into appointments (paciente_id, profissional_id, procedimento_id, data, hora_inicio, hora_fim) select id, $1, $2, '2026-10-07', '22:00', '22:30' from patients limit 1", [PRO2, PROC30]);
      const { rows } = await c.query("select to_char(data,'DD/MM/YYYY') d, hora_inicio::text h from appointments where hora_inicio='22:00' and profissional_id=$1", [PRO2]);
      expect(rows[0]).toEqual({ d: "07/10/2026", h: "22:00:00" });
    } finally {
      await c.end();
    }
  });
});
