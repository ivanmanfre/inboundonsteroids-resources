# Task A4 report — architecture + ai-walkthrough + n8n-workflow coverage

Status: DONE. Commit: `1f16df9` — "feat(editor): architecture+ai-walkthrough+n8n-workflow field coverage (skip SVG text)"

Verify: `node --check` passed on all three files. No Playwright run (fell back to path-match + node --check per brief's fallback allowance). Path-match audit below confirms every registered path against each engine's demo `data.json`.

## architecture.js — registered paths after change

1. `title` — hero h1 (renderHero) — unchanged
2. `subtitle` — hero sub (renderHero) — unchanged
3. `diagram.nodes[i].panel.headline` — drawer headline (openDrawerForNode) — unchanged
4. `diagram.nodes[i].panel.body_html` — drawer body, `{multiline:true}` (openDrawerForNode) — unchanged
5. **NEW** `diagram.nodes[i].label` — mobile-list card `.m-label` (renderMobileList), only when `n.label` is truthy
6. **NEW** `diagram.nodes[i].panel.headline` — mobile-list card `.m-hint` (renderMobileList), only when `n.panel.headline` is truthy — **duplicate path**, same field as #3, registered on the HTML mobile-list twin. Flagging per brief instruction: acceptable, two DOM elements → one field.

All 6 paths verified present in `_engine/demo/architecture/data.json` (12 nodes, each with `label`, `panel.headline`, `panel.body_html`).

Skipped, with reason:
- **SVG diagram node label text** (`renderSvg`@411, `<text class="lma-node-label">`) — lives inside `<svg>` (built via `svgEl`/`createElementNS`). Cannot host an inline `<input>`. This is exactly why the HTML mobile-list twin (`.m-label`) was registered instead, per the brief's CRITICAL rule.
- **SVG region labels** (`renderSvg`, `.lma-region-label`) — also `createElementNS("text")`, inside `<svg>`. No HTML twin exists anywhere for these ("Generation pipeline" / "Re-engagement loop") — literal JS strings, not data-derived anyway. Skip.
- **SVG edge labels** (`renderSvg`, `.lma-edge-label`) — same, inside `<svg>`, and text is `e.label` (edge label) which has no HTML twin. Skip (SVG-only, not inline-editable, and out of the brief's requested scope which was node labels/panels).
- Hero badge ("System diagram") — literal JS string in `renderHero`, not read from `data.json` at all. Not data-derived → skip.
- Hero meta chips (node count / connection count / "Click any node") — computed counts + literal strings, decorated. Skip.
- Legend items (`renderLegend`) — hardcoded 5-item JS array (`trigger/transform/decision/storage/output`), not read from `data.json` anywhere. Not data-derived → skip.
- `.m-type` node-type chip in mobile list — `(n.type || "transform").toUpperCase()`, decorated (uppercased) and explicitly called out in the brief as a locked/skip field (node type). Skip.
- Mobile-list fallback to `n.id` when `n.label` is falsy — textContent would show the id, not the label; guarded out by the `if (n.label)` check above so we never register a mismatched path.
- Drawer CTA (`cta.textContent = ctaDef.button || ctaDef.headline || "Talk it through"`) and floating CTA (`refreshFloatingCta`, built via `innerHTML` string) — both select from `data.ctas[]` **dynamically** via `pickCta(data, ctx)` based on runtime view-count context, so the resolved array index isn't stable, and the button/headline fallback is ambiguous (can't tell which field textContent maps to). Checked precedent: no engine in this codebase (`stack-picker.js`'s `pickCta` included) registers a dynamically-picked `ctas[]` entry — only `assessment.js`'s singular fixed `data.cta` object gets registered. Skipped, consistent with that precedent.
- Node IDs / computed x,y positions — explicitly locked/skip per brief.

## ai-walkthrough.js — registered paths (no changes made)

Existing 5 registrations, unchanged:
1. `brand.hero_badge` (badgeEl)
2. `title` (titleEl)
3. `subtitle` (subEl, conditional)
4. `input.placeholder` (hidden proxy span)
5. `system_prompt_clickup_page_id` (hidden proxy div)

No new registrations added. Investigated every "Add" candidate in the brief and none were safe/valid additions:
- **`steps[i].label`/`.description` (renderStepRow)** — the brief assumed a static `steps[]` array in `data.json`. Checked `_engine/demo/ai-walkthrough/data.json`: **there is no `steps` field at all.** Steps are parsed live, per-run, from Claude's streamed SSE response (`extractCompletedSteps`) — `s.step`/`s.reasoning`/`s.tools` are 100% runtime AI output, never stored/authorable content. Registering these would attach edit-mode metadata to elements that are destroyed and rebuilt on every re-run (`host.__skeletoned = false` on each `runAnalysis` call wipes and rebuilds `#lmw-steps`), leaking stale entries into `editModeState.fields` indefinitely (no unregister API exists) and offering no coherent "edit this" UX since the content isn't canonical copy. Same category of exclusion the brief already applies to the skeleton ("loading placeholder, not data — skip"); extended that same reasoning to the populated rows.
- **`render.verdict_labels.{automate_now,automate_later,keep_human}`** (data-derived — 3 real static strings in `data.json`) — these DO exist in `data.json`, but the only DOM node that renders them is the per-step pill inside `renderStepRow`, keyed dynamically by `s.verdict` (which step gets which label is a runtime AI decision, not a fixed index), and that pill element is torn down/rebuilt on every run same as above. No stable, non-ephemeral place in the current markup renders these labels. Skipped — flagging as a legitimate but currently un-registerable static field (would need a persistent settings/legend surface to expose safely, which doesn't exist today).
- Output-section copy (`#lmw-summary`) — `parsed.summary`, live-streamed AI text, not stored copy. Skip.
- Quick-wins heading ("Top 3 quick wins") — literal JS string, not data-derived. Skip.
- CTA copy (`paintCta`) — same dynamic `pickCta(data.ctas, ctx)` runtime-selection problem as architecture.js's CTAs. No precedent anywhere in the codebase registers a dynamically-picked `ctas[]` entry. Skip.
- `metaRow` hint ("Min X · Max Y") — concatenation of `data.input.min_steps`/`max_steps` with literal separators; decorated, textContent ≠ raw stored value. Skip.
- `runBtn`/gate-modal copy ("Run analysis", "One more run is on me", etc.) — hardcoded JS literals, not from `data.json`. Skip.

Net result: ai-walkthrough.js's coverage was already complete for all genuinely stored/authorable fields; the file is unmodified.

## n8n-workflow.js — registered paths after change

1. `title` — hero h1 — unchanged
2. `subtitle` — hero sub — unchanged
3. `what_it_does` — `{contenteditable:true}` — unchanged
4. `sections[i].title` — unchanged
5. `sections[i].html` — `{contenteditable:true}` — unchanged
6. `sections` array — `registerArray` — unchanged
7. **NEW** `brand.hero_badge` — `.lmc-badge` (built by shared `L.buildHero`, queried by class after the call, same pattern the file already used for `.lmc-h1`/`.lmc-sub`)
8. **NEW** `credentials_required[i]` — each `<li>` in the "Credentials" setup list, resolved positionally (`h3.textContent === "Credentials"` → `nextElementSibling` `<ul>` → its `<li>`s) so no new classes/attrs were added to keep rendered DOM byte-identical outside edit mode
9. **NEW** `env_vars[i]` — each `<code>` inside the "Env vars" setup list `<li>`s, same positional lookup
10. **NEW** `ctas[0].headline` — closing CTA `<h2>`, only when `cta.headline` is truthy (guards against the `"Want this customized?"` fallback literal)
11. **NEW** `ctas[0].button` — closing CTA `<a>`, only when `cta.button` is truthy (guards against the `"Talk to me"` fallback literal)

All new paths verified present in `_engine/demo/n8n-workflow/data.json`: `brand.hero_badge` = "n8n Workflow", `credentials_required` = ["Demo API"], `env_vars` = ["DEMO_TOKEN"], `ctas[0].headline` = "Want one built for you?", `ctas[0].button` = "Talk to me".

Note on `ctas[0]` vs architecture/ai-walkthrough's CTA: this one WAS safe to register, unlike the other two engines' CTA copy, because n8n-workflow.js's closing CTA is a **fixed** `data.ctas[0]` render (only checked once, no `pickCta`/runtime context selection) — a stable single element per render, not a dynamically-reselected one.

Skipped, with reason:
- Download button ("↓ Download workflow JSON") / copy button ("Copy to clipboard") — hardcoded JS literals, not data-derived. Skip.
- Hero meta chips (node/credential counts, setup minutes) — computed + decorated strings. Skip.
- `.lmw-download-note` paragraph (node count + joined credentials list) — decorated/computed concatenation. Skip.
- Mermaid diagram loading text / fallback messages — not data, runtime/library-driven. Skip.
- `workflow_file` — only ever used as an href/fetch target attribute, never rendered as visible text. Skip (not a text node).
- The `else` branch's `L.buildClosingCta("n8n_workflow", data, {...})` (used when `data.ctas[0].url` is absent) — this shared component (`shared.js`) builds its entire markup via one `innerHTML` string assignment with no `registerField` calls inside it at all. This is a **pre-existing, codebase-wide gap**: no engine that uses `buildClosingCta` (guide.js, checklist.js, calculator.js, template.js, swipe.js, stack-picker.js, n8n-workflow.js) registers `closing_cta.headline_html`/`.body`/`.bullets`/`.email_lead`. Fixing it means editing `shared.js`, which is out of scope for this task (only `architecture.js`/`ai-walkthrough.js`/`n8n-workflow.js` were in scope, and `shared.js` is consumed by every engine, not just these three). Flagging for a future task if closing-CTA coverage is wanted.
- Mermaid diagram itself — auto-generated from `workflow_file` JSON, not editable prose.

## Concerns / follow-ups for whoever reviews this

1. The `ai-walkthrough.js` "add" list in the brief assumed a static `steps[]` data shape that doesn't exist in this engine — worth updating the brief/plan so future tasks don't re-litigate this. The file needed zero changes.
2. `buildClosingCta` (shared.js) has zero field coverage across every engine that uses it — a cross-cutting gap, not specific to n8n-workflow.js. Someone should scope a dedicated task for it if closing-CTA copy needs to be editable.
3. Architecture's dual-registration of `diagram.nodes[i].panel.headline` (drawer + mobile-list) means editing it from either surface should stay in sync since the editor presumably targets the same JSON path — not verified live (no Playwright run), only verified by code inspection (both `registerField` calls target an identical string path).
4. No live browser verification was performed (brief's fallback path — demo include bug may block render) — only `node --check` + manual path-vs-data.json cross-reference. Recommend a Playwright smoke pass before merging if the demo harness is fixed.
