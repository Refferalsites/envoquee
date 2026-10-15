import { googleToken, has, kvGet, kvPut, siteUrl } from "./admin.js";
async function fetchJson(u) { const r = await fetch(u, { headers: { "cache-control": "no-cache" } }); if (!r.ok) throw new Error(`${u} -> ${r.status}`); return r.json(); }
export async function getLog(env) { return kvGet(env, "indexing:log", { indexnow: [], google: [] }); }
async function addLog(env, kind, entry) { const l = await getLog(env); l[kind] = [entry, ...(l[kind] || [])].slice(0, 20); await kvPut(env, "indexing:log", l); }
export async function changedUrls(env, req, all = false) {
  const man = await fetchJson(`${siteUrl(env, req)}/indexnow-urls.json`);
  const prev = all ? {} : await kvGet(env, "indexing:snapshot", {});
  return { man, changed: Object.keys(man.urls).filter((u) => prev[u] !== man.urls[u]) };
}
export async function submitIndexNow(env, req, urls, key, trigger) {
  const site = siteUrl(env, req), host = new URL(site).host, at = new Date().toISOString();
  if (!key) { const e = { at, trigger, ok: false, detail: "No IndexNow key in settings" }; await addLog(env, "indexnow", e); return e; }
  if (!urls.length) { const e = { at, trigger, ok: true, count: 0, detail: "No new or changed URLs" }; await addLog(env, "indexnow", e); return e; }
  const r = await fetch(env.INDEXNOW_ENDPOINT || "https://api.indexnow.org/indexnow", { method: "POST", headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key, keyLocation: `${site}/${key}.txt`, urlList: urls.slice(0, 10000) }) });
  const e = { at, trigger, ok: r.status === 200 || r.status === 202, status: r.status, count: urls.length, detail: (await r.text()).slice(0, 200) || (r.status === 202 ? "Accepted (key validation pending)" : "OK"), sample: urls.slice(0, 5) };
  await addLog(env, "indexnow", e); return e;
}
export async function submitGoogle(env, urls, trigger) {
  const at = new Date().toISOString();
  if (!has(env, "GOOGLE_INDEXING_SA_JSON")) { const e = { at, trigger, ok: false, detail: "GOOGLE_INDEXING_SA_JSON not set (skipped)" }; await addLog(env, "google", e); return e; }
  const posts = urls.filter((u) => /\/blog\/[^/]+\/$/.test(u)).slice(0, 40); // Workers free plan: 50 subrequests/invocation
  if (!posts.length) { const e = { at, trigger, ok: true, count: 0, detail: "No new or changed blog posts" }; await addLog(env, "google", e); return e; }
  const tok = await googleToken(env, "GOOGLE_INDEXING_SA_JSON", "https://www.googleapis.com/auth/indexing");
  const res = [];
  for (const u of posts) {
    const r = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", { method: "POST", headers: { authorization: `Bearer ${tok}`, "content-type": "application/json" }, body: JSON.stringify({ url: u, type: "URL_UPDATED" }) });
    res.push({ url: u, status: r.status }); if (r.status === 429) break;
  }
  const ok = res.filter((x) => x.status === 200).length;
  const e = { at, trigger, ok: ok === res.length, count: res.length, detail: `${ok}/${res.length} accepted`, sample: res.slice(0, 5) };
  await addLog(env, "google", e); return e;
}
export async function runIndexing(env, req, trigger, all = false) {
  const { man, changed } = await changedUrls(env, req, all);
  const a = await submitIndexNow(env, req, changed, man.indexnow_key, trigger);
  let g; try { g = await submitGoogle(env, changed, trigger); } catch (err) { g = { ok: false, detail: String(err.message) }; await addLog(env, "google", { at: new Date().toISOString(), trigger, ...g }); }
  if (a.ok) await kvPut(env, "indexing:snapshot", man.urls);
  return { indexnow: a, google: g };
}
