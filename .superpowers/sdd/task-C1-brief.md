# Task C1 — `lm-copy-rewrite` Supabase edge function

Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). Create a new Deno edge function that rewrites a piece of LM page copy in Ivan's voice, called by the browser edit-mode UI (Task C2).

## House pattern — MIRROR the existing resources edge fns (NOT personal-site)
Read `supabase/functions/lm-walkthrough-proxy/index.ts` first — copy its conventions exactly:
- `cors()` returns `{ "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Methods":"POST, OPTIONS", "Access-Control-Allow-Headers":"Content-Type, Authorization, apikey" }`.
- `jsonResponse(body, status)` helper.
- Handle `OPTIONS` preflight → 204/200 with cors headers.
- LLM calls go through the **Railway Claude proxy**, NEVER the Anthropic API directly (house rule + Ivan's standing preference): `fetch(RAILWAY_PROXY_URL, { method:"POST", headers:{ "Content-Type":"application/json", "x-api-key": RAILWAY_PROXY_API_KEY, "anthropic-version":"2023-06-01" }, body: JSON.stringify({ model, max_tokens, system, messages }) })`. The proxy is NON-streaming: read the result from `j.content?.[0]?.text`.
- Supabase service-role client: `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` from `https://esm.sh/@supabase/supabase-js@2.45.0`.
- Env vars already set as secrets for this project's functions: `RAILWAY_PROXY_URL`, `RAILWAY_PROXY_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Contract
`POST { text: string, instruction: string, context?: string }` → `200 { rewritten: string }`.
- Validate: both `text` and `instruction` required and non-empty; `text` length cap 4000 chars, `instruction` cap 500, `context` cap 2000 → else `400 { error }`.
- On any proxy/LLM failure → `502 { error: "rewrite_failed" }` (don't 500-leak).

## Voice — load from content_prompts (NEVER hardcode voice rules)
Using the service-role client, read the voice rows from `content_prompts` (same Supabase project bjbvqvzbzczjbatgmccb):
```
const { data } = await sb.from("content_prompts").select("slug, content").in("slug", ["forbidden-language", "author-voice"]);
```
Build the system prompt as: the `author-voice` content + the `forbidden-language` content + a short task instruction:
> "You rewrite one piece of copy for a lead-magnet web page. Rewrite the USER's `text` according to their `instruction`, staying strictly in the voice and forbidden-language rules above. Preserve meaning and any factual specifics. Return ONLY the rewritten copy as plain text — no preamble, no quotes, no markdown, no explanation. If the text contains inline HTML tags (e.g. <em>), preserve them."
- If a row is missing, degrade gracefully (use whatever rows exist; if BOTH missing, still proceed with just the task instruction — don't hard-fail, but note it). Column name might be `content` or `body` or `prompt` — inspect one row's shape first (`select('*').eq('slug','author-voice').maybeSingle()`) and use the right column.

## LLM call
- `model`: try `"claude-sonnet-5"` for copy quality. Put the model in a `const MODEL`. If the live curl test returns an error indicating the proxy rejects that model, fall back to `"claude-haiku-4-5"` (what lm-walkthrough-proxy uses) and note it in the report.
- `max_tokens`: ~1500. `system`: the voice system prompt. `messages`: `[{ role:"user", content: "INSTRUCTION: "+instruction+"\n\nTEXT:\n"+text + (context? "\n\nPAGE CONTEXT (for tone only, do not include): "+context : "") }]`.
- Extract `j.content?.[0]?.text`, trim, and return `{ rewritten }`. If empty → 502.

## Optional: light rate limit
If it's quick and low-risk, add a per-IP hourly cap (e.g. 40/hr) using the same `bump_edge_rate` RPC the img-* fns added to this project (`sb.rpc("bump_edge_rate", { p_bucket, p_ip, p_fn:"lm-copy-rewrite", p_limit:40 })` → if it returns false, 429). If the RPC doesn't exist / errors, SKIP the limit (don't block on it) and note it. Do NOT add a cleanup DELETE (the outbound-action guard blocks it).

## Header comment
Top of file: `// DEPLOY WITH: supabase functions deploy lm-copy-rewrite --no-verify-jwt --project-ref bjbvqvzbzczjbatgmccb` and one line explaining --no-verify-jwt is required (browser-called; platform JWT gate 401s → "Failed to send a request" without CORS).

## Verify / deploy
1. If `deno` is on PATH: `deno check supabase/functions/lm-copy-rewrite/index.ts`.
2. Deploy: `supabase functions deploy lm-copy-rewrite --no-verify-jwt --project-ref bjbvqvzbzczjbatgmccb`. 
3. Live curl test (only if deploy succeeded):
   - No-auth bad body: `curl -sS -X POST https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-copy-rewrite -H 'Content-Type: application/json' -d '{}'` → expect **400** (NOT 401 — 401 means --no-verify-jwt didn't take; redeploy).
   - Real: `-d '{"text":"We help agencies scale.","instruction":"make it punchier"}'` → expect **200** with a `rewritten` string that differs from input and contains no em dashes.
4. If deploy fails due to CLI auth (not logged in / no access token), do NOT block: report status BLOCKED_DEPLOY with the written+`deno check`ed code committed, and note "controller must run the deploy + curl". The CODE is the deliverable; I (controller) will deploy.

## Commit
`git add supabase/functions/lm-copy-rewrite && git commit -m "feat(editor): lm-copy-rewrite edge fn (voice from content_prompts, Railway proxy)"`

## Report
Write to `.superpowers/sdd/task-C1-report.md`. Return: status (DONE / BLOCKED_DEPLOY / DONE_WITH_CONCERNS), commit hash, the content_prompts column name you found, the model used (+ fallback note), the curl results (or why skipped), concerns.
