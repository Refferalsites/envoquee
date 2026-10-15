// Pluggable transactional email. Provider by env: RESEND_API_KEY (preferred) or BREVO_API_KEY.
// With no provider key, emails are only logged in KV (status "logged") and nothing breaks.
import { kvGet, kvPut, siteUrl } from "./admin.js";
const te = new TextEncoder();
export const TEMPLATES = {
  order_customer:   { label: "Customer: order confirmation", enabled: true, subject: "Your Envoquee order {{order_id}} is received", body: "Assalam o Alaikum {{name}},\n\nThank you for your order. Here are the details:\n\nOrder number: {{order_id}}\nProduct: {{product}} × {{qty}}\nTotal payable on delivery: {{total}}\nDelivery to: {{address}}, {{city}}\n\nOur team will call you on {{phone}} to confirm before dispatch. You pay in cash when your parcel arrives.\n\nTrack your order: {{track_url}}" },
  order_admin:      { label: "Admin: new order notification", enabled: true, subject: "New COD order {{order_id}} – {{name}}, {{city}} ({{total}})", body: "New cash-on-delivery order.\n\nOrder: {{order_id}}\nName: {{name}}\nPhone: {{phone}}\nEmail: {{email}}\nCity: {{city}}\nAddress: {{address}}\nQty: {{qty}}\nTotal: {{total}}\nNotes: {{notes}}\n\nOpen admin: {{admin_url}}" },
  status_confirmed: { label: "Customer: order confirmed", enabled: true, subject: "Order {{order_id}} confirmed", body: "Hi {{name}},\n\nYour order {{order_id}} is confirmed and is being prepared for dispatch.\n\nTotal payable on delivery: {{total}}\n\nTrack your order: {{track_url}}" },
  status_shipped:   { label: "Customer: order shipped", enabled: true, subject: "Order {{order_id}} is on its way", body: "Hi {{name}},\n\nGood news: your Envoquee order {{order_id}} has been shipped.\n\nCourier: {{courier}}\nTracking number: {{tracking}}\n\nPlease keep {{total}} ready in cash for the rider.\n\nTrack your order: {{track_url}}" },
  status_delivered: { label: "Customer: order delivered", enabled: true, subject: "Order {{order_id}} delivered – thank you", body: "Hi {{name}},\n\nYour order {{order_id}} has been delivered. Thank you for choosing Envoquee.\n\nBefore your first use, please read our how-to and safety guides:\n{{site_url}}/how-to-use/\n{{site_url}}/derma-roller-safety/" },
  status_cancelled: { label: "Customer: order cancelled", enabled: true, subject: "Order {{order_id}} cancelled", body: "Hi {{name}},\n\nYour order {{order_id}} has been cancelled. If this is a mistake, just reply to this email or contact us: {{site_url}}/contact/" },
  contact_autoreply:{ label: "Customer: contact form auto-reply", enabled: true, subject: "We received your message", body: "Hi {{name}},\n\nThanks for contacting Envoquee. We've received your message and will reply soon.\n\nYour message:\n{{message}}" },
  contact_admin:    { label: "Admin: new contact message", enabled: true, subject: "New contact message from {{name}}", body: "Name: {{name}}\nEmail: {{email}}\nPhone: {{phone}}\n\n{{message}}\n\nAdmin: {{admin_url}}" },
  newsletter_welcome:{ label: "Subscriber: newsletter welcome", enabled: true, subject: "Welcome to Envoquee", body: "Welcome to the Envoquee journal.\n\nYou'll receive our scalp care, derma rolling and hair care guides written for Pakistan's climate. Start here:\n{{site_url}}/blog/" },
  review_request:   { label: "Customer: review request (days after delivery)", enabled: true, subject: "How is your Envoquee kit?", body: "Hi {{name}},\n\nIt's been a few days since your order {{order_id}} was delivered. We'd really value your honest feedback. Just reply to this email with a few lines and a rating out of 5. With your permission, we may share it on our website.\n\nThank you!" },
  abandoned_followup:{ label: "Abandoned order follow-up (needs customer consent)", enabled: false, subject: "Your Envoquee order is not complete", body: "Hi,\n\nYou started an order for the Envoquee Hair Serum Kit but didn't finish. If you'd still like it, you can order with cash on delivery here:\n{{site_url}}/shop/envoquee-hair-serum-kit/#order\n\nYou asked us to remind you. We won't email again about this order." },
  broadcast:        { label: "Broadcast wrapper (used by Broadcast)", enabled: true, subject: "{{subject}}", body: "{{body}}" },
};
export const DEFAULT_CFG = { review_days: 4, abandoned_hours: 2, sms_enabled: false, whatsapp_enabled: false, templates: {} };
export async function getCfg(env) { const c = await kvGet(env, "email:config", {}); return { ...DEFAULT_CFG, ...c, templates: c.templates || {} }; }
export function tpl(cfg, key) { return { ...TEMPLATES[key], ...(cfg.templates[key] || {}) }; }
export function provider(env) { return env.RESEND_API_KEY ? "resend" : env.BREVO_API_KEY ? "brevo" : null; }
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fill = (s, v) => String(s).replace(/\{\{(\w+)\}\}/g, (_, k) => (v[k] ?? "") === "" ? "—" : String(v[k]));
function linkify(h) { return h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#c9a45c">$1</a>'); }
export function renderHtml(site, subject, text, unsubUrl) {
  const paras = esc(text).split(/\n{2,}/).map((p) => `<p style="margin:0 0 16px;line-height:1.6">${linkify(p).replace(/\n/g, "<br>")}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;background:#0b0b0b;padding:24px 0;font-family:Arial,Helvetica,sans-serif;color:#ece7dc">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#141414;border:1px solid #c9a45c">
<tr><td style="padding:24px 28px;border-bottom:1px solid #3a3326;text-align:center"><img src="${site}/logo.png" width="260" alt="ENVOQUEE" style="display:inline-block;max-width:260px"></td></tr>
<tr><td style="height:4px;background:linear-gradient(90deg,#9c7a3a,#e6c886,#9c7a3a);background-color:#c9a45c"></td></tr>
<tr><td style="padding:28px;font-size:15px"><h1 style="font-family:Georgia,serif;font-weight:normal;color:#f6f1e7;font-size:24px;margin:0 0 18px">${esc(subject)}</h1>${paras}
<p style="margin:24px 0 0"><a href="${site}/shop/envoquee-hair-serum-kit/" style="background:#c9a45c;color:#111;text-decoration:none;padding:12px 22px;font-weight:bold;letter-spacing:1px;font-size:13px;text-transform:uppercase">Visit Envoquee</a></p></td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #3a3326;font-size:12px;color:#8d877c">Envoquee · Cash on Delivery across Pakistan · <a href="${site}" style="color:#c9a45c">${site.replace(/^https?:\/\//, "")}</a>${unsubUrl ? `<br><a href="${unsubUrl}" style="color:#8d877c">Unsubscribe</a>` : ""}</td></tr>
</table></td></tr></table></body></html>`;
}
async function addLog(env, e) { const l = await kvGet(env, "email:log", []); l.unshift(e); await kvPut(env, "email:log", l.slice(0, 300)); }
// Low-level send. msgs: [{to, subject, text, html, headers}]
async function deliver(env, msgs) {
  const p = provider(env), from = env.EMAIL_FROM || "Envoquee <orders@envoquee.com>";
  if (!p) return { ok: true, status: "logged", detail: "No email provider configured (log only)" };
  try {
    if (p === "resend") {
      const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify(msgs.map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text, reply_to: env.EMAIL_REPLY_TO || undefined, headers: m.headers }))) });
      return { ok: r.ok, status: r.ok ? "sent" : "failed", detail: (await r.text()).slice(0, 200) };
    }
    const fm = from.match(/^(.*)<(.+)>$/), sender = fm ? { name: fm[1].trim(), email: fm[2].trim() } : { email: from };
    let ok = true, detail = "";
    for (const m of msgs) { const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": env.BREVO_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({ sender, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text, headers: m.headers }) }); ok = ok && r.ok; detail = (await r.text()).slice(0, 200); }
    return { ok, status: ok ? "sent" : "failed", detail };
  } catch (e) { return { ok: false, status: "failed", detail: String(e.message || e).slice(0, 200) }; }
}
const validEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(e || ""));
// High-level: send a template. Never throws.
export async function sendTemplate(env, req, key, to, vars = {}, opts = {}) {
  try {
    if (!validEmail(to)) return { skipped: "no email" };
    const cfg = opts.cfg || await getCfg(env), t = tpl(cfg, key);
    if (!t.enabled && !opts.force) return { skipped: "template disabled" };
    const site = siteUrl(env, req);
    const v = { site_url: site, admin_url: site + "/admin/", ...vars };
    const subject = fill(t.subject, v), text = fill(t.body, v);
    const unsub = opts.unsubUrl || null;
    const headers = unsub ? { "List-Unsubscribe": `<${unsub}>` } : undefined;
    const res = await deliver(env, [{ to, subject, text: text + (unsub ? `\n\nUnsubscribe: ${unsub}` : ""), html: renderHtml(site, subject, text, unsub), headers }]);
    await addLog(env, { at: new Date().toISOString(), template: key, to, subject, provider: provider(env) || "none", status: res.status, detail: res.detail });
    return res;
  } catch (e) { return { ok: false, detail: String(e.message || e) }; }
}
export async function sendBatch(env, req, list, subject, body) { // list: [{to, unsub}]
  const site = siteUrl(env, req); let sent = 0, failed = 0, status = "sent";
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const res = await deliver(env, chunk.map((s) => ({ to: s.to, subject, text: body + `\n\nUnsubscribe: ${s.unsub}`, html: renderHtml(site, subject, body, s.unsub), headers: { "List-Unsubscribe": `<${s.unsub}>` } })));
    status = res.status; if (res.ok) sent += chunk.length; else failed += chunk.length;
  }
  await addLog(env, { at: new Date().toISOString(), template: "broadcast", to: `${list.length} subscribers`, subject, provider: provider(env) || "none", status, detail: `${sent} ok, ${failed} failed` });
  return { sent, failed, status };
}
// Unsubscribe token = HMAC(email)
export async function unsubToken(env, email) {
  const k = await crypto.subtle.importKey("raw", te.encode((env.SESSION_SECRET || "") + ":unsub"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, te.encode(String(email).toLowerCase())))].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function unsubUrl(env, req, email) { return `${siteUrl(env, req)}/unsubscribe/?e=${encodeURIComponent(email)}&t=${await unsubToken(env, email)}`; }
// Optional SMS / WhatsApp hooks (off by default). POSTs JSON to a webhook you control (e.g. a WhatsApp Business API bridge).
export async function notifyHooks(env, event, data) {
  try { const cfg = await getCfg(env);
    for (const [on, url] of [[cfg.sms_enabled, env.SMS_WEBHOOK_URL], [cfg.whatsapp_enabled, env.WHATSAPP_WEBHOOK_URL]]) {
      if (on && url) await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...(env.HOOK_WEBHOOK_SECRET ? { "x-hook-secret": env.HOOK_WEBHOOK_SECRET } : {}) }, body: JSON.stringify({ event, ...data }) }); }
  } catch {}
}
export const orderVars = (o, site) => ({ order_id: o.id, name: o.name, phone: o.phone, email: o.email || "", city: o.city, address: o.address, qty: o.qty, product: o.product,
  total: "Rs " + Number(o.total).toLocaleString("en-US") + (o.delivery == null ? " (+ delivery, if any)" : ""), notes: o.notes, courier: o.courier || "", tracking: o.tracking || "", track_url: `${site}/track-order/?id=${o.id}` });
