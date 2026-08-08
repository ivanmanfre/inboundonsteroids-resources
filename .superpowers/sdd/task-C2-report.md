# Task C2 report — "✨ Rewrite" AI proposal loop

**Status:** complete
**Commit:** `5708b4f` — "feat(editor): AI rewrite proposal loop (Keep/Try again) with in-place apply"
**Files:** `_engine/edit-mode.js` (+225/-1), `_engine/edit-mode.css` (+177)

## Verify

1. `node --check _engine/edit-mode.js` → OK.
2. No playwright smoke run (per brief's fallback: rely on static trace + node --check — no demo server was set up in this worktree).

## Design choice: single floating chip, not a per-field wrapper

The brief allowed either "absolutely positioned relative to a wrapper" or "a floating chip that follows hover." I went with the floating singleton chip, for one concrete reason: `attachField`'s existing `commit()`/blur logic reads `el.textContent` / `el.innerHTML` back into `state.data` as the source of truth. If the ✨ button were a DOM child of `el` (the natural way to do "absolutely positioned relative to a wrapper" without introducing a new wrapper element), its own text/markup would leak into whatever gets saved. Wrapping `el` in a new parent avoids that but risks breaking engine assumptions about `el`'s parent chain. A single `position: fixed` chip (`_engine/edit-mode.js:186-231`, `.lme-ai-chip` in edit-mode.css) is repositioned via `getBoundingClientRect()` on hover/focus and never touches `el`'s subtree, so it's structurally inert with respect to save-path correctness.

`[data-lme-field] { position: relative; }` already exists in the CSS for other reasons, so no positioning-context change was needed on `el` itself.

## Static flow trace

- **Attach:** `wireAiAffordance(el, path, opts)` is called from both `attachField` branches — once before the contenteditable branch's `return` (`edit-mode.js:428`), once at the end of the plain-field branch (`edit-mode.js:439`). It bails immediately if `opts.locked` or if `el.getAttribute("data-lme-ai") === "1"` (double-attach guard), otherwise sets the flag and wires `mouseenter`/`focus` (show, gated on `!el.hasAttribute("data-lme-field-editing")`) and `mouseleave`/`blur` (schedule-hide, 180ms grace so moving onto the chip itself doesn't hide it).
- **Locked fields:** never see the chip — `wireAiAffordance` returns before attaching any listener.
- **Fields mid-edit:** the contenteditable `focus` handler and `enterEditField` (plain fields) both now call `hideAiChipNow()` in addition to setting `data-lme-field-editing`, so a chip already visible from a pre-click hover can't linger over a field that's just been swapped to an `<input>`/`<textarea>` or is actively being typed into directly.
- **Click ✨:** `stopPropagation()` + `preventDefault()` fire (brief-mandated, though structurally redundant here since the chip isn't inside `el`'s subtree so no click ever bubbles into `el`'s own listener regardless). Opens `openAiPanel(el, path, opts)`.
- **openAiPanel:** captures `original = isHtml ? el.innerHTML : el.textContent` **once**, into a closure variable never reassigned. Renders `showPrompt()` first — free-text input + 4 preset chips (Punchier/Shorter/More specific/In my voice) + Rewrite/Cancel. Esc, backdrop click, X, and Cancel all call the same `close()` — no mutation on any of those paths, confirmed by reading every caller of `close()` in the function: none touch `el` or `state.data`.
- **Submit → loading:** `submit(instruction)` calls `showLoading()` (replaces panel body with spinner + "Rewriting…", which also removes the previous buttons entirely — no separate disable step needed since there's nothing left to click). POSTs `{ text: original, instruction, context: (state.data && state.data.title) || "" }` to `REWRITE_URL`.
- **Non-200 / missing `rewritten`:** shows an error toast and calls `showPrompt()` again (instruction preserved via `lastInstruction`) — original still untouched, matches "keep the original."
- **Success → proposal:** `showProposal(rewritten)` renders "Now" (from the closured `original`) and "Proposed" (from `rewritten`), each as sanitized-HTML preview if `isHtml` else as `textContent`. Three buttons: Cancel (→ `close()`, no mutation), Try again (→ `showPrompt()`, `original` untouched, `lastInstruction` re-populates the input), Keep.
- **Keep is the only mutation path in this entire panel.** It's a single handler: for contenteditable, `sanitizeHtml(rewritten)` → `el.innerHTML` and `setByPath(state.data, path, clean)`; otherwise `el.textContent = rewritten` and `setByPath(state.data, path, rewritten)` — same value goes into the DOM and into `state.data`, matching the existing inline-edit `commit()` pattern. Then `markDirty()`, `close()`, `showToast("Rewrite applied · Publish to go live")`. No `rerender()` call anywhere in this feature — confirmed by grep, `rerender` is not referenced in the new code at all.
- **Post-close guard:** a `closed` flag is checked at the top of both the success and error branches of the fetch `.then`/`.catch`, so if the user dismisses the panel while a rewrite request is still in flight, the panel doesn't materialize into a detached DOM node or spuriously toast after the user already walked away.
- **Scoping:** every new class is `lme-ai-*` or `lme-ai-chip*`, all defined only in `edit-mode.css`, which per its own header comment is "only loaded when `?edit=<token>` in URL" — so none of this can appear on a published page. Confirmed via grep: no new class name added without the `lme-ai-` prefix.

## Concerns

- Chip reposition-on-scroll uses a capture-phase `window` scroll listener that recomputes position only while a chip is currently visible; this is untested against deeply nested scroll containers on the actual live pages (no demo server available in this worktree to smoke it).
- Did not add a rate-limit / in-flight-request guard beyond the single global panel instance (opening a new field's panel while another is loading isn't currently prevented, though each panel closes over its own `closed`/`original`/`el` so two open panels wouldn't cross-contaminate each other's state — just visually stack, which is an edge case a real user is unlikely to hit given the modal backdrop).
- Not live-verified against the deployed `lm-copy-rewrite` endpoint from a real browser session (Task C1 already confirmed the endpoint is live via curl; this task only implements the client).
