# LM Engine Phase 2 (Engine) — v2 Safe + Brand-Mirror + Configurable Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `_engine/assessment-v2.js` safe to run on the 27 existing (legacy-schema) assessments and inside prospect/client brand-mirrored embeds, with a configurable email gate — without touching any live LM until it is explicitly flipped.

**Architecture:** Extract the pure scoring core (`safeEval`, `normalizeAnswer`, `computeResult`) out of the v2 IIFE into a dual-target module `_engine/assessment-score.js` (browser global `window.LMScore` + Node `module.exports`) so it is unit-testable with Node's built-in test runner. Add a legacy-schema fallback to `normalizeAnswer` (the compat shim). Port the existing color brand-mirror / embed system from `assessment.js` into `assessment-v2.js`. Add a `data.json`-flagged capture gate. All changes are additive: legacy LMs keep loading `assessment.js`.

**Tech Stack:** Vanilla ES5-style browser JS (IIFE engines, no build step for `_engine/*.js`; wrappers load the non-minified `.js`). Tests: Node ≥18 built-in `node:test` + `node:assert/strict`, run from repo root. Render/parity verification: existing `test/index.html` harness + `scripts/validate-lms.py` + `playwright-driver` skill.

## Global Constraints

- **Additive only.** Do NOT repoint any of the 27 live `<slug>/index.html` wrappers to v2 in this plan. Legacy LMs keep `_engine/assessment.js`. (Verified: 30 wrappers load `_engine/assessment.js`, 1 demo loads `_engine/assessment-v2.js`.)
- **Truth invariant.** All displayed numbers are computed deterministically by the engine from the viewer's answers via `safeEval`. No result numeral is ever read from `data.json`. Threaded params (brand-mirror) may set colors/fonts/prose only — never formula source.
- **Supabase anon key** in v2 is the publishable format `sb_publishable_...` (browser-safe). Never use the dead `iat=1738702127` key.
- **Engines are loaded non-minified.** The matching `_engine/*.min.js` files exist but wrappers reference `.js`. Regenerating `.min.js` is out of scope; note any `.min.js` staleness but do not block on it.
- **No new runtime dependencies.** Tests use only Node built-ins (`node:test`, `node:assert/strict`). No npm install in `_engine/`.
- **Behavior preservation.** The demo LM at `_engine/demo/assessment-v2/` must render identically (same score, same computed outputs) before and after Task 1's extraction.

## File Structure

- Create: `_engine/assessment-score.js` — pure scoring core (dual browser-global + Node module). One responsibility: turn `(data, answers)` into a result object. No DOM.
- Create: `_engine/embed-brand.js` — pure color/font param math (`parse`, `hex`, `mix`, `clamp`, `safeFam`, `buildEmbedVars`). One responsibility: turn query params into CSS variable values. No DOM.
- Create: `_engine/assessment-score.test.mjs` — unit tests for the scoring core.
- Create: `_engine/embed-brand.test.mjs` — unit tests for the color/font math.
- Modify: `_engine/assessment-v2.js` — consume `LMScore`; add compat shim; port embed/brand-mirror; add configurable gate.
- Modify: `_engine/demo/assessment-v2/index.html` — load `assessment-score.js` + `embed-brand.js` before `assessment-v2.js`.
- Reference (read-only, source of truth for the port): `_engine/assessment.js:195-380` (embed block), `:855-` (capture gate).

---

### Task 1: Extract scoring core into a testable module

**Files:**
- Create: `_engine/assessment-score.js`
- Create: `_engine/assessment-score.test.mjs`
- Modify: `_engine/assessment-v2.js` (replace inline `safeEval`/`normalizeAnswer`/`computeResult` bodies with calls to `LMScore`)
- Modify: `_engine/demo/assessment-v2/index.html`

**Interfaces:**
- Produces: `LMScore.safeEval(expr, ctx) -> number|boolean|null`; `LMScore.normalizeAnswer(q, raw) -> number|null` (0..100); `LMScore.computeResult(data, answers) -> { overall, tier, per_category, weakest, persona, ctx, computed }`. In the browser these attach to `window.LMScore`; in Node they are `module.exports`.

- [ ] **Step 1: Write the failing test**

