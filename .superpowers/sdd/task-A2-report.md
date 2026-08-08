# Task A2 report — checklist + calculator field coverage

## Status: DONE

## Summary
Closed inline-edit registration gaps in `_engine/checklist.js` and `_engine/calculator.js` without changing any rendered output in the non-edit-mode path (verified empirically, not just by inspection — see Verify §3).

## checklist.js — changes
1. **Hero badge** (line ~168-170): `data.brand.hero_badge` was rendered but never registered. Registered plain-text at `brand.hero_badge` (matches the precedent already set in `ai-walkthrough.js` for the identical pattern).
2. **Impact badge** (line ~241-245, the flagged GAP): registered `sections[sIdx].items[iIdx].impact` with `{ locked: true }`. Its textContent (`"HIGH IMPACT"`) is a decorated/uppercased view of the raw stored value (`"high"`), and `it.impact` also drives the CSS class and the scoring/gap-count logic elsewhere in `render()`/`update()` — free-text editing would desync the class and the "high-impact gaps" count. Locked per brief.

### checklist.js — full registered-path list after change
- `title`
- `subtitle`
- `brand.hero_badge` (new)
- `intro.paragraph`, `intro.point_time`, `intro.point_value`, `intro.point_next`, `intro.note` (in `buildIntro`)
- `sections[i].title`
- `sections[i].description`
- `sections[i].items[j].text`
- `sections[i].items[j].tip`
- `sections[i].items[j].impact` — **locked** (new)
- array: `sections[i].items`

