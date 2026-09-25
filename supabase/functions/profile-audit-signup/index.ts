// profile-audit-signup (2026-09-25): public intake for the PROFILE audit by link (no comment needed).
// POST {linkedin_url, email, utm...}  -> profile_audit_signups row -> marked Ivan-lane prospect
//   (enrichment_data.lm_gate_keyword='PROFILE', profile_gate.state='queued', source='link'), same shape the
//   Comment-Gate Handler writes, so the Profile Gate Builder (9fq1BdbdmA6CFiW7) builds it unchanged.
// POST ?deliver=<token> -> called by the builder once the scan page is live: sends the page by email ONCE.
//   No secret needed: it can only send the one email this person asked for, to the address they gave.
// GET/POST ?unsub=<token> -> no email from us.
// Born dead: while integration_config.profile_audit_intake_armed != 'true', only the test allowlist gets in.
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND = Deno.env.get("RESEND_API_KEY") || "";
const FN_BASE = SB_URL + "/functions/v1";
const UNI = "https://api38.unipile.com:16836/api/v1";
const UNIACC = "rm-WNhwaS1m7VcZoYLRrJA";
const KEYWORD = "PROFILE";
const ORIGINS = new Set(["https://resources.inboundonsteroids.com", "https://inboundonsteroids.com", "https://www.inboundonsteroids.com", "http://localhost:8790", "http://127.0.0.1:8790"]);
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "content-type": "application/json" };