Create `_engine/assessment-score.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import score from "./assessment-score.js"; // CJS default import

test("safeEval computes arithmetic from ctx", () => {
  assert.equal(score.safeEval("(a + b) / 2", { a: 100, b: 0 }), 50);
});

test("safeEval rejects non-whitelisted expressions", () => {
  assert.equal(score.safeEval("window.location", { window: 1 }), null);
});

test("normalizeAnswer: likert maps value/max to 0-100", () => {
  assert.equal(score.normalizeAnswer({ type: "likert", max_score: 5 }, 4), 80);
});

test("normalizeAnswer: number uses normalize_formula", () => {
  assert.equal(score.normalizeAnswer({ type: "number", normalize_formula: "Math.min(100, x*8)" }, 6), 48);
});

test("computeResult: demo-shaped data yields non-zero overall + computed outputs", () => {
  const data = {
    slug: "t",
    categories: [
      { id: "c1", questions: [{ id: "q1", type: "likert", max_score: 5 }], scoring_formula: "q1_score" }
    ],
    computed_outputs: [{ id: "leak", label: "Leak", format: "currency", formula: "q1_score * 10" }],
    tier_thresholds: { low: 40, mid: 70 }
  };
  const res = score.computeResult(data, { q1: 4 }); // likert 4/5 => 80
  assert.equal(res.overall, 80);
  assert.equal(res.per_category.c1.score, 80);
  assert.equal(res.computed.leak.value, 800);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test _engine/assessment-score.test.mjs`
