const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://bjbvqvzbzczjbatgmccb.supabase.co";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const RAILWAY_URL = "https://claude-code-railway-production.up.railway.app/v1/messages";
const RAILWAY_API_KEY = "a2f2a2629dda15e70358374e1b35dbe8bc0ed75355cfd49a34aec5840a2870b5";

function cors(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Content-Type": "application/json",
  };
}

async function pg(path: string, init: RequestInit): Promise<Response> {
  return await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init,
    headers: {
      ...(init.headers || {}),
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: cors() });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: cors() });
  }

  let body: { candidate_id?: string; custom?: string } = {};
  try { body = await req.json(); } catch (_) {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400, headers: cors() });
  }

  if (!body.candidate_id) {
    return new Response(JSON.stringify({ error: "missing_candidate_id" }), { status: 400, headers: cors() });
  }

  try {
    // Branch 1: custom angle provided — just patch it
    if (typeof body.custom === "string" && body.custom.trim().length > 0) {
      const patchRes = await pg("lm_idea_candidates?id=eq." + body.candidate_id, {
        method: "PATCH",
        body: JSON.stringify({ post_angle: body.custom.trim() }),
      });
      if (!patchRes.ok) throw new Error("patch_custom:" + patchRes.status);
      return new Response(JSON.stringify({ ok: true, custom: true }), { status: 200, headers: cors() });
    }

    // Branch 2: generate 3 angles via Claude
    // a. Fetch candidate
    const cRes = await pg(
      "lm_idea_candidates?id=eq." + body.candidate_id + "&select=raw_topic,normalized_topic,evidence",
      { method: "GET" }
    );
    if (!cRes.ok) throw new Error("fetch_candidate:" + cRes.status);
    const arr = await cRes.json();
    if (!Array.isArray(arr) || arr.length === 0) {
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: cors() });
    }
    const cand = arr[0];

    // b. Fetch prompt
    const pRes = await pg("content_prompts?slug=eq.idea-angle-options&select=body", { method: "GET" });
    if (!pRes.ok) throw new Error("fetch_prompt:" + pRes.status);
    const pArr = await pRes.json();
    if (!Array.isArray(pArr) || pArr.length === 0) {
      return new Response(JSON.stringify({ error: "prompt_not_found", slug: "idea-angle-options" }), { status: 404, headers: cors() });
    }
    const promptBody: string = pArr[0].body || "";

    // c. Build prompt
    const topic = (cand.normalized_topic || cand.raw_topic || "").toString();
    const evidence = Array.isArray(cand.evidence) ? cand.evidence.slice(0, 3) : (cand.evidence || "");
    const prompt = promptBody
      .replace("{TOPIC}", topic)
      .replace("{EVIDENCE}", JSON.stringify(evidence));

    // d. Call Railway Claude proxy
    const claudeRes = await fetch(RAILWAY_URL, {
      method: "POST",
      headers: {
        "X-API-Key": RAILWAY_API_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1200,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      throw new Error("claude_proxy:" + claudeRes.status + " " + errText.slice(0, 200));
    }
    const claudeJson = await claudeRes.json();
    const text: string = claudeJson?.content?.[0]?.text || "";

    // e. Parse strict JSON
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      return new Response(JSON.stringify({ ok: false, error: "no_json_in_response", raw: text.slice(0, 300) }), { status: 502, headers: cors() });
    }
    let parsed: { angles?: Array<{ key: string; label: string; angle: string }> };
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: "json_parse_failed", raw: text.slice(0, 300) }), { status: 502, headers: cors() });
    }

    const angles = parsed.angles;
    if (!Array.isArray(angles) || angles.length !== 3) {
      return new Response(JSON.stringify({ ok: false, error: "need 3", got: Array.isArray(angles) ? angles.length : -1, raw: text.slice(0, 300) }), { status: 502, headers: cors() });
    }

    // f. PATCH angle_options onto the candidate
    const patchRes = await pg("lm_idea_candidates?id=eq." + body.candidate_id, {
      method: "PATCH",
      body: JSON.stringify({ angle_options: angles }),
    });
    if (!patchRes.ok) throw new Error("patch_angles:" + patchRes.status);

    // g. Return
    return new Response(JSON.stringify({ ok: true, angle_options: angles }), { status: 200, headers: cors() });

  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e && (e as Error).message || e) }),
      { status: 502, headers: cors() }
    );
  }
}

if (import.meta.main) Deno.serve(handler);
