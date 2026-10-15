import { json, kvGet, kvPut, safeEq } from "../_lib/admin.js";
import { unsubToken } from "../_lib/email.js";
export async function onRequestPost({ request: req, env }) {
  const b = await req.json().catch(() => ({})), email = String(b.e || "").toLowerCase().trim();
  if (!email || !safeEq(String(b.t || ""), await unsubToken(env, email))) return json({ error: "This unsubscribe link is invalid or expired." }, 400);
  const s = await kvGet(env, `sub:${email}`); if (s) { s.unsubscribed = new Date().toISOString(); await kvPut(env, `sub:${email}`, s); }
  return json({ ok: true });
}
