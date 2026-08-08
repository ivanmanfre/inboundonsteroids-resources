# Task B1 — footer + closing-CTA + nav editable (shared.js chrome)

Work in `~/Desktop/resources-page-editor-wt` (branch `feat/page-editor`). This task edits `_engine/shared.js` ONLY. shared.js chrome renders on EVERY resource page, so the #1 rule is: **when no `data.footer`/`data.nav`/`closing_cta` override exists, the rendered HTML must be CHARACTER-IDENTICAL to today.** You prove this by string-equality of the no-override branch, not by pixels.

## Registration rules (same as Phase A)
- `if (window.LM && window.LM.editMode) window.LM.editMode.registerField(el, "path", opts)` / `registerArray(...)`. Keep the guard.
- `opts`: `{multiline:true}`; `{contenteditable:true}` for nodes that render RAW HTML (so markup round-trips); `{locked:true}`; default plain.
- Register only where node textContent == stored value. Nodes that render raw HTML (may contain `<em>` etc.) → `{contenteditable:true}`, NOT plain.
- Registration is a no-op outside edit mode (gated in shared.js) — additive. Don't touch `.min.js`.

## Part 1 — `rebrandFooter()` renders from `data.footer` (refactor, HIGHEST RISK)
Current `rebrandFooter()` is at shared.js:706-742. It sets `footer.querySelector(".im-footer-cta").innerHTML` and `.im-footer-meta` to HARDCODED strings.

Refactor so each piece is sourced from an OPTIONAL `data.footer` (read `window.__lm_data && window.__lm_data.footer` into a local `f = footer_data || {}`), falling back to the EXACT current literal when absent:
```
var f = (window.__lm_data && window.__lm_data.footer) || {};
var fLabel   = f.label    || "Work with me";
var fHeading = f.heading_html || 'Ready to scale without <em>scaling payroll</em>?';
var fBody    = f.body     || 'See how I build Agent-Ready Ops systems that survive past pilot. 40+ live across eight industries. Book a free fit call.';
var fBtn     = f.cta_label|| 'Book the free fit call';
```
Then build the SAME innerHTML using these vars in place of the literals (keep `callUrl("footer")` for href, keep `data-footer-cta`, keep the beacon click handler exactly). Because each `||` yields the current literal when `data.footer` is undefined, the assembled innerHTML is byte-identical for a no-override page. AFTER setting innerHTML, querySelector each node and register:
- `.im-footer-label` → `registerField(el, "footer.label")` (plain)
- `.im-footer-h` → `registerField(el, "footer.heading_html", { contenteditable: true })` (renders raw HTML with `<em>`)
- `.im-footer-p` → `registerField(el, "footer.body", { multiline: true })` (plain — it's plain text today)
- `.im-footer-btn` → `registerField(el, "footer.cta_label")` (plain; register the LABEL only, never the href)
- meta: leave the `© YEAR Iván Manfredi` + `ivanmanfredi.com` line as-is OR source from `f.meta_left`/`f.meta_right` with the same fallback pattern and register them (plain). Your call — but if you touch meta, prove byte-identity the same way (note: the year uses `new Date().getFullYear()` — keep that; do NOT hardcode a year).

**PROVE byte-identity:** in your report, show that for `data.footer === undefined`, each `||` resolves to the exact current literal, so the concatenated innerHTML string equals the pre-refactor string character-for-character. Quote the before and after assembled string for the no-override case and confirm equality.

## Part 2 — `buildClosingCta()` register overridable fields (additive, LOW RISK — like Phase A)
`buildClosingCta` (shared.js:335-389) already reads overrides from `data.closing_cta` (`over`): `headline_html`, `body`, `bullets[]`, `email_lead`. It builds innerHTML then the engine appends the section. Do NOT refactor it — just, after the `sec.innerHTML = ...` assignment, querySelector and register:
- `.lmc-closing-h` → `registerField(el, "closing_cta.headline_html", { contenteditable: true })` (raw HTML)
- `.lmc-closing-p` (the FIRST one, the body) → `registerField(el, "closing_cta.body", { multiline: true })`. NOTE there are multiple `.lmc-closing-p` nodes — target the body one specifically (it's the first `.lmc-closing-p`, filled by `esc(body)`). The second `.lmc-closing-p` is a hardcoded book-call literal — do NOT register it.
- `.lmc-closing-points` (the `<ul>`) → `registerArray(el, "closing_cta.bullets", { itemLabel: "point" })`, and per-`<li>` → `registerField(li, "closing_cta.bullets[" + i + "]")` (plain). Match the A5 array+per-item precedent.
- `.lmc-closing-email-p` → `registerField(el, "closing_cta.email_lead", { multiline: true })`.
- Do NOT register: the `.lmc-closing-label`, `.lmc-closing-lead`, the second book-call `.lmc-closing-p`, `.lmc-closing-sign`, `.lmc-closing-byline` — all hardcoded literals with no data path.
- These fields fall back to `CLOSING_COPY[format]` constants when no override; registering against `closing_cta.*` means a first edit CREATES the override key — that's the intended customization behavior (same fallback-creates-key pattern used elsewhere in this codebase).

## Part 3 — nav (`.im-nav`) — VERIFY VISIBILITY FIRST, then maybe register
The plan wants nav logo + CTA editable. BUT shared.js has a comment (~line 865) suggesting `.im-nav` is HIDDEN on LM pages. **First determine whether `.im-nav` actually renders visibly on a resource page** (grep shared.js + a real slug index.html for `.im-nav`; check if it's display:none'd or removed). 
- If nav is HIDDEN or absent on resource pages → SKIP nav entirely and document why (editing a hidden element is pointless). This is an acceptable outcome.
- If nav IS visible and data-derived → add a `renderEditableNav()` that reads `window.__lm_data.nav` with fallbacks (byte-identical when absent) and registers `.im-nav` logo name + CTA label against `nav.logo_name` / `nav.cta_label`. Call it right after `rebrandFooter()` in the init sequence.

## Out of scope (do NOT do here — noted for a later task)
- Do NOT touch `rerender()` / `edit-mode.js`. (There's a known follow-up: rerender must re-apply footer/nav registration + sync data — that's a C2/D1 concern, not B1.)

## Verify
1. `node --check _engine/shared.js`.
2. Byte-identity proof for the footer no-override case (Part 1) — REQUIRED in the report.
3. List all registered paths + the nav decision (skipped/registered + why).
4. Guard on every call. No `.min.js`.

## Commit
`git add _engine/shared.js && git commit -m "feat(editor): editable footer + closing-cta from data (byte-identical fallback) + nav decision"`

## Report
Write to `.superpowers/sdd/task-B1-report.md`. Return: status, commit hash, one-line verify summary, the footer byte-identity confirmation, the nav decision, concerns.
