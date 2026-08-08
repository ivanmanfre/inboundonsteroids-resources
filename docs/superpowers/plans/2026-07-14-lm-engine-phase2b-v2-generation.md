# LM Engine Phase 2b — Assessment v2 Generation + Render-QA Gate (n8n + Railway) — Implementation Plan

> **RESUME POINTER (read first, after a compact/clear):** This plan executes the LIVE-AUTOMATION half of the LM v2 upgrade. Before starting, read: (1) this file, (2) project memory `lm-resource-upgrade-initiative-2026-07-13.md` (full recon: node names/IDs, prompt slugs, Fable sequence), (3) the Phase 2 spec `docs/superpowers/specs/2026-07-14-lm-engine-upgrade-design.md`. Steps touch the running LM pipeline that generates real client/Ivan/prospect LMs — inspect live state before every edit; do NOT fabricate node internals from this doc.

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` checkboxes.

**Goal:** Make newly generated assessment LMs emit the v2 schema (computed-output formulas), gate every generated assessment spec through a fail-closed render-QA validator before publish, across BOTH generation surfaces (n8n Lead Magnets workflow + the Railway scan-builder).

**Architecture:** Additive nodes/edits per surface, staggered. The render-QA validator reuses the already-deployed, hardened, dual-shape scoring core `assessment-score.js` — the generator emits FORMULAS ONLY and the engine computes deterministically, so a validation gate that runs `computeResult` on synthetic answers catches malformed/undefined-formula specs before they reach the GitHub PUT.

**Tech Stack:** n8n (workflow `XQSUuQH2e4YVwLCB`, Code + IF + httpRequest nodes), Supabase `content_prompts` (canonical prompts), a Railway "scan-builder" service (Node/JS, outside n8n), GitHub Contents API (publish). Validator: fetch `https://resources.inboundonsteroids.com/_engine/assessment-score.js` and eval to obtain `computeResult`/`safeEval`.

## Status
- **2b.1 DONE + LIVE** (merges `99a5bff` likert-index-scoring, `dd9fc9a` dark-surface accent legibility). Prerequisite safeEval hardening DONE + LIVE (`9beabba`). v2 renderer + brand-mirror + gate all live (`4e7d5d4`). Only the demo uses v2 today.
- **2b.2 / 2b.3 / 2b.4 = NOT STARTED** (this plan).

## Global Constraints
- **FABLE SEQUENCE (do in order):** 2b.2 render-QA gate → 2b.3 n8n emission flip → 2b.4 Railway scan-builder ~24h AFTER n8n publishes clean v2. Reason the gate is first: it's fail-closed, so a bad v2 emission routes to review instead of publishing broken.
- **FORMULAS-NOT-VALUES (truth invariant):** the generator emits `formula` strings + inputs ONLY, never a computed result numeral. The validator must REJECT any `computed_outputs[i]` that carries a numeric `value` instead of a `formula`. Formulas must be safeEval-safe (no brackets, no `constructor`/`Function`/etc — matches the hardened whitelist in `assessment-score.js`).
- **FAIL-CLOSED:** a spec that fails validation NEVER publishes — route it to the existing halt/review path (mirror the `LM QA Gate` → `LM Revision on Halt` → `Set LM Status To Review on Halt` pattern).
- **ADDITIVE + STAGGERED:** each surface flips independently; n8n first, Railway ~24h later. New validator/IF nodes are additive (bypass to roll back).
- **"ALL new = v2" applies to NEW generations ONLY.** The existing 27 legacy LMs are NOT flipped in this phase (they keep legacy schema + legacy renderer and still render fine). Retroactive migration is explicitly OUT of scope (it would require a true score-parity test — deferred Phase-2 final-review item).
- **ROLLBACK PREP:** before editing the Supabase `build-assessment` prompt, SAVE its current `body` verbatim to a rollback file. Prompts are canonical in Supabase (`content_prompts`) — edit via the dashboard, never hardcode in a node (project rule).
- **Tooling:** use the `n8nac` CLI for n8n node lookup (NOT n8n-mcp), per project AGENTS.md; n8n API key in `.mcp.json`. n8n base = https://n8n.ivanmanfredi.com.
- **Test with a DISPOSABLE draft**, never a real client draft, when firing the Studio webhook.

