# Task A5 — coverage: stack-picker + guide

Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). Vanilla JS IIFE engines.

## Registration rules (same as prior coverage tasks)
- `if (window.LM && window.LM.editMode) window.LM.editMode.registerField(el, "json.path", opts)` / `registerArray(...)`. Keep the guard.
- `opts`: `{multiline:true}` textarea; `{contenteditable:true}` (+ optional `richtext:true`) rich HTML; `{locked:true}` protected; default plain single-line.
- Only register when node textContent EQUALS the raw stored value; decorated/derived/computed → lock or skip.
- Additive metadata; no-op outside edit mode; DOM byte-identical for same data. Don't change `make(...)` output. Don't touch `.min.js`.
- Do NOT register SVG (`createElementNS`) text nodes — inline editor can't host an input there.

## Scope — audit + close gaps

### stack-picker.js (11 registrations today)
Registered: title, subtitle, and per-tree-node: `tree.nodes.<id>.question`, `.branches[i].label` (+ branches array), `.headline`, `.stack[]` (array), `.body_html` (richtext), `.alternatives[i].name` + `.when_to_consider` (+ alternatives array). Inner: `render`@160, `renderQuestion`@286, `renderResult`@319.
- NOTE: this engine navigates a decision tree via `hashchange` and re-renders per node — each node's fields register on render of THAT node. That's fine; just make sure every VISIBLE data-derived text node in BOTH `renderQuestion` and `renderResult` is covered.
- Add any genuine gaps: hero badge/eyebrow, a question sub-note/helper text, result intro/summary line, CTA block copy, stack-chip labels if they're plain stored strings (check the array registration already covers item text — if the chip renders `stack[i].name` or `stack[i]` as a plain string, ensure it's editable via the array's item template OR a per-chip registerField).
- Lock/skip: computed node routing, node IDs, any icon/emoji-only chips.

### guide.js (8 registrations today)
Registered: title, subtitle, intro.bio_html (contenteditable), sections[i].title, sections[i].html (contenteditable), sections[i].text (multiline), sections array. Inner: `renderMiniChecklist`@77, `renderMiniCalculator`@100, `render`@150.
- Add: hero badge/eyebrow if data-derived, intro heading/name if data-derived, any section subhead or caption from data, a CTA block if present.
- The embedded MINI-WIDGETS (`renderMiniChecklist`, `renderMiniCalculator`) render from a section's embedded config. Their internal item text may be deeply nested (e.g. `sections[i].checklist.items[j].text` or a `config` blob). Register the top-level ones IF the path is clean and the node text equals the stored value; if the mini-widget config is a complex nested/computed blob, LEAVE it (note it as "mini-widget config — edit via Raw JSON") rather than guessing a fragile path. Read `_engine/demo` (guide has NO demo dir — use a real guide slug's data.json if you can find one via `grep -rl '"format".*guide' */data.json` or inspect `guide.js` render to infer the shape).

## Verify
1. `node --check _engine/stack-picker.js && node --check _engine/guide.js`.
2. Report: full registered-path set per engine after change; each new path confirmed against a real data.json (name the file) or marked optional; list deliberate skips w/ reason.
3. Guard on every new call. Playwright optional.

## Commit
`git add _engine/stack-picker.js _engine/guide.js && git commit -m "feat(editor): stack-picker+guide field coverage"`

## Report
Write to `.superpowers/sdd/task-A5-report.md`. Return: status, commit hash, one-line verify summary, concerns.
