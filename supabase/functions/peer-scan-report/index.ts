// peer-scan-report (2026-10-12): the report page fetches its JSON here.
// GET ?t=<token> -> the report JSON (v1) as stored in peer_scan_reports.data, or {error} 404.
// The token is the only key: 24+ url-safe chars, unguessable, private to the buyer.
import { cors, json, sget, spatch } from "../_shared/peerscan.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "GET") return json(req, { error: "method" }, 405);
  const t = new URL(req.url).searchParams.get("t") || "";
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(t)) return json(req, { error: "bad_token" }, 400);
  try {
    const r = (await sget(`peer_scan_reports?token=eq.${t}&select=id,data,views&limit=1`))[0];
    if (!r || !r.data) return json(req, { error: "not_found" }, 404);
    // View count is best effort; never block the report on it.
    spatch(`peer_scan_reports?id=eq.${r.id}`, { views: (r.views || 0) + 1, last_viewed_at: new Date().toISOString() }).catch(() => {});
    return json(req, r.data, 200, { "cache-control": "private, no-store" });
  } catch (e) {
    return json(req, { error: "server", detail: String((e as Error)?.message || e).slice(0, 120) }, 500);
  }
});
