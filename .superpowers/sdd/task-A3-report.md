# Task A3 report — assessment + assessment-v2 coverage

**Status:** done
**Commit:** `aa77e313f4522b8d4c80bdc434a9fcf69951f239` — "feat(editor): assessment coverage audit + full assessment-v2 field coverage"
**Verify:** `node --check _engine/assessment.js && node --check _engine/assessment-v2.js` → both OK. Playwright not run (per brief's opt-out) — relied on the path-match-against-demo-`data.json` argument below instead, since every new path was checked against the real stored shape before registering.

## assessment.js — audit result: 2 real gaps closed, rest confirmed clean

Read the full file (1126 lines) and diffed every visible, data-derived text node against the brief's "already registered" list (27 registrations). Found two genuine gaps and closed them; everything else checked out as either already registered, hardcoded literal (no backing path, correctly unregistered), or computed/decorated (correctly left unregistered per the "textContent must equal raw stored value" rule):

1. **`brand.hero_badge`** — the hero eyebrow badge (`"Interactive Assessment"`) was rendered from `data.brand.hero_badge` (confirmed present in demo `data.json`: `"brand": {"hero_badge": "Interactive Assessment"}`) but never registered. Captured the element in a var and registered it.
2. **`results_copy.gap_fix_label`** — the "Fix" label prefixing each top-gap's fix text (default `"Fix"`) is built inside an `.innerHTML =` templated `<ol>` (one `.lmc-gap-fix-label` span per gap item, up to 3). Queried `.lmc-gap-fix-label` after insertion and registered each occurrence to the same path (same pattern already used elsewhere in this file for repeated-instance fields, e.g. `categories[i].name` appearing in two different render passes).

Explicitly checked and left unregistered (with reasoning):
- Meta chips ("N questions", "N min", "Auto-saves"), hero eyebrow "Your read", "Per-category breakdown" h3, "Next move" CTA eyebrow, per-category rec `tag` strings ("Critical — fix first" etc.), and the results-lead/weakest-category note sentence — all either hardcoded literals with no backing data path, or string concatenations/computed values (fails the textContent-equals-raw-value test). Same treatment as existing unregistered nodes already in the file.
- `cta.url`, all `placeholder=` attributes — not visible textContent, correctly never registered anywhere in either engine.

## assessment-v2.js — brought from 4 to full coverage

Read the full file (803 lines) and the demo `data.json` at `_engine/demo/assessment-v2/data.json` before registering anything. 4 pre-existing registrations (`title`, `subtitle`, `categories[i].questions[j].text`, `.hint` — and even those two were bugged, see below) → **21 registration call sites** now, covering every renderer in the brief's line map plus `buildIntro` (not in the line map, but the closest v1 analog registers `intro.*` and v2's demo data has the same shape).

### Bug fixed en route
The pre-existing `.text`/`.hint` registration only fired when `catIdx >= 0 && qIdx >= 0`, but the persona-classifier question (`__persona: true`, `category_id: "__persona"`) passed the guard's precondition (`q.category_id && q.id` both truthy) and then silently resolved to `catIdx = -1` (no category named `"__persona"` exists), so persona text/hint were **never actually registerable** despite the guard looking like it covered them. Replaced with an explicit `basePath` resolution: `"persona_selector"` for the persona question, `"categories[i].questions[j]"` for real ones — used consistently across all four question-type renderers.

### Full path list, each checked against `_engine/demo/assessment-v2/data.json`

