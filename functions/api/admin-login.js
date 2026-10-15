import { json, makeSession, sessionCookie, sameOrigin, sha256Hex, safeEq, kvGet, kvPut, kvDel } from "../_lib/admin.js";
const WINDOW = 15 * 60 * 1000, MAX = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function onRequest({ request: req, env }) {
  if (req.method === "DELETE") return json({ ok: true }, 200, { "set-cookie": sessionCookie("", 0) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const U = env.ADMIN_USERNAME || "", H = (env.ADMIN_PASSWORD_SHA256 || "").trim().toLowerCase();
  if (!U || !/^[0-9a-f]{64}$/.test(H) || !env.SESSION_SECRET) return json({ error: "Admin login is not configured on the server." }, 500);
  const ip = req.headers.get("cf-connecting-ip") || "unknown", key = "rate:" + ip.replace(/[^0-9a-fA-F:.]/g, ""), now = Date.now();
  let rec = (await kvGet(env, key, [])).filter((t) => now - t < WINDOW);
  if (rec.length >= MAX) return json({ error: "Too many attempts. Try again in 15 minutes." }, 429, { "retry-after": "900" });
  let body = {}; try { body = await req.json(); } catch {}
  const userOk = safeEq(await sha256Hex(body.username || ""), await sha256Hex(U));
  const passOk = safeEq(await sha256Hex(body.password || ""), H);
  await sleep(400 + Math.floor(Math.random() * 300));
  if (!(userOk && passOk)) { rec.push(now); await kvPut(env, key, rec, { expirationTtl: 900 }); return json({ error: "Invalid username or password." }, 401); }
  await kvDel(env, key);
  return json({ ok: true, user: U }, 200, { "set-cookie": sessionCookie(await makeSession(env, U)) });
}
