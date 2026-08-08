const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://bjbvqvzbzczjbatgmccb.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=60, s-maxage=60",
  };
}

async function fetchTable(query: string): Promise<unknown[]> {
  const r = await fetch(SUPABASE_URL + "/rest/v1/lm_idea_candidates?" + query, {
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY },
  });
  if (!r.ok) throw new Error("postgrest:" + r.status);
  return await r.json();
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors() });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: cors(),
    });
  }
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [pending, promoted, archived, weekScored] = await Promise.all([
      // limit raised 50->200 + stable order: unscored (new/manual) ideas surface first,
      // then by recency, then scored. Prevents silent truncation as the pool grows past 50.
      fetchTable("status=in.(reviewing,scored)&order=composite_score.desc.nullsfirst,ingested_at.desc&limit=200&select=*"),
      fetchTable(`status=eq.promoted&promoted_clickup_task_id=not.is.null&ingested_at=gte.${fourteenDaysAgo}&order=ingested_at.desc&limit=20&select=id,raw_topic,promoted_clickup_task_id,composite_score,format_recommendation,ingested_at`),
      fetchTable(`status=eq.archived&ingested_at=gte.${fourteenDaysAgo}&order=ingested_at.desc&limit=50&select=id,raw_topic,archived_reason,composite_score,source,ingested_at`),
      fetchTable(`scored_at=gte.${sevenDaysAgo}&select=source,composite_score`),
    ]);
    const scoredArr = weekScored as Array<{ source: string; composite_score: number | null }>;
    const sourceDist: Record<string, number> = {};
    let sum = 0; let n = 0;
    for (const r of scoredArr) {
      sourceDist[r.source] = (sourceDist[r.source] || 0) + 1;
      if (typeof r.composite_score === "number" && r.composite_score >= 0) { sum += r.composite_score; n++; }
    }
    const metrics = {
      week_scored_count: scoredArr.length,
      week_avg_composite: n > 0 ? +(sum / n).toFixed(2) : null,
      week_source_distribution: sourceDist,
      last_refresh: new Date().toISOString(),
    };
    return new Response(JSON.stringify({
      pending, recent_promoted: promoted, recent_archived: archived, metrics,
    }), { status: 200, headers: cors() });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && (e as Error).message || e) }), {
      status: 502, headers: cors(),
    });
  }
}

if (import.meta.main) Deno.serve(handler);