### checklist.js — deliberately left unregistered (with why)
- **Section-title "label" span** (`splitTitle(s.title)` label half, line ~211): a substring split of the same `sections[i].title` string, not a separate data field. The full title is already registered on `secTitle`; registering the label fragment separately would let a user edit only half the title and desync it from the raw stored value. Skip — already covered.
- **`estimated_minutes` meta chip** ("30 min"): textContent is `data.estimated_minutes + " min"`, a decorated concatenation, not equal to the raw stored value. Every other engine in `_engine/` (assessment, assessment-v2, guide, n8n-workflow, template, stack-picker) renders this exact same chip and none of them register or lock it — consistent with leaving it as a display-only chip. Skipped, not locked (no corruption risk from clicking it — it's simply never wired to editMode, same as everywhere else in the codebase).
- **"X items" meta chip**: `total` is a computed sum across all sections' items arrays, not a single data path. Not registrable.
- **Mid-scroll CTA headline** (`completion_cta.mid_headline`, ~line 259, inside the `sIdx === 0` block): explicitly outside the brief's stated audit range (`checklist.js:159-256`); the boundary lands exactly before this block. Also found on inspection that the real demo data's `completion_cta` object only has `headline`/`description` keys (consumed by the shared `buildClosingCta()` in `shared.js`, out of scope) — `mid_headline` doesn't match any real data key, so the hardcoded English fallback always renders in practice. Left untouched per the brief's explicit line-range scope.
- No other data-derived visible text node in `render()` (159-256) was found unregistered.

## calculator.js — changes
1. **Hero badge**: same as checklist — registered `brand.hero_badge`.
2. **Input `prefix`/`suffix`/`hint`** (e.g. `"$"`, `"people"`, `"Full-time equivalents..."`): plain 1:1 data strings, confirmed present and used in the demo `data.json` (`prefix: "$"`, `suffix: "people"`, `hint: "..."`). Registered `inputs[idx].prefix`, `inputs[idx].suffix`, `inputs[idx].hint`. (`assessment-v2.js` already registers the analogous `.hint` field for its questions — this brings calculator in line; prefix/suffix had no precedent anywhere but are equally plain 1:1 fields.)
3. **Primary output's "big unit" label**: `primary.label` is shown under the big number (`.lmc-big-unit`) but — unlike every *secondary* output — was never registered, because the code explicitly skips the primary output in the secondary-outputs loop (`if (out === primary) return;`). This is exactly the "output unit/suffix string" gap flagged in the brief. Registered `outputs[primaryIdx].label`.
4. **`fixes_scenario.label`** (the "See what happens with the top 3 fixes" toggle copy): data-derived CTA-style label, built via `innerHTML`, never registered. Grabbed the inner `<span>` after the `innerHTML` assignment and registered `fixes_scenario.label`.
5. **`recommendations[idx].tag`** (e.g. `"Automate first"`, `"Skip for now"`): a free-text short label rendered in `<strong>`, sibling to the already-registered `.text`. Confirmed via demo data these are arbitrary short strings, not an enum. Registered as its own field on the `<strong>` element. This does not change the pre-existing (out-of-scope) behavior of the parent `recDiv`'s own `.text` registration — the click handler's `stopPropagation()` means clicking directly on the tag now edits just the tag, while clicking elsewhere in the rec still behaves exactly as before.

### calculator.js — full registered-path list after change
- `title`
- `subtitle`
- `brand.hero_badge` (new)
- `inputs[i].label`
- `inputs[i].prefix` (new)
- `inputs[i].suffix` (new)
- `inputs[i].hint` (new)
- `outputs[i].label` (secondary outputs, pre-existing) + `outputs[primaryIdx].label` (new, primary output's big-unit display)
- `fixes_scenario.label` (new, only registered when `data.fixes_scenario.input_overrides` is a non-empty array — same gate as the toggle itself)
- `recommendations[i].text` (pre-existing)
- `recommendations[i].tag` (new)
- array: `inputs`, `outputs`

### calculator.js — deliberately left unregistered (with why)
- **`formula`** (per brief): logic evaluated by `safeEval`, never rendered as a visible text node. Left alone, no field invented.
- **`tier_thresholds.{low,mid,high}_label`**: three candidate labels, of which only one shows at a time (`#lmc-tier`), swapped live by `tierFor()` based on the current computed value — this is the calculator's version of "impact": a derived/enum-like display driven by live computation, not a stable 1:1 static node. There's no single stable path to bind (the pill starts as a static placeholder — "Fill in the numbers" — until the first `compute()` call, then flips between 3 different data-backed strings depending on live input values). Locking it wouldn't fit the model either, since there's no single element↔single-path mapping. Left unregistered, analogous reasoning to the brief's formula ruling.
- **`lmc-big-num` / secondary output `[data-out-id]` values**: these are the live `safeEval(formula, ctx)` results, not raw data strings — computed outputs, same category as `formula` itself. Left alone.
- **Sensitivity bars and benchmark overlay**: sensitivity row labels are a duplicate re-render of the already-registered `inputs[i].label`, rebuilt via `innerHTML` on every `compute()` call (every keystroke) — not a stable target. Benchmark panel content comes from a Supabase RPC (`fetchBenchmark`), not from `data.json` at all. Neither touched.
- **`(data.inputs||[]).length + " inputs"` / `estimated_minutes + " min"` / "Live math" meta chips**: same reasoning as checklist — computed count or decorated concatenation, consistent with every other engine leaving these unregistered.
- No other data-derived visible text node in `render()` (168-410) was found unregistered.

## Verify
1. `node --check _engine/checklist.js && node --check _engine/calculator.js` — **both pass.**
2. Registration audits — see per-file lists above; each states "no other data-derived visible text node is unregistered" plus the explicit deliberate exclusions and why.
3. Playwright path taken (not skipped): global `playwright@1.59.1` + cached Chromium were available on the machine. However both demo pages (`_engine/demo/checklist/index.html`, `_engine/demo/calculator/index.html`) are **missing the `<script src="/_engine/shared.js">` include** that other engines' demos have (architecture/stack-picker/ai-walkthrough include it; checklist/calculator do not) — a pre-existing defect unrelated to this task, which makes `window.LM` undefined and `render()` throw on `window.LM.buildClosingCta(...)` before it ever gets to the code I touched. I did not modify the tracked demo HTML (out of scope). Instead I served the real repo `_engine/` alongside a **patched copy of the demo HTML** (only adding the missing `shared.js` script tag, kept entirely outside the repo in the scratch dir) from a local `python3 -m http.server`, and loaded both pages headless:
   - Zero JS console/page errors on either page (the only console entries were a CORS failure from the remote `lm-beacon` POST call — pre-existing, unrelated to `render()`, unrelated to my edits).
   - `.lmc-impact` badges render with correct decorated text (`"HIGH IMPACT"`, `"MEDIUM IMPACT"`, `"LOW IMPACT"`) and `outerHTML` is byte-identical to what the original unregistered code produced (`<span class="lmc-impact lmc-impact-high">HIGH IMPACT</span>`).
   - `.lmc-badge` renders `"Action Checklist"` / `"Interactive Calculator"` correctly, `outerHTML` byte-identical.
   - New calculator fields render with correct content: `.lmc-prefix` → `"$"`, `.lmc-suffix` → `"people"`, `.hint` → `"Full-time equivalents on billable work."`, `.lmc-big-unit` → `"Monthly savings"`.
   - Confirmed `window.LM.editMode` is unconditionally present once `shared.js` loads (`editMode: { registerField, ... }` is set synchronously in `shared.js`, not gated by edit-mode activation), and that the DOM mutation performed by `registerField`/`attachField` (contentEditable, `lme-*` classes, `data-lme-field` attr) is itself gated behind `editModeState.enabled && editModeIsLoaded()` inside `shared.js`/`edit-mode.js` — so on a normal (non-`?edit=`) page load these registrations are pure bookkeeping with zero DOM footprint. This is also why the two demo pages I loaded (`window.LM` present, edit mode never activated) showed byte-identical markup to the pre-change version.

## Concerns
- The missing `shared.js` `<script>` tag in `_engine/demo/checklist/index.html` and `_engine/demo/calculator/index.html` is a real, pre-existing bug (these two demo pages currently throw and fail to render at all, even on `main`/before this task) — flagging for whoever owns demo-page maintenance since it wasn't in scope here to fix.
- `recommendations[idx].tag` and the parent `recDiv`'s pre-existing `recommendations[idx].text` registration both live on nested elements (`<strong>` inside the div). This is safe (click `stopPropagation()` on the inner field prevents double-firing) but is worth knowing about if this pattern is copied elsewhere.
- `fixes_scenario` is `null` in the calculator demo data, so the new `fixes_scenario.label` registration path is currently inert in the demo (never rendered) — it will activate once a real `data.json` sets `fixes_scenario.input_overrides`.
