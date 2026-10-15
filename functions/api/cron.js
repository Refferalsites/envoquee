// Called by GitHub Actions (email-cron.yml) with x-cron-secret. Sends review requests and consented abandoned-order reminders.
import { json, safeEq, kvGet, kvPut, kvDel, siteUrl } from "../_lib/admin.js";
import { getCfg, sendTemplate, orderVars } from "../_lib/email.js";
export async function onRequestPost({ request: req, env }) {
  const sec = env.CRON_SECRET || env.INDEXNOW_HOOK_SECRET || "";
  if (!sec || !safeEq(req.headers.get("x-cron-secret") || "", sec)) return json({ error: "Forbidden" }, 403);
  if (!env.STORE) return json({ error: "No KV" }, 500);
  const cfg = await getCfg(env), site = siteUrl(env, req), now = Date.now(), out = { reviews: 0, abandoned: 0 };
  const orders = []; let cursor;
  do { const r = await env.STORE.list({ prefix: "order:", cursor }); orders.push(...r.keys.map((k) => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor);
  const emailsWithOrders = new Set();
  for (const k of orders.slice(0, 400)) {
    const o = await kvGet(env, k); if (!o) continue; if (o.email) emailsWithOrders.add(o.email);
    if (o.status === "delivered" && o.email && !o.review_sent && o.delivered_at && now - Date.parse(o.delivered_at) >= cfg.review_days * 86400e3) {
      const r = await sendTemplate(env, req, "review_request", o.email, orderVars(o, site), { cfg });
      if (!r.skipped) { o.review_sent = new Date().toISOString(); await kvPut(env, k, o); out.reviews++; }
    }
  }
  const drafts = await env.STORE.list({ prefix: "draft:" });
  for (const k of drafts.keys.slice(0, 100)) {
    const d = await kvGet(env, k.name); if (!d || !d.consent) continue;
    if (emailsWithOrders.has(d.email)) { await kvDel(env, k.name); continue; }
    if (now - Date.parse(d.at) < cfg.abandoned_hours * 3600e3) continue;
    const r = await sendTemplate(env, req, "abandoned_followup", d.email, { name: d.name }, { cfg });
    if (!r.skipped) { await kvDel(env, k.name); out.abandoned++; }   // one reminder only
  }
  return json({ ok: true, ...out });
}