| Path | Renderer | In demo data.json? |
|---|---|---|
| `title` | render | yes |
| `subtitle` | render | yes |
| `brand.hero_badge` | render | yes (`"Interactive Assessment v2"`) |
| `intro.paragraph` | buildIntro | yes |
| `intro.point_time` | buildIntro | yes |
| `intro.point_value` | buildIntro | yes |
| `intro.point_next` | buildIntro | yes |
| `categories[i].name` | renderQuestion (category chip) + renderUnlocked (h4) | yes, all 3 categories |
| `persona_selector.text` | renderQuestion | yes |
| `categories[i].questions[j].text` | renderQuestion | yes, all questions |
| `persona_selector.hint` | renderQuestion | optional — absent in demo (guarded by `if (q.hint)`, correctly not rendered/registered) |
| `categories[i].questions[j].hint` | renderQuestion | yes, all category questions have `hint` |
| `persona_selector.answers[k].label` | renderLikert | yes, 3 persona answers |
| `categories[i].questions[j].answers[k].label` (likert type) | renderLikert | no likert-type category question in this demo (all are number/multi_select/short_text) — path is correct/generic, simply unexercised by this data.json; not a gap |
| `categories[i].questions[j].prefix` | renderNumberInput | optional — absent on `door_count`/`team_size`/`reporting_hours` (guarded by `if (q.prefix)`) |
| `categories[i].questions[j].suffix` | renderNumberInput | yes — `door_count.suffix="doors"`, `team_size.suffix="people"`, `reporting_hours.suffix="hrs/month"` |
| `categories[i].questions[j].answers[k].label` (multi_select) | renderMultiSelect | yes — `stack` question, 9 answers |
| `categories[i].questions[j].multi_hint` | renderMultiSelect | optional — absent on `stack` (falls back to hardcoded "Check all that apply."; registered anyway so an editor can add the field, same pattern as `results_copy.progress_label` in v1) |
| `tier_thresholds.low_label` / `mid_label` / `high_label` | renderResult (tier pill) | yes, all 3 present — **registered `{locked:true}`** per the brief's explicit "LOCK ... tier names selected by score logic" rule |
| `computed_outputs[i].label` | renderResult | yes, all 3 (`hours_lost_weekly`, `monthly_leak`, `annual_leak`) — none use the `currency_per_period`/`hours_per_period` leaky-bucket format in this demo, so only the plain-row branch fires; the leaky-bucket branch is registered too but unexercised by this data.json |
| `categories[i].recommendations.<key>.text` | renderUnlocked | yes — `scale` and `intake` categories both use the legacy `{low,mid,high}` object; `reporting` has no `recommendations` key at all so `pickRec` returns null and the block is skipped (no path attempted, no crash) |
| `categories[i].recommendations.<key>.steps[s]` | renderUnlocked | yes, all populated |
| `cta.headline` / `cta.description` / `cta.button` | renderUnlocked | yes, all 3 present |

### Deliberately left unregistered
- **`categories[i].recommendations[k].text/.steps`** for the newer dynamic array format (`{when, text, steps}` entries) — `pickRec`'s array-format branch returns the matched object but not its index, so there's no reliable way to build `recommendations[k]` without risking a wrong-index write. Not present in the demo data.json either. Registering only the legacy-object branch (which the demo uses) avoids a silent-corruption risk; flagged here rather than guessed at.
- Computed **values** (`lmc-computed-value`, `lmc-leaky-value`, the `lmc-result-lead` headline sentence) — fully derived from `safeEval` formulas / `headline_formula` interpolation, no raw-text backing path exists (`computed_outputs[i]` has `formula`, not a stored display value). Left unregistered, matching the brief's "lock or skip computed values" rule (skip chosen since there's no sensible path to lock against).
- Fallback (no-`cta.url`) CTA block's hardcoded copy — unlike v1's single-path-with-JS-fallback CTA, v2 branches into a fully separate hardcoded block when `data.cta.url` is absent; registering that text to `cta.*` would edit a field that doesn't gate the branch back on, creating a confusing chicken-and-egg state. Left unregistered; the demo data.json has `cta.url` set so the registered branch is the one actually exercised.
- All `placeholder=` attributes (textarea/input) — never textContent, consistent with both engines everywhere else.

### One small necessary side-fix
Adding `registerField` to the answer-option spans in `renderLikert`/`renderMultiSelect` meant their parent `<label>` still had its own `click` handler that records an answer and advances. Added the same edit-mode guard v1 already uses on its option labels (`if (editMode.enabled()) return;`) so clicking near — not exactly on — the label text during editing doesn't silently record a phantom answer and advance the flow. Required by the new registration, not a drive-by.

## Concerns
- None blocking. The two "left unregistered" recommendation-array and fallback-CTA cases above are judgment calls under ambiguity — flagged explicitly rather than guessed, per the brief's own caution about wrong paths silently corrupting data.
- Demo pages were not opened in a browser (Playwright skipped per brief's known missing-shared.js include bug note); confidence rests on `node --check` + line-by-line path verification against both demo `data.json` files.
