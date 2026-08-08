# Fix pass — 4 findings from the whole-branch review

Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). Fix all four below. Each is independent. Keep the same code style. After all fixes: `node --check` every touched JS file, redeploy the edge fn (Fix 3 only), commit ONCE.

## FIX 1 (Critical) — footer overrides invisible on live pages
`_engine/shared.js`: `rebrandFooter()` reads `window.__lm_data` (for `data.footer` overrides), but it's called once from `bootstrapShared()` synchronously, BEFORE any engine has set `window.__lm_data` (engines set it inside an async `fetch("./data.json").then(...)`). So `data.footer` overrides never render for real visitors, and in edit mode the footer field shows stale default text (WYSIWYG mismatch).

Fix: keep the initial `rebrandFooter()` call (so the footer renders defaults immediately), then re-invoke it once `window.__lm_data` becomes available. `rebrandFooter()` is already idempotent (it overwrites `.im-footer-cta`/`.im-footer-meta` innerHTML each call). Add, right after the existing `rebrandFooter();` call in `bootstrapShared()` (find it — grep `rebrandFooter()` call site), a short poll:
```js
var _fTries = 0;
var _fPoll = setInterval(function () {
  _fTries++;
  if (window.__lm_data) { rebrandFooter(); clearInterval(_fPoll); }
  else if (_fTries > 60) clearInterval(_fPoll); // ~3s cap
}, 50);
```
This re-runs `rebrandFooter()` exactly once more (when data lands), re-registering the footer fields against the fresh nodes and rendering any `data.footer` override. It runs only at startup (before edit mode activates), so it can't clobber in-progress edits. Verify: `rebrandFooter()` reading `window.__lm_data.footer` now sees real data on the second call. Do NOT change the byte-identical no-override fallback logic.

## FIX 2 (Critical) — calculator recommendation click destroys the tag + corrupts data
`_engine/calculator.js:412-424`. Currently:
```js
var recDiv = make("div", { class: "lmc-rec" });                       // 412
var tagEl = make("strong", ...);                                       // ~414
window.LM.editMode.registerField(tagEl, "recommendations["+origIdx+"].tag");   // 416
recDiv.appendChild(tagEl);                                             // 418
recDiv.appendChild(textNode /* m.text */);                            // 420
window.LM.editMode.registerField(recDiv, "recommendations["+origIdx+"].text"); // 422  <-- recDiv is tagEl's PARENT
```
`recDiv` (registered `.text`) is the ANCESTOR of `tagEl` (registered `.tag`). Clicking the body text fires `recDiv`'s inline-edit handler → `enterEditField(recDiv)` does `el.innerHTML = ""`, DESTROYING `tagEl`, and commits `recDiv.textContent` (tag+body concatenated) into `.text`. Data corruption + lost tag on save.

