// Contact form -> KV (binding STORE). Honeypot + rate limit.
import { kvGet, kvPut } from "../_lib/admin.js";
import { rateOk, clean } from "../_lib/util.js";
const back = (req, path) => new Response(null, { status: 303, headers: { location: new URL(path, req.url).toString() } });
const err = (m, s = 400) => new Response(m + " Please go back and try again.", { status: s, headers: { "content-type": "text/plain; charset=utf-8" } });
export async function onRequestPost({ request: req, env }) {
  let fd; try { fd = await req.formData(); } catch { return err("Bad request."); }
  if (String(fd.get("form-name")) !== "contact") return err("Unknown form.");
  if (String(fd.get("bot-field") || "")) return back(req, "/contact/thanks/");
  const data = { name: clean(fd.get("name"), 100), email: clean(fd.get("email"), 200), phone: clean(fd.get("phone"), 30), message: clean(fd.get("message"), 4000) };
  if (!data.name || data.message.length < 5) return err("Please add your name and a message.");
  if (data.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.email)) return err("Please enter a valid email address.");
  if (!data.email && !data.phone) return err("Please give an email or phone number so we can reply.");
  if (!env.STORE) return err("Form storage is not configured.", 500);
  if (!(await rateOk(env, req, "contact", 5, 3600))) return err("Too many messages. Try again later.", 429);
  const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  await kvPut(env, `msg:${id}`, { id, form: "contact", at: new Date().toISOString(), ...data });
  const idx = await kvGet(env, "msg:index", []); idx.unshift(id); await kvPut(env, "msg:index", idx.slice(0, 2000));
  return back(req, "/contact/thanks/");
}
export const onRequest = () => new Response("Method not allowed", { status: 405 });
