import { getLog, runIndexing, submitGoogle, changedUrls } from "../_lib/indexing.js";
import { json, getSession, sameOrigin, ghList, ghGet, ghPut, ghDelete, googleToken, has, repo, siteUrl, ghHeaders, ghApi, branch, kvGet, kvPut, kvDel } from "../_lib/admin.js";
const SECRETS = ["ADMIN_USERNAME", "ADMIN_PASSWORD_SHA256", "SESSION_SECRET", "GITHUB_TOKEN", "INDEXNOW_HOOK_SECRET", "GSC_SERVICE_ACCOUNT_JSON", "MERCHANT_SERVICE_ACCOUNT_JSON", "GOOGLE_INDEXING_SA_JSON"];
const STATUSES = ["new", "confirmed", "shipped", "delivered", "cancelled"];
const q = (s) => JSON.stringify(String(s ?? ""));
const SLUG = /^[a-z0-9][a-z0-9-]{1,80}$/, OID = /^ENV-\d{6}-[0-9A-F]{6}$/;
function frontmatter(p) {
  return ["---", `title: ${q(p.title)}`, `date: ${q(p.date)}`, `description: ${q(p.description)}`, `image: ${q(p.image)}`, `question: ${q(p.question)}`, `category: ${q(p.category)}`, `status: ${p.status === "published" ? "published" : "draft"}`, "---", ""].join("\n") + String(p.body || "").replace(/\r\n/g, "\n").trim() + "\n";
}
function parseFront(t) {
  const m = t.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/); if (!m) return { body: t };
  const meta = {};
  for (const line of m[1].split("\n")) { const i = line.indexOf(":"); if (i < 0) continue; let v = line.slice(i + 1).trim();
    if (v.startsWith('"')) { try { v = JSON.parse(v); } catch {} } meta[line.slice(0, i).trim()] = v; }
  return { ...meta, body: m[2] };
}
async function listOrders(env) {
  if (!env.STORE) return [];
  const keys = []; let cursor;
  do { const r = await env.STORE.list({ prefix: "order:", cursor, limit: 1000 }); keys.push(...r.keys.map((k) => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor && keys.length < 5000);
  const items = (await Promise.all(keys.slice(0, 900).map((k) => kvGet(env, k)))).filter(Boolean);
  return items.sort((a, b) => (a.at < b.at ? 1 : -1));
}
const csvCell = (v) => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export async function onRequest({ request: req, env }) {
  const s = await getSession(env, req); if (!s) return json({ error: "Not logged in" }, 401);
  const REPO = repo(env), SITE = siteUrl(env, req);
  if (req.method !== "GET" && !sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const url = new URL(req.url), a = url.searchParams.get("action");
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  try {
    if (a === "me") return json({ user: s.u });
    if (a === "status") return json({ repo: REPO, site: SITE, kv: Boolean(env.STORE), sitemap: `${SITE}/sitemap.xml`, merchantFeed: `${SITE}/merchant-feed.xml`, secrets: Object.fromEntries(SECRETS.map((k) => [k, has(env, k)])) });
    // ---- blog
    if (a === "posts") { const l = await ghList(env, "content/blog"); return json(l.filter((f) => f.name.endsWith(".md")).map((f) => f.name.replace(/\.md$/, ""))); }
    if (a === "post") { const slug = url.searchParams.get("slug"); if (!SLUG.test(slug || "")) return json({ error: "Bad slug" }, 400);
      const f = await ghGet(env, `content/blog/${slug}.md`); return json({ slug, sha: f.sha, ...parseFront(f.text) }); }
    if (a === "save-post") { const p = body; if (!SLUG.test(p.slug || "")) return json({ error: "Slug must be lowercase letters, numbers and hyphens" }, 400);
      if (!p.title || !p.date) return json({ error: "Title and date are required" }, 400);
      const r = await ghPut(env, `content/blog/${p.slug}.md`, frontmatter(p), `${p.sha ? "Update" : "Add"} post: ${p.title} (admin)`, p.sha || undefined); return json({ ok: true, sha: r.content.sha }); }
    if (a === "delete-post") { if (!SLUG.test(body.slug || "")) return json({ error: "Bad slug" }, 400);
      await ghDelete(env, `content/blog/${body.slug}.md`, `Delete post: ${body.slug} (admin)`, body.sha); return json({ ok: true }); }
    // ---- product
    if (a === "product") { const f = await ghGet(env, "data/product.json"); return json({ sha: f.sha, product: JSON.parse(f.text) }); }
    if (a === "save-product") { const p = body.product;
      if (!p || typeof p !== "object") return json({ error: "Bad product" }, 400);
      p.price = Number(p.price); p.sale_price = Number(p.sale_price); p.max_qty = Number(p.max_qty || 5);
      if (!(p.price > 0) || !(p.sale_price > 0) || p.sale_price > p.price) return json({ error: "Prices must be positive and sale price must not exceed regular price" }, 400);
      if (!Array.isArray(p.reviews)) p.reviews = [];
      const r = await ghPut(env, "data/product.json", JSON.stringify(p, null, 1) + "\n", "Update product (admin)", body.sha); return json({ ok: true, sha: r.content.sha }); }
    if (a === "upload-image") { const name = String(body.name || "").toLowerCase().replace(/[^a-z0-9.-]+/g, "-");
      if (!/^[a-z0-9-]+\.(webp|jpg|jpeg|png)$/.test(name)) return json({ error: "File must be .webp, .jpg or .png" }, 400);
      const b64 = String(body.data || "").replace(/^data:[^,]+,/, ""); if (b64.length > 4_000_000) return json({ error: "Image too large (max ~3 MB)" }, 400);
      const r = await fetch(`${ghApi(env)}/repos/${REPO}/contents/static/img/uploads/${name}`, { method: "PUT", headers: { ...ghHeaders(env), "content-type": "application/json" }, body: JSON.stringify({ message: `Upload image ${name} (admin)`, branch: branch(env), content: b64 }) });
      if (!r.ok) return json({ error: `GitHub ${r.status}: ${(await r.text()).slice(0, 200)}` }, 502);
      return json({ ok: true, src: `/img/uploads/${name}` }); }
    // ---- settings
    if (a === "settings") { const f = await ghGet(env, "data/settings.json"); return json({ sha: f.sha, settings: JSON.parse(f.text) }); }
    if (a === "save-settings") { if (typeof body.settings !== "object") return json({ error: "Bad settings" }, 400);
      const r = await ghPut(env, "data/settings.json", JSON.stringify(body.settings, null, 1) + "\n", "Update site settings (admin)", body.sha); return json({ ok: true, sha: r.content.sha }); }
    // ---- Google
    if (a === "gsc-submit-sitemap") { if (!has(env, "GSC_SERVICE_ACCOUNT_JSON")) return json({ error: "GSC_SERVICE_ACCOUNT_JSON is not set in Cloudflare Pages secrets" }, 400);
      const tok = await googleToken(env, "GSC_SERVICE_ACCOUNT_JSON", "https://www.googleapis.com/auth/webmasters");
      const prop = env.GSC_PROPERTY || `${SITE}/`;
      const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(prop)}/sitemaps/${encodeURIComponent(SITE + "/sitemap.xml")}`, { method: "PUT", headers: { authorization: `Bearer ${tok}` } });
      return json({ ok: r.ok, status: r.status, detail: r.ok ? "Sitemap submitted" : (await r.text()).slice(0, 400) }, r.ok ? 200 : 502); }
    if (a === "merchant-status") { if (!has(env, "MERCHANT_SERVICE_ACCOUNT_JSON")) return json({ error: "MERCHANT_SERVICE_ACCOUNT_JSON is not set in Cloudflare Pages secrets" }, 400);
      const id = String(body.merchantId || "").replace(/\D/g, ""); if (!id) return json({ error: "Set a Merchant Center ID first" }, 400);
      const tok = await googleToken(env, "MERCHANT_SERVICE_ACCOUNT_JSON", "https://www.googleapis.com/auth/content");
      const r = await fetch(`https://merchantapi.googleapis.com/accounts/v1/accounts/${id}`, { headers: { authorization: `Bearer ${tok}` } });
      return json({ ok: r.ok, status: r.status, detail: (await r.text()).slice(0, 600) }, r.ok ? 200 : 502); }
    if (a === "indexing-log") return json(await getLog(env));
    if (a === "indexnow-submit-all") return json(await runIndexing(env, req, "manual (all URLs)", true));
    if (a === "google-index-now") { const { changed } = await changedUrls(env, req, Boolean(body.all)); return json(await submitGoogle(env, changed, "manual")); }
    // ---- messages
    if (a === "messages") { const ids = await kvGet(env, "msg:index", []);
      const items = (await Promise.all(ids.slice(0, 200).map((id) => kvGet(env, `msg:${id}`)))).filter(Boolean); return json({ total: ids.length, items, kv: Boolean(env.STORE) }); }
    if (a === "delete-message") { const id = String(body.id || ""); if (!/^[0-9]+-[0-9a-f]{8}$/.test(id)) return json({ error: "Bad id" }, 400);
      await kvDel(env, `msg:${id}`); await kvPut(env, "msg:index", (await kvGet(env, "msg:index", [])).filter((x) => x !== id)); return json({ ok: true }); }
    // ---- orders
    if (a === "orders") return json({ kv: Boolean(env.STORE), items: await listOrders(env) });
    if (a === "order-status") { const id = String(body.id || ""); if (!OID.test(id) || !STATUSES.includes(body.status)) return json({ error: "Bad id or status" }, 400);
      const o = await kvGet(env, `order:${id}`); if (!o) return json({ error: "Order not found" }, 404);
      o.status = body.status; o.history = [...(o.history || []), { at: new Date().toISOString(), status: body.status }]; if (typeof body.admin_note === "string") o.admin_note = body.admin_note.slice(0, 500);
      await kvPut(env, `order:${id}`, o); return json({ ok: true, order: o }); }
    if (a === "delete-order") { const id = String(body.id || ""); if (!OID.test(id)) return json({ error: "Bad id" }, 400); await kvDel(env, `order:${id}`); return json({ ok: true }); }
    if (a === "orders-csv") { const items = await listOrders(env), cols = ["id", "at", "status", "name", "phone", "city", "address", "qty", "unit_price", "subtotal", "delivery", "total", "notes", "admin_note"];
      const csv = "\ufeff" + [cols.join(","), ...items.map((o) => cols.map((c) => csvCell(o[c])).join(","))].join("\r\n");
      return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="envoquee-orders-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" } }); }
    return json({ error: "Unknown action" }, 400);
  } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
