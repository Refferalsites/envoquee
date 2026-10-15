// Abandoned-order reminder opt-in: stored ONLY when the customer typed an email AND ticked the reminder consent box.
import { json, kvPut, kvDel } from "../_lib/admin.js";
import { rateOk, clean } from "../_lib/util.js";
import { getCfg } from "../_lib/email.js";
export async function onRequestPost({ request: req, env }) {
  const b = await req.json().catch(() => ({})), email = clean(b.email, 200).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false }, 400);
  if (!b.consent) { await kvDel(env, `draft:${email}`); return json({ ok: true, stored: false }); }
  const cfg = await getCfg(env); if (!cfg.templates.abandoned_followup || !cfg.templates.abandoned_followup.enabled) return json({ ok: true, stored: false });
  if (!(await rateOk(env, req, "draft", 10, 3600))) return json({ ok: false }, 429);
  await kvPut(env, `draft:${email}`, { email, name: clean(b.name, 80), city: clean(b.city, 60), at: new Date().toISOString(), consent: true }, { expirationTtl: 7 * 86400 });
  return json({ ok: true, stored: true });
}
