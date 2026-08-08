# Task A1 report — makeField() helper + re-render hook

## Status
DONE

## Commit
`67d4810` — feat(editor): makeField helper + rerender hook + per-engine rerender thunk

## Files changed
- `_engine/shared.js` — added `makeField`, `makeFieldArray`, `editModeResetBuffers` functions (placed right before `window.LM = {...}` at what is now line 749/750); exposed `makeField`/`makeFieldArray` on top-level `window.LM` AND on `window.LM.editMode`; exposed `resetBuffers: editModeResetBuffers` on `window.LM.editMode`.
- `_engine/edit-mode.js` — added `rerender()` function (clears buffers via `window.LM.editMode.resetBuffers()` then calls `window.__lm_rerender()` if present); added `rerender: rerender` to the `window.__LM_EDIT_MODE_API` object literal.
- Per-engine `render(data, root)` call sites — added `window.__lm_rerender = function(){ render(window.__lm_data, root); };` right after the initial render call in each engine's bootstrap/init:
  - `_engine/checklist.js`
  - `_engine/calculator.js`
  - `_engine/assessment.js`
  - `_engine/assessment-v2.js`
  - `_engine/architecture.js`
  - `_engine/ai-walkthrough.js`
  - `_engine/n8n-workflow.js`
  - `_engine/stack-picker.js` (added after the initial `render(data, root);` call, before the existing `hashchange` listener — did not touch the hashchange re-render call itself)
  - `_engine/guide.js`
  - `_engine/swipe.js`
  - `_engine/template.js`
  - `_engine/landing.js` — this engine's `render(d)` takes only one arg (no `root` param — it closes over a module-level `root` var) and its bootstrap is a bare top-level `fetch(...).then(render)` (no named `init()`). Adapted: replaced `.then(render)` with `.then(function (d) { render(d); window.__lm_rerender = function(){ render(window.__lm_data); }; })`. `render(d)` already does `window.__lm_data = d` internally like every other engine, so the thunk is consistent with the others (it just omits the `root` arg landing.js's `render` doesn't take).

No `.min.js` files were touched (minify runs later in Phase E, per the brief's constraint).

## Verify — grep-count evidence

`node --check` on every touched file — all pass:
```
shared.js OK, edit-mode.js OK, checklist.js OK, calculator.js OK, assessment.js OK,
assessment-v2.js OK, architecture.js OK, ai-walkthrough.js OK, n8n-workflow.js OK,
stack-picker.js OK, guide.js OK, swipe.js OK, landing.js OK, template.js OK
```

`grep -n "makeField" _engine/shared.js`:
```
752:  function makeField(tag, attrs, text, path, opts) {
758:  function makeFieldArray(containerEl, arrayPath, opts) {
776:    makeField: makeField, makeFieldArray: makeFieldArray,
785:      makeField: makeField, makeFieldArray: makeFieldArray,
```
(2 function defs + top-level export line 776 + editMode sub-object export line 785 — matches brief.)

`grep -n "rerender" _engine/edit-mode.js`:
```
549:  function rerender() {
552:    if (typeof window.__lm_rerender === "function") window.__lm_rerender();
561:    rerender: rerender,
```
(fn def + the `__lm_rerender` call inside it + the API export — matches brief.)

`grep -c "__lm_rerender" _engine/*.js` (non-`.min.js` files only, all count 1 except edit-mode.js):
```
ai-walkthrough.js:1   architecture.js:1   assessment-v2.js:1   assessment.js:1
calculator.js:1       checklist.js:1      n8n-workflow.js:1    stack-picker.js:1
template.js:1         swipe.js:1          guide.js:1           landing.js:1
edit-mode.js:1        shared.js:0
```
12 engines × 1 thunk assignment each = 12, plus 1 call site in edit-mode.js. All `.min.js` files show 0 (untouched, as required). `shared.js:0` is expected — the thunk lives in edit-mode.js and the engines, not shared.js.

## Concerns
- `landing.js` required a genuine adaptation (no named `init()`, single-arg `render(d)`, no `root` param) as anticipated by the brief's "adapt if variable names differ" clause. Behavior is equivalent to the other 11 engines: `window.__lm_data` is always set by `render()` itself, so `window.__lm_rerender` closing over `window.__lm_data` instead of a fixed `data` var is intentional and consistent with the pattern the brief specifies for `checklist`'s thunk (`render(window.__lm_data, root)`), not a deviation.
- `stack-picker.js` already had a separate `hashchange` re-render call (`render(data, root)` closing over the original fetched `data`, not `window.__lm_data`) — left untouched since it's pre-existing behavior outside this task's scope; only the thunk assignment was added alongside it.
- No behavior change when edit mode is disabled: `makeField`/`makeFieldArray` are purely additive, and `rerender()`/`__lm_rerender` are never invoked by anything in this task (only later tasks will call `window.__LM_EDIT_MODE_API.rerender()`).
