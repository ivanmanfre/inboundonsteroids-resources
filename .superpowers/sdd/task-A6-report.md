# Task A6 Report — coverage from scratch: swipe + landing + template

## Status
Done. `node --check` passes on all three files. Every `registerField`/`registerArray` call is guarded by `L.editMode` (or `data.brand && data.brand.hero_badge` etc. for conditional-render cases) and inserted after the existing `L.make`/`appendChild`/innerHTML build — no render output changed.

## swipe.js

Render entry: `render(data, root)` @ line 12 (now ~line 12, shifted by inserted lines).

Registered:
| Path | Node | Render line (accessor) |
|---|---|---|
| `title` | hero `.lmc-h1` | `L.buildHero(data, {...})` — hero renders `data.title` internally; captured via `root.querySelector(".lmc-h1")` after appendChild |
| `subtitle` | hero `.lmc-sub` | same buildHero call — renders `data.subtitle` |
| `brand.hero_badge` | hero `.lmc-badge` | `badge: (data.brand && data.brand.hero_badge) \|\| "Swipe File"` — only registered when `data.brand.hero_badge` truthy (else text is the literal fallback, no path) |
| `examples[i].title` | `.lms-ex-title` h3 | `L.esc(ex.title \|\| "")` in the per-item innerHTML build |
| `examples[i].body` (multiline) | `.lms-ex-body` pre | `L.esc(ex.body \|\| "")` |
| `examples[i].why` (multiline) | `.lms-ex-why` p (only if el exists, i.e. `ex.why` truthy — markup itself is conditional) | `ex.why ? '...' + L.esc(ex.why) ...` |
| `examples[i].tags[j]` | `.lms-ex-tag` span | `(ex.tags \|\| []).map(...)` tag chip loop |
| `examples` (array) | `.lms-list` container | the `(data.examples \|\| []).forEach(...)` loop itself |

Skipped/locked (with reason):
- Filter label (`.lms-filter-label` "Filter") and filter category buttons (`.lms-filter`) — brief-designated UI chrome; tag list is a de-duplicated union of `data.tags` and `examples[].tags`, not a 1:1 stored field on this node.
- `.lms-taken-count` — computed (`taken.length` / examples.length), not stored copy.
- Take button text ("Taken"/"Take this example") — runtime toggle state, not stored data.
- Email-gate copy, export-bar copy, closing CTA (`L.buildClosingCta`) — all static/shared-helper strings, no `data.X` accessor.

## landing.js

Render entry: `render(d)` @ line ~41 (module-level `root`, no root param — matches brief).

Registered:
| Path | Node | Render line (accessor) |
|---|---|---|
| `headline` (multiline) | `.lp-h1` h1 | `headlineHTML(d)` reads `d.headline` (and `d.headline_emphasis` only to choose where to wrap `<em>`, never altering the concatenated text) |
| `subhead` (multiline) | `.lp-sub` p | `d.subhead ? '<p class="lp-sub">' + esc(d.subhead) ...` — only registered when the element exists (conditional render) |
| `subhead_secondary` (multiline) | `.lp-sub-2` p | `d.subhead_secondary ? ...` |
| `inside[i]` | 2nd `<span>` inside each `li.lp-b` | `(d.inside \|\| []).map(function (b, i) { return '<li class="lp-b"><span class="n">' + (i+1) + '</span><span>' + esc(b) + '</span></li>'; })` — 1st span (`.n`, the index number) is computed, only the 2nd span (the bullet text) is registered |
| `inside` (array) | `.lp-bullets` ul | same `inside` map/join, container is the ul it's joined into |
| `proof` (contenteditable) | `.lp-proof p` | `d.proof ? '<section class="lp-proof">' + avatar + "<p>" + d.proof + "</p></section>" : ""` — note `d.proof` is inserted **raw/unescaped**, so registered as `contenteditable` (rich-HTML) like other `*_html`/section-body fields, not as plain text |

