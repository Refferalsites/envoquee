import { kvGet, kvPut } from "./admin.js";
// Simple per-IP fixed-window rate limit stored in KV. Returns true if allowed.
export async function rateOk(env, req, bucket, max, windowSec) {
  const ip = (req.headers.get("cf-connecting-ip") || "unknown").replace(/[^0-9a-fA-F:.]/g, "");
  const key = `rl:${bucket}:${ip}`, now = Date.now();
  const rec = (await kvGet(env, key, [])).filter((t) => now - t < windowSec * 1000);
  if (rec.length >= max) return false;
  rec.push(now); await kvPut(env, key, rec, { expirationTtl: Math.max(60, windowSec) });
  return true;
}
// Pakistan mobile/landline normalisation: mobiles 03XXXXXXXXX (+92 3XX...), landlines 0XX XXXXXXX
export function normPkPhone(raw) {
  let d = String(raw || "").replace(/[\s\-().]/g, "");
  if (d.startsWith("+92")) d = "0" + d.slice(3); else if (d.startsWith("0092")) d = "0" + d.slice(4); else if (/^92\d{10}$/.test(d)) d = "0" + d.slice(2);
  if (/^03\d{9}$/.test(d)) return d;
  if (/^0[1-9]\d{8,9}$/.test(d)) return d;
  return null;
}
export const clean = (v, n = 300) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, n);
