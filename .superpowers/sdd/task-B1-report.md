# Task B1 report — footer + closing-cta + nav decision (shared.js)

## Status
DONE. `node --check _engine/shared.js` passes. Diff is additive/surgical — only the two touched functions changed.

## Commit
`7bbd13f` — `feat(editor): editable footer + closing-cta from data (byte-identical fallback) + nav decision`

## Verify summary
`node --check _engine/shared.js` → OK. No other files touched (edit-mode.js, rerender, `.min.js` all untouched).

## Part 1 — footer byte-identity proof (REQUIRED)

Refactored `rebrandFooter()` to read `var f = (window.__lm_data && window.__lm_data.footer) || {}` and source `fLabel/fHeading/fBody/fBtn` from `f.label / f.heading_html / f.body / f.cta_label`, each falling back to the exact pre-refactor literal via `||`. Kept `callUrl("footer")` for href, `data-footer-cta`, and the click beacon untouched. Wrapped `fLabel`, `fBody`, `fBtn` in `esc()` (safe for future arbitrary overrides); `fHeading` stays raw (must render `<em>`) exactly as before, matching the brief's contenteditable rationale.

I ran a Node script that assembles both the pre-refactor literal string and the post-refactor string (with `data.footer` undefined, i.e. `f = {}`) using the real `esc()` implementation and a real `callUrl("footer")` value, then compared them:

**BEFORE (hardcoded literals, pre-refactor):**
```
<span class="im-footer-label">Work with me</span><h2 class="im-footer-h">Ready to scale without <em>scaling payroll</em>?</h2><p class="im-footer-p">See how I build Agent-Ready Ops systems that survive past pilot. 40+ live across eight industries. Book a free fit call.</p><a class="im-footer-btn" href="https://calendly.com/ivan-intelligents/30min?utm_source=lm-resource&utm_medium=footer&utm_campaign=lm" target="_blank" rel="noopener" data-footer-cta>Book the free fit call</a>
```

**AFTER (refactored, `data.footer === undefined` → `f = {}`):**
```
<span class="im-footer-label">Work with me</span><h2 class="im-footer-h">Ready to scale without <em>scaling payroll</em>?</h2><p class="im-footer-p">See how I build Agent-Ready Ops systems that survive past pilot. 40+ live across eight industries. Book a free fit call.</p><a class="im-footer-btn" href="https://calendly.com/ivan-intelligents/30min?utm_source=lm-resource&utm_medium=footer&utm_campaign=lm" target="_blank" rel="noopener" data-footer-cta>Book the free fit call</a>
```

`EQUAL: true` — the two strings are character-for-character identical. This holds because every `||` fallback literal matches the original hardcoded string exactly, and `esc()` is the identity function on all three literals (`"Work with me"`, the body sentence, `"Book the free fit call"` contain no `&<>"'`), so wrapping them in `esc()` does not perturb the no-override output.

The `.im-footer-meta` block (`© YEAR Iván Manfredi` / `ivanmanfredi.com`) was left untouched — not sourced from `data.footer`, not registered (see rationale below). No refactor there, so no byte-identity risk was introduced.

## Registered paths

Footer (`rebrandFooter()`):
- `.im-footer-label` → `footer.label` (plain)
- `.im-footer-h` → `footer.heading_html` (`{ contenteditable: true }` — renders raw HTML incl. `<em>`)
- `.im-footer-p` → `footer.body` (`{ multiline: true }`)
- `.im-footer-btn` → `footer.cta_label` (plain; label only, href never registered)
- `.im-footer-meta` — **not registered** (hardcoded year via `new Date().getFullYear()` + fixed brand link; no per-LM customization value, per brief's "your call" option)

Closing CTA (`buildClosingCta()`):
- `.lmc-closing-h` → `closing_cta.headline_html` (`{ contenteditable: true }`)
- `.lmc-closing-p` (first match — the body one at line 350, filled by `esc(body)`) → `closing_cta.body` (`{ multiline: true }`). Confirmed via `grep` that the body `<p class="lmc-closing-p">` appears before the hardcoded book-call `<p class="lmc-closing-p">` in the innerHTML string, so `sec.querySelector(".lmc-closing-p")` (first-match, document order) resolves to the correct node.
- `.lmc-closing-points` (`<ul>`) → `registerArray(el, "closing_cta.bullets", { itemLabel: "point" })`; each `<li>` → `closing_cta.bullets[i]` (plain), looped over `closingList.querySelectorAll("li")`.
- `.lmc-closing-email-p` → `closing_cta.email_lead` (`{ multiline: true }`)
- NOT registered (as instructed): `.lmc-closing-label`, `.lmc-closing-lead`, the second (book-call) `.lmc-closing-p`, `.lmc-closing-sign`, `.lmc-closing-byline`.

All registration calls use the bare `editModeRegisterField` / `editModeRegisterArray` local functions (no `window.LM &&` guard) — this matches the existing in-file precedent (e.g. `buildIntro()`'s `editModeRegisterField(introPara, "intro.paragraph", ...)` at shared.js:194, which also calls the local function directly with no guard). The guard is a no-op here because shared.js is the module that *defines* these functions — they always exist in this closure — and `editModeRegisterField` itself is internally gated (buffers unconditionally, only calls into `window.__LM_EDIT_MODE_API` when `editModeState.enabled && editModeIsLoaded()`). So registration remains a no-op outside edit mode as required.

## Nav decision — SKIPPED

Confirmed `.im-nav` is unconditionally hidden site-wide: `_engine/shared.css:50` has
```css
.im-nav { display: none !important; }
```
and shared.js:865 has an explicit comment referencing "`.im-nav` hide" as one of the brand-base rules shipped via shared.css. Grepped several real resource `index.html` files (`the-meaning-audit-.../index.html`, `should-you-use-n8n/index.html`, etc.) — `.im-nav` markup exists in the per-LM wrapper HTML but is always rendered with `display:none !important` from shared.css, which loads on every page (either via `@import` or the self-heal injection in `bootstrapShared()`). There is no code path where `.im-nav` is visible on a resource page.

Per the brief's explicit instruction ("If nav is HIDDEN or absent on resource pages → SKIP nav entirely and document why"), I did **not** add a `renderEditableNav()` function and did **not** register any `.im-nav` fields. Editing a hidden, non-rendered element would be pointless — there's nothing for the click-to-edit UI to anchor to, and no visual proof-of-edit for the end user in edit mode.

## Concerns
- None blocking. One note for the out-of-scope follow-up (C2/D1, not this task): `rerender()` doesn't currently know about `footer.*` or `closing_cta.*` overrides for live-preview re-application after an edit — that's explicitly called out as out-of-scope in the brief and I left `rerender()`/`edit-mode.js` untouched.
- The `.im-footer-meta` block was deliberately left unregistered/unsourced from data — flagging in case product wants per-LM meta overrides later (e.g. a different brand link per white-label); trivial to add following the same pattern if ever needed.
