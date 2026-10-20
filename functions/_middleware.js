// Adds the Envoquee HQ privacy-friendly pageview beacon (no cookies, no raw IP stored) to public HTML pages.
// Additive only: never alters responses for /admin, /api or non-HTML files. Disable by setting HQ_BEACON=off.
const SRC = "https://envoquee-hq.pages.dev/b.js";
export async function onRequest({ request, next, env }) {
  const res = await next();
  try {
    const p = new URL(request.url).pathname;
    if (request.method !== "GET" || env.HQ_BEACON === "off" || /^\/(admin|api)(\/|$)/.test(p) || /\.[a-z0-9]{2,5}$/i.test(p) && !/\.html$/i.test(p)) return res;
    if (!(res.headers.get("content-type") || "").includes("text/html")) return res;
    return new HTMLRewriter().on("head", { element(e) { e.append(`<script src="${SRC}" defer></script>`, { html: true }); } }).transform(res);
  } catch { return res; }
}