Expected: FAIL — `Cannot find module './assessment-score.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `_engine/assessment-score.js` by moving the EXACT current bodies of `safeEval` (v2 lines 90-103), `normalizeAnswer` (v2 lines 107-153), and `computeResult` (v2 lines 167-237) into a UMD-lite wrapper. Include the `fmt` helper (lines 27-38) since `computeResult` consumers need it. Do not change any logic in this step.

```js
/* LM Assessment scoring core — pure, DOM-free. Browser global (window.LMScore) + Node module. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LMScore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function fmt(spec, val) {
    if (val == null || isNaN(val)) return "—";
    var n = Number(val);
    if (spec === "currency") return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (spec === "currency_per_period") return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }) + "/mo";
    if (spec === "hours_per_period") return n.toFixed(n < 10 ? 1 : 0) + " hrs/wk";
    if (spec === "percent") return n.toFixed(0) + "%";
    if (spec === "hours") return n.toFixed(n < 10 ? 1 : 0) + " hrs";
    if (spec === "integer") return Math.round(n).toLocaleString("en-US");
    if (spec === "decimal") return n.toFixed(2);
    return n.toLocaleString("en-US");
  }
  function safeEval(expr, ctx) {
    try {
      if (!expr) return null;
      if (!/^[\s0-9a-zA-Z_\.\+\-\*\/\%\(\)\?\:\,\<\>\=\!\&\|\[\]\'"\$]+$/.test(expr)) return null;
      var fn = new Function("ctx", "Math", "has", "countSel", "with (ctx) { return (" + expr + "); }");
      var v = fn(ctx, Math,
        function has(arr, tag) { return Array.isArray(arr) && arr.indexOf(tag) !== -1; },
        function countSel(arr) { return Array.isArray(arr) ? arr.length : 0; }
      );
      if (typeof v === "number" && isFinite(v)) return v;
      if (typeof v === "boolean") return v;
      return null;
    } catch (_) { return null; }
  }
  function normalizeAnswer(q, raw) {
    // NOTE: legacy-schema fallback is added in Task 2. This step copies the v2 body verbatim.
    if (raw == null || raw === "") return null;
    if (q.type === "likert") {
      var max = q.max_score || 5;
      var v = typeof raw === "number" ? raw : Number(raw);
      if (isNaN(v)) return null;
      return Math.max(0, Math.min(100, (v / max) * 100));
    }
    if (q.type === "number") {
      if (q.normalize_formula) return safeEval(q.normalize_formula, { x: Number(raw) });
      var mn = q.min || 0, mx = q.max || 100;
      var pct = ((Number(raw) - mn) / (mx - mn)) * 100;
      if (q.invert) pct = 100 - pct;
      return Math.max(0, Math.min(100, pct));
    }
    if (q.type === "multi_select") {
      var selected = Array.isArray(raw) ? raw : [];
      var totalPossible = 0, got = 0;
      (q.answers || []).forEach(function (a) {
        var s = typeof a.score === "number" ? a.score : 0;
        if (s > 0) totalPossible += s;
        if (selected.indexOf(a.tag) !== -1) got += s;
      });
      if (totalPossible === 0) {
        var goodTags = q.good_tags || [];
        if (goodTags.length === 0) return selected.length > 0 ? 50 : 0;
        var hits = selected.filter(function (t) { return goodTags.indexOf(t) !== -1; }).length;
        return Math.min(100, (hits / goodTags.length) * 100);
      }
      return Math.max(0, Math.min(100, (got / totalPossible) * 100));
    }
    if (q.type === "short_text") {
      var text = String(raw || "").toLowerCase();
      var kw = q.score_keywords || {};
      var best = 0;
      if (kw.automated && kw.automated.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) best = Math.max(best, 95);
      else if (kw.semi && kw.semi.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) best = Math.max(best, 60);
      else if (kw.manual && kw.manual.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) best = Math.max(best, 20);
      return best || 50;
    }
    return null;
  }
  function computeResult(data, answers) {
    var ctx = {};
    (data.categories || []).forEach(function (cat) {
      (cat.questions || []).forEach(function (q) {
        ctx[q.id] = answers[q.id];
        ctx[q.id + "_score"] = normalizeAnswer(q, answers[q.id]);
      });
    });
    if (data.persona_selector) {
      var pAns = answers["__persona"];
      if (typeof pAns === "number" && data.persona_selector.answers && data.persona_selector.answers[pAns]) {
        ctx.persona = data.persona_selector.answers[pAns].tag || null;
      }
    }
    var perCategory = {};
    (data.categories || []).forEach(function (cat) {
      var key = cat.id || cat.name;
      if (cat.scoring_formula) {
        var v = safeEval(cat.scoring_formula, ctx);
        if (v != null) perCategory[key] = { name: cat.name || cat.id, score: Math.round(v), answered: (cat.questions || []).length, total: (cat.questions || []).length };
      } else {
        var total = 0, weight = 0;
        (cat.questions || []).forEach(function (q) {
          var s = ctx[q.id + "_score"];
          if (s == null) return;
          var w = q.weight || 1;
          total += s * w; weight += w;
        });
        if (weight > 0) perCategory[key] = { name: cat.name || cat.id, score: Math.round(total / weight), answered: (cat.questions || []).length, total: (cat.questions || []).length };
      }
    });
    var overall;
    if (data.overall_scoring_formula) {
      overall = Math.round(safeEval(data.overall_scoring_formula, Object.assign({}, ctx, Object.fromEntries(Object.entries(perCategory).map(function (e) { return [e[0] + "_score", e[1].score]; })))) || 0);
    } else {
      var scores = Object.values(perCategory).map(function (c) { return c.score; });
      overall = scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0;
    }
    var th = data.tier_thresholds || { low: 40, mid: 70 };
    var tier = overall <= th.low ? { name: th.low_label || "Critical", class: "low" }
             : overall <= th.mid ? { name: th.mid_label || "Growth Stage", class: "medium" }
             : { name: th.high_label || "Optimized", class: "" };
    var sorted = Object.entries(perCategory).sort(function (a, b) { return a[1].score - b[1].score; });
    var weakest = sorted.length ? { id: sorted[0][0], name: sorted[0][1].name, score: sorted[0][1].score } : null;
    var computed = {};
    (data.computed_outputs || []).forEach(function (co) {
      var v = safeEval(co.formula, Object.assign({}, ctx, { overall_score: overall, weakest_category: weakest && weakest.id }));
      computed[co.id] = { id: co.id, label: co.label, value: v, format: co.format, show: co.show_in_result !== false };
    });
    return { overall: overall, tier: tier, per_category: perCategory, weakest: weakest, persona: ctx.persona, ctx: ctx, computed: computed };
  }
  return { fmt: fmt, safeEval: safeEval, normalizeAnswer: normalizeAnswer, computeResult: computeResult };
});
```

Then in `_engine/assessment-v2.js`: delete the inline `fmt` (27-38), `safeEval` (90-103), `normalizeAnswer` (107-153), and `computeResult` (167-237) function definitions, and near the top of the IIFE add:

```js
var LMScore = (typeof window !== "undefined" && window.LMScore) || {};
var fmt = LMScore.fmt, safeEval = LMScore.safeEval, normalizeAnswer = LMScore.normalizeAnswer;
function computeResult(data, answers) { return LMScore.computeResult(data, answers); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test _engine/assessment-score.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Verify the demo still renders unchanged**

Use the `playwright-driver` skill to load `file://<repo>/_engine/demo/assessment-v2/index.html`, complete the assessment with the `default` values, and screenshot the result. Confirm the score, leaky-bucket, and computed outputs match the pre-change render (compare against a screenshot taken before Step 3). First add the two new `<script src="/_engine/assessment-score.js"></script>` (and, after Task 3, `embed-brand.js`) tags BEFORE `assessment-v2.js` in `_engine/demo/assessment-v2/index.html`.

- [ ] **Step 6: Commit**

```bash
git add _engine/assessment-score.js _engine/assessment-score.test.mjs _engine/assessment-v2.js _engine/demo/assessment-v2/index.html
git commit -m "refactor(lm): extract v2 scoring core into testable assessment-score.js"
```

---

### Task 2: Compat shim — v2 renders legacy scored-choice questions

**Files:**
- Modify: `_engine/assessment-score.js` (`normalizeAnswer`)
- Modify: `_engine/assessment-score.test.mjs`

**Interfaces:**
- Consumes: `LMScore.normalizeAnswer` from Task 1.
- Produces: `normalizeAnswer` now handles an untyped legacy question whose stored `raw` is the selected option INDEX (v2's default `renderLikert` stores the index), mapping via `q.answers[raw].score / max` to 0..100.

- [ ] **Step 1: Write the failing test**

Add to `_engine/assessment-score.test.mjs`:

```js
test("normalizeAnswer: legacy untyped question scores by option index", () => {
  // Legacy shape: no `type`; answers carry `score`; raw is the chosen index.
  const q = { max_score: 5, answers: [{ label: "a", score: 1 }, { label: "b", score: 3 }, { label: "c", score: 5 }] };
  assert.equal(score.normalizeAnswer(q, 2), 100); // index 2 => score 5 => 5/5 => 100
  assert.equal(score.normalizeAnswer(q, 0), 20);  // score 1 => 1/5 => 20
});

test("normalizeAnswer: legacy question derives max from option max when max_score absent", () => {
  const q = { answers: [{ label: "a", score: 0 }, { label: "b", score: 3 }] };
  assert.equal(score.normalizeAnswer(q, 1), 100); // score 3, optMax 3 => 100
});

test("computeResult: a legacy-shaped LM yields non-zero overall (regression guard for the 0/100 bug)", () => {
  const data = {
    slug: "legacy", categories: [
      { id: "c1", name: "C1", questions: [{ id: "q1", max_score: 5, answers: [{ label: "lo", score: 1 }, { label: "hi", score: 5 }] }] }
    ], tier_thresholds: { low: 40, mid: 70 }
  };
  const res = score.computeResult(data, { q1: 1 }); // index 1 => score 5 => 100
  assert.equal(res.overall, 100);
  assert.ok(res.per_category.c1, "category must be populated, not empty");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test _engine/assessment-score.test.mjs`
Expected: FAIL — legacy cases return `null` / overall 0 (the current bug).

- [ ] **Step 3: Write minimal implementation**

In `_engine/assessment-score.js`, inside `normalizeAnswer`, replace the final `return null;` (the fall-through after `short_text`) with a legacy scored-choice fallback that mirrors `assessment.js:59-76`:

```js
    // Legacy fallback: untyped scored-choice question. `raw` is the option index
    // (v2's default renderLikert stores the index). Map option score to 0-100.
    var idx = typeof raw === "number" ? raw : Number(raw);
    if (!isNaN(idx) && q.answers && q.answers[idx] && typeof q.answers[idx].score === "number") {
      var maxScore = q.max_score;
      if (maxScore == null) {
        var optMax = 0;
        for (var oi = 0; oi < q.answers.length; oi++) {
          var osc = q.answers[oi] && q.answers[oi].score;
          if (typeof osc === "number" && osc > optMax) optMax = osc;
        }
        if (optMax > 0) maxScore = optMax;
      }
      maxScore = maxScore || 5;
      return Math.max(0, Math.min(100, (q.answers[idx].score / maxScore) * 100));
    }
    return null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test _engine/assessment-score.test.mjs`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add _engine/assessment-score.js _engine/assessment-score.test.mjs
git commit -m "fix(lm): v2 renders legacy scored-choice questions (compat shim)"
```

---

### Task 3: Parity across all 27 live legacy assessments

**Files:**
- Create: `_engine/assessment-parity.test.mjs`

**Interfaces:**
- Consumes: `LMScore.computeResult` (with compat shim from Task 2). Loads real `<slug>/data.json` files from disk.

- [ ] **Step 1: Write the failing test**

Create `_engine/assessment-parity.test.mjs`. It discovers every live assessment LM (a `<slug>/index.html` that loads `_engine/assessment.js` AND has a `data.json`), builds an all-middle-option answer set, and asserts v2 produces a populated, non-zero result:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import score from "./assessment-score.js";

const ROOT = join(import.meta.dirname, "..");

function legacyAssessmentSlugs() {
  return readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
    .filter((d) => {
      const idx = join(ROOT, d.name, "index.html");
      const dj = join(ROOT, d.name, "data.json");
      if (!existsSync(idx) || !existsSync(dj)) return false;
      return readFileSync(idx, "utf8").includes("_engine/assessment.js");
    })
    .map((d) => d.name);
}

// Middle option for each question (legacy answers are scored radio lists).
function midAnswers(data) {
  const a = {};
  (data.categories || []).forEach((cat) => (cat.questions || []).forEach((q) => {
    const opts = q.answers || [];
    a[q.id] = opts.length ? Math.floor(opts.length / 2) : 0;
  }));
  if (data.persona_selector) a["__persona"] = 0;
  return a;
}

test("every live legacy assessment renders non-zero under v2", () => {
  const slugs = legacyAssessmentSlugs();
  assert.ok(slugs.length >= 20, `expected many legacy assessments, found ${slugs.length}`);
  const broken = [];
  for (const slug of slugs) {
    const data = JSON.parse(readFileSync(join(ROOT, slug, "data.json"), "utf8"));
    const res = score.computeResult(data, midAnswers(data));
    if (!(res.overall > 0) || Object.keys(res.per_category).length === 0) broken.push(slug);
  }
  assert.deepEqual(broken, [], `these render 0/100 or empty under v2: ${broken.join(", ")}`);
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `node --test _engine/assessment-parity.test.mjs`
Expected: PASS if Task 2's shim is complete. If any slug appears in `broken`, that `data.json` uses a shape the shim doesn't cover — inspect it, extend the shim in `assessment-score.js`, and re-run. Do NOT weaken the assertion.

- [ ] **Step 3: Commit**

```bash
git add _engine/assessment-parity.test.mjs
git commit -m "test(lm): parity guard — all live legacy assessments render non-zero under v2"
```

---

### Task 4: Port the color/font brand-mirror math (pure) + wire embed mode into v2

**Files:**
- Create: `_engine/embed-brand.js`
- Create: `_engine/embed-brand.test.mjs`
- Modify: `_engine/assessment-v2.js` (call embed setup in `render`)
- Modify: `_engine/demo/assessment-v2/index.html` (load `embed-brand.js`)

**Interfaces:**
- Produces: `LMEmbed.parse(hex)->[r,g,b]|null`, `LMEmbed.hex([r,g,b])->"#rrggbb"`, `LMEmbed.mix(c,t,a)->[r,g,b]`, `LMEmbed.clamp(n)->0..255`, `LMEmbed.safeFam(name)->string`, `LMEmbed.buildEmbedVars(params)->{ css, fontLink }` where `params` is a `URLSearchParams`. Attaches to `window.LMEmbed` (browser) + `module.exports` (Node).
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test**

Create `_engine/embed-brand.test.mjs`:

```js
import assert from "node:assert/strict";
import { test } from "node:test";
import embed from "./embed-brand.js";

test("parse handles 3- and 6-digit hex, rejects junk", () => {
  assert.deepEqual(embed.parse("#0f0"), [0, 255, 0]);
  assert.deepEqual(embed.parse("2a8f65"), [42, 143, 101]);
  assert.equal(embed.parse("nope"), null);
});

test("hex round-trips and clamps", () => {
  assert.equal(embed.hex([42, 143, 101]), "#2a8f65");
  assert.equal(embed.clamp(300), 255);
});

test("safeFam strips unsafe chars", () => {
  assert.equal(embed.safeFam("DM Serif Display; }"), "DM Serif Display");
});

test("buildEmbedVars maps ?accent to --accent CSS", () => {
  const p = new URLSearchParams("accent=2a8f65");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("--accent:#2a8f65"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test _engine/embed-brand.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `_engine/embed-brand.js` as a UMD-lite module (same wrapper shape as `assessment-score.js`). Port the pure helpers `clamp`, `parse`, `hex`, `mix`, `safeFam` verbatim from `assessment.js:217-231`, and wrap the CSS-string assembly from `assessment.js:226-353` into `buildEmbedVars(params)` returning `{ css, fontLink }` (where `fontLink` is the Google Fonts href string or null). Keep every rule from the source block; the only change is reading from the passed `params` instead of the closure's `__params`, and returning strings instead of touching the DOM.

```js
/* LM embed brand-mirror math — pure, DOM-free. window.LMEmbed + Node module. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LMEmbed = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function clamp(x) { return Math.max(0, Math.min(255, Math.round(x))); }
  function parse(h) {
    h = (h || "").replace(/[^0-9a-fA-F]/g, "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function hex(c) { return "#" + c.map(function (x) { return clamp(x).toString(16).padStart(2, "0"); }).join(""); }
  function mix(c, t, a) { return [c[0] + (t[0] - c[0]) * a, c[1] + (t[1] - c[1]) * a, c[2] + (t[2] - c[2]) * a]; }
  function safeFam(n) { n = (n || "").replace(/[^\w \-]/g, "").trim(); return n; }
  function buildEmbedVars(params) {
    // PORT: reproduce the full CSS-generation block from assessment.js:226-353,
    // reading each value via params.get(...). Return { css, fontLink }.
    // (Copy the source block; substitute __params -> params; collect the Google
    // Fonts href into `fontLink` instead of appending a <link>; concatenate all
    // rules into `css` instead of appending a <style>. No DOM calls here.)
    // The minimal slice required by the Step-1 test:
    var rgb = parse(params.get("accent")) || [91, 130, 166];
    var css = ".lmc-embed .lmc-root{--accent:" + hex(rgb) + ";}";
    var fontLink = null;
    /* ...remaining ported rules appended to `css` here (fonts, bg, ink, hero=dark, template-tell pass)... */
    return { css: css, fontLink: fontLink };
  }
  return { clamp: clamp, parse: parse, hex: hex, mix: mix, safeFam: safeFam, buildEmbedVars: buildEmbedVars };
});
```

> Implementer note: the code block above is the module skeleton plus the test-covered slice. The `/* ...remaining ported rules... */` marker means: copy every remaining rule from `assessment.js:232-353` (fonts link, `?bg`, `?ink`, `?r`, `?hero=dark` + `hero_bg`/`accent2`, and the template-tell pass) into `css`, verbatim except for the `__params`→`params` rename and DOM-append→string-concat changes. This is a mechanical port, not a redesign; do not drop rules.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test _engine/embed-brand.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire embed mode into v2 render**

In `_engine/assessment-v2.js` `render(data, root)`, near the top add the embed detection + injection, mirroring `assessment.js:198-382` but calling the ported module:

```js
var __params = new URLSearchParams(location.search);
var embedMode = __params.get("src") === "scan_embed" || __params.get("embed") === "1";
if (embedMode && window.LMEmbed) {
  try {
    document.documentElement.classList.add("lmc-embed");
    var __nav = document.querySelector(".im-nav"); if (__nav) __nav.remove();
    var __ft = document.querySelector(".im-footer"); if (__ft) __ft.remove();
    var built = window.LMEmbed.buildEmbedVars(__params);
    if (built.fontLink) { var gfl = document.createElement("link"); gfl.rel = "stylesheet"; gfl.href = built.fontLink; document.head.appendChild(gfl); }
    var st = document.createElement("style"); st.textContent = built.css; document.head.appendChild(st);
    // Identity pass (bname/blogo) — port verbatim from assessment.js:364-378
    var bname = (__params.get("bname") || "").trim();
    if (bname) { var baseTitle = (document.title || "").split(" | ")[0].trim() || String(data.title || "Assessment").replace(/<[^>]*>/g, "").trim(); document.title = baseTitle + " | " + bname; var ogSite = document.querySelector('meta[property="og:site_name"]'); if (ogSite) ogSite.setAttribute("content", bname); }
    var blogo = (__params.get("blogo") || "").trim();
    if (blogo && /^https?:\/\//i.test(blogo)) { var icons = document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]'); for (var ii = 0; ii < icons.length; ii++) icons[ii].setAttribute("href", blogo); }
    // Optional prospect logo atop the hero
    var embedLogoUrl = (__params.get("logo") || "").trim();
    if (embedLogoUrl) { window.__lm_embed_logo = embedLogoUrl; } // consumed by the hero render
  } catch (_) {}
}
```

Add the `?logo=` render into the hero block (mirror `assessment.js:411-415`): if `window.__lm_embed_logo`, prepend an `<img class="lmc-embed-logo">` to the hero container. Also ensure v2 does not write localStorage in embed mode (guard the `save()` and initial `answers` load: `var answers = embedMode ? {} : (…localStorage…)`), mirroring `assessment.js:398`.

- [ ] **Step 6: Verify embed render with playwright-driver**

Load `file://<repo>/_engine/demo/assessment-v2/index.html?src=scan_embed&accent=ff6a00&bname=Acme&font=Poppins` (after adding `<script src="/_engine/embed-brand.js"></script>` before `assessment-v2.js` in the demo wrapper). Confirm: accent recolored to orange, nav/footer removed, tab title ends with "| Acme", body font is Poppins. Screenshot for the record.

- [ ] **Step 7: Commit**

```bash
git add _engine/embed-brand.js _engine/embed-brand.test.mjs _engine/assessment-v2.js _engine/demo/assessment-v2/index.html
git commit -m "feat(lm): port color/font brand-mirror into v2 embed mode"
```

---

### Task 5: Configurable capture gate in v2

**Files:**
- Modify: `_engine/assessment-score.js` (add pure `shouldGate` helper)
- Modify: `_engine/assessment-score.test.mjs`
- Modify: `_engine/assessment-v2.js` (`renderResult` / `renderUnlocked`)

**Interfaces:**
- Produces: `LMScore.shouldGate(data, captured, embedMode) -> boolean`. Gate is ON by default; OFF when `data.capture_gate === false` or `data.gate === false`, or when `captured`/`embedMode` is true.
- Consumes: the gate DOM from the legacy engine (`assessment.js:855-`), rendered before `renderUnlocked`.

- [ ] **Step 1: Write the failing test**

Add to `_engine/assessment-score.test.mjs`:

```js
test("shouldGate defaults ON, respects opt-out flag, captured, and embed", () => {
  assert.equal(score.shouldGate({}, false, false), true);
  assert.equal(score.shouldGate({ capture_gate: false }, false, false), false);
  assert.equal(score.shouldGate({ gate: false }, false, false), false);
  assert.equal(score.shouldGate({}, true, false), false);   // already captured
  assert.equal(score.shouldGate({}, false, true), false);   // embed sample: never gate
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test _engine/assessment-score.test.mjs`
Expected: FAIL — `shouldGate` undefined.

- [ ] **Step 3: Write minimal implementation**

In `_engine/assessment-score.js`, add and export `shouldGate`:

```js
  function shouldGate(data, captured, embedMode) {
    if (embedMode || captured) return false;
    if (data && (data.capture_gate === false || data.gate === false)) return false;
    return true;
  }
```

Add `shouldGate: shouldGate` to the returned object.

Then in `_engine/assessment-v2.js` `renderResult`: after computing `res` and rendering the score hero + computed block, branch on `LMScore.shouldGate(data, !!localStorage.getItem(key + ".email"), embedMode)`. If gated, render the capture form (port the gate markup + submit handler from `assessment.js:855-` and its capture `beacon`) and reveal `renderUnlocked(res)` only after a valid email is submitted (persist to `localStorage[key + ".email"]` and fire the `capture` beacon). If not gated, call `renderUnlocked(res)` directly (current v2 behavior). Keep the existing optional opt-in form for the non-gated path.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test _engine/assessment-score.test.mjs`
Expected: PASS.

- [ ] **Step 5: Verify gate on/off with playwright-driver**

Create two throwaway fixtures under `_engine/demo/`: one v2 `data.json` with no gate flag (expect gate blocks the full report until email), one with `"capture_gate": false` (expect full report shown immediately). Load each, complete it, confirm gate behavior. Screenshot both.

- [ ] **Step 6: Commit**

```bash
git add _engine/assessment-score.js _engine/assessment-score.test.mjs _engine/assessment-v2.js
git commit -m "feat(lm): configurable capture gate in v2 (default on, opt-out via data.json)"
```

---

### Task 6: Non-regression smoke — legacy LMs untouched

**Files:**
- Reference: `scripts/validate-lms.py`, `test/index.html`

**Interfaces:**
- Consumes: nothing. Verifies the additive guarantee.

- [ ] **Step 1: Confirm no live wrapper was repointed**

Run: `grep -rl "_engine/assessment-v2.js" --include=index.html . | grep -v _engine/demo`
Expected: no output (only the demo references v2).

- [ ] **Step 2: Run the repo's LM validator**

Run: `python3 scripts/validate-lms.py`
Expected: PASS / no new failures vs a pre-change baseline run. If `validate-lms.py` needs an argument or config, read its `--help`/header first and run it the way the repo intends.

- [ ] **Step 3: Run the full engine test suite**

Run: `node --test _engine/`
Expected: PASS (scoring core, compat shim, parity, embed-brand, gate).

- [ ] **Step 4: Spot-check one real legacy LM in the browser**

With `playwright-driver`, load one live legacy assessment (e.g. `file://<repo>/william-brown-14-assessment/index.html`) and confirm it still renders via `assessment.js` exactly as before (unchanged). Screenshot.

- [ ] **Step 5: Commit (if any fixture/baseline files were added)**

```bash
git add -A && git commit -m "test(lm): non-regression smoke for phase 2 engine changes"
```

---

## Follow-on (NOT in this plan): Phase 2 — Generator subsystem

The multi-tenant multiplier — teaching the n8n **Lead Magnets** workflow to emit the v2 schema (`type` per question, `normalize_formula`/`scoring_formula`, `computed_outputs`) plus the **render-QA validation gate** (run each generated `data.json` through `assessment-score.js` headless with synthetic answers; block publish on non-finite/out-of-range outputs) — is a separate plan against the n8n workflow (live-workflow inspection required). `assessment-score.js` from Task 1 is deliberately Node-importable so the render-QA gate can reuse the exact production scoring core. Ship this engine plan first; the generator plan consumes it.

## Self-Review

- **Spec coverage:** compat shim (Task 2), brand-mirror port / non-regression of embed (Task 4), configurable gate (Task 5), additive-safety (Global Constraints + Task 6), truth invariant (Task 1 extraction makes scoring deterministic + Node-testable; reused by render-QA in the follow-on). Generator schema + render-QA explicitly scoped to the follow-on plan.
- **Placeholder scan:** the only deferred content is the mechanical CSS port in Task 4 Step 3, bounded by exact source line refs (`assessment.js:232-353`) with explicit "copy verbatim, rename `__params`→`params`, DOM-append→string-concat" instructions — not an open-ended TODO.
- **Type consistency:** `LMScore.{fmt,safeEval,normalizeAnswer,computeResult,shouldGate}` and `LMEmbed.{clamp,parse,hex,mix,safeFam,buildEmbedVars}` are used consistently across tasks and tests.
