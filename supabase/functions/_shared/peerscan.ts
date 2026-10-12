// Shared helpers for the LinkedIn Peer Scan edge functions (thread C, 2026-10-11).
export const SB_URL = Deno.env.get("SUPABASE_URL")!;
export const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const RESEND = Deno.env.get("RESEND_API_KEY") || "";
export const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };
export const REPORT_BASE = "https://resources.inboundonsteroids.com/peer-scan/r/?t=";
export const RESEND_PAGE = "https://resources.inboundonsteroids.com/peer-scan/resend/";
const ORIGINS = new Set(["https://resources.inboundonsteroids.com", "https://inboundonsteroids.com", "https://www.inboundonsteroids.com",
  "http://localhost:8790", "http://127.0.0.1:8790", "http://localhost:5873", "http://127.0.0.1:5873"]);

export function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return { "access-control-allow-origin": ORIGINS.has(o) ? o : "https://resources.inboundonsteroids.com",
    "access-control-allow-headers": "content-type, apikey, authorization, x-client-info", "access-control-allow-methods": "POST, GET, OPTIONS", vary: "origin" };
}
export const json = (req: Request, body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json", ...extra } });

export async function sget(q: string) {
  const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error("sb_get_" + r.status + " " + (await r.text()).slice(0, 160));
  return await r.json();
}
export async function spost(table: string, body: unknown, prefer = "return=representation") {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, { method: "POST", headers: { ...H, Prefer: prefer }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("sb_post_" + r.status + " " + (await r.text()).slice(0, 160));
  return prefer.includes("representation") ? await r.json() : null;
}
export async function spatch(q: string, body: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/${q}`, { method: "PATCH", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("sb_patch_" + r.status + " " + (await r.text()).slice(0, 160));
  return await r.json();
}
export async function rpc(fn: string, args: unknown) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: H, body: JSON.stringify(args) });
  return r.ok;
}
export async function conf(keys: string[]): Promise<Record<string, string>> {
  const rows = await sget(`integration_config?select=key,value&key=in.(${keys.join(",")})`);
  const out: Record<string, string> = {};
  for (const r of rows) { let v = r.value; if (typeof v === "string") { try { const j = JSON.parse(v); if (typeof j === "string") v = j; } catch { /* plain */ } } out[r.key] = typeof v === "string" ? v : JSON.stringify(v); }
  return out;
}

export function normLinkedin(u: string): string | null {
  const m = String(u || "").trim().match(/linkedin\.com\/in\/([^/?#\s]+)/i);
  if (!m) return null;
  let s = m[1]; try { s = decodeURIComponent(s); } catch { /* keep */ }
  s = s.toLowerCase();
  return s.length >= 2 && s.length <= 120 ? s : null;
}
export const profileUrl = (slug: string) => "https://www.linkedin.com/in/" + encodeURIComponent(slug);
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
export const clip = (v: unknown, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
export const esc = (s: string) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// The report email. Plain and light so it lands in the inbox; the report page carries the design.
export function reportEmail(o: { name?: string | null; links: { url: string; pdf?: string | null; label?: string }[]; resend?: boolean }) {
  const first = (o.name || "").split(/\s+/)[0] || "there";
  const rows = o.links.map((l) => `<tr><td style="padding:0 0 14px">
      <a href="${esc(l.url)}" style="display:inline-block;background:#C8361B;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:999px;font-size:16px">Open your Peer Scan${l.label ? " (" + esc(l.label) + ")" : ""}</a>
      ${l.pdf ? `<div style="margin-top:10px;font-size:14px"><a href="${esc(l.pdf)}" style="color:#131210">Download the PDF</a></div>` : ""}
    </td></tr>`).join("");
  const subject = o.resend ? "Your LinkedIn Peer Scan link" : "Your LinkedIn Peer Scan is ready";
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f2;font-family:Arial,Helvetica,sans-serif;color:#131210">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;padding:32px">
<tr><td style="font-size:13px;letter-spacing:.08em;font-weight:700;padding-bottom:22px">INBOUND<span style="color:#C8361B">ON</span>STEROIDS</td></tr>
<tr><td style="font-size:22px;font-weight:700;padding-bottom:12px">Hi ${esc(first)}, ${o.resend ? "here is your report link again." : "your report is ready."}</td></tr>
<tr><td style="font-size:16px;line-height:1.55;padding-bottom:22px">${o.resend ? "Same private link as before. It works on phone and desktop." :
  "Inside: where you rank among creators your size in your niche, what wins and costs you on your own posts, who engages with you, 12 posts for the next 4 weeks (3 as ready carousels), your profile rewrite and more."}</td></tr>
${rows}
<tr><td style="font-size:14px;line-height:1.55;color:#4A463E;padding-top:8px">The link is private to you. If you lose it, get it again here: <a href="${RESEND_PAGE}" style="color:#131210">${RESEND_PAGE.replace("https://", "")}</a>. In 30 days we scan you again and send your before and after numbers.</td></tr>
<tr><td style="font-size:14px;line-height:1.55;color:#4A463E;padding-top:18px">Questions? Just reply to this email.<br>Ivan</td></tr>
</table></td></tr></table></body></html>`;
  const text = `Hi ${first}, ${o.resend ? "here is your Peer Scan link again" : "your LinkedIn Peer Scan is ready"}.\n\n${o.links.map((l) => l.url + (l.pdf ? "\nPDF: " + l.pdf : "")).join("\n\n")}\n\nLost the link? ${RESEND_PAGE}\nIn 30 days we scan you again and send your before and after numbers.\n\nQuestions? Just reply.\nIvan`;
  return { subject, html, text };
}

export async function sendEmail(to: string, m: { subject: string; html: string; text: string }) {
  if (!RESEND) throw new Error("no_resend_key");
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "content-type": "application/json" },
    body: JSON.stringify({ from: "Ivan Manfredi <ivan@inboundonsteroids.com>", reply_to: "im@ivanmanfredi.com", to: [to], subject: m.subject, html: m.html, text: m.text }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("resend_" + r.status + " " + JSON.stringify(j).slice(0, 160));
  return j.id as string;
}
