# Task A2 — coverage: checklist + calculator

Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). Vanilla JS IIFE engines, no bundler.

## Goal
Complete inline-edit field coverage for `_engine/checklist.js` and `_engine/calculator.js`: every text node that maps to a `data.json` path should be registered as editable, EXCEPT enum/logic fields which must be `locked` (editable only via the Raw JSON escape hatch) so a non-technical client can't corrupt them.

## How registration works (verified — trust this)
- Engines register via `window.LM.editMode.registerField(el, "json.path", opts)` and `registerArray(containerEl, "arrayPath", opts)`, always guarded `if (window.LM && window.LM.editMode)`.
- `opts`: `{ multiline: true }` → textarea; `{ locked: true }` → click shows a "locked" toast, no inline edit (use for enums/logic/IDs); `{ contenteditable: true }` → rich HTML. Default = plain single-line text.
- A registered field's INLINE editor edits `el.textContent` and writes it via `setByPath(state.data, path, newValue)`. So **only register a node against a path when the node's visible textContent equals the raw stored value.** If the node shows a decorated/derived string (e.g. `"HIGH IMPACT"` for a stored `"high"`), do NOT register it as a free-text field — `locked` it or skip it.
- There is now a `window.LM.makeField(tag, attrs, text, path, opts)` helper (creates el + registers in one call). Using it is optional; matching the existing `make(...)` + `registerField(...)` pattern already in these files is equally fine. Prefer the LEAST diff.

## Current state (audited for you)
**checklist.js** — already registers: title, subtitle, intro.paragraph, intro.points[], intro.note, sections[].title, sections[].description, sections[].items[].text, sections[].items[].tip, and the items array. 
- GAP: the impact badge at `checklist.js:241-242` — `make("span", {class:"lmc-impact lmc-impact-"+it.impact}, (it.impact).toUpperCase()+" IMPACT")` — is NOT registered. Its textContent is `"HIGH IMPACT"` but the stored value is `"high"`, and `it.impact` also drives the CSS class AND the scoring logic (lines 282/316/413). **Register this span with `{ locked: true }`** against path `sections[sIdx].items[iIdx].impact` so it's acknowledged as a field but protected from inline corruption (real edits happen via Raw JSON). Do NOT make it free-text.
- Audit the rest of `render()` (checklist.js:159-256) for ANY other data-derived visible text node not yet registered (e.g. a results/summary headline, CTA button label, section count labels that come from data). Register genuinely-missing plain-text ones; `locked` any enum/derived/ID ones. If you find none, say so.

**calculator.js** — already registers: title, subtitle, inputs[].label, outputs[].label, recommendations[].text, and the inputs/outputs arrays.
- `formula` is LOGIC evaluated by `safeEval` and is NOT rendered as a visible text node, so there is nothing to register for it — leave it (it's edited via array-item Raw JSON). Do not invent a field for it.
- Audit `render()` (calculator.js:168-410) for missing VISIBLE data-derived text: e.g. a results headline, output unit/suffix strings, a CTA label, any `data.*` string shown to the reader that isn't yet registered. Register plain-text ones; `locked` derived/computed ones. If coverage is already complete, say so explicitly.

## Constraint: ZERO render change
Registration is additive metadata — the rendered DOM (tags, classes, textContent) must be byte-identical for a page with the same data. If you convert a `make(...)` to `makeField(...)`, the resulting element's tag/attrs/textContent MUST match exactly. Do not touch `.min.js`.

## Verify
1. `node --check _engine/checklist.js && node --check _engine/calculator.js` — must pass.
2. Registration audit: in your report, list for EACH engine the full set of registered paths after your change, and state "no other data-derived visible text node is unregistered" (or list any you deliberately left, with why).
3. Demo pages exist: `_engine/demo/checklist/` and `_engine/demo/calculator/`. If you can run Playwright headless, load each demo `index.html` under `python3 -m http.server` (from the worktree root) and confirm no console errors and the page renders (screenshot optional). If Playwright/Chromium is unavailable in your environment, SKIP this and instead prove non-regression by showing that each make→makeField conversion preserves tag/attrs/text (diff-level argument). State which path you took.

## Commit
`git add -A && git commit -m "feat(editor): complete checklist+calculator field coverage (impact locked)"`

## Report
Write full report to `.superpowers/sdd/task-A2-report.md`. Return: status, commit hash, one-line verify summary, concerns.