## Ground truth (from 2026-07-14 recon — verify still current at execution)
- Workflow **`Lead Magnets` `XQSUuQH2e4YVwLCB`** (active, 164 nodes). Trigger: `Studio Webhook` `POST /webhook/lm-gen-v2` (body: draft_id, topic, format, editorial_notes, target_audience, key_problem, source_material, workflow_file_id).
- Assessment path: **`Format`** (switch on `Parse Content Fields.format === "Interactive Assessment"`) → **`Build Assessment Prompt`** (id `build-assessment-prompt-001`, Code; calls Railway proxy `https://claude-code-railway-production.up.railway.app/v1/messages`, model `claude-opus-4-8`, max_tokens 16000; system prompt = Supabase `build-assessment` + shared `forbidden-language`/`author-voice` from `Fetch Shared Prompts (Assets)`) → **`Build Resource HTML Assessment`** (id `faf4cc94-6b9a-4aed-b7b2-faed31ddfd0b`, Code; ONLY structural check = `JSON.parse` after fence-strip; sets `spec.slug`/`spec.brand`; **hardcodes** wrapper `<link .../assessment.css>` + `<script .../assessment.js>` = legacy renderer) → **`Deploy to GitHub Assessment`** (id `484741b1-b0b1-4ec4-b843-aa768860f524`, httpRequest PUT `api.github.com/repos/ivanmanfre/resources/contents/{slug}/{path}` — the PUT IS publish; no CI gate).
- Existing copy-only QA gate: `Fetch LM QA Prompt` → `Claude: LM QA` → `Parse LM QA Feedback` → `LM QA Gate` (IF: parse_success && qa_recommendation==="approve" && qa_total>=84 && banned_patterns_found.length<=1) → pass `Combine All Outputs1` / fail `LM Revision on Halt` → `Set LM Status To Review on Halt`. Prompt slug `lm-qa`. **Never inspects spec structure.**
- Supabase prompts (project `bjbvqvzbzczjbatgmccb`): `content_prompts` slugs `build-assessment` (assessment rubric/schema — EDIT HERE for v2), `forbidden-language`, `author-voice`, `lm-qa`.
- 2nd surface: **`Outreach - Scan At Accept` `uIFsFNPd3N1sE7a3`** → `Pick + Fire Scan Build` code node → inline build on the `claude-code-railway` Railway app (a SEPARATE service, code NOT inspected — lives outside n8n; emits legacy-shaped prospect assessment `data.json` embedded in /scan pages).
- Validator reuse: `https://resources.inboundonsteroids.com/_engine/assessment-score.js` — pure, DOM-free, dual-shape (legacy + v2), RCE-hardened, exports `computeResult(data, answers)` + `safeEval` + `normalizeAnswer` + `shouldGate`. `_engine/demo/assessment-v2/data.json` is the canonical v2-shape example.

---

## Step 2b.2 — Render-QA validation gate (fail-closed, ALL assessment specs)

**Deliverable:** every generated assessment spec (legacy OR v2) is run through `computeResult` on synthetic answers and structurally checked BEFORE the GitHub PUT; failures route to review.

- [ ] **T1 — Recon the exact node internals (READ-ONLY).** Pull the full current code of `Build Assessment Prompt` and `Build Resource HTML Assessment` (n8nac/API). Record: the exact variable holding the parsed spec, the fence-strip/JSON.parse code, and the item shape passed onward. Confirm the `Format`→...→`Deploy` wiring is unchanged from recon.

