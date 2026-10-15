// Called by the GitHub Action after a Cloudflare Pages deploy is live (Pages has no deploy-succeeded event).
import { json, safeEq } from "../_lib/admin.js";
import { runIndexing } from "../_lib/indexing.js";
export async function onRequestPost({ request: req, env }) {
  const s = env.INDEXNOW_HOOK_SECRET || "", got = req.headers.get("x-hook-secret") || "";
  if (!s || !safeEq(got, s)) return json({ error: "Forbidden" }, 403);
  try { return json(await runIndexing(env, req, "deploy")); } catch (e) { return json({ error: String(e.message || e) }, 500); }
}
