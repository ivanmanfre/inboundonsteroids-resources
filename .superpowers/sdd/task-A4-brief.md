# Task A4 — coverage: architecture + ai-walkthrough + n8n-workflow

Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). Vanilla JS IIFE engines with rich nested data.

## Registration rules (same as prior coverage tasks — trust these)
- Register via `if (window.LM && window.LM.editMode) window.LM.editMode.registerField(el, "json.path", opts)` / `registerArray(...)`. ALWAYS keep the guard.
- `opts`: `{multiline:true}` textarea; `{contenteditable:true}` rich HTML; `{locked:true}` protected (enum/derived/computed/ID); default plain single-line.
- Only register when the node's visible `textContent` EQUALS the raw stored value. Decorated/derived/computed strings → `locked` or skip.
- Additive metadata only: `registerField` is a no-op outside edit mode (gated in shared.js), so rendered DOM stays byte-identical for the same data. Don't change any `make(...)` tag/attrs/text. Don't touch `.min.js`.

## CRITICAL: SVG text is NOT inline-editable — skip it
The inline editor swaps a node's innerHTML to an `<input>`/`<textarea>` on click. That works for HTML elements but is BROKEN inside SVG (`<svg><text>`/`<tspan>` can't host an HTML input). Therefore:
- **Do NOT register any node that lives inside an `<svg>` element** (architecture's `renderSvg` diagram labels). Leave them.
- Architecture renders the SAME diagram-node content a SECOND time as HTML in `renderMobileList` (architecture.js:547). Register the HTML mobile-list copies against the node paths instead — those ARE editable. If a diagram node's label/text only exists in SVG and has no HTML twin, skip it (note it in your report as "SVG-only, not inline-editable").
- If unsure whether an element is SVG: check whether its `make(...)`/creation uses `document.createElementNS` or is appended under an `<svg>`/`<g>`. When in doubt, skip and note it.

## Scope — audit each render() + inner renderers, close gaps

### architecture.js (5 registrations today)
Registered: title, subtitle, `diagram.nodes[i].panel.headline`, `diagram.nodes[i].panel.body_html`. Inner renderers: `renderHero`@120, `renderSvg`@276 (SVG — SKIP its text), `renderLegend`@528, `renderMobileList`@547 (HTML — register here), `render`@826.
- Add: hero badge/eyebrow if data-derived, any hero description, legend item labels (if data-derived HTML, not SVG), mobile-list node headlines/bodies (map to `diagram.nodes[i].panel.headline`/`.body_html` — but NOTE: if the mobile list already reuses the same registered path as the panel, registering twice on different elements is acceptable but flag it), any CTA block copy, section headings that come from data.
- Lock/skip: SVG diagram text, computed positions, node IDs/types.

### ai-walkthrough.js (8 registrations today)
Registered: brand.hero_badge, title, subtitle, input.placeholder, system_prompt_clickup_page_id. Inner: `render`@74, `renderStepRow`@257, `renderSkeleton`@274.
- Add: per-step VISIBLE data-derived text in `renderStepRow` (step label/title/description/caption — match the data shape, path like `steps[i].label` / `.description`), any output-section copy, CTA copy, an intro/subhead if data-derived. Read the demo `_engine/demo/ai-walkthrough/data.json` to confirm the step object keys.
- Lock/skip: the hidden `system_prompt` field is already handled; skeleton is a loading placeholder (not data) — skip.

### n8n-workflow.js (6 registrations today)
Registered: title, subtitle, what_it_does (contenteditable), sections[i].title, sections[i].html (contenteditable), sections array. Inner: `render`@11.
- Add: hero badge if present, any download/CTA button label that's data-derived, a hero description/meta line, step or requirement list labels that come from data. Read `_engine/demo/n8n-workflow/data.json`.
- Lock/skip: any computed/download-URL/id fields; keep the contenteditable HTML blocks as-is.

## Verify
1. `node --check` on all three files.
2. Report: for EACH engine, list the full registered-path set after your change, confirm each new path exists in that engine's demo `data.json` (or is an optional field), and list every node you deliberately SKIPPED with the reason (esp. SVG-only nodes).
3. Guard on every new call. Playwright optional (demo include bug may block render — fall back to path-match + node --check, state which).

## Commit
`git add _engine/architecture.js _engine/ai-walkthrough.js _engine/n8n-workflow.js && git commit -m "feat(editor): architecture+ai-walkthrough+n8n-workflow field coverage (skip SVG text)"`

## Report
Write to `.superpowers/sdd/task-A4-report.md`. Return: status, commit hash, one-line verify summary, concerns.