- [ ] **T2 — Build the validator node "Validate Assessment Spec" (Code).** Insert AFTER `Build Assessment Prompt`, BEFORE `Build Resource HTML Assessment`. Logic:
  1. Reuse the same fence-strip + `JSON.parse` to get `spec` (fail → invalid, reason "unparseable JSON").
  2. Fetch the scoring core: HTTP GET the deployed `assessment-score.js`; obtain `computeResult` by evaluating the module text with a `module`/`exports` shim (the file is UMD-lite: `module.exports = api`). PRIMARY approach = fetch-live (single source of truth, already hardened). FALLBACK (if eval-of-fetched-code is disallowed in the Code node sandbox) = inline a pinned copy of `assessment-score.js` into the node with a `// SYNC: mirror of _engine/assessment-score.js @<commit>` header + a note in this plan's ledger (drift risk — decide at execution).
  3. Build synthetic answers from `spec.categories[].questions[]`: number→a value inside [min,max] (or `default`); multi_select→first 1-2 `answers[].tag`; short_text→`"test process"`; likert→a mid index; untyped legacy→a mid option index. Add `__persona: 0` if `persona_selector` present.
  4. `computeResult(spec, synthetic)` and assert: `overall` finite and `0 < overall <= 100`; `per_category` non-empty and covers every category id; for v2 (any `computed_outputs`), every computed `.value` is a finite number (not NaN/Infinity/null); tier resolves to a name.
  5. LIKERT BOUNDARY (Fable): for each `type:"likert"` question, assert `normalizeAnswer(q, 0)` and `normalizeAnswer(q, lastIndex)` are both finite and NOT equal (guards the index-vs-value regression class, not just this instance).
  6. STRUCTURAL: required top-level keys (`slug`,`title`,`categories`,`tier_thresholds`); each question has `id` and (`type` OR `answers`). FORMULAS-NOT-VALUES: reject if any `computed_outputs[i]` has a numeric `value` field or lacks a string `formula`.
  7. Emit `{ valid: boolean, reasons: string[], spec }`.

- [ ] **T3 — Add IF node "Assessment Spec Gate."** After the validator: `valid === true` → `Build Resource HTML Assessment` (unchanged wiring onward); `valid === false` → the existing halt/review path (`LM Revision on Halt` style → `Set LM Status To Review on Halt`), so a bad spec CANNOT reach `Deploy to GitHub Assessment`. Attach `reasons` to the review status for debugging.

- [ ] **T4 — Verify with disposable drafts (do NOT publish real content).**
  - Malformed spec (delete `categories`) → routes to review, NO GitHub PUT. Confirm via execution log + that no new commit landed on the repo.
  - Bad v2 formula (a `computed_outputs.formula` referencing an undefined var → `computeResult` yields NaN) → blocked.
  - Formulas-not-values violation (a `computed_outputs` with numeric `value`) → blocked.
  - Known-good v2 (the demo `data.json`) → passes.
  - Known-good legacy spec → passes (validator is dual-shape).

- [ ] **T5 — Rollback note + activate.** Validator + IF are additive; to revert, rewire `Build Assessment Prompt → Build Resource HTML Assessment` directly and delete the two nodes. Record the pre-change wiring in the ledger. Publish/activate the workflow version.

---

## Step 2b.3 — n8n v2 emission flip (all NEW assessments → v2)

**Deliverable:** new assessments generate as v2 (computed-output formulas) and load the v2 renderer; gated by 2b.2.

- [ ] **T1 — SAVE rollback.** Fetch the current Supabase `content_prompts` row `slug=build-assessment` and save `body` verbatim to `docs/superpowers/plans/rollback/build-assessment-<date>.txt` (commit it). This is the instant revert.

- [ ] **T2 — Edit the `build-assessment` prompt (via dashboard) to emit v2.** Add schema instructions so Claude emits: per-question `type` (`number`/`multi_select`/`short_text`/`likert`) with `normalize_formula` (numbers) / `score_keywords` (short_text) / `answers[].score` (multi_select/likert); category `scoring_formula`; top-level `computed_outputs[]` (`{id,label,format,formula,show_in_result}`), `headline_formula`, and an explicit `schema_version: "v2"`. HARD RULES in the prompt: emit FORMULAS + inputs only, NEVER result numerals; formulas reference question ids, `<id>_score` vars, `Math.*`, `has()`, `countSel()`; NO bracket access, NO `constructor`/`Function`/etc (safeEval-safe). Keep the forbidden-language/author-voice layers intact. Give 1-2 few-shot examples grounded in `_engine/demo/assessment-v2/data.json`.