function cors(req: Request) {
  const o = req.headers.get("origin") || "";
  return { "access-control-allow-origin": ORIGINS.has(o) ? o : "https://resources.inboundonsteroids.com", "access-control-allow-headers": "content-type", "access-control-allow-methods": "POST, GET, OPTIONS", vary: "origin" };
}
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), "content-type": "application/json" } });
const clip = (v: unknown, n = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const sget = async (q: string) => { const r = await fetch(`${SB_URL}/rest/v1/${q}`, { headers: H }); if (!r.ok) throw new Error("sb_" + r.status); return await r.json(); };
const spatch = (q: string, body: unknown) => fetch(`${SB_URL}/rest/v1/${q}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(body) });
async function conf(keys: string[]) {
  const rows = await sget(`integration_config?select=key,value&key=in.(${keys.join(",")})`);
  return Object.fromEntries(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
}

function normLinkedin(raw: string) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
  let u: URL; try { u = new URL(s); } catch { return null; }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const m = u.pathname.match(/\/in\/([^\/?#]+)/i);
  if (!m) return null;
  let slug = m[1]; try { slug = decodeURIComponent(slug); } catch { /* keep */ }
  return slug.toLowerCase().normalize("NFC");
}

// Same rules as the Comment-Gate Handler's _profileGateEnsure: reuse an Ivan-lane row, hold a person another
// tenant owns, otherwise create the row in the Inbound Request (Ivan) campaign.
async function ensureProspect(providerId: string, slug: string, name: string, headline: string, signupId: string) {
  const camps = await sget("outreach_campaigns?select=id,name,client_id");
  const campClient: Record<string, string | null> = {};
  for (const c of camps) campClient[c.id] = c.client_id || null;
  const inbound = camps.find((c: { name: string; client_id: string | null }) => /inbound request/i.test(c.name || "") && (c.client_id == null || c.client_id === "ivan"));
  if (!inbound) throw new Error("no_inbound_campaign");
  const all: { id: string; campaign_id: string; blacklisted: boolean; marked: string | null }[] = [];
  for (const q of [`linkedin_profile_id=eq.${encodeURIComponent(providerId)}`, `linkedin_url=ilike.*${encodeURIComponent("/in/" + slug)}*`]) {
    for (const r of await sget(`outreach_prospects?select=id,campaign_id,blacklisted,marked:enrichment_data->>lm_gate_keyword&${q}&limit=10`)) if (!all.some((x) => x.id === r.id)) all.push(r);
  }
  // prefer the row already in the builder, then the Inbound Request row, then any other Ivan-lane row
  const rank = (r: { campaign_id: string; marked: string | null }) => (r.marked === KEYWORD ? 0 : r.campaign_id === inbound.id ? 1 : 2);
  const ivanRows = all.filter((r) => r.campaign_id && r.campaign_id in campClient && (campClient[r.campaign_id] == null || campClient[r.campaign_id] === "ivan")).sort((a, b) => rank(a) - rank(b));
  const mark = { state: "queued", keyword: KEYWORD, lm_slug: "profile-audit", source: "link", signup_id: signupId, queued_at: new Date().toISOString() };
  if (ivanRows.length) {
    const r0 = ivanRows[0];
    if (r0.blacklisted) return { status: "blacklisted", prospect_id: r0.id };
    const fr = await sget(`outreach_prospects?id=eq.${r0.id}&select=id,enrichment_data&limit=1`); // re-read right before the write
    let ed = (fr[0] && fr[0].enrichment_data) || {};
    if (typeof ed === "string") { try { ed = JSON.parse(ed); } catch { ed = {}; } }
    const live = ed.profile_gate && ed.lm_gate_keyword === KEYWORD && ["queued", "building", "built"].includes(ed.profile_gate.state);
    if (live) { // already in the builder: attach this signup so delivery goes by email
      await spatch(`outreach_prospects?id=eq.${r0.id}`, { enrichment_data: { ...ed, profile_gate: { ...ed.profile_gate, source: "link", signup_id: signupId } } });
    } else {
      await spatch(`outreach_prospects?id=eq.${r0.id}`, { enrichment_data: { ...ed, lm_gate_keyword: KEYWORD, profile_gate: mark } });
    }
    return { status: "queued", prospect_id: r0.id };
  }
  if (all.length) return { status: "held_other_tenant", prospect_id: all[0].id };
  const made = await fetch(`${SB_URL}/rest/v1/outreach_prospects?select=id`, {
    method: "POST", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify({ name: name || slug, headline: headline || null, linkedin_url: "https://www.linkedin.com/in/" + slug, linkedin_profile_id: providerId,
      campaign_id: inbound.id, stage: "lm_delivered", notes: "lm_gate: signed up by link for profile-audit (build_first)",
      enrichment_data: { lm_gate_keyword: KEYWORD, profile_gate: mark } }),
  });
  if (made.status === 409) return { status: "held_other_tenant", prospect_id: null };
  if (!made.ok) throw new Error("prospect_create_" + made.status);
  return { status: "queued", prospect_id: (await made.json())[0]?.id || null };
}

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function mdToHtml(md: string) {
  const inline = (t: string) => esc(t).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" style="color:#C8361B;text-decoration:underline;">$1</a>');
  return md.trim().split(/\n{2,}/).map((block) => {
    const b = block.trim();
    const btn = b.match(/^\[\[button:([^|\]]+)\|(https?:[^\]]+)\]\]$/);
    if (btn) return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:26px 0;"><tr><td style="border-radius:100px;background:#C8361B;"><a href="${esc(btn[2])}" style="display:inline-block;padding:16px 26px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:100px;">${esc(btn[1])} &#8599;</a></td></tr></table>`;
    return `<p style="margin:0 0 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#29241f;">${inline(b).replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
}
const mdToText = (md: string) => md.replace(/\[\[button:([^|\]]+)\|([^\]]+)\]\]/g, "$1: $2").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)").replace(/\*\*/g, "");
function shell(bodyHtml: string, preview: string, unsubUrl: string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>InboundOnSteroids</title></head>
<body style="margin:0;padding:0;background:#f6f5f2;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f6f5f2;">${esc(preview)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f5f2;"><tr><td align="center" style="padding:28px 14px 40px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;">
<tr><td style="background:#131210;border-radius:20px 20px 0 0;padding:22px 30px;font-family:Arial,Helvetica,sans-serif;font-size:18px;letter-spacing:-0.3px;color:#ffffff;">INBOUND<span style="color:#C8361B;font-weight:900;">ON</span>STEROIDS</td></tr>
<tr><td style="background:#ffffff;border-radius:0 0 20px 20px;padding:34px 30px 30px;">${bodyHtml}</td></tr>
<tr><td style="padding:22px 30px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#716b63;">You are getting this because you asked for your LinkedIn profile audit at inboundonsteroids.com. <a href="${esc(unsubUrl)}" style="color:#716b63;text-decoration:underline;">No more emails</a>.</td></tr>
</table></td></tr></table></body></html>`;
}

async function deliver(req: Request, token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return json(req, { error: "bad_token" }, 400);
  const s = (await sget(`profile_audit_signups?token=eq.${token}&select=*&limit=1`))[0];
  if (!s) return json(req, { error: "not_found" }, 404);
  if (s.emailed_at) return json(req, { ok: true, already: true });
  if (s.unsubscribed_at) return json(req, { ok: true, skipped: "unsubscribed" });
  if (!s.prospect_id) return json(req, { error: "no_prospect" }, 409);
  const p = (await sget(`outreach_prospects?id=eq.${s.prospect_id}&select=id,name,enrichment_data&limit=1`))[0];
  let ed = (p && p.enrichment_data) || {};
  if (typeof ed === "string") { try { ed = JSON.parse(ed); } catch { ed = {}; } }
  const pg = ed.profile_gate || {};
  if (pg.state !== "built" || !pg.slug || !pg.page_live_at) return json(req, { error: "page_not_ready" }, 409);
  const c = await conf(["profile_audit_email_template"]);
  let tpl: { subject?: string; preview?: string; body_md?: string } = {};
  try { tpl = JSON.parse(c.profile_audit_email_template || "{}"); } catch { tpl = {}; }
  if (!tpl.subject || !tpl.body_md || tpl.body_md.indexOf("{{url}}") < 0) return json(req, { error: "copy_not_set" }, 409);
  if (!RESEND) return json(req, { error: "no_resend_key" }, 500);
  const url = `https://inboundonsteroids.com/scan/${pg.slug}/`;
  const first = String(s.name || p?.name || "").split(" ")[0] || "there";
  const fill = (t: string) => t.replace(/\{\{\s*(first_name|firstName)\s*\}\}/g, first).replace(/\{\{\s*url\s*\}\}/g, url);
  const unsub = `${FN_BASE}/profile-audit-signup?unsub=${s.token}`;
  const body = fill(tpl.body_md);
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${RESEND}`, "content-type": "application/json" },
    body: JSON.stringify({ from: "Ivan Manfredi <ivan@inboundonsteroids.com>", reply_to: "im@ivanmanfredi.com", to: [s.email], subject: fill(tpl.subject),
      html: shell(mdToHtml(body), fill(tpl.preview || ""), unsub), text: mdToText(body) + `\n\nNo more emails: ${unsub}`,
      headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, tags: [{ name: "lane", value: "profile_audit" }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return json(req, { error: "resend_" + r.status, detail: JSON.stringify(j).slice(0, 200) }, 502);
  await spatch(`profile_audit_signups?id=eq.${s.id}`, { emailed_at: new Date().toISOString(), resend_id: j.id || null, status: "emailed" });
  return json(req, { ok: true, resend_id: j.id || null, url });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  const url = new URL(req.url);
  const unsubT = url.searchParams.get("unsub");
  if (unsubT) {
    if (/^[0-9a-f]{32}$/.test(unsubT)) await spatch(`profile_audit_signups?token=eq.${unsubT}&unsubscribed_at=is.null`, { unsubscribed_at: new Date().toISOString() });
    if (req.method === "POST") return new Response("ok"); // RFC 8058 one-click
    return new Response('<!doctype html><meta charset=utf-8><meta name=robots content=noindex><body style="font-family:Arial,sans-serif;background:#f6f5f2;color:#131210;padding:60px 24px;text-align:center"><p style="font-size:18px">Done. No more emails from us.</p></body>', { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  if (req.method !== "POST") return json(req, { error: "method" }, 405);
  try {
    const dT = url.searchParams.get("deliver");
    if (dT) return await deliver(req, dT);

    let b: Record<string, unknown>; try { b = await req.json(); } catch { return json(req, { error: "bad_json" }, 400); }
    if (clip(b.company_site)) return json(req, { ok: true }); // honeypot
    const email = String(b.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return json(req, { error: "bad_email" }, 400);
    const slug = normLinkedin(String(b.linkedin_url || ""));
    if (!slug) return json(req, { error: "bad_linkedin_url" }, 400);

    const c = await conf(["profile_audit_intake_armed", "profile_audit_test_allowlist", "profile_audit_daily_signup_cap"]);
    let allow: string[] = []; try { allow = JSON.parse(c.profile_audit_test_allowlist || "[]").map((x: string) => String(x).toLowerCase()); } catch { allow = []; }
    const isTest = allow.includes(email);
    if (String(c.profile_audit_intake_armed) !== "true" && !isTest) return json(req, { error: "not_open_yet" }, 403);
    if (!isTest) { // the builder does 10 scans a day on the shared proxy: take no more than that. Fail closed.
      const cap = Number(c.profile_audit_daily_signup_cap);
      if (Number.isFinite(cap) && cap >= 0) {
        const since = new Date(Date.now() - 86400000).toISOString();
        const r = await fetch(`${SB_URL}/rest/v1/profile_audit_signups?select=id&is_test=eq.false&created_at=gte.${encodeURIComponent(since)}`, { method: "HEAD", headers: { ...H, Prefer: "count=exact" } });
        const n = Number((r.headers.get("content-range") || "").split("/")[1]);
        if (!r.ok || !Number.isFinite(n) || n >= cap) return json(req, { error: "full_today" }, 429);
      }
    }
    const utm = (b.utm && typeof b.utm === "object" ? b.utm : {}) as Record<string, unknown>;
    const row = { email, linkedin_url: String(b.linkedin_url).trim().slice(0, 300), linkedin_slug: slug, is_test: isTest,
      utm_source: clip(b.utm_source ?? utm.utm_source), utm_medium: clip(b.utm_medium ?? utm.utm_medium), utm_id: clip(b.utm_id ?? utm.utm_id),
      utm_campaign: clip(b.utm_campaign ?? utm.utm_campaign), utm_content: clip(b.utm_content ?? utm.utm_content), referrer: clip(b.referrer, 300) };
    const ins = await fetch(`${SB_URL}/rest/v1/profile_audit_signups`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
    if (ins.status === 409) return json(req, { ok: true, duplicate: true });
    if (!ins.ok) return json(req, { error: "store_failed" }, 500);
    const s = (await ins.json())[0];

    // One profile read on Ivan's seat to get the provider id the builder needs (the builder reads the rest).
    const ur = await fetch(`${UNI}/users/${encodeURIComponent(slug)}?account_id=${UNIACC}`, { headers: { "X-API-KEY": (await conf(["unipile_api_key"])).unipile_api_key || "" } });
    const u = ur.ok ? await ur.json() : null;
    if (!u || !u.provider_id) {
      await spatch(`profile_audit_signups?id=eq.${s.id}`, { status: "resolve_failed", status_detail: "unipile_" + ur.status });
      return json(req, { error: "profile_not_found" }, 422);
    }
    const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
    const res = await ensureProspect(u.provider_id, slug, name, u.headline || "", s.id);
    await spatch(`profile_audit_signups?id=eq.${s.id}`, { provider_id: u.provider_id, name: name || null, prospect_id: res.prospect_id, status: res.status });
    return json(req, { ok: true });
  } catch (e) {
    return json(req, { error: "server", detail: String((e as Error)?.message || e).slice(0, 120) }, 500);
  }
});
