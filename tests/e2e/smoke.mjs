import { chromium } from "playwright-core";
import ExcelJS from "exceljs";
import fs from "node:fs";
import pg from "pg";
import os from "node:os";
import path from "node:path";

// Roteiro de navegador (Chromium/Playwright) contra o app rodando com o Supabase falso.
// Env: BASE (padrão http://localhost:3100), DATABASE_URL (Postgres do teste), CHROME_PATH (Chromium).
const BASE = process.env.BASE || "http://localhost:3100";
const results = [];
const check = (name, cond, extra = "") => { results.push([cond ? "OK " : "FAIL", name, cond ? "" : extra]); console.log(cond ? "OK  " : "FAIL", name, cond ? "" : extra); if (!cond) process.exitCode = 1; };
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH, args: ["--no-sandbox"] });
const errors = [];
async function newPage(ctx) { const p = await ctx.newPage(); p.on("pageerror", e => errors.push(String(e))); p.on("console", m => { if (m.type() === "error" && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); }); return p; }

// ---------- fluxo público até o resumo ----------
async function toSummary(ctx, nome, tel, pickTime) {
  const p = await newPage(ctx);
  await p.goto(`${BASE}/agendamento`);
  await Promise.all([p.waitForURL(/profissional/), p.click("text=Avaliação")]);
  await Promise.all([p.waitForURL(/\/data/), p.click("text=Dra. Maria Exemplo")]);
  await Promise.all([p.waitForURL(/horario/), p.locator("ul a").first().click()]);           // primeira data
  const url1 = p.url();
  const times = await p.locator("ul a").allInnerTexts();
  await Promise.all([p.waitForURL(/dados/), p.getByRole("link", { name: pickTime ?? times[0], exact: true }).click()]);
  await p.fill("#nome", nome); await p.fill("#telefone", tel); await p.check("input[name=consentimento]");
  await p.click("text=Continuar");
  await p.waitForURL(/resumo/);
  return { p, url1, times };
}

const ctxA = await browser.newContext();
const a = await toSummary(ctxA, "Maria Clara Teste", "(91) 98888-1111");
check("público: chegou ao resumo com os dados", (await a.p.textContent("main")).includes("Maria Clara Teste") && (await a.p.textContent("main")).includes("(91) 98888-1111"));
check("público: horários exibidos são 'HH:MM'", a.times.length > 0 && a.times.every(t => /^\d\d:\d\d$/.test(t)), a.times.join());
const slotUrl = a.p.url();
await a.p.click("text=Confirmar agendamento");
await a.p.waitForURL(/confirmado/);
const txt = await a.p.textContent("main");
check("público: confirmação mostra mensagem NOVO AGENDAMENTO", txt.includes("NOVO AGENDAMENTO") && txt.includes("Paciente: Maria Clara Teste") && txt.includes("Procedimento: Avaliação"), txt);
const wa = await a.p.getAttribute("a[href^='https://wa.me']", "href");
check("público: link do WhatsApp gerado para o número da clínica", wa?.startsWith("https://wa.me/5591988887777?text=") && decodeURIComponent(wa).includes("Profissional: Dra. Maria Exemplo"), wa);
const { rows } = await db.query("select a.status, a.origem, p.nome from appointments a join patients p on p.id=a.paciente_id");
check("público: agendamento PENDENTE/PUBLICO gravado", rows.length === 1 && rows[0].status === "PENDENTE" && rows[0].origem === "PUBLICO", JSON.stringify(rows));