- [ ] **T3 — Wrapper conditional in `Build Resource HTML Assessment`.** When `spec.schema_version === "v2"` (or `computed_outputs` present), emit the wrapper loading, IN ORDER: `/_engine/assessment-v2.css`, then `/_engine/assessment-score.js`, `/_engine/embed-brand.js`, `/_engine/assessment-v2.js` (score + embed BEFORE the engine — the engine hard-depends on `window.LMScore`/`window.LMEmbed`). Legacy specs keep the legacy wrapper. Prefer trusting the explicit `schema_version` flag the generator now sets.

- [ ] **T4 — Verify (this IS the canary — the stagger).** Fire the Studio webhook with a disposable draft; confirm the v2 spec passes the 2b.2 gate and publishes; load the published page and verify v2 renders correctly: score ring, computed-output block (legible on the dark box per 2b.1), gate on/off, no console errors. Generate 2-3 more. Then watch the first REAL client/Ivan assessments for 24h.

- [ ] **T5 — Rollback path documented.** Revert = restore the saved `build-assessment` body (T1 file) + revert the wrapper conditional. Because 2b.2 is fail-closed, a bad v2 emission during this window routes to review, not to a broken live page.

---

## Step 2b.4 — Railway scan-builder v2 flip (~24h AFTER n8n publishes clean)

**Deliverable:** prospect /scan assessments also emit v2 + get the same render-QA gate, in EMBED (brand-mirror) mode.

- [ ] **T1 — Locate + read the scan-builder service (READ-ONLY).** It's invoked by `Outreach - Scan At Accept` `uIFsFNPd3N1sE7a3` → `Pick + Fire Scan Build` (find the exact Railway endpoint/app it fires). Find the service's repo (likely `~/Desktop/claude-code-railway` or a Railway-linked repo) and locate where it generates the assessment `data.json` + wrapper HTML + its prompt source. Record the analog of each n8n node (prompt, spec build, publish/embed).

- [ ] **T2 — Mirror 2b.2 (validator) in the scan-builder.** Before the scan build publishes/embeds, run the same fetch-`assessment-score.js` + `computeResult`-on-synthetic validation, fail-closed (on invalid → don't embed a broken assessment; fall back to legacy shape or skip, per the service's existing error path).

- [ ] **T3 — Mirror 2b.3 (v2 emission) in the scan-builder.** Add the v2-schema instructions to the scan builder's prompt (SAVE its current prompt first for rollback); set `schema_version:"v2"` + `computed_outputs`; emit the v2 renderer + score core in the wrapper. NOTE: scan assessments render in EMBED mode — v2 embed (brand-mirror) was ported + browser-verified in Phase 2, and the dark-surface + likert fixes are live, so v2 scan gets prospect-brand recolor + legible computed outputs. Embeds never gate (`shouldGate` short-circuits on embedMode) — confirm that holds.

- [ ] **T4 — Verify.** Trigger a test scan build; confirm the v2 embed renders in the prospect's brand, computed outputs legible, no gate in embed, no console errors. Verify against a real /scan layout.

- [ ] **T5 — Rollback.** Restore the scan-builder prompt/wrapper + redeploy the Railway service.

---

## Deferred / out of scope (record, don't do here)
- **Retroactive migration** of the existing 27 legacy LMs to v2 — needs a true numeric score-parity test (`v2 score == legacy score` for the same answers) built FIRST (Phase-2 final-review item). "All new = v2" does not trigger this.
- **safeEval residual:** a future ctx var named exactly a blocked word (`process`, `self`, `global`, …) is rejected — zero today; watch if v2 formulas ever need such a var name.
- **`assessment-parity.test.mjs`** asserts non-zero only, not score-equality — fine for the compat guard; upgrade to equality only if/when retroactive migration happens.

## Self-review
- Fable sequence honored (gate → n8n flip → Railway, staggered). Fail-closed everywhere. Formulas-not-values enforced in prompt AND validator. Rollback prepped per surface (saved prompt bodies + additive nodes). Existing legacy LMs untouched. Live-system internals I haven't read (node code, Railway service) are marked as execution-time recon steps, not fabricated.

