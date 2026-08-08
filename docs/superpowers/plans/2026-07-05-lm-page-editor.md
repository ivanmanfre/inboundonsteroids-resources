# LM Resource-Page Editor Upgrade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Extend the existing `?edit=<token>` inline editor so an operator can edit EVERY text block/object on a lead-magnet resource page (including the footer/nav and the 3 currently-unwired formats), plus select any block and have AI rewrite it in Ivan's voice — all saved through the existing n8n commit→Pages pipeline.

**Architecture:** The engine already renders each page from a per-slug `data.json` via a shared JS template and has a working click-to-edit module (`_engine/edit-mode.js`) that swaps nodes to inline inputs and POSTs the whole `data` object to the `edit-lm` n8n webhook (which commits to GitHub → Pages redeploys ~30s). This plan (A) adds a `makeField()` helper and completes per-engine field-registration coverage, (B) makes footer+nav editable by rendering them from `data.footer`/`data.nav` inside `rebrandFooter()`, (C) adds a `lm-copy-rewrite` Supabase edge function + a "✨ Rewrite" proposal UX in edit-mode.js, (D) makes save optimistic. No new save mechanism; no per-slug file migration.

**Tech stack:** vanilla JS (IIFE, no framework, no bundler), GitHub Pages, Supabase edge functions (Deno), Claude via the existing Anthropic key. Verification = Playwright visual-diff (`scripts/visual-diff.js`) + manual edit-mode DOM smoke (no unit-test framework in this repo).

**Source of truth for design:** memory `lm-resource-page-visual-editor-2026-07-05.md` (scope = edit-everything + AI rewrite, approved by Ivan 2026-07-05).

## Global Constraints

