// Supabase FALSO, SOMENTE para testes locais/CI: GoTrue mínimo (login/refresh/user) + proxy /rest/v1 -> PostgREST.
// Usuários de teste: admin@test.test / AdminPass123 (ADMIN) e sec@test.test / SecPass12345 (SECRETARIA).
// Env: JWT_SECRET (o mesmo do PostgREST), POSTGREST_URL (padrão http://localhost:54330), PORT (padrão 54331).
import http from "node:http";
import { createHmac } from "node:crypto";
const SECRET = process.env.JWT_SECRET;
const POSTGREST = process.env.POSTGREST_URL || "http://localhost:54330";
const PORT = Number(process.env.PORT || 54331);
if (!SECRET) throw new Error("Defina JWT_SECRET");
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (claims) => { const h = b64({ alg: "HS256", typ: "JWT" }); const p = b64(claims); return `${h}.${p}.${createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url")}`; };
const verify = (t) => { const [h, p, s] = (t || "").split("."); if (!s) return null; if (createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url") !== s) return null; const c = JSON.parse(Buffer.from(p, "base64url").toString()); return c.exp * 1000 > Date.now() ? c : null; };
const USERS = {
  "admin@test.test": { id: "11111111-1111-4111-8111-111111111111", pw: "AdminPass123" },
  "sec@test.test": { id: "22222222-2222-4222-8222-222222222222", pw: "SecPass12345" },
};
const userObj = (email, id) => ({ id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
const session = (email, id) => { const exp = Math.floor(Date.now() / 1000) + 3600; return { access_token: sign({ role: "authenticated", aud: "authenticated", sub: id, email, exp }), token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: `r-${id}`, user: userObj(email, id) }; };
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
const body = (req) => new Promise((r) => { const c = []; req.on("data", (d) => c.push(d)); req.on("end", () => r(Buffer.concat(c))); });

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (url.pathname.startsWith("/rest/v1/")) {
      const buf = await body(req);
      const headers = { ...req.headers }; delete headers.host; delete headers["content-length"];
      const r = await fetch(`${POSTGREST}/${url.pathname.slice(9)}${url.search}`, { method: req.method, headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : buf });
      const out = Buffer.from(await r.arrayBuffer());
      const h = {}; r.headers.forEach((v, k) => { if (!["content-encoding", "transfer-encoding", "content-length"].includes(k)) h[k] = v; });
      res.writeHead(r.status, h); return res.end(out);
    }
    if (url.pathname === "/auth/v1/token") {
      const b = JSON.parse((await body(req)).toString() || "{}");
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const u = Object.entries(USERS).find(([, v]) => `r-${v.id}` === b.refresh_token);
        return u ? json(res, 200, session(u[0], u[1].id)) : json(res, 400, { error: "invalid_grant", error_description: "bad refresh" });
      }
      const u = USERS[b.email];
      if (!u || u.pw !== b.password) return json(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials" });
      return json(res, 200, session(b.email, u.id));
    }
    if (url.pathname === "/auth/v1/user") {
      const c = verify((req.headers.authorization || "").replace("Bearer ", ""));
      if (!c || !c.sub) return json(res, 401, { code: 401, msg: "invalid JWT" });
      if (req.method === "PUT") { await body(req); return json(res, 200, userObj(c.email, c.sub)); }
      return json(res, 200, userObj(c.email, c.sub));
    }
    if (url.pathname === "/auth/v1/logout") { res.writeHead(204); return res.end(); }
    if (url.pathname === "/auth/v1/recover") { await body(req); return json(res, 200, {}); }
    if (url.pathname === "/auth/v1/admin/users") return json(res, 200, { users: Object.entries(USERS).map(([e, v]) => userObj(e, v.id)), aud: "authenticated" });
    json(res, 404, { msg: "not found " + url.pathname });
  } catch (e) { json(res, 500, { msg: String(e) }); }
}).listen(PORT, () => console.log(`fake supabase on ${PORT}`));
