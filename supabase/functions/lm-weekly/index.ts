import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=300, s-maxage=300",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const prevWeek = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  // This week's events by type
  const { data: thisWeekEvts } = await supabase.from("lm_events").select("event_type, email, lm_slug").gte("created_at", weekAgo);
  const { data: lastWeekEvts } = await supabase.from("lm_events").select("event_type").gte("created_at", prevWeek).lt("created_at", weekAgo);

  const countEvt = (arr: any[], type: string) => arr.filter((e) => e.event_type === type).length;
  const uniqEmail = (arr: any[]) => new Set(arr.filter((e) => e.event_type === "capture" && e.email).map((e) => e.email.toLowerCase())).size;

  const thisViews = countEvt(thisWeekEvts || [], "view");
  const lastViews = countEvt(lastWeekEvts || [], "view");
  const thisCaps = uniqEmail(thisWeekEvts || []);
  const lastCaps = new Set((lastWeekEvts || []).filter((e: any) => e.event_type === "capture").map((e: any) => e.email)).size;
  const thisCompletes = countEvt(thisWeekEvts || [], "complete");

  // Per-LM this week
  const perLm: Record<string, { views: number; captures: Set<string>; completes: number }> = {};
  for (const e of thisWeekEvts || []) {
    const s = e.lm_slug || "unknown";
    if (!perLm[s]) perLm[s] = { views: 0, captures: new Set(), completes: 0 };
    if (e.event_type === "view") perLm[s].views++;
    if (e.event_type === "capture" && e.email) perLm[s].captures.add(e.email.toLowerCase());
    if (e.event_type === "complete") perLm[s].completes++;
  }

  // Top 5 by captures (tie-break views)
  const ranked = Object.entries(perLm)
    .map(([slug, s]) => ({ slug, views: s.views, captures: s.captures.size, completes: s.completes }))
    .sort((a, b) => (b.captures - a.captures) || (b.views - a.views));
  const top = ranked.slice(0, 5);

  // Dark LMs: high quality score (>=7), no views in 7 days
  const { data: allLms } = await supabase.from("lead_magnets").select("slug, title, content_quality_score, resource_page_url, format, gate_keyword").gte("content_quality_score", 7).not("resource_page_url", "is", null);
  const dark = (allLms || []).filter((lm: any) => (perLm[lm.slug]?.views ?? 0) === 0).slice(0, 10);

  // Assessment completions rollup (this week)
  const { data: completes } = await supabase.from("assessment_results").select("assessment_slug, weakest_category, overall_score, tier").gte("completed_at", weekAgo);
  const weakestRollup: Record<string, { n: number; avg_score: number }> = {};
  for (const c of completes || []) {
    const k = c.weakest_category || "unknown";
    if (!weakestRollup[k]) weakestRollup[k] = { n: 0, avg_score: 0 };
    weakestRollup[k].n++;
    weakestRollup[k].avg_score += (c.overall_score || 0);
  }
  for (const k of Object.keys(weakestRollup)) {
    const r = weakestRollup[k];
    r.avg_score = Math.round(r.avg_score / Math.max(r.n, 1));
  }

  // Gate-keyword performance
  const { data: gateData } = await supabase.from("gate_keyword_performance").select("*");

  // Per-LM P&L (W-B.3, 2026-07-10): rolling 30d views → cta_clicks → calls, one
  // headline number per resource (calls_per_100_views). Reads lm_attribution,
  // the Calendly join shipped with Spec 1 Layer B.
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: monthEvts } = await supabase.from("lm_events").select("event_type, lm_slug").gte("created_at", monthAgo);
  const { data: attribRows } = await supabase.from("lm_attribution").select("lm_slug, status, booked_at").gte("booked_at", monthAgo);
  const pnl: Record<string, { views: number; cta_clicks: number; calls_booked: number; calls_held: number }> = {};
  const pnlGet = (s: string) => (pnl[s] ||= { views: 0, cta_clicks: 0, calls_booked: 0, calls_held: 0 });
  for (const e of monthEvts || []) {
    const s = e.lm_slug || "unknown";
    if (e.event_type === "view") pnlGet(s).views++;
    if (e.event_type === "cta_click") pnlGet(s).cta_clicks++;
  }
  for (const a of attribRows || []) {
    const s = a.lm_slug || "unknown";
    if (a.status === "canceled") continue;
    pnlGet(s).calls_booked++;
    if (a.status === "held" || a.status === "deal") pnlGet(s).calls_held++;
  }
  const perLmPnl = Object.entries(pnl)
    .map(([slug, v]) => ({
      slug, ...v,
      calls_per_100_views: v.views > 0 ? Math.round((v.calls_booked / v.views) * 1000) / 10 : null,
    }))
    .sort((a, b) => (b.calls_booked - a.calls_booked) || (b.cta_clicks - a.cta_clicks) || (b.views - a.views));
  const callsBooked30d = perLmPnl.reduce((t, x) => t + x.calls_booked, 0);

  // Build markdown digest for WhatsApp/email/ClickUp
  const viewDelta = thisViews - lastViews;
  const capDelta = thisCaps - lastCaps;
  const arrow = (n: number) => n > 0 ? `+${n} ↗` : n < 0 ? `${n} ↘` : "flat";

  const md = [
    `*LM Weekly Digest* — ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Views: *${thisViews}* (${arrow(viewDelta)} vs last week)`,
    `Captures: *${thisCaps}* (${arrow(capDelta)})`,
    `Completions: *${thisCompletes}*`,
    `Calls booked from LMs (30d): *${callsBooked30d}*`,
    "",
    `*Top 5 LMs this week*`,
    ...(top.length === 0 ? ["_no activity_"] : top.map((t, i) => `${i + 1}. ${t.slug.slice(0, 50)} — ${t.views}v / ${t.captures}c`)),
    "",
    `*Dark high-quality LMs* (score ≥7, 0 views in 7 days)`,
    ...(dark.length === 0 ? ["_all quality LMs are flowing_"] : dark.slice(0, 5).map((d: any) => `• ${d.slug.slice(0, 60)} (q=${d.content_quality_score})`)),
    "",
    `*Assessment completions — weakest category rollup*`,
    ...(Object.keys(weakestRollup).length === 0 ? ["_no completions this week_"] : Object.entries(weakestRollup).map(([k, v]) => `• ${k} — ${v.n} completion(s), avg ${v.avg_score}/100`)),
    "",
    `*Comment-gate activity*`,
    ...(gateData?.length === 0 ? ["_no matches yet_"] : (gateData || []).map((g: any) => `• ${g.gate_keyword}: ${g.comments_matched || 0} matched, ${g.dms_sent || 0} DMs sent`)),
    "",
    `Dashboard: resources.ivanmanfredi.com/dashboard/`,
  ].join("\n");

  return new Response(JSON.stringify({
    generated_at: new Date().toISOString(),
    window_start: weekAgo,
    window_end: new Date().toISOString(),
    totals: { views: thisViews, captures: thisCaps, completions: thisCompletes, view_delta: viewDelta, capture_delta: capDelta },
    top_performers: top,
    dark_high_quality: dark.map((d: any) => ({ slug: d.slug, title: d.title, quality: d.content_quality_score, gate_keyword: d.gate_keyword })),
    weakest_category_rollup: weakestRollup,
    gate_keyword_performance: gateData || [],
    per_lm_pnl: perLmPnl,
    calls_booked_30d: callsBooked30d,
    markdown_digest: md,
  }), { headers: CORS });
});
