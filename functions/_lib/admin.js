// Shared helpers for Cloudflare Pages Functions (Web Crypto, no Node APIs).
export const COOKIE = "env_admin";
const TTL = 8 * 3600;
const te = new TextEncoder();
export const repo = (env) => env.GITHUB_REPO || "envoquee/envoquee";
export const branch = (env) => env.GITHUB_BRANCH || "main";
export const siteUrl = (env, req) => (env.SITE_URL || (req ? new URL(req.url).origin : "https://envoquee.pages.dev")).replace(/\/$/, "");
export const has = (env, k) => Boolean(env[k]);
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = (s) => b64u(te.encode(s));
const fromB64u = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));
export async function sha256Hex(s) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", te.encode(String(s))))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export function safeEq(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
async function hmac(env, s) {
  const k = await crypto.subtle.importKey("raw", te.encode(env.SESSION_SECRET || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", k, te.encode(s)));
}
export async function makeSession(env, user) {
  const n = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const payload = b64uStr(JSON.stringify({ u: user, exp: Math.floor(Date.now() / 1000) + TTL, n }));
  return `${payload}.${await hmac(env, payload)}`;
}
export function sessionCookie(v, maxAge = TTL) { return `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`; }
export async function getSession(env, req) {
  if (!env.SESSION_SECRET) return null;
  const c = (req.headers.get("cookie") || "").split(/;\s*/).find((x) => x.startsWith(COOKIE + "="));
  if (!c) return null;
  const [p, sig] = c.slice(COOKIE.length + 1).split(".");
  if (!p || !sig || !safeEq(sig, await hmac(env, p))) return null;
  try { const d = JSON.parse(fromB64u(p)); return d.exp > Date.now() / 1000 ? d : null; } catch { return null; }
}
export function sameOrigin(req) {
  const o = req.headers.get("origin"); if (!o) return true;
  try { return new URL(o).host === new URL(req.url).host; } catch { return false; }
}
// ---- KV helpers (binding STORE). All calls tolerate a missing binding.
export async function kvGet(env, key, def = null) { try { const v = env.STORE ? await env.STORE.get(key, "json") : null; return v ?? def; } catch { return def; } }
export async function kvPut(env, key, val, opts) { try { if (env.STORE) await env.STORE.put(key, JSON.stringify(val), opts); } catch {} }
export async function kvDel(env, key) { try { if (env.STORE) await env.STORE.delete(key); } catch {} }
// ---- GitHub contents API (base64 with UTF-8 safety)
const toB64 = (s) => { const b = te.encode(s); let o = ""; for (let i = 0; i < b.length; i += 0x8000) o += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(o); };
const fromB64 = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
export function ghHeaders(env) { return { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "site-admin" }; }
export const ghApi = (env) => (env.GITHUB_API || "https://api.github.com").replace(/\/$/, "");
async function gh(env, path, opts = {}) {
  const r = await fetch(`${ghApi(env)}/repos/${repo(env)}/${path}`, { ...opts, headers: { ...ghHeaders(env), ...(opts.headers || {}) } });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${d && d.message ? d.message : t}`.slice(0, 300));
  return d;
}
export const ghList = (env, dir) => gh(env, `contents/${dir}?ref=${branch(env)}`);
export async function ghGet(env, path) { const d = await gh(env, `contents/${path}?ref=${branch(env)}`); return { sha: d.sha, text: fromB64(d.content) }; }
export const ghPut = (env, path, text, message, sha) => gh(env, `contents/${path}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, branch: branch(env), content: toB64(text), ...(sha ? { sha } : {}) }) });
export const ghDelete = (env, path, message, sha) => gh(env, `contents/${path}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ message, branch: branch(env), sha }) });
// ---- Google service-account token (JWT RS256 via Web Crypto)
export async function googleToken(env, envName, scope) {
  const sa = JSON.parse(env[envName]);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64uStr(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64uStr(JSON.stringify({ iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }))}`;
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----|\s/g, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, te.encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${unsigned}.${sig}` });
  const d = await r.json(); if (!r.ok) throw new Error("Google auth failed: " + (d.error_description || d.error));
  return d.access_token;
}
