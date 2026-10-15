// Order status lookup: needs order number AND the phone used on the order.
import { json, kvGet } from "../_lib/admin.js";
import { rateOk, normPkPhone } from "../_lib/util.js";
export async function onRequestGet({ request: req, env }) {
  const u = new URL(req.url), id = String(u.searchParams.get("id") || "").trim().toUpperCase(), phone = normPkPhone(u.searchParams.get("phone"));
  if (!/^ENV-\d{6}-[0-9A-F]{6}$/.test(id) || !phone) return json({ error: "Enter your order number (e.g. ENV-261015-1A2B3C) and the phone number used." }, 400);
  if (!(await rateOk(env, req, "track", 20, 600))) return json({ error: "Too many lookups. Try again in a few minutes." }, 429);
  const o = await kvGet(env, `order:${id}`);
  if (!o || o.phone !== phone) return json({ error: "No order found with that number and phone." }, 404);
  return json({ id: o.id, status: o.status, at: o.at, qty: o.qty, total: o.total, delivery: o.delivery, city: o.city });
}