// ---------- corrida real entre dois navegadores no MESMO horário ----------
const q = new URL(slotUrl).searchParams;
const pickTime = q.get("horario");
const ctxB = await browser.newContext(), ctxC = await browser.newContext();
const b = await toSummary(ctxB, "Paciente Bravo", "(91) 98888-2222", null);
const c = await toSummary(ctxC, "Paciente Charlie", "(91) 98888-3333", new URL(b.p.url()).searchParams.get("horario"));
check("corrida: B e C escolheram o mesmo horário", new URL(b.p.url()).searchParams.get("horario") === new URL(c.p.url()).searchParams.get("horario"));
await Promise.all([b.p.click("text=Confirmar agendamento"), c.p.click("text=Confirmar agendamento")]);
await Promise.all([b.p.waitForLoadState("networkidle"), c.p.waitForLoadState("networkidle")]);
await b.p.waitForTimeout(800);
const okPages = [b.p, c.p].filter(p => /confirmado/.test(p.url())).length;
const lostPage = [b.p, c.p].find(p => !/confirmado/.test(p.url()));
check("corrida: exatamente um confirmou", okPages === 1, `${b.p.url()} | ${c.p.url()}`);
const lostText = lostPage ? await lostPage.textContent("main") : "";
check("corrida: o outro recebe 'Este horário acabou de ser reservado. Escolha outro horário.' e volta para escolher horário", /horario/.test(lostPage?.url() ?? "") && lostText.includes("Este horário acabou de ser reservado. Escolha outro horário."), (lostPage?.url() ?? "") + " " + lostText.slice(0, 200));
const dup = await db.query("select count(*)::int n from appointments where data = (select data from appointments order by criado_em desc limit 1) and hora_inicio = (select hora_inicio from appointments order by criado_em desc limit 1) and status='PENDENTE'");
check("corrida: banco tem 1 agendamento por horário", dup.rows[0].n === 1);

