# Task A3 — coverage: assessment + assessment-v2

Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). Vanilla JS IIFE engines.

## The registration rules (identical to prior coverage tasks — trust these)
- Register via `if (window.LM && window.LM.editMode) window.LM.editMode.registerField(el, "json.path", opts)` / `registerArray(containerEl, "arrayPath", opts)`. ALWAYS keep that guard.
- `opts`: `{multiline:true}` → textarea; `{locked:true}` → protected (enum/derived/computed/ID — click shows "locked", edit only via Raw JSON); `{contenteditable:true}` → rich HTML. Default = plain single-line.
- **Only register a node against a path when the node's visible `textContent` EQUALS the raw stored value.** If it shows a decorated/derived/computed string (a score, a tier label swapped by logic, a concatenation), `locked` it or skip — never free-text (inline edit writes textContent back via `setByPath`, so a mismatch corrupts data or a CSS class).
- Registration is additive metadata: rendered DOM must be byte-identical for the same data. `registerField` is a no-op on normal (non-edit) page loads — it only buffers + attaches when edit mode is enabled (gated in shared.js). So there is ZERO render risk as long as you don't change the `make(...)` tag/attrs/text. Do not touch `.min.js`.

## Scope

### assessment.js — AUDIT ONLY (already has 27 registrations, likely near-complete)
Read `render()` and its inner renderers (`render`@166, `renderQuestion`@631, `renderResult`@675, `renderUnlocked`@948). Already-registered paths: title, subtitle, intro.*, start_screen.* (eyebrow/headline_html/description/button/chips[]), results_copy.* (progress_label/tier_headline.<tier>/gaps_headline_html/monday_label), question `.text` + `answers[].label`, category `.name`, capture_gate.* (headline_html/description/button/note), recommendations `.text` + `.steps[]`, cta.* (headline/description/button).
- Find any VISIBLE data-derived text node NOT in that list (e.g. a footer line, a results subheadline, a "share" label, a progress "of N" string that comes from data). Register plain-text ones; `locked` any computed/tier-swapped ones (scores, computed tier names).
- If you find no genuine gaps, state that explicitly with the nodes you checked.

### assessment-v2.js — BRING TO FULL COVERAGE (only 4 registrations today)
Only title, subtitle, `categories[i].questions[j].text`, and `.hint` are registered. Audit ALL of these renderers and register every remaining data-derived VISIBLE text node, using the SAME path conventions assessment.js uses where the shapes match:
- `render`@273, `renderQuestion`@319, `renderLikert`@369, `renderNumberInput`@396, `renderMultiSelect`@417, `renderShortText`@447, `renderResult`@512, `renderUnlocked`@616.
- Expect to add: start-screen copy (eyebrow/headline/description/button/chips if present), per-question answer/likert/multi-select OPTION labels (these are stored strings → plain text; path like `categories[i].questions[j].answers[k].label` or `.options[k]` — match the actual data shape), number-input/short-text prompt or placeholder strings that come from data, results copy (tier headlines, gaps headline, monday label, progress label), capture-gate copy, recommendations text/steps, CTA copy.
- LOCK or skip: computed scores, tier names selected by score logic, likert numeric values, any `type`/`id`/enum discriminator.
- Read the demo `data.json` at `_engine/demo/assessment-v2/` to confirm each path matches the real stored shape BEFORE registering. Getting the path right (matching the data.json key names and array nesting) is the whole job — a wrong path silently writes to the wrong place on save.

## Verify
1. `node --check _engine/assessment.js && node --check _engine/assessment-v2.js`.
2. In your report, list the FULL set of registered paths for assessment-v2 after your change, and for each confirm it exists in the demo `data.json` (or note it's an optional field). For assessment, list any gaps you closed or state "no gaps".
3. Every new call must have the `if (window.LM && window.LM.editMode)` guard.
4. Playwright optional (demo pages may have a pre-existing missing-shared.js include bug — if the demo won't render, rely on the data.json path-match argument + node --check; state which path you took).

## Commit
`git add _engine/assessment.js _engine/assessment-v2.js && git commit -m "feat(editor): assessment coverage audit + full assessment-v2 field coverage"`

## Report
Write to `.superpowers/sdd/task-A3-report.md`. Return: status, commit hash, one-line verify summary, concerns.
