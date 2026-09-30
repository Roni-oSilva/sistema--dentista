// Gera as chaves JWT de teste (anon e service_role) assinadas com JWT_SECRET. Uso: JWT_SECRET=... node make-keys.mjs
import { createHmac } from "node:crypto";
const S = process.env.JWT_SECRET;
if (!S) throw new Error("Defina JWT_SECRET");
const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (c) => { const h = b({ alg: "HS256", typ: "JWT" }), p = b(c); return `${h}.${p}.${createHmac("sha256", S).update(`${h}.${p}`).digest("base64url")}`; };
const exp = Math.floor(Date.now() / 1000) + 86400 * 30;
console.log(`ANON=${sign({ role: "anon", exp })}`);
console.log(`SERVICE=${sign({ role: "service_role", exp })}`);
