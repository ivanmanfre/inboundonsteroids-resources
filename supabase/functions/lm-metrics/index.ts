import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Content-Type": "application/json",
  "Cache-Control": "public, max-age=60, s-maxage=60",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // Parallel queries
  const [performance, activity, weakest, gateKw, totals] = await Promise.all([
    supabase.from("lm_dashboard_performance").select("*").order("captures_30d", { ascending: false }),
    supabase.from("lm_today_activity").select("*").limit(100),
    supabase.from("assessment_weakest_rollup").select("*"),
    supabase.from("gate_keyword_performance").select("*"),
    supabase.from("lm_events").select("event_type", { count: "exact", head: true }),
  ]);

  const rows = performance.data || [];
  const totalViews30d = rows.reduce((a: number, r: any) => a + (r.views_30d || 0), 0);
  const totalCaptures30d = rows.reduce((a: number, r: any) => a + (r.captures_30d || 0), 0);
  const totalCompletions = rows.reduce((a: number, r: any) => a + (r.completions_all || 0), 0);
  const avgCapture = rows.length ? (rows.reduce((a: number, r: any) => a + (r.capture_rate_pct || 0), 0) / rows.length) : 0;

  // Per-event counts in last 24h
  const { data: last24 } = await supabase.from("lm_events").select("event_type").gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  const events24h: Record<string, number> = {};
  for (const r of last24 || []) { const k = r.event_type || "unknown"; events24h[k] = (events24h[k] || 0) + 1; }

  return new Response(JSON.stringify({
    generated_at: new Date().toISOString(),
    totals: {
      lm_count: rows.length,
      views_30d: totalViews30d,
      captures_30d: totalCaptures30d,
      completions_all: totalCompletions,
      avg_capture_rate_pct: Math.round(avgCapture * 10) / 10,
      events_last_24h: events24h,
    },
    per_lm: rows,
    recent_activity: activity.data || [],
    assessment_weakest_rollup: weakest.data || [],
    gate_keyword_performance: gateKw.data || [],
  }), { headers: CORS });
});