Skipped/locked (with reason):
- `.lp-eyebrow` — `[d.format_label, d.category].filter(Boolean).map(esc).join(" · ")`. Computed join of two independent fields; no single json path has a textContent match. Skipped per the "only register on exact accessor match" rule.
- CTA button (`#lp-submit`, `.lp-cta`) — `ctaLabel + " &rarr;"`. The rendered arrow (`→`) is appended into the *same text node* as the label, so `textContent` is never equal to the raw `cta_label` value. Worse: `enterEditField` in edit-mode.js commits `el.textContent` verbatim back to the path on blur — registering this node would let a save write `"<label> →"` into `cta_label`, and the arrow would then be double-appended on next render. Isolating the label into its own child span would require changing the render markup (disallowed). Skipped and documented inline in the code.
- `.lp-cover-fallback` — `d.headline || d.category || "Free resource"`. Ambiguous 3-way OR-fallback with no deterministic single path. Skipped.
- Cover `img` alt / `proof_avatar` img — image URLs, not text nodes (rule: never register a URL, and `alt` mirrors an already-registered field).
- "What's inside" `<h2>` — static literal, not data-derived.
- Secondary CTA / attribution line — do not exist in this render (docstring implies possible future fields, but current `render(d)` has neither a second CTA element nor a separate attribution/name field beyond `proof`/`proof_avatar`). Nothing to register.

## template.js

Render entry: `render(data, root)` @ line 10 (now shifted; original line numbers cited below are from the pre-edit file for accessor traceability).

Registered:
| Path | Node | Render line (accessor) |
|---|---|---|
| `title` | hero `.lmc-h1` | `L.buildHero(data, {...})` renders `data.title` |
| `subtitle` | hero `.lmc-sub` | same, `data.subtitle` |
| `brand.hero_badge` | hero `.lmc-badge` | `badge: (data.brand && data.brand.hero_badge) \|\| "Template"` — conditional, only when data supplied it |
| `stack_headline` | `.lmt-stack h2` | `var stackHeadline = data.stack_headline \|\| "Match the template to your stack";` — conditional, only when `data.stack_headline` truthy |
| `stack_subtitle` (multiline) | `.lmt-stack p` | `L.esc(data.stack_subtitle \|\| "Answer these so we tailor...")` — conditional |
| `stack_questions[i].label` OR `.text` | `.lmt-q-label` span | `L.esc(q.label \|\| q.text \|\| q.id)` — registers against whichever field actually produced the text; if it fell through to `q.id`, **not registered** (id is a discriminator, not label copy) |
| `stack_questions[i].options[j].label` | `.lmt-q-opt` button | `L.esc(opt.label \|\| opt.value)` — only registered when `opt.label` is present; if it fell back to `opt.value`, not registered (value is the answer discriminator) |
| `stack_questions[i].options` (array) | `.lmt-q-options` div | the `(q.options \|\| []).forEach(...)` loop container — safe array target since this div only ever holds option buttons, no other siblings |
| `sections[i].title` | dynamically created `h2` | `if (s.title) body.appendChild(L.make("h2", null, L.esc(s.title)));` |
| `sections[i].html` (contenteditable) | dynamically created `div` | `h.innerHTML = s.html;` — raw HTML insert, registered as rich text |
| `sections[i].text` (multiline) | dynamically created `p` | `L.esc(s.text)` (else-branch, only when `s.html` absent) |

