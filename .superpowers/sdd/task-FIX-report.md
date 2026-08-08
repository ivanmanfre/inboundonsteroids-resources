# FIX pass report

Status: **all 4 findings fixed, verified, deployed, committed.**

## Commits
- `b999984` — fix(editor): footer data-timing, calculator rec corruption, rewrite token-gate, badge coverage consistency
- `22a30a3` — chore(editor): re-minify after fix pass

(`.superpowers/sdd/progress.md` had pre-existing uncommitted edits from earlier phase work, unrelated to this pass — left untouched/unstaged, not part of either commit.)

## Fix 1 — footer data-timing (Critical)
`_engine/shared.js`, `bootstrapShared()`: kept the existing synchronous `rebrandFooter()` call (renders defaults immediately) and added the exact poll from the brief right after it — checks `window.__lm_data` every 50ms (60 tries / ~3s cap) and re-invokes `rebrandFooter()` once when data lands, then clears the interval. No changes to the no-override fallback path.

## Fix 2 — calculator rec corruption (Critical)
`_engine/calculator.js` (~line 419): replaced the bare text node with a `<span class="lmc-rec-text">`, set its `textContent`, and moved the `recommendations[i].text` field registration onto that span. Removed the old `registerField(recDiv, ...)` call entirely — `recDiv` is no longer registered, only its two now-independent leaf children (`tagEl` for `.tag`, `textSpan` for `.text`) are, matching `checklist.js`'s pattern.

**CSS-layout check**: grepped `.lmc-rec` across `calculator.css` and `shared.css`. Found rules for `.lmc-rec` (container box: background/padding/font/line-height) and `.lmc-rec strong` (the tag — `display:block`, uppercase, color). No rule targets a bare text node inside `.lmc-rec`, and nothing currently references `.lmc-rec-text`. A `span` is `display:inline` by default, so wrapping the text in one renders identically to the bare text node it replaces — confirmed no layout change.

## Fix 3 — token-gate lm-copy-rewrite (Important)
Client (`_engine/edit-mode.js`, `submit()`): added `token: state.token, slug: state.slug` to the rewrite fetch body (both fields already exist on `state`, set in `mount()`).

Server (`supabase/functions/lm-copy-rewrite/index.ts`): added the exact gate from the brief, placed after input validation and before the IP rate-limit / Supabase client creation / LLM call. Requires a non-empty `token`, calls `lm-edit-token-check` server-to-server, and 401s unless the response is exactly `{ ok: true, ... }`; a network/fetch failure against the checker 503s. Sanity-checked the checker's live shape first: `curl .../lm-edit-token-check -d '{"token":"bogus"}'` → `{"ok":false,"expires_at":null}` (200) — confirms the `cj.ok !== true` check is correct. IP rate-limit kept as secondary layer, unchanged.

Redeployed: `supabase functions deploy lm-copy-rewrite --no-verify-jwt --project-ref bjbvqvzbzczjbatgmccb` → succeeded (Docker warning only, no functional effect on this deploy path).

**Live curl results (post-deploy):**
- No token — `{"text":"x","instruction":"punchier"}` → **`401`**, body `{"error":"unauthorized"}`
- Bogus token — `{"text":"x","instruction":"punchier","token":"bogus"}` → **`401`**, body `{"error":"unauthorized"}`

Both match the expected fail-closed behavior. (Did not test the 200 path — no real edit token available in this session, as anticipated by the brief.)

## Fix 4 — hero_badge registration consistency (Important)
`_engine/swipe.js:40` and `_engine/template.js:36`: changed the gate from `if (heroBadge && data.brand && data.brand.hero_badge)` to `if (heroBadge)`, matching the other 7 engines. Replaced the now-inaccurate "no json path to write back to" comments with a note that `brand.hero_badge` is writable even when only the fallback string ("Swipe File" / "Template") is showing.

## node --check / deno check summary
All clean:
- `_engine/shared.js` — OK
- `_engine/calculator.js` — OK
- `_engine/edit-mode.js` — OK
- `_engine/swipe.js` — OK
- `_engine/template.js` — OK
- `supabase/functions/lm-copy-rewrite/index.ts` — `deno check` → `Check supabase/functions/lm-copy-rewrite/index.ts` (no errors)

## Minify
Ran `bash _engine/minify.sh shared calculator edit-mode swipe template` — all 5 succeeded, sources untouched (script's own guard confirms this), `.min.js`/`.min.css` regenerated. Re-ran `node --check` on the 5 sources afterward as a belt-and-suspenders check — still clean.

## Concerns / notes for whoever pushes to main
- Fix 3's server-side gate depends on `lm-edit-token-check` being reachable at `${SUPABASE_URL}/functions/v1/lm-edit-token-check` at request time; if that function is ever renamed or its response shape changes from `{ok:true}`, this gate silently starts 401/503-ing all legitimate rewrites (fail-closed by design, but worth knowing it's a hard dependency now).
- Did not verify the 200 (authorized) path end-to-end for Fix 3 — only confirmed both 401 cases live, per the brief's own caveat (no real token available in this session).
- `progress.md` has unrelated pre-existing uncommitted changes from earlier phase work in this worktree; left as-is, not part of either commit in this pass.
