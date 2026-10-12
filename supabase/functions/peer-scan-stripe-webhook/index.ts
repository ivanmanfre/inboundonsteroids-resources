// peer-scan-stripe-webhook (2026-10-12): Stripe -> checkout.session.completed / async_payment_succeeded.
// Verifies the Stripe-Signature header with STRIPE_WEBHOOK_SECRET (edge secret), matches the payment
// to the order by client_reference_id, marks it paid (idempotent on stripe_session_id) and queues the job.
// A payment with no matching order still becomes a paid order (status paid, error 'unmatched_payment')
// so no paid buyer is lost; the job cannot run without a LinkedIn URL, so it waits for a human.
// Job dispatch only fires while integration_config.peer_scan_runner_armed = 'true'.
import { json, sget, spost, spatch, conf, rpc } from "../_shared/peerscan.ts";

const WHSEC = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
const TOLERANCE_S = 300;

async function verify(payload: string, header: string): Promise<boolean> {
  if (!WHSEC || !header) return false;
  const parts = header.split(",").map((p) => p.split("=") as [string, string]);
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WHSEC), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return sigs.some((s) => s.length === hex.length && [...s].reduce((a, c, i) => a | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

const token = () => {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get("stripe-signature") || ""))) return json(req, { error: "bad_signature" }, 400);
  let ev: { type?: string; livemode?: boolean; data?: { object?: Record<string, any> } };
  try { ev = JSON.parse(payload); } catch { return json(req, { error: "bad_json" }, 400); }
  if (ev.type !== "checkout.session.completed" && ev.type !== "checkout.session.async_payment_succeeded") return json(req, { ok: true, ignored: ev.type });
  const s = ev.data?.object || {};
  if (s.payment_status !== "paid") return json(req, { ok: true, waiting: s.payment_status });
  try {
    const dup = await sget(`peer_scan_orders?stripe_session_id=eq.${encodeURIComponent(s.id)}&select=id`);
    if (dup.length) return json(req, { ok: true, duplicate: dup[0].id });
    const paid = { status: "paid", stripe_session_id: s.id, stripe_payment_intent: s.payment_intent || null,
      amount_cents: s.amount_total ?? null, currency: s.currency || null, livemode: !!ev.livemode, paid_at: new Date().toISOString(),
      rescan_due_at: new Date(Date.now() + 30 * 86400e3).toISOString(), updated_at: new Date().toISOString() };
    const ref = String(s.client_reference_id || "");
    let id: string | null = null;
    if (/^[0-9a-f-]{36}$/.test(ref)) {
      const rows = await spatch(`peer_scan_orders?id=eq.${ref}&status=eq.pending_payment`, { ...paid, token: token() });
      if (rows.length) id = rows[0].id;
      else {
        const cur = (await sget(`peer_scan_orders?id=eq.${ref}&select=id,status`))[0];
        if (cur) return json(req, { ok: true, already: cur.status });
      }
    }
    if (!id) {
      const email = String(s.customer_details?.email || s.customer_email || "").toLowerCase() || null;
      const row = (await spost("peer_scan_orders", [{ kind: "purchase", email, linkedin_url: null, is_test: !ev.livemode,
        ...paid, token: token(), error: "unmatched_payment" }]))[0];
      id = row.id;
    }
    const c = await conf(["peer_scan_runner_armed"]);
    if (String(c.peer_scan_runner_armed) === "true") await rpc("peer_scan_dispatch", { p_mode: "order", p_order: id });
    await spost("peer_scan_events", [{ session_id: null, step: "purchase", order_id: id, meta: { livemode: !!ev.livemode, amount: s.amount_total ?? null } }], "return=minimal").catch(() => {});
    return json(req, { ok: true, order_id: id });
  } catch (e) {
    // 500 makes Stripe retry, which is what we want on a transient DB failure.
    return json(req, { ok: false, error: "server", detail: String((e as Error)?.message || e).slice(0, 120) }, 500);
  }
});
