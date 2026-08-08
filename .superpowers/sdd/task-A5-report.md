# Task A5 report — stack-picker + guide field coverage

Status: DONE. Commit: `2992a14` — "feat(editor): stack-picker+guide field coverage"

Verify: `node --check _engine/stack-picker.js && node --check _engine/guide.js` — both pass. No Playwright run (optional per brief); verification is `node --check` + manual path-vs-real-data.json cross-reference.

## stack-picker.js — full registered-path set after change

1. `title` — hero h1 (start node only) — unchanged
2. `subtitle` — hero sub (start node only) — unchanged
3. **NEW** `brand.hero_badge` — hero badge `.lmc-badge` (queried after `LM.buildHero`, same pattern as n8n-workflow.js/calculator.js/checklist.js/assessment*.js)
4. `tree.nodes.<id>.question` — `{multiline:true}` (renderQuestion) — unchanged
5. `tree.nodes.<id>.branches[i].label` (+ `registerArray` on the branches array) — unchanged
6. `tree.nodes.<id>.headline` — result headline (renderResult) — unchanged
7. **NEW** `tree.nodes.<id>.stack[i]` — per-chip registerField, one per stack-chip `<span>` (renderResult)
8. `tree.nodes.<id>.stack` (+ `registerArray`, itemLabel "tool") — unchanged, now paired with per-item field registration above
9. `tree.nodes.<id>.body_html` — `{multiline:true, richtext:true}` — unchanged
10. `tree.nodes.<id>.alternatives[i].name` — unchanged
11. `tree.nodes.<id>.alternatives[i].when_to_consider` — `{multiline:true}` — unchanged
12. `tree.nodes.<id>.alternatives` (+ `registerArray`, itemLabel "alternative") — unchanged

Verified against `should-you-use-n8n/data.json` (the real, currently-live doc for this stack-picker; `_engine/demo/stack-picker/data.json` is a frozen earlier snapshot of the same slug — text has since been lightly edited in prod, e.g. em-dashes replaced with commas, but the JSON *shape* is identical):
- `brand.hero_badge` = `"Decision Tree"` — present, string, matches fallback but is a real stored field.
- `tree.nodes.result_n8n.stack` = `["n8n self-hosted (Railway)", "Postgres", "Redis (queue mode)", "Custom code nodes"]` — plain strings, `stack[i]` path resolves correctly for each.

### Gaps closed
- **Stack chip text was never inline-editable.** `registerArray` only wires add/remove/reorder chrome (drag handle, remove button, +Add button) — it does NOT make item text itself editable (confirmed by reading `attachArray`/`decorateArrayItem` in `edit-mode.js`: no field registration happens there). The chip `<span>` had no `registerField`, so the only way to change a stack-tool name was Raw JSON. Fixed by registering `tree.nodes.<id>.stack[i]` on each chip, following the established primitive-array-item pattern (`assessment.js` `start_screen.chips[i]`, `assessment-v2.js` `.steps[si]`, `calculator.js` `outputs[idx].label` etc. — direct bracket-index path, no property suffix, for arrays of plain strings).
- **Hero badge was never registered** on this engine (start node only) even though the sibling engines (n8n-workflow.js, calculator.js, checklist.js, assessment.js, assessment-v2.js) all register `brand.hero_badge` off `.lmc-badge`. Closed for consistency.

### Deliberate skips (with reason)
- **CTA headline/description/button** (`pickCta(data, ctx)` in `renderResult`) — dynamically resolved at render time via `evalWhen()` string-expression matching against runtime path/result context (`ctx.result_id`, `ctx.path`, `ctx.leaf_cta_id`). The array index actually rendered isn't stable across sessions/paths, so there's no fixed `ctas[i]` to bind an editable node to. This is the exact same pattern already excluded in task A4 for `architecture.js`'s and `ai-walkthrough.js`'s dynamic CTA (`pickCta`) — no engine in this codebase registers a dynamically-selected `ctas[]` entry; only engines with a *fixed* single CTA object (`n8n-workflow.js`'s `ctas[0]`, `assessment.js`'s singular `cta` object) get CTA registration. Skipped consistent with that precedent.
- **Question sub-note / helper text** — checked the real node schema (`should-you-use-n8n/data.json` and `_engine/demo/stack-picker/data.json`): question nodes only have `{question, branches}`. No sub-note/helper field exists anywhere in the schema. Nothing to register.
- **Result intro/summary line** — checked result-node schema: `{type, headline, body_html, stack, alternatives, cta_id}`. No separate intro/summary field distinct from `headline`/`body_html`, both of which are already registered. Nothing to add.
- **Node IDs / computed node routing** (`.next`, `data-branch` attr, `slugify()` output) — explicitly locked/skip per brief; not visible editable text, and identifiers must stay in sync with `tree.nodes` keys.
- **Icon/emoji-only chips** — none exist; stack chips are plain tool-name strings (now registered), so this exclusion is moot for this engine.
- **Crumbs / "Start" / "&larr; Back" / "Share my result" / LinkedIn / WhatsApp share button labels / CTA fallback "Continue"** — all hardcoded JS literals, never read from `data.json`. Skip.
- **`buildClosingCta("stack_picker", ...)` output** — shared-component (`shared.js`) cross-cutting gap already flagged in task A4's report (no engine that uses it registers `closing_cta.*` fields); out of scope for a stack-picker/guide-only task since `shared.js` is consumed by every engine.

## guide.js — full registered-path set after change

