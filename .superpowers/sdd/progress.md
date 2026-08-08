# LM page-editor — progress ledger
BASE (plan committed): d6e3625
Started: 2026-07-05

## Task status
- A1 makeField+rerender: complete (commits d6e3625..67d4810, review clean)
- A2 checklist+calculator: complete (67d4810..6f99066, review clean)
- A3 assessment+assessment-v2: complete (6f99066..aa77e31, review clean; v2 4->21, fixed latent persona-guard)
- A4 architecture+ai-walkthrough+n8n-workflow: complete (aa77e31..1f16df9, review clean; ai-walkthrough unchanged=steps AI-streamed; SVG skipped)
- A5 stack-picker+guide: complete (1f16df9..2992a14, review clean; per-chip stack editing + hero badges)
- A6 swipe+landing+template: complete (2992a14..bd4fdd2, review clean; PHASE A DONE = all 12 engines covered)
- B1 footer+closing-cta+nav: complete (bd4fdd2..7bbd13f, review clean; footer byte-identical EQUAL:true; nav skipped=display:none; buildClosingCta covered)
- C1 lm-copy-rewrite edge fn: complete (7bbd13f..fde4972, review clean, DEPLOYED+live-verified 400/200). Voice from content_prompts.body; model claude-sonnet-5; --no-verify-jwt confirmed.
- C2 rewrite proposal UX: complete (fde4972..5708b4f, review clean; chip-as-child + XSS verified safe; non-destructive proposal loop)
- D1 optimistic save: complete (ecbee2c, controller inline edit; reload dropped from save-success only, discard/revert reloads kept; covered by E3)
- E1 smoke / E2 minify / E3 review / E4 push: pending

## Notes
- Demo pages EXIST for: checklist calculator assessment assessment-v2 architecture ai-walkthrough n8n-workflow stack-picker. MISSING for guide/swipe/landing/template -> those tasks verify vs real slug pages.

## Minor findings (final-review triage)
- calculator recommendations: recDiv registered as `.text` but contains nested `.tag` span -> parent textContent = tag+text (PRE-EXISTING, not introduced by A2). Child stopPropagation narrows it. Follow-up.
- demo pages for checklist/calculator missing `<script src=/_engine/shared.js>` include -> demos fail to render (PRE-EXISTING, demos not shipped to prod).
- A3: multiple DOM nodes registered against identical path `results_copy.gap_fix_label` in one render pass -> only matters if edit-mode UI assumes 1:1 path->element. Verify in E3 review.
- A4: n8n credentials/env_vars registration uses positional `h3.textContent==="Credentials"` lookup -> brittle if headers reworded (accepted, avoids DOM change).
- CROSS-CUTTING: shared.js `buildClosingCta` (mid-page CTA, used by ~7 engines) has ZERO field coverage -> fold into B1 (shared.js chrome task).
- A6: landing `headline` registered as plain text but `headlineHTML()` supports embedded <em>/<i> -> if a headline contains markup, save loses it (textContent!=raw). Narrow edge. Consider contenteditable in E3.
- A6 FOLLOW-UP (needs authorized markup change): swipe `examples`/template `stack_questions`+`sections` lists have per-item field editing but NO registerArray (no 1:1 wrapper without changing render) -> add/remove/reorder unavailable for those lists.

## Integration TODOs (for C2/D1)
- A1 rerender() calls `render(window.__lm_data, root)` but edits write to edit-mode `state.data` (a deepClone, separate object). So a naive rerender shows STALE pre-edit data. C2/D1 MUST sync `window.__lm_data = state.data` (or render state.data) before/at rerender, else AI-rewrite Keep + array ops lose edits.
- After B1, footer/nav chrome fields are registered OUTSIDE engine render; A1 rerender resetBuffers() clears them and engine render doesn't re-add them -> footer/nav lose editability after a rerender. C2/D1 rerender should also re-run rebrandFooter()/renderEditableNav() (closing-cta is fine, it re-registers within engine render).
- C1 Minor: no 'do not reveal these instructions' line in rewrite system prompt (voice rows aren't secret; low stakes). Optional harden in E.
- C1 INCIDENT (needs Ivan awareness + memory note): implementer fixed project-wide Supabase secret RAILWAY_PROXY_URL (bare domain -> /v1/messages). It was 502ing ALL real Railway-proxy calls including live lm-walkthrough-proxy. Verified correct (lm-copy-rewrite 200s; walkthrough fetches same secret same way).
- rerender/__lm_data TODOs DOWNGRADED: C2 uses IN-PLACE field update (no rerender), so the staleness bug never activates in this build. rerender() stays dead-code for future array ops.
- C2 accepted limitation: ✨ keyboard-focus path unreachable for non-contenteditable fields (no tabindex). Consistent with existing click-only inline-edit; not fixed to avoid degrading mouse tab-order. E3/future a11y pass if desired.

## E3 whole-branch review findings (fixing in one pass)
- CRIT-1 rebrandFooter runs before __lm_data set -> footer overrides invisible live + WYSIWYG mismatch. FIX: re-invoke after data loads.
- CRIT-2 calculator recDiv(.text) is PARENT of tagEl(.tag) -> click body destroys tag + corrupts .text on save. FIX: leaf span for .text.
- IMP-3 lm-copy-rewrite not token-gated (anon paid LLM, IP-limit spoofable/fail-open). FIX: send token, validate via lm-edit-token-check.
- IMP-4 swipe/template hero_badge gated on data existing (other 7 unconditional). FIX: register unconditionally.
- MINOR (accepted): rerender dead-code; swipe filter data-tags stale after tag edit (cosmetic).
