// peer-scan-resend (2026-10-12): the "get my report link again" form posts here.
// POST {email} -> always {ok:true}, whatever happens, so the page never says whether an email bought.
// Sends the report links of that email's delivered orders to that same email only.
// At most one resend per email per 15 minutes (peer_scan_events step 'resend_sent').
import { cors, json, sget, spost, validEmail, reportEmail, sendEmail, REPORT_BASE } from "../_shared/peerscan.ts";

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  const ok = () => json(req, { ok: true });
  try {
    let b: Record<string, unknown>; try { b = await req.json(); } catch { return ok(); }
    const email = String(b.email || "").trim().toLowerCase();
    if (!validEmail(email)) return ok();
    const eh = await sha(email);
    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const recent = await sget(`peer_scan_events?step=eq.resend_sent&session_id=eq.${eh}&at=gte.${encodeURIComponent(since)}&select=id&limit=1`);
    if (recent.length) return ok();
    const orders = await sget(`peer_scan_orders?email=eq.${encodeURIComponent(email)}&kind=in.(purchase,rescan)&delivered_at=not.is.null&select=id,created_at&order=created_at.desc&limit=5`);
    if (!orders.length) return ok();
    const reps = await sget(`peer_scan_reports?order_id=in.(${orders.map((o: { id: string }) => o.id).join(",")})&select=order_id,token,pdf_url,created_at,data->buyer->>name&order=created_at.desc`);
    if (!reps.length) return ok();
    const many = reps.length > 1;
    const links = reps.map((r: { token: string; pdf_url: string | null; created_at: string }) => ({
      url: REPORT_BASE + r.token, pdf: r.pdf_url,
      label: many ? new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : undefined }));
    const id = await sendEmail(email, reportEmail({ name: reps[0].name, links, resend: true }));
    await spost("peer_scan_events", [{ session_id: eh, step: "resend_sent", order_id: orders[0].id, meta: { email_id: id, reports: reps.length } }], "return=minimal");
    return ok();
  } catch (e) {
    console.error("resend", String((e as Error)?.message || e).slice(0, 200));
    return ok();
  }
});