- **Git hazard:** `main` receives automated "Publish …" commits from the pipeline. WORK IN THE ISOLATED WORKTREE `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`), push with a refspec `git push origin feat/page-editor:main`, and `git fetch origin main && git rebase origin/main` before every push. Never commit on the primary checkout.
- **Deploy = commit to `main`** (`.github/workflows/pages.yml`, `on: push: branches:[main]`, no build step — uploads repo root). Any `_engine/*.js` / `index.html` / `data.json` change goes live as-is on merge.
- **Minified builds:** production slug pages load NON-minified `/_engine/shared.js` + `/_engine/<format>.js` (verified in a real slug's index.html). Do NOT hand-edit `.min.js`. After editing any `_engine/*.js`, run `bash _engine/minify.sh` to regenerate the `.min.*` siblings so they don't drift, then verify no slug references the `.min` path (grep). If none reference `.min`, regeneration is belt-and-suspenders, not load-bearing.
- **`make()` is duplicated locally in every engine** (byte-identical copy, not the shared `window.LM.make`). Auto-tagging via one wrapper is NOT possible; coverage is completed per-engine at `registerField` call sites.
- **The static footer/nav HTML in each slug `index.html` is DEAD** — `rebrandFooter()` (`shared.js:706-742`) overwrites `.im-footer` innerHTML at load. Footer work happens in `rebrandFooter()`, not in slug files.
- **Edit-mode + engines register via `window.LM.editMode.registerField(el, path, opts)` / `registerArray(el, arrayPath, opts)`** (buffered in `shared.js:416-433`, attached by `edit-mode.js` `attachField`/`attachArray`). Field commit writes `setByPath(state.data, path, val)` and `markDirty()`. Save PUTs the ENTIRE `state.data` as `{token,slug,format,mode,data}` to `EDIT_WEBHOOK` (`edit-mode.js:348`).
- **New edge function MUST deploy with `--no-verify-jwt`** (browser-called; the platform JWT gate 401s without CORS → "Failed to send a request"). Same lesson as img-* and content-lint fns.
- **Voice for AI rewrite:** pull `forbidden-language` + `author-voice` rows from Supabase `content_prompts` (project bjbvqvzbzczjbatgmccb) as the system prompt. Never hardcode voice rules.
- **No-regression rule:** every page-visible change must pass a Playwright visual-diff against the current live page (footer/nav copy and layout render identically for a page with NO `data.footer` override). Use `scripts/visual-diff.js` `captureToBuffer`+`diffPngs`; footer changes need a TIGHT threshold (byte-ish identical), not the migration script's 50% catastrophic gate.

## File structure

**Modified — engine:**
- `_engine/shared.js` — add `makeField()` to `window.LM`; refactor `rebrandFooter()` to render footer + nav from `data.footer`/`data.nav` (default fallback = current hardcoded copy) with `registerField` calls; ensure it runs after `window.__lm_data` is set.
- `_engine/edit-mode.js` — add the "✨ Rewrite" affordance (per-field + section-level), the rewrite proposal UI (before/after, Keep / Try again), and optimistic save (replace `location.reload()` with in-place re-render). Add a `rerender()` hook.
- `_engine/checklist.js`, `calculator.js`, `assessment.js`, `assessment-v2.js`, `architecture.js`, `ai-walkthrough.js`, `n8n-workflow.js`, `stack-picker.js`, `guide.js` — complete field/array registration coverage (add missing `registerField`/`registerArray`; migrate pairs to `makeField`).
- `_engine/swipe.js`, `landing.js`, `template.js` — add registration from scratch (currently ZERO coverage).

**New — edge function:**
- `supabase/functions/lm-copy-rewrite/index.ts` (lives in the personal-site repo's supabase/functions OR resources repo — decide in Task 8; deploy target is the same Supabase project bjbvqvzbzczjbatgmccb).

**New — verification:**
- `scripts/footer-diff.mjs` — tight visual-diff of a sample page (live vs local worktree served) asserting footer/nav render identically pre/post refactor.

## Phase A — coverage foundation

### Task A1: `makeField()` helper + re-render hook

**Files:** Modify `_engine/shared.js`; Modify `_engine/edit-mode.js`.

**Interfaces:**
- Produces (shared.js, on `window.LM`): `makeField(tag, attrs, text, path, opts)` — creates an element via the local `make`, sets escaped text (or innerHTML when `opts.html`), calls `editModeRegisterField(el, path, opts)`, returns el. `makeFieldArray(containerEl, arrayPath, opts)` — thin wrapper over `editModeRegisterArray`.
- Produces (edit-mode.js): `window.__LM_EDIT_MODE_API.rerender()` — re-runs the active engine's `render(state.data, root)` so newly-added array items / rewrites show without a full reload; re-attaches buffered fields.

- [ ] **Step 1: Add `makeField`/`makeFieldArray` to shared.js** near the other `window.LM` methods (export at `shared.js:749-777`). Exact code:
```js
function makeField(tag, attrs, text, path, opts) {
  var e = make(tag, attrs, (opts && opts.html) ? text : undefined);
  if (!(opts && opts.html) && text !== undefined) e.textContent = text;
  editModeRegisterField(e, path, opts || {});
  return e;
}
function makeFieldArray(containerEl, arrayPath, opts) {
  editModeRegisterArray(containerEl, arrayPath, opts || {});
  return containerEl;
}
```
Add `makeField: makeField, makeFieldArray: makeFieldArray,` to the `editMode` sub-object AND top-level `window.LM` (both, so engines can call `LM.makeField` or `LM.editMode.makeField`).

- [ ] **Step 2: Add `rerender()` to edit-mode.js.** In `mount()`, capture the engine render fn: engines expose nothing today, so add — in each engine's `init()` after `render(data, root)` succeeds, set `window.__lm_rerender = function(){ render(window.__lm_data, root); };`. Then in edit-mode.js:
```js
function rerender() {
  if (typeof window.__lm_rerender === "function") {
    window.__lm_rerender();
    // re-attach buffered fields (shared.js re-buffers on each render)
    if (window.LM && window.LM.editMode) flushBufferedRegistrations();
  }
}
```
Add `rerender: rerender` to `window.__LM_EDIT_MODE_API` (`edit-mode.js:544`). (`flushBufferedRegistrations` = iterate `editModeState.fields`/`.arrays` and call attach; expose a flush from shared.js if not already — see shared.js `loadEditModeAssets` mount path.)

- [ ] **Step 3: Verify** load the checklist demo (`_engine/demo/checklist/index.html`) via `python3 -m http.server` in the worktree + `?edit=<valid token>`; confirm existing fields still edit and `window.LM.makeField` is defined (DevTools console). No visual-diff needed (additive API).
- [ ] **Step 4: Commit** `git add _engine/shared.js _engine/edit-mode.js && git commit -m "feat(editor): makeField helper + rerender hook"`.

### Task A2–A6: per-engine coverage completion (one task per engine group)

For EACH engine, the deliverable is: every text node that maps to a `data.json` path is registered (via `makeField` or an added `registerField`), and every list is a `registerArray`. Use the checklist pattern (`checklist.js:171-251`) as the reference. Known gaps to close (from the map): checklist `item.impact`; calculator `formula` (register as a locked/raw-only field — formulas are logic, mark `opts.locked` so they only change via Raw JSON); assessment already near-complete (audit only); the CTA blocks several formats render but don't register.

- [ ] **A2 — checklist + calculator** (add `item.impact`, calculator input/output labels already done → add `recommendations`, mark `formula` locked). Visual-diff each demo page pre/post = identical render; edit-mode smoke: every visible text field enters an input on click.
- [ ] **A3 — assessment + assessment-v2** (audit assessment's 27 registrations for gaps; bring assessment-v2 from 4 up to full coverage).
- [ ] **A4 — architecture + ai-walkthrough + n8n-workflow** (bring each to full coverage; these have rich nested data).
- [ ] **A5 — stack-picker + guide** (guide already uses contenteditable rich blocks; complete remaining fields).
- [ ] **A6 — swipe + landing + template** (ZERO coverage today — add registration from scratch for every rendered text/array node).

Each A-task's steps: (1) read the engine's `render()`, list every `make(...)` that emits data-derived text + every list container; (2) convert each to `makeField`/`makeFieldArray` (or add `registerField` after) with the correct `data.json` path; (3) run the format's demo page under a local server with `?edit=<token>` and confirm each field is clickable-editable and a save round-trips (or dry-run the payload); (4) visual-diff the demo page (no data override) vs current render → identical; (5) commit per engine.

## Phase B — footer + nav editable

### Task B1: render footer + nav from data, registered

**Files:** Modify `_engine/shared.js` (`rebrandFooter()` at 706-742; add `renderEditableNav()`).

**Interfaces:** `data.footer = { heading, body, cta_label, cta_url, meta_left, meta_right }` and `data.nav = { logo_name, cta_label, cta_url }`, ALL optional — when absent, fall back to today's hardcoded strings so existing pages are byte-identical.

- [ ] **Step 1: Write `footer-diff.mjs`** (verification harness): serve the worktree via `python3 -m http.server`, capture a real slug page footer region from BOTH the live site and local, `diffPngs`, assert `pctDiff < 0.5` for a page with no `data.footer`. Run it on the UNMODIFIED worktree first to record the baseline passes.
- [ ] **Step 2: Refactor `rebrandFooter()`** to read `window.__lm_data.footer` (fallback to current hardcoded copy), build the footer with `makeField` calls (`footer.heading` → the `<h2>`, `footer.body` → `<p>`, `footer.cta_label`/`footer.cta_url` → the `<a>`), and inject into `.im-footer`. Add `renderEditableNav()` that registers `.im-nav` logo name + CTA against `data.nav`. Call both after `window.__lm_data` is set (hook into the engine `render()` completion or a `LM.afterData` callback).
- [ ] **Step 3: Verify** `footer-diff.mjs` still passes (<0.5% drift) on a no-override page; then set a test `data.footer.heading` locally and confirm it renders + is click-editable + saves into `data.footer`.
- [ ] **Step 4: Commit.**

## Phase C — AI rewrite

### Task C1: `lm-copy-rewrite` edge function

**Files:** Create `supabase/functions/lm-copy-rewrite/index.ts`.

**Interface:** POST `{ text, instruction, context? }` → `{ rewritten }`. Reads Anthropic key from env; loads `content_prompts` rows `forbidden-language` + `author-voice` (via service-role Supabase client) as system prompt; asks Claude to rewrite `text` per `instruction` staying in voice + returning ONLY the rewritten text. CORS + `Deno.serve` + `json()` helper mirroring the img-* fns. Header comment: DEPLOY WITH `--no-verify-jwt`.

- [ ] Steps: write the fn (mirror `img-edit` CORS/handler boilerplate; Anthropic fetch mirrors `assessment-intake-chat/index.ts:830`); deploy `supabase functions deploy lm-copy-rewrite --no-verify-jwt --project-ref bjbvqvzbzczjbatgmccb`; set/confirm `ANTHROPIC_API_KEY` secret; live-curl test (no-auth POST returns 400 not 401 = gate off; a real `{text,instruction}` returns a rewrite). Commit.

### Task C2: "✨ Rewrite" affordance + proposal UX in edit-mode.js

**Files:** Modify `_engine/edit-mode.js`, `_engine/edit-mode.css`.

**Interface:** On any registered field (and a section-level container), a small "✨" button appears on hover. Click → prompt input ("shorter / punchier / in my voice…") → POST to `lm-copy-rewrite` → show a PROPOSAL panel (before/after) with **Keep** / **Try again** (reuse the image-editor lesson: never overwrite silently). Keep → `setByPath(state.data, path, rewritten)` + `markDirty()` + `rerender()`.

- [ ] Steps: add the ✨ affordance in `attachField` (and a section variant); build the proposal panel (DOM, `edit-mode.css`); wire the fetch to `https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-copy-rewrite`; Keep/Try-again handlers; smoke-test on the checklist demo. Commit.

## Phase D — optimistic save

### Task D1: replace reload with in-place re-render

**Files:** Modify `_engine/edit-mode.js` (`saveTo` success path at 371-375).

- [ ] Steps: drop `setTimeout(location.reload, 3000)`; on save success keep the already-applied `state.data` (edits are already in the DOM), just clear dirty + toast "live in ~30s". Add a subtle "syncing…" indicator that clears after ~30s. Verify an edit stays visible without a flash-reload after Publish. Commit.

## Phase E — final

- [ ] **E1: full-format smoke** — for all 12 formats, load the demo page with `?edit=<token>`, confirm every visible text block is editable, footer/nav editable, ✨ rewrite works, save round-trips. Record which formats pass.
- [ ] **E2: minify** — `bash _engine/minify.sh`; grep all slug `index.html` for `.min.js` references (expect none); commit regenerated `.min.*` if any page uses them.
- [ ] **E3: whole-branch review** (superpowers:requesting-code-review) focused on: does any coverage change alter rendered output for no-override pages (visual-diff), is the rewrite proposal loop non-destructive, does optimistic save ever show stale data, edge-fn input validation/cost.
- [ ] **E4: rebase on origin/main, refspec push** `git push origin feat/page-editor:main`. Watch Pages deploy.

## Self-review

- **Coverage:** edit-everything (A1-A6 + B1) ✓; footer/nav (B1) ✓; 3 dead formats (A6) ✓; AI rewrite in voice + proposal loop (C1-C2) ✓; optimistic save (D1) ✓; save pipeline unchanged (all tasks reuse `saveTo`) ✓.
- **Discovered simplifications baked in:** footer needs no per-slug migration (rebrandFooter already owns it); `data.footer`/`data.nav` optional so existing pages stay byte-identical (visual-diff gate enforces).
- **Risks flagged in-plan:** `make()` duplication (coverage is per-engine, not auto), minified-build drift, edge-fn `--no-verify-jwt`, visual-diff must be TIGHT for footer (not the 50% migration gate).
- **No unit tests in repo:** gates are visual-diff + edit-mode DOM smoke, stated per task.