Skipped/locked (with reason):
- `stack_questions` array itself (no `registerArray`) — the per-question `<div class="lmt-question">` elements are appended directly into `stackSection`, which also directly contains the `<h2>`/`<p>` headline nodes as siblings. There's no dedicated wrapper around just the question divs. `registerArray` decorates every direct child of its container as a draggable/removable array item — pointing it at `stackSection` would incorrectly turn the headline/subtitle into draggable "array items" too. Adding a new wrapper div to fix this would insert a DOM node into every render (not just edit mode), violating the "rendered DOM stays byte-identical outside edit mode" / "don't rewrite the render" rules. Left as per-item field registration only (full text coverage, no add/remove/reorder). Flagging as a possible follow-up if reorder/add support on stack questions is wanted — would need a small render restructure (wrap questions in their own container), which is out of scope for this additive-only task.
- `sections` array itself (no `registerArray`) — one `sections[i]` entry can render as up to two sibling nodes (`h2` + `div`/`p`) with no shared per-item wrapper, so there's no 1:1 element↔array-item mapping to decorate. Per-item field registration covers all text; array reorder/add is unavailable without a markup change (same category as the n8n-workflow.js precedent, which *does* have a dedicated `sectionsContainer` — template.js's `sections` loop doesn't).
- Result panel (`.lmt-result` — "Your personalized template is *ready*", download button, meta) and email-gate section (`.lmc-capture` copy, "Email me the artifact" button) — all static string literals, no `data.X` accessor anywhere in their markup.
- Computed download meta fragments (`opt.short || opt.value` joined by `refreshResult()`) — computed/derived at runtime from selections, not stored copy.
- `q.id` / `opt.value` — discriminator IDs, explicitly excluded per brief.
- `role`/`aria-label`/`aria-checked` attributes — attribute-only, not text nodes, never registered.
- Closing CTA (`L.buildClosingCta("template", data, {...})`) — shared helper in `shared.js`, out of scope for this per-engine task; not modified.

## Verify
- `node --check _engine/swipe.js && node --check _engine/landing.js && node --check _engine/template.js` → all three pass.
- Manual accessor-match audit (see tables above): every registered path was traced back to the exact `data.X`/`d.X`/`q.X`/`opt.X`/`ex.X` read in the corresponding `render()` and confirmed the visible node's textContent is exactly that value (or, for conditionally-rendered nodes, is only registered when the driving field is truthy so the fallback-literal case is excluded).
- No `.min.js` files touched. No SVG registration. No `L.make(...)` call's tag/attrs/text argument changed — all captures happen on the variable holding the existing `make()`/innerHTML result, with registration calls added afterward.
- Playwright not run (no demo pages/data.json exist for these three engine types, per brief).

## Concerns / follow-ups for reviewer
1. **`stack_questions` and `sections` have no `registerArray`** despite the brief text suggesting "Use registerArray for the questions list and the options list" (template.js) and array registration generally. I deliberately withheld it in both cases because doing so safely would require adding a new wrapper `<div>`/`<section>` to the render, which is a structural change that fires unconditionally on every render (not gated to edit mode), directly conflicting with the "rendered DOM stays byte-identical outside edit mode" / "don't rewrite the render" rules stated at the top of the brief. I registered `stack_questions[i].options` (the array of options) since that container already exists 1:1 with no extra siblings — full array support there. If add/remove/reorder is wanted on the outer `stack_questions` and `sections` arrays, that needs a small follow-up task that explicitly authorizes a markup restructure.
2. **landing.js CTA button label was not registered** — the arrow (`→`) is appended into the same text node as the label, and edit-mode's commit path (`el.textContent = newVal` written straight back to the json path) would corrupt `cta_label` with the arrow character baked in, and double it on the next render. This is a real risk, not just a strict-equality technicality — flagged clearly in-code and here in case the team wants to restructure the button markup (wrap the arrow in its own `aria-hidden` span) in a future task so the label becomes safely registrable.
3. Hero `title`/`subtitle` are registered unconditionally (matching the already-shipped `n8n-workflow.js`/`stack-picker.js` precedent) even though, in the degenerate case where `data.title`/`data.subtitle` are absent, the rendered text is a fallback literal ("Resource"/nothing). This mirrors existing shipped behavior in the codebase rather than introducing a new pattern; flagging for awareness, not changed.
