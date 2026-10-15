// Contact + newsletter forms -> KV (binding STORE). Honeypot + rate limit + emails.
import { kvGet, kvPut, siteUrl } from "../_lib/admin.js";
import { rateOk, clean } from "../_lib/util.js";
import { sendTemplate, unsubUrl } from "../_lib/email.js";
const back = (req, path) => new Response(null, { status: 303, headers: { location: new URL(path, req.url).toString() } });
const err = (m, s = 400) => new Response(m + " Please go back and try again.", { status: s, headers: { "content-type": "text/plain; charset=utf-8" } });
const EM = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export async function onRequestPost({ request: req, env, waitUntil }) {
  let fd; try { fd = await req.formData(); } catch { return err("Bad request."); }
  const form = String(fd.get("form-name"));
  const run = (p) => { if (waitUntil) waitUntil(p); else return p; };
  if (form === "newsletter") {
    if (String(fd.get("company") || "")) return back(req, "/thanks/");
    const email = clean(fd.get("email"), 200).toLowerCase(); if (!EM.test(email)) return err("Please enter a valid email address.");
    if (!env.STORE) return err("Form storage is not configured.", 500);
    if (!(await rateOk(env, req, "news", 5, 3600))) return err("Too many sign-ups. Try again later.", 429);
    const existing = await kvGet(env, `sub:${email}`);
    if (!existing || existing.unsubscribed) {
      await kvPut(env, `sub:${email}`, { email, at: new Date().toISOString(), source: clean(fd.get("page"), 200) });
      await run(sendTemplate(env, req, "newsletter_welcome", email, {}, { unsubUrl: await unsubUrl(env, req, email) }));
    }
    return back(req, "/thanks/");
  }
  if (form !== "contact") return err("Unknown form.");
  if (String(fd.get("bot-field") || "")) return back(req, "/contact/thanks/");
  const data = { name: clean(fd.get("name"), 100), email: clean(fd.get("email"), 200), phone: clean(fd.get("phone"), 30), message: clean(fd.get("message"), 4000) };
  if (!data.name || data.message.length < 5) return err("Please add your name and a message.");
  if (data.email && !EM.test(data.email)) return err("Please enter a valid email address.");
  if (!data.email && !data.phone) return err("Please give an email or phone number so we can reply.");
  if (!env.STORE) return err("Form storage is not configured.", 500);
  if (!(await rateOk(env, req, "contact", 5, 3600))) return err("Too many messages. Try again later.", 429);
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  await kvPut(env, `msg:${id}`, { id, form: "contact", at: new Date().toISOString(), ...data });
  const idx = await kvGet(env, "msg:index", []); idx.unshift(id); await kvPut(env, "msg:index", idx.slice(0, 2000));
  await run((async () => {
    if (data.email) await sendTemplate(env, req, "contact_autoreply", data.email, data);
    if (env.ADMIN_NOTIFY_EMAIL) await sendTemplate(env, req, "contact_admin", env.ADMIN_NOTIFY_EMAIL, data);
  })());
  return back(req, "/contact/thanks/");
}
export const onRequest = () => new Response("Method not allowed", { status: 405 });
