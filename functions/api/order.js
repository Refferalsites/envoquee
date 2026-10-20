// Cash-on-delivery orders -> Cloudflare KV (binding STORE). Accepts JSON (fetch) or form posts (no-JS fallback).
import { json, kvPut } from "../_lib/admin.js";
import { rateOk, normPkPhone, clean } from "../_lib/util.js";
import { PRICING } from "../_lib/pricing.js";
import { sendTemplate, notifyHooks, orderVars } from "../_lib/email.js";
import { siteUrl, kvDel } from "../_lib/admin.js";
function orderId() {
  const d = new Date(Date.now() + 5 * 3600e3), p = (n) => String(n).padStart(2, "0");
  const r = [...crypto.getRandomValues(new Uint8Array(3))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  return `ENV-${String(d.getUTCFullYear()).slice(2)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}-${r}`;
}
export async function onRequestPost({ request: req, env, waitUntil }) {
  const isJson = (req.headers.get("content-type") || "").includes("application/json");
  let f = {};
  try { if (isJson) f = await req.json(); else { const fd = await req.formData(); fd.forEach((v, k) => (f[k] = v)); } } catch { return json({ error: "Bad request" }, 400); }
  const fail = (msg, status = 400) => isJson ? json({ error: msg }, status) : new Response(`${msg} Please go back and try again.`, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
  const done = (id) => isJson ? json({ ok: true, id, redirect: `/order/thank-you/?id=${id}` }) : new Response(null, { status: 303, headers: { location: new URL(`/order/thank-you/?id=${id}`, req.url).toString() } });
  if (clean(f.website)) return done("ENV-000000-000000");                 // honeypot: pretend success
  if (!env.STORE) return fail("Ordering is temporarily unavailable.", 503);
  if (!PRICING.in_stock) return fail("Sorry, the kit is currently out of stock.", 409);
  const name = clean(f.name, 80), city = clean(f.city, 60), address = clean(f.address, 400), notes = clean(f.notes, 500);
  const email = clean(f.email, 200).toLowerCase(), phone = normPkPhone(f.phone), qty = parseInt(f.quantity, 10);
  if (name.length < 2) return fail("Please enter your full name.");
  if (!phone) return fail("Please enter a valid Pakistani phone number, e.g. 0300 1234567.");
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Please enter a valid email address or leave it empty.");
  if (city.length < 2) return fail("Please enter your city.");
  if (address.length < 8) return fail("Please enter your full delivery address.");
  if (!(qty >= 1 && qty <= PRICING.max_qty)) return fail(`Quantity must be between 1 and ${PRICING.max_qty}.`);
  if (!(await rateOk(env, req, "order", 5, 3600))) return fail("Too many orders from this connection. Please call or WhatsApp us instead.", 429);
  const subtotal = qty * PRICING.sale_price;
  const dc = PRICING.delivery_charge, free = PRICING.free_delivery_over;
  const delivery = dc == null ? null : (free != null && subtotal >= free ? 0 : dc);
  const id = orderId();
  const order = { id, at: new Date().toISOString(), status: "new", name, phone, email, city, address, notes, qty, product: PRICING.name, unit_price: PRICING.sale_price, regular_price: PRICING.price, subtotal, delivery, total: delivery == null ? subtotal : subtotal + delivery, currency: "PKR", payment: "COD", page: clean(f.page, 200), ip_country: req.cf && req.cf.country || "" };
  await kvPut(env, `order:${id}`, order);
  const site = siteUrl(env, req), v = orderVars(order, site);
  const bg = (async () => {
    if (email) { await kvDel(env, `draft:${email}`); await sendTemplate(env, req, "order_customer", email, v); }
    if ((env.ADMIN_NOTIFY_EMAIL || "care@envoquee.com")) await sendTemplate(env, req, "order_admin", (env.ADMIN_NOTIFY_EMAIL || "care@envoquee.com"), v);
    await notifyHooks(env, "order.created", { order });
  })();
  if (waitUntil) waitUntil(bg); else await bg;
  return done(id);
}
export const onRequest = () => json({ error: "Method not allowed" }, 405);
