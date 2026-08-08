# Task A6 — coverage FROM SCRATCH: swipe + landing + template

Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). These THREE engines have ZERO inline-edit coverage today. Add registration from scratch for every data-derived visible text node.

## Registration rules (same as every prior coverage task)
- `if (window.LM && window.LM.editMode) window.LM.editMode.registerField(el, "json.path", opts)` / `registerArray(containerEl, "arrayPath", opts)`. ALWAYS keep the guard. (In these files `window.LM` is aliased `L` at top — you can use `if (L.editMode) L.editMode.registerField(...)`, matching this repo's other guarded engines like n8n-workflow.js.)
- `opts`: `{multiline:true}` textarea; `{contenteditable:true}` rich HTML; `{locked:true}` protected; default plain single-line.
- Only register when the node's visible `textContent` EQUALS the raw stored value. Decorated/derived/computed/enum strings → `locked` or skip.
- Additive metadata only: `registerField` is a no-op outside edit mode (gated in shared.js), so rendered DOM stays byte-identical for the same data. Do NOT change any `L.make(...)` tag/attrs/text — capture the element into a var and register it AFTER the existing `make`/`appendChild`, don't rewrite the render. Don't touch `.min.js`. No SVG registration.

## No demo pages / no data.json for these formats
Format is engine-determined, not stored, so there is NO `_engine/demo/{swipe,landing,template}` and no slug data.json to grep. **Infer every path directly from the `render()` source**: wherever the code reads `data.X` / `d.X` / `item.Y` and puts it into a visible text node, that read expression IS the json path (with array indices). This is unambiguous — the accessor tells you the path. Do not guess keys; copy them from the code.

## Scope

### swipe.js (render@12; ~226 lines) — a filterable "swipe file" list
- Register: page title/subtitle/hero badge if data-derived; and for the LIST, each item's visible stored text (title/headline, body/description, any tag/label that's a plain stored string). Use `registerArray` on the list container for the array itself (add/remove/reorder) AND `registerField` per-item for each editable text node (the A5 stack-picker precedent: array + per-item field on primitive/text nodes).
- The engine re-renders the list on FILTER change. That's fine — registration re-fires each render. Just register inside the item-build loop so every render wires the visible items.
- Lock/skip: the "Filter" UI labels and filter category buttons (these are UI chrome / may be derived from item tags), the live "taken count" (`lms-taken-count` — computed), any enum/status flags.

### landing.js (render@41; ~131 lines) — a marketing landing page, single `render(d)` (no root/init var)
- Register every marketing copy node from data: hero eyebrow/badge, headline, subhead/description, feature/benefit block titles + bodies (use array registration if features are an array), any stat labels that are STORED strings (lock computed numbers), CTA headline + button label, secondary CTA, testimonial/quote text + attribution if present.
- landing's render signature is `render(d)` (d, not data; no root param — it uses a module-level root). Register the same way; the A1 rerender thunk already handles it.
- Lock/skip: computed values, any URL-only fields (register a CTA's visible LABEL, never its href as text).

### template.js (render@10; ~207 lines) — a quiz/scorecard-style template (questions + options + result)
- Register: title/subtitle/hero badge; per-question `label`/`text` (the code reads `q.label || q.text || q.id` — register against the primary stored field, and if it falls back to `id`, skip/lock that one since id≠label); per-option answer LABELS (stored strings → editable, path like `questions[i].options[j].label` — match the actual accessor); result section headline/body copy; CTA copy.
- Use `registerArray` for the questions list and the options list.
- Lock/skip: computed score, result tier selected by logic, `q.id`/option `value` discriminators, `aria-label`-only strings.

## Verify
1. `node --check _engine/swipe.js && node --check _engine/landing.js && node --check _engine/template.js`.
2. Report: for EACH engine, the FULL list of paths you registered, each tied to the exact `render()` line + the `data.X` accessor it came from (so the reviewer can confirm path==accessor). List every node you skipped/locked with the reason.
3. Guard on every call. No `make()` output changed. Playwright optional (no demos exist — rely on accessor-match + node --check).

## Commit
`git add _engine/swipe.js _engine/landing.js _engine/template.js && git commit -m "feat(editor): add field coverage from scratch for swipe+landing+template"`

## Report
Write to `.superpowers/sdd/task-A6-report.md`. Return: status, commit hash, one-line verify summary, concerns.