// ---------- proteção de parâmetros ----------
const evil = await newPage(ctxA);
await evil.goto(`${BASE}/agendamento/horario?procedimento=1%27%20or%201=1--&profissional=x&data=2026-02-31`);
check("parâmetros manipulados: redireciona sem erro 500", /procedimento$/.test(evil.url()), evil.url());
const r = await evil.request.get(`${BASE}/admin`, { maxRedirects: 0 });
check("anônimo em /admin é redirecionado ao login", r.status() >= 300 && r.status() < 400 && (r.headers().location ?? "").includes("/login"), String(r.status()));
for (const path of ["/api/admin/export/agenda", "/api/admin/export/pacientes"]) {
  const x = await evil.request.get(BASE + path);
  check(`anônimo não exporta ${path}`, x.status() === 401, String(x.status()));
}
const imp = await evil.request.post(`${BASE}/api/admin/import`, { multipart: { arquivo: { name: "a.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("x") } } });
check("anônimo não importa (sem origin => 403)", imp.status() === 403, String(imp.status()));

// ---------- login ----------
const ctxAdmin = await browser.newContext();
const ad = await newPage(ctxAdmin);
await ad.goto(`${BASE}/login`);
await ad.fill("#email", "admin@test.test"); await ad.fill("#password", "senha-errada-123"); await ad.click("button[type=submit]");
await ad.waitForSelector("p[role=alert]");
check("login: senha errada mostra mensagem genérica", (await ad.textContent("p[role=alert]")).includes("E-mail ou senha incorretos."));
await ad.fill("#password", "AdminPass123"); await ad.click("button[type=submit]");
await ad.waitForURL(`${BASE}/admin`, { waitUntil: "commit" });
check("login: admin entra no dashboard", (await ad.textContent("main")).includes("Dashboard"));
const audLogin = await db.query("select count(*)::int n from audit_logs where acao='LOGIN'");
check("auditoria: LOGIN registrado", audLogin.rows[0].n === 1);

// ---------- todas as páginas do admin renderizam ----------
const pages = ["/admin", "/admin/agenda", "/admin/agendamentos", "/admin/agendamentos/novo", "/admin/pacientes", "/admin/profissionais", "/admin/procedimentos", "/admin/bloqueios", "/admin/planilha", "/admin/importar", "/admin/configuracoes", "/admin/usuarios", "/admin/auditoria", "/admin/alterar-senha"];
for (const path of pages) {
  const resp = await ad.goto(BASE + path);
  const body = await ad.textContent("body");
  check(`admin renderiza ${path}`, resp.status() === 200 && !/Application error|Unhandled|digest/i.test(body), `${resp.status()} ${body.slice(0, 150)}`);
}

// ---------- painel: criar agendamento ----------
const { rows: apps } = await db.query("select id, data::text d from appointments order by criado_em limit 1");
await ad.goto(`${BASE}/admin/agenda?data=${apps[0].d}&profissional=a0000000-0000-4000-8000-000000000001`);
check("agenda mostra o agendamento como OCUPADO com o nome do paciente", (await ad.textContent("table")).includes("OCUPADO") && (await ad.textContent("table")).includes("Maria Clara Teste"));
const procId = "b0000000-0000-4000-8000-000000000003"; // 60 min
await ad.goto(`${BASE}/admin/agendamentos/novo?procedimento=${procId}&profissional=a0000000-0000-4000-8000-000000000001&data=${apps[0].d}`);
const opts = await ad.locator("#hora_inicio option").allInnerTexts();
check("painel: horários do procedimento de 60min (sem o ocupado)", opts.length > 0 && !opts.includes(new URL(slotUrl).searchParams.get("horario")), opts.join());
await ad.fill("#nome", "Paciente Painel"); await ad.fill("#telefone", "(91) 97777-0001");
await ad.selectOption("#hora_inicio", opts[opts.length - 1]);
await ad.click("text=Criar agendamento");
await ad.waitForURL(/agendamentos\/[0-9a-f-]{36}/);
check("painel: agendamento criado e confirmado", (await ad.textContent("main")).includes("Agendamento criado.") && (await ad.textContent("main")).includes("CONFIRMADO"));
const detailUrl = ad.url();
// remarcar
const newDate = await db.query("select (data + 1)::text d from appointments where origem='PAINEL'");
await ad.fill("#data", newDate.rows[0].d);
await ad.click("text=Ver horários");
await ad.waitForSelector("text=Novo horário");
await ad.click("button:has-text('Remarcar')");
await ad.waitForSelector("text=Agendamento remarcado.");
const moved = await db.query("select data::text d from appointments where origem='PAINEL'");
check("remarcação: data alterada sem deslocar dia", moved.rows[0].d === newDate.rows[0].d, JSON.stringify(moved.rows));
// cancelar
ad.once("dialog", d => d.accept());
await ad.click("text=Cancelar consulta");
await ad.waitForSelector("text=Agendamento cancelado");
const canc = await db.query("select status from appointments where origem='PAINEL'");
check("cancelamento: status CANCELADO e registro mantido", canc.rows[0].status === "CANCELADO");
const aud = await db.query("select acao from audit_logs where acao in ('CRIAR_AGENDAMENTO','REMARCAR_AGENDAMENTO','CANCELAR_AGENDAMENTO')");
check("auditoria: criar/remarcar/cancelar registrados", new Set(aud.rows.map(r => r.acao)).size === 3, JSON.stringify(aud.rows));

// ---------- planilha: editar, restaurar ----------
const sunday = await db.query("select (current_date + ((7 - extract(dow from current_date)::int) % 7 + 7))::text d");
await ad.goto(`${BASE}/admin/planilha?profissional=a0000000-0000-4000-8000-000000000001&de=${sunday.rows[0].d}&ate=${sunday.rows[0].d}`);
check("planilha: domingo sem horários", (await ad.textContent("table")).includes("Sem horários no período"));
await ad.fill("section input[name=data]", sunday.rows[0].d); await ad.fill("section input[name=hora_inicio]", "09:00");
await ad.locator("section").first().locator("button:has-text('Salvar')").click();
await ad.waitForSelector("text=Linha salva.");
const ov = await db.query("select status from schedule_slots where data=$1", [sunday.rows[0].d]);
check("planilha: exceção DISPONIVEL criada", ov.rows[0]?.status === "DISPONIVEL");
ad.once("dialog", d => d.accept());
await ad.click("button:has-text('Restaurar padrão')");
await ad.waitForSelector("text=Exceção removida");
check("planilha: restaurar padrão remove exceção", (await db.query("select 1 from schedule_slots where data=$1", [sunday.rows[0].d])).rowCount === 0);

// ---------- bloqueios ----------
await ad.goto(`${BASE}/admin/bloqueios`);
await ad.fill("form:has(input[name=data]) input[name=data]", "2026-12-25");
await ad.fill("form:has(input[name=data]) input[name=motivo]", "Natal");
await ad.locator("form:has(input[name=data]) button:has-text('Bloquear')").first().click();
await ad.waitForSelector("text=Data bloqueada");
check("bloqueios: dia bloqueado gravado", (await db.query("select 1 from blocked_dates where data='2026-12-25'")).rowCount === 1);

// ---------- importar Excel pela interface ----------
const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Agenda");
ws.addRow(["Data", "Horário", "Status", "Profissional", "Observação"]);
ws.addRow(["14/10/2026", "16:00", "BLOQUEADO", "Dra. Maria Exemplo", "reunião"]);
ws.addRow(["15/10/2026", "99:99", "BLOQUEADO", "Dra. Maria Exemplo", ""]);
ws.addRow(["16/10/2026", "09:00", "BLOQUEADO", "Dr. Fantasma", ""]);
const impFile = path.join(os.tmpdir(), `imp-${Date.now()}.xlsx`);
fs.writeFileSync(impFile, Buffer.from(await wb.xlsx.writeBuffer()));
await ad.goto(`${BASE}/admin/importar`);
await ad.setInputFiles("#arquivo", impFile);
await ad.click("button:has-text('Validar arquivo')");
await ad.waitForSelector("text=Resumo da importação");
const prev = await ad.textContent("main");
check("importação: resumo + 'irá alterar X registros'", prev.includes("Esta importação irá alterar 1 registros") && /Novos:\s*1/.test(prev) && /Com erro:\s*2/.test(prev), prev.slice(0, 500));
check("importação: erros com linha/coluna/valor/motivo", prev.includes("99:99") && prev.includes("Horário inválido") && prev.includes("Dr. Fantasma") && prev.includes("Profissional não cadastrado."));
check("importação: nada gravado antes de confirmar", (await db.query("select 1 from schedule_slots where data='2026-10-14'")).rowCount === 0);
await ad.click("button:has-text('Confirmar importação')");
await ad.waitForSelector("text=Importação concluída");
check("importação: confirmada grava as válidas", (await db.query("select observacao from schedule_slots where data='2026-10-14' and hora_inicio='16:00'")).rows[0]?.observacao === "reunião");
check("auditoria: IMPORTAR_EXCEL registrado", (await db.query("select 1 from audit_logs where acao='IMPORTAR_EXCEL'")).rowCount === 1);
await ad.setInputFiles("#arquivo", { name: "falso.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("isto nao e excel") });
await ad.click("button:has-text('Validar arquivo')");
await ad.waitForSelector("p[role=alert]");
check("importação: arquivo inválido => 'Arquivo Excel inválido.'", (await ad.textContent("p[role=alert]")).includes("Arquivo Excel inválido"));

// ---------- exportação (download) ----------
const dl = await ad.request.get(`${BASE}/api/admin/export/agenda?profissional=a0000000-0000-4000-8000-000000000001&de=2026-10-14&ate=2026-10-14`);
const exp = Buffer.from(await dl.body());
const ewb = new ExcelJS.Workbook(); await ewb.xlsx.load(exp);
const rowsX = []; ewb.worksheets[0].eachRow(r => rowsX.push(r.values.slice(1)));
check("exportação: xlsx válido com cabeçalho e datas em DD/MM/AAAA", dl.status() === 200 && rowsX[0].join() === "Data,Horário,Status,Profissional,Observação" && rowsX.some(r => r[0] === "14/10/2026" && r[1] === "16:00" && r[2] === "BLOQUEADO" && r[4] === "reunião"), JSON.stringify(rowsX.slice(0, 3)));
const pacs = await ad.request.get(`${BASE}/api/admin/export/pacientes`);
check("exportação: pacientes", pacs.status() === 200);

// ---------- configurações / usuários ----------
await ad.goto(`${BASE}/admin/configuracoes`);
await ad.fill("#nome", "Clínica Teste"); await ad.locator("form:has(#whatsapp) button").click();
await ad.waitForSelector("text=Dados da clínica salvos.");
check("configurações: salvas", (await db.query("select valor->>'nome' n from system_settings where chave='clinica'")).rows[0].n === "Clínica Teste");
await ad.goto(`${BASE}/admin/profissionais`);
await ad.fill("form input[name=nome]", "Dra. Nova Teste"); await ad.locator("form:has(input[name=registro_profissional]) button:has-text('Criar')").click();
await ad.waitForSelector("text=Profissional criado");
check("profissionais: criado", (await db.query("select 1 from professionals where nome='Dra. Nova Teste'")).rowCount === 1);

// ---------- secretaria ----------
const ctxSec = await browser.newContext(); const sc = await newPage(ctxSec);
await sc.goto(`${BASE}/login`); await sc.fill("#email", "sec@test.test"); await sc.fill("#password", "SecPass12345"); await sc.click("button[type=submit]");
await sc.waitForURL(`${BASE}/admin`, { waitUntil: "commit" });
const nav = await sc.textContent("nav");
check("secretaria: menu sem Importar/Configurações/Usuários/Profissionais", !/Importar|Configurações|Usuários|Profissionais|Auditoria|Planilha/.test(nav) && /Agenda/.test(nav) && /Pacientes/.test(nav), nav);
for (const path of ["/admin/importar", "/admin/configuracoes", "/admin/usuarios", "/admin/profissionais", "/admin/planilha", "/admin/auditoria"]) {
  await sc.goto(BASE + path);
  check(`secretaria bloqueada em ${path}`, sc.url().endsWith("/admin/sem-permissao") && (await sc.textContent("main")).includes("Você não possui permissão para realizar esta ação."), sc.url());
}
for (const path of ["/api/admin/export/pacientes", "/api/admin/export/agenda"]) { const x = await sc.request.get(BASE + path); check(`secretaria não exporta ${path}`, x.status() === 403, String(x.status())); }
await sc.goto(`${BASE}/admin/agendamentos`);
await Promise.all([sc.waitForURL(/agendamentos\/[0-9a-f-]{36}/), sc.locator("tr:has-text('PENDENTE') a:has-text('Abrir')").first().click()]);
const secDetail = await sc.textContent("main");
check("secretaria: vê confirmar/realizado mas não 'Cancelar consulta' nem remarcar", /Marcar/.test(secDetail) && !secDetail.includes("Cancelar consulta") && !secDetail.includes("Remarcar"), secDetail.slice(0, 300));
const id = sc.url().split("/").pop();
const forged = await sc.request.post(`${BASE}/admin/agendamentos/${id}`, { form: { id, status: "CANCELADO" }, maxRedirects: 0 });
check("secretaria: POST forjado de cancelamento não altera dados", (await db.query("select status from appointments where id=$1", [id])).rows[0].status !== "CANCELADO");
await sc.click("button:has-text('Marcar CONFIRMADO')");
await sc.waitForSelector("text=Status atualizado.");
check("secretaria: confirma agendamento", (await db.query("select status from appointments where id=$1", [id])).rows[0].status === "CONFIRMADO");
await sc.goto(`${BASE}/admin/agendamentos/novo`);
check("secretaria: pode abrir novo agendamento", (await sc.textContent("main")).includes("Novo agendamento"));

// ---------- logout ----------
await ad.goto(`${BASE}/admin`); await ad.click("button:has-text('Sair')"); await ad.waitForURL(/login/);
await ad.goto(`${BASE}/admin`);
check("logout: /admin volta a exigir login", ad.url().includes("/login"));

check("sem erros de JavaScript no navegador", errors.length === 0, errors.slice(0, 3).join(" | "));
await browser.close(); await db.end();
for (const r of results) console.log(r.join(" "));
console.log(`\n${results.filter(r => r[0] === "OK ").length}/${results.length} verificações OK`);