1. `title` — hero h1 — unchanged
2. `subtitle` — hero sub — unchanged
3. **NEW** `brand.hero_badge` — hero badge `.lmc-badge`, same pattern as sibling engines
4. `intro.bio_html` — `{multiline:true, contenteditable:true}` (hoisted "Who Am I?" bio) — unchanged
5. `sections[i].title` — section `<h2>` — unchanged
6. `sections[i].html` — `{contenteditable:true}` — unchanged
7. `sections[i].text` — `{multiline:true}` (used only when `s.html` is absent) — unchanged
8. `sections` array (+ `registerArray`, itemLabel "section") — unchanged
9. **NEW** `sections[i].title` — second registration, on the sticky mini-TOC `.lmg-toc-text` entry (dual view of the same field, guarded on `s.title` truthy so the "Section N" fallback literal is never wrongly bound)

Verified against `zapier-to-n8n-migration-guide/data.json` (a real, currently-live guide-format doc — this engine has no `_engine/demo/guide/` dir, so I located a real slug via the sections-shape signature `{id, title, html, self_prompt}` since no doc in the repo sets a literal `"format": "guide"` key; `guide.js`'s own render code is what identifies the format, not a stored field):
- `brand.hero_badge` = `"Guide"` — present, string.
- `sections[i].title` for all 10 sections — present, non-empty strings (e.g. `"Why This Migration Matters Right Now"`, `"1. Audit What You Actually Have"`, `"Closing"`) — the TOC-text path resolves correctly for every entry.
- Also checked `anti-ai-patterns-guide-...` (another real guide, 9 sections, `{id, title, html, self_prompt}`) as a second confirmation.

### Gaps closed
- **Hero badge** — was unregistered; closed for consistency with every other engine in the codebase.
- **Mini-TOC section titles** — the sticky right-rail TOC (`.lmg-toc`) renders each section's title a second time via an `innerHTML` template string, and had zero edit-mode wiring. Closed by querying `.lmg-toc-text` elements post-render and registering each against the same `sections[i].title` path already used for the in-body `<h2>`, guarded so only real (non-fallback) titles are bound — precedent: architecture.js's mobile-list dual registration of `panel.headline` in task A4.

### Deliberate skips (with reason)
- **Mini-widget configs** (`renderMiniChecklist(slug, sectionId, items)` / `renderMiniCalculator(slug, sectionId, config)`) — per brief instruction, left alone. Confirmed via repo-wide search (`grep -rl '"type": *"checklist"\|"type": *"mini_calculator"'`) that **no real guide doc in this repo currently uses these section types at all** — the render paths exist in code but are exercised by zero live data. Even setting that aside, the underlying config shapes (`s.config.items[]`, `s.config.inputs[]` + `s.config.formula`) are exactly the "complex nested/computed blob" case the brief calls out — `formula`/`inputs[].id`/`.min`/`.max`/`.step` interact as a coupled unit, and a wrong/fragile path here could silently break the live calculator. Left for Raw JSON editing as instructed.
- **`self_prompt`** (self-placement prompt text, e.g. `"Is your team already doing this?"`) — real data DOES have this field (confirmed in `zapier-to-n8n-migration-guide/data.json` and others), but (a) the self-placement block only renders when `data.enable_self_placement === true`, and a repo-wide check found **zero** guides with that flag set — this is currently dead code in every real doc; (b) even where it would render, the markup builds `.lmg-self-prompt` via one `innerHTML` string that concatenates a literal `<span>Self-placement</span>` label immediately followed by the escaped prompt text with no wrapping element around the prompt alone — so `textContent` of the only queryable node would be `"Self-placement" + prompt`, not equal to the raw stored value. Registering it would require restructuring the markup (out of scope — "no render change outside edit mode" / don't touch `make()` output patterns) or accepting a fragile textContent-not-equal-to-value binding the brief explicitly says to avoid. Skipped, both for being currently unreachable and for failing the textContent-equality rule as structured today.
- **`STATE_LABEL`s** ("Not yet" / "Partial" / "Done"), self-placement button labels, TOC label ("Sections"), "Listen instead" audio label, progress bar "Reading" label, summary-panel copy ("Where you stand", tier notes from `L.tierFor()`), "What to do Monday" copy, skipped-chapters prompt copy — all hardcoded JS literals or computed from a shared, non-per-doc `tierFor()` function (`shared.js`), never read from this guide's `data.json`. Skip.
- **`audio_url` / `audio_timestamps`** — used only as `src`/comparison values, never rendered as visible text content. Skip (not a text node per the brief's scope).
- **`buildClosingCta("guide", ...)` output** — same shared-component cross-cutting gap already flagged in task A4 (no engine registers `closing_cta.*` fields); out of scope, `shared.js` not touched by this task.
- **Section subhead/caption beyond title** — none found; section schema is `{id, title, html|text, self_prompt}`. No additional data-derived caption field exists.

## Concerns / follow-ups for whoever reviews this

1. Neither engine had a demo `data.json` that could confirm `guide.js`'s coverage in isolation — I cross-referenced real production docs instead (`zapier-to-n8n-migration-guide`, `anti-ai-patterns-guide-...`) and the frozen `_engine/demo/stack-picker/data.json` plus its live counterpart `should-you-use-n8n/data.json` (which has since diverged slightly in copy — cosmetic em-dash re-encoding and small text edits — but not in shape).
2. `enable_self_placement` and the mini-widget section types (`checklist`, `mini_calculator`) are fully-built render paths with **zero real usage** in the current content set. If/when a guide actually adopts self-placement or a mini-widget, someone should re-run this same gap audit against real data before trying to register those paths — right now there's nothing to verify against.
3. The `buildClosingCta` cross-cutting coverage gap (flagged first in task A4) still applies to both `stack-picker.js` and `guide.js` — unchanged from before, noted again for visibility since it recurs on every engine using the shared closing-CTA component.
4. No live browser/Playwright verification was performed — only `node --check` + manual path-vs-real-data.json cross-reference, consistent with the fallback approach used in tasks A3/A4.