Fix: wrap the body text in its OWN leaf element and register THAT, not `recDiv`. Change line 420's raw text node to a span, and move the `.text` registration onto the span:
```js
var textSpan = make("span", { class: "lmc-rec-text" });
textSpan.textContent = m.text || "";
recDiv.appendChild(textSpan);
if (window.LM && window.LM.editMode) window.LM.editMode.registerField(textSpan, "recommendations[" + origIdx + "].text");
```
Do NOT register `recDiv` itself anymore (remove the line-422 `registerField(recDiv, ...)`). This mirrors `checklist.js`'s pattern (independent leaf spans under an unregistered container). VERIFY the rendered output is unchanged for a non-edit page: a `<span class="lmc-rec-text">` wrapping the text instead of a bare text node is a DOM change — confirm it doesn't alter visible layout (an inline span with the same text renders identically to a bare text node in this flex/block context; if `.lmc-rec` has CSS that styled the bare text node specifically, check `.lmc-rec` in calculator's CSS/shared.css). If a wrapping span WOULD change layout, instead use a bare-textNode-safe approach: keep the text node but register `recDiv` with a guard that only enters edit on direct text clicks — NO, prefer the span; just verify the CSS. Report which you did + the CSS check.

## FIX 3 (Important) — token-gate the rewrite endpoint
`lm-copy-rewrite` is `--no-verify-jwt` and validates NO edit token — anyone can call it and burn Railway/Claude usage (the IP limit is spoofable + fails open). The save path sends `token: state.token`; the rewrite call doesn't.

Two edits:
1. `_engine/edit-mode.js` — in the AI rewrite `submit()` (the `fetch(REWRITE_URL, ...)` call), add `token: state.token` and `slug: state.slug` to the JSON body: `body: JSON.stringify({ text: original, instruction: instruction, context: context, token: state.token, slug: state.slug })`.
2. `supabase/functions/lm-copy-rewrite/index.ts` — after parsing the body and BEFORE the LLM call (ideally before the content_prompts read too), validate the token by calling the canonical checker server-to-server:
```ts
// Gate: require a valid edit token (same validator the client uses to enter edit mode).
const token = typeof body.token === "string" ? body.token : "";
if (!token) return jsonResponse({ error: "unauthorized" }, 401);
try {
  const chk = await fetch(SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/lm-edit-token-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  });
  const cj = await chk.json().catch(() => ({}));
  if (!cj || cj.ok !== true) return jsonResponse({ error: "unauthorized" }, 401);
} catch (_) {
  return jsonResponse({ error: "auth_unavailable" }, 503);
}
```
(Use the same base URL the function already has for SUPABASE_URL; `lm-edit-token-check` lives at `${SUPABASE_URL}/functions/v1/lm-edit-token-check`. Confirm SUPABASE_URL is the project URL `https://bjbvqvzbzczjbatgmccb.supabase.co` — if the function currently derives the functions base differently, match that.) Keep the existing IP rate-limit as a secondary layer. This makes token validation FAIL CLOSED (401/503), unlike the IP limit.
Redeploy: `supabase functions deploy lm-copy-rewrite --no-verify-jwt --project-ref bjbvqvzbzczjbatgmccb`. Then live-curl:
- `-d '{"text":"x","instruction":"punchier"}'` (no token) → expect **401**.
- `-d '{"text":"x","instruction":"punchier","token":"bogus"}'` → expect **401**.
(You won't have a real token to test the 200 path — that's fine; confirm the two 401s. If lm-edit-token-check returns something other than `{ok:true}` shape, inspect its live response with a curl of `.../lm-edit-token-check -d '{"token":"bogus"}'` and adapt the check field name.)

## FIX 4 (Important) — hero_badge registration consistency
`_engine/swipe.js:40` and `_engine/template.js:36` gate badge registration on `data.brand.hero_badge` existing:
`if (heroBadge && data.brand && data.brand.hero_badge) L.editMode.registerField(heroBadge, "brand.hero_badge");`
The other 7 engines register it unconditionally (the path `brand.hero_badge` is writable even from the fallback string). Make these two match — register whenever the element exists:
`if (heroBadge) L.editMode.registerField(heroBadge, "brand.hero_badge");`
Fix/remove any now-inaccurate nearby comment claiming there's no json path to write back to.

## Verify + commit
1. `node --check` on: shared.js, calculator.js, edit-mode.js, swipe.js, template.js, supabase/functions/lm-copy-rewrite/index.ts (deno check if available).
2. Fix 3 redeploy + the two 401 curls (report results).
3. Fix 2 CSS-layout check (report what you found).
4. ONE commit: `git add -A && git commit -m "fix(editor): footer data-timing, calculator rec corruption, rewrite token-gate, badge coverage consistency"`.
5. Regenerate minified bundles for the touched engines: `bash _engine/minify.sh shared calculator edit-mode swipe template` and `git add _engine/*.min.* && git commit -m "chore(editor): re-minify after fix pass"` (prod loads non-min, but keep them in sync).

## Report
Write to `.superpowers/sdd/task-FIX-report.md`. Return: status, commit hashes, node --check summary, the two 401 curl results, the calculator CSS-layout finding, concerns.
