// peer-scan-order (2026-10-11): the sales page form posts here.
// POST {linkedin_url, email, session_id, utm:{source,medium,campaign,content,term}, referrer}
//   -> peer_scan_orders row (pending_payment) -> {ok, order_id, checkout_url}
//   checkout_url = the Stripe Payment Link in integration_config.peer_scan_payment_link (test link until launch)
//   with client_reference_id=<order_id> so the webhook can match the payment to this order.
// Closed unless integration_config.peer_scan_orders_open = 'true' (launch) or body.preview matches peer_scan_preview_key.
// GET ?o=<order_id> -> {status} for the thanks page (no personal data).
import { cors, json, sget, spost, conf, normLinkedin, profileUrl, validEmail, clip } from "../_shared/peerscan.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      const o = url.searchParams.get("o") || "";
      if (!/^[0-9a-f-]{36}$/.test(o)) return json(req, { error: "bad_order" }, 400);
      const r = (await sget(`peer_scan_orders?id=eq.${o}&select=status,stage`))[0];
      return json(req, r ? { ok: true, status: r.status, stage: r.stage } : { error: "not_found" }, r ? 200 : 404);
    }
    if (req.method !== "POST") return json(req, { error: "method" }, 405);
    let b: Record<string, unknown>; try { b = await req.json(); } catch { return json(req, { ok: false, error: "bad_json" }, 400); }
    if (clip(b.company_site)) return json(req, { ok: true, order_id: null, checkout_url: null }); // honeypot
    const email = String(b.email || "").trim().toLowerCase();
    if (!validEmail(email)) return json(req, { ok: false, error: "bad_email" }, 400);
    const slug = normLinkedin(String(b.linkedin_url || ""));
    if (!slug) return json(req, { ok: false, error: "bad_linkedin_url" }, 400);
    const c = await conf(["peer_scan_payment_link", "peer_scan_orders_open", "peer_scan_preview_key"]);
    // Gate until launch: orders stay closed unless the page was opened with ?preview=<peer_scan_preview_key>.
    const preview = !!c.peer_scan_preview_key && clip(b.preview, 64) === c.peer_scan_preview_key;
    if (String(c.peer_scan_orders_open) !== "true" && !preview) return json(req, { ok: false, error: "closed" }, 403);
    const link = c.peer_scan_payment_link;
    if (!link || !/^https:\/\/buy\.stripe\.com\//.test(link)) return json(req, { ok: false, error: "checkout_unavailable" }, 503);
    const u = (b.utm && typeof b.utm === "object" ? b.utm : {}) as Record<string, unknown>;
    const utm: Record<string, string> = {};
    for (const k of ["source", "medium", "campaign", "content", "term"]) { const v = clip(u[k] ?? u["utm_" + k] ?? b["utm_" + k], 120); if (v) utm[k] = v; }
    const row = (await spost("peer_scan_orders", [{ kind: "purchase", email, linkedin_url: profileUrl(slug), status: "pending_payment",
      session_id: clip(b.session_id, 80), utm, referrer: clip(b.referrer, 300), is_test: preview || /test$/.test(utm.medium || "") }]))[0];
    const checkout = link + (link.includes("?") ? "&" : "?") + "client_reference_id=" + row.id + "&prefilled_email=" + encodeURIComponent(email);
    return json(req, { ok: true, order_id: row.id, checkout_url: checkout });
  } catch (e) {
    return json(req, { ok: false, error: "server", detail: String((e as Error)?.message || e).slice(0, 120) }, 500);
  }
});
