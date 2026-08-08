# Task A1 — `makeField()` helper + re-render hook

You are implementing ONE task in the LM resource-page editor. Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). This is the resources engine: vanilla JS IIFEs, no framework, no bundler, GitHub Pages.

## What exists today (verified — trust this over guessing)

- `_engine/shared.js` renders each page and exposes `window.LM` (defined at `shared.js:749`). It has a **local** `make(tag, attrs, html)` at line 10.
- Edit registration is buffered:
  ```js
  // shared.js:409-433
  editModeState = { enabled: <bool>, fields: [], arrays: [] };
  function editModeRegisterField(el, path, opts) {
    if (!el) return el;
    editModeState.fields.push({ el, path, opts: opts||{} });
    if (editModeState.enabled && editModeIsLoaded() && window.__LM_EDIT_MODE_API)
      window.__LM_EDIT_MODE_API.attachField(el, path, opts||{});
    return el;
  }
  // editModeRegisterArray is symmetric, pushes to editModeState.arrays
  ```
  So when edit mode is ENABLED, any `registerField`/`registerArray` call **auto-attaches immediately** (it becomes click-editable at once). When not enabled, it just buffers and is flushed on mount.
- `window.LM.editMode` sub-object (shared.js:749+) already exposes `registerField: editModeRegisterField, registerArray: editModeRegisterArray`.
- `_engine/edit-mode.js` exposes `window.__LM_EDIT_MODE_API = { attachField, attachArray, mount }` at line 544. `window.__LM_EDIT_MODE_LOADED = true` at 543.
- Engines (checklist.js etc.) have an `init()` that calls `render(data, root)`. `window.__lm_data` holds the current data object (referenced in shared.js).

## Deliverable

### Part 1 — `makeField` / `makeFieldArray` on `window.LM` (shared.js)

Add these two functions inside the shared.js IIFE, near the other exported helpers (before the `window.LM = {...}` literal at 749):

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

Expose them on BOTH `window.LM.editMode` (the sub-object) AND top-level `window.LM` — so engines can call either `LM.makeField(...)` or `LM.editMode.makeField(...)`. Add `makeField: makeField, makeFieldArray: makeFieldArray,` in both places.

### Part 2 — `rerender()` (edit-mode.js) + buffer-clear (shared.js)

Goal: after an edit that changes structure (array add/remove, or an AI rewrite), re-run the active engine's `render()` so the new content shows WITHOUT a full page reload, and re-wire all editable fields.

Mechanics (important — this is why a naive re-render double-buffers):
- Re-running `render()` re-calls every `registerField`/`registerArray`, which **pushes again** onto `editModeState.fields/.arrays`. You MUST clear those buffers first, or they accumulate stale entries pointing at removed DOM nodes.
- Because edit mode is `enabled` during a live session, each re-pushed `registerField` **auto-attaches** on push (see the auto-attach branch above). So after clearing + re-rendering, fields are re-wired automatically. No separate flush pass is needed as long as `editModeState.enabled` is true at re-render time.

Implement:

1. In **shared.js**, add and export a helper on `window.LM.editMode`:
   ```js
   function editModeResetBuffers() {
     editModeState.fields.length = 0;
     editModeState.arrays.length = 0;
   }
   ```
   Expose as `resetBuffers: editModeResetBuffers` on `window.LM.editMode`. Also, in each engine's `init()` right after a successful `render(data, root)`, set a re-render thunk:
   `window.__lm_rerender = function(){ render(window.__lm_data, root); };`
   (Add this line to EVERY engine init that calls render: checklist, calculator, assessment, assessment-v2, architecture, ai-walkthrough, n8n-workflow, stack-picker, guide, swipe, landing, template. Grep for the `render(` call site in each engine's init and append the thunk assignment. If an engine's variable names differ, adapt — the thunk must call that engine's render with its current data + root.)

2. In **edit-mode.js**, add:
   ```js
   function rerender() {
     if (window.LM && window.LM.editMode && window.LM.editMode.resetBuffers)
       window.LM.editMode.resetBuffers();
     if (typeof window.__lm_rerender === "function") window.__lm_rerender();
   }
   ```
   Add `rerender: rerender` to the `window.__LM_EDIT_MODE_API` object literal at line 544.

## Constraints
- Zero behavior change when NOT in edit mode. `makeField`/`makeFieldArray` are purely additive; `rerender` is only called by later tasks.
- Do NOT hand-edit any `.min.js`. (Minify runs later in Phase E.)
- Match the existing code style (var, IIFE, function declarations, no arrow-fn in the shared/edit-mode files if they don't already use them — they use `function`).

## Verify
- `node -e "require('...')"` won't work (browser IIFE). Instead:
  1. `node --check _engine/shared.js && node --check _engine/edit-mode.js` — must pass (syntax).
  2. `node --check` each engine you touched.
  3. Grep-confirm: `grep -n "makeField" _engine/shared.js` shows the two fns + both exports; `grep -n "rerender" _engine/edit-mode.js` shows the fn + the API export; `grep -c "__lm_rerender" _engine/*.js` shows the thunk added to every engine init (~12) + the call in edit-mode.js.
- Report the exact grep counts in your report.

## Commit
`git add -A && git commit -m "feat(editor): makeField helper + rerender hook + per-engine rerender thunk"`

## Report
Write your full report to `.superpowers/sdd/task-A1-report.md` (status, files changed, the grep-count evidence, the commit hash, any concerns). Return only: status (DONE / DONE_WITH_CONCERNS / BLOCKED / NEEDS_CONTEXT), the commit hash, a one-line verify summary, and concerns.
