# Task C2 — "✨ Rewrite" AI proposal UX in edit-mode

Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). Modify `_engine/edit-mode.js` + `_engine/edit-mode.css`. This is the CLIENT-FACING feature: a non-technical operator hovers any editable text, clicks ✨, asks for a rewrite ("punchier", "shorter", "in my voice"), and gets a PROPOSAL they can Keep or reject. Never overwrite silently.

## Existing helpers you'll use (verified line refs in edit-mode.js)
- `attachField(el, path, opts)` @178 — where each registered field is wired. `opts.locked`, `opts.contenteditable`, `opts.multiline` exist. **This is where you add the ✨ affordance.**
- `setByPath(obj, path, value)` @55 — write into `state.data`.
- `markDirty()` @72 — flags unsaved + updates toolbar.
- `showToast(msg, isError)` @76.
- `sanitizeHtml(html)` @162 — for contenteditable/HTML fields.
- `state.data` — the edited data object (a clone; edits accumulate here, PUT on save).
- `make(tag, attrs, text)` — DOM helper (already imported at top of edit-mode.js).

## Endpoint
`const REWRITE_URL = "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-copy-rewrite";`
`POST { text, instruction, context? }` → `{ rewritten }` (deployed, live). On non-200 or missing `rewritten`, show an error toast and keep the original.

## Behavior spec

### 1. The ✨ affordance (in `attachField`)
- For every registered field that is NOT `opts.locked`, add a small "✨" button that appears on hover (and on focus for keyboard). Position it unobtrusively at the field's top-right corner (absolutely positioned relative to a wrapper, OR a floating chip that follows hover — your call, but it must NOT shift layout / must NOT appear on the published page, only in edit mode, and must NOT overlap the click-to-edit affordance confusingly).
- Guard against double-attaching: `attachField` can run more than once for the same element across re-renders — check a `data-lme-ai="1"` flag and bail if already wired.
- Clicking ✨ must `stopPropagation()` so it does not trigger the inline text editor.
- Do NOT add ✨ to locked fields or to fields currently being inline-edited.

### 2. The prompt step
- Clicking ✨ opens a small input UI (a popover near the field or a compact centered panel): a text input with placeholder `e.g. punchier, shorter, more specific, in my voice` PLUS 3-4 one-click preset chips: **Punchier**, **Shorter**, **More specific**, **In my voice** (clicking a chip = submit with that instruction). An explicit "Rewrite" submit button for the free-text input. A cancel/close (X or Esc).
- The `text` sent = for a `contenteditable` field, `el.innerHTML`; otherwise `el.textContent`. Pass `context: (state.data && state.data.title) || ""` for tone.

### 3. Loading → PROPOSAL panel (the core UX)
- On submit, show a loading state ("Rewriting…" with a subtle spinner; disable buttons).
- On success, show a PROPOSAL panel with TWO clearly-labelled blocks:
  - **Now** (the current/original text) and **Proposed** (the `rewritten`). Render proposed as text (or as sanitized HTML preview if the field is contenteditable).
  - Three actions: **Keep** (primary), **Try again** (re-opens the prompt step, preserving the original — lets them refine the instruction), **Cancel** (discard, close, original untouched).
- NEVER mutate the field or `state.data` until the user clicks **Keep**. This is the non-destructive proposal loop (same lesson as the image editor).

### 4. Keep (apply IN PLACE — do NOT call rerender())
- For a `contenteditable`/HTML field: `el.innerHTML = sanitizeHtml(rewritten)`.
- Otherwise: `el.textContent = rewritten`.
- Then `setByPath(state.data, path, keptValueThatMatchesWhatYouPutInTheDOM)` — for contenteditable store the sanitized HTML, for plain store the plain string, so the DOM and the data stay in sync exactly as the existing inline-edit `commit()` does (@230-237).
- `markDirty()`. Close the panel. Optional: `showToast("Rewrite applied · Publish to go live")`.
- (Deliberately in-place, NOT a full re-render — a single field update needs no rerender, and this avoids any stale-data path.)

## CSS (edit-mode.css) — match the existing edit-mode look
- The editor theme is warm-paper + sage green accent `#4C6E3D` (see existing `.lme-*` rules, e.g. `.lme-field-contenteditable`, `.lme-toolbar`). Reuse those tokens/colors. Radius ~4px like the rest of edit-mode. Soft, unobtrusive.
- The ✨ button: tiny, sage-tinted, low-opacity until hover. The proposal panel: a clean card with clear "Now"/"Proposed" labels, readable, keyboard-dismissable, `prefers-reduced-motion` respected on any spinner.
- Everything must be scoped under edit-mode classes so it can NEVER affect the published (non-edit) page.
- COPY RULES (Ivan's anti-slop voice): the UI microcopy must have ZERO em dashes, no "not X but Y", no corrective-contrast, no banned filler. Keep labels plain: "Rewrite", "Punchier", "Keep", "Try again", "Cancel", "Now", "Proposed", "Rewriting…". That's it.

## Verify
1. `node --check _engine/edit-mode.js`.
2. Static self-check in report: trace the flow — ✨ click → prompt → POST → proposal → Keep applies in place + setByPath + markDirty; Try again preserves original; Cancel = no mutation. Confirm no code path writes to state.data before Keep. Confirm ✨ is skipped for locked fields and double-attach-guarded. Confirm all new UI is scoped under `.lme-*` (or a new `lme-ai-*` prefix) so published pages are unaffected.
3. Playwright optional (demo include bug). If you CAN serve a demo + a valid edit token you may smoke it, else rely on the static trace + node --check.

## Commit
`git add _engine/edit-mode.js _engine/edit-mode.css && git commit -m "feat(editor): AI rewrite proposal loop (Keep/Try again) with in-place apply"`

## Report
Write to `.superpowers/sdd/task-C2-report.md`. Return: status, commit hash, one-line verify summary, concerns.