---

## 2b.4 RECON (2026-07-14) — Railway scan-builder (claude-code-railway `main.py`) — FLIP HELD for canary

**Trigger chain:** n8n `Outreach - Scan At Accept` `uIFsFNPd3N1sE7a3` → `Pick + Fire Scan Build` code node → `POST https://claude-code-railway-production.up.railway.app/build-hypertarget` body `{prospect_id, transcript, inline, name, company_domain}`. Generation is INSIDE the service, not n8n.

**Surface = `~/Desktop/claude-code-railway/main.py` (Python/FastAPI, live on Railway). Route `@app.post("/build-hypertarget")` @4315.** Bespoke-assessment path (prospects with no mapped niche slug):
- `_ht_assessment_system(forbidden, founder, angle)` @2879 — system prompt. Emits LEGACY schema (untyped scored-choice: 12-16 Qs, `answers:[{label,score 1..5}]`, 4-5 categories, per-category recommendations). NO computed_outputs, NO schema_version. Fetches `content_prompts?slug=forbidden-language` only (NOT the n8n `build-assessment` prompt).
- `_ht_gen_assessment_spec(founder, transcript, angle)` @2981 — calls `_ht_llm_json(system, user, max_tokens=6000)`; returns `_ht_normalize_assessment_spec(...)` or None on failure (caller keeps static LM card = the existing fail path).
- `_ht_normalize_assessment_spec(spec, founder, slug)` @2909 — coerces to legacy data.json; raises ValueError if <12 valid Qs (this raise = the fail-closed hook to reuse). Sets slug/title/brand{accent}/tier_thresholds/tier_names/cta/persona_selector. Q shape out: `{id,text,max_score,answers}` (untyped).
- WRAPPER f-string @3562-3620: hardcodes `<link .../assessment.css>` @3586 + `<script .../shared.js defer><script .../assessment.js defer>` @3618. Neobrutalist embed aesthetic, accent = prospect's (brand-mirror). Root `<main id="lmc-root" data-lm-assessment-src="./data.json">` @3612 — IDENTICAL to v2 engine expectation.
- `_ht_seed_lm(...)` @3516 seeds an lm from the spec with "neutral-middle answers" for the live embed render.

**2b.4 build (DEFERRED, ~24h after n8n clean, own focused pass):**
1. Port validator to PYTHON: `computeResult` + `safeEval` (JS `new Function`+whitelist → Python restricted `eval` with `{'__builtins__':{}}` + the SAME UNSAFE_EXPR_RE blocklist + char-whitelist + Math shim + `has`/`countSel`). SECURITY-SENSITIVE — must match assessment-score.js @2bc0fdd semantics AND be safe under Python eval. Unit-test against demo v2 + a legacy spec before wiring.
2. Add render-QA in/after `_ht_normalize_assessment_spec`: run computeResult on synthetic answers, assert overall>0 + all cats covered + computed finite + formulas-not-values; fail → raise ValueError (caller already keeps static card = fail-closed). Embeds never gate (shouldGate short-circuits on embedMode) — confirm.
3. v2 emission in `_ht_assessment_system`: mirror the n8n doctrine (schema_version v2, type likert, optional number Qs + computed_outputs, COEFFICIENT DISCIPLINE = coeff traces to input or stated constant else omit). Reuse the same prose block from Supabase `build-assessment` v2 section if practical, adapted to the founder-voice framing. SAVE current prompt fn text for rollback.
4. `_ht_normalize_assessment_spec`: preserve v2 fields through normalization (type, normalize_formula, computed_outputs, schema_version, number Q min/max/step/default).
5. Wrapper conditional (@3586 + @3618): when schema_version==v2 → assessment-v2.css + shared.js + assessment-score.js + embed-brand.js + assessment-v2.js.
6. Deploy Railway service (its own deploy path); verify a test scan build renders v2 embed in prospect brand, computed outputs legible, no gate in embed, no console errors.
