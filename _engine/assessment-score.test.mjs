import assert from "node:assert/strict";
import { test } from "node:test";
import score from "./assessment-score.js"; // CJS default import

test("safeEval computes arithmetic from ctx", () => {
  assert.equal(score.safeEval("(a + b) / 2", { a: 100, b: 0 }), 50);
});

test("safeEval rejects non-whitelisted expressions", () => {
  assert.equal(score.safeEval("window.location", { window: 1 }), null);
});

test("safeEval blocks constructor RCE", () => {
  assert.equal(score.safeEval("constructor.constructor('return 42')()", {}), null);
  assert.equal(score.safeEval("x.constructor.constructor('return 1')()", { x: 1 }), null);
  assert.equal(score.safeEval("x['constructor']", { x: 1 }), null);
  assert.equal(score.safeEval("({}).__proto__", {}), null);
  assert.equal(score.safeEval("(function(){return 1})()", {}), null);
  assert.equal(score.safeEval("globalThis.process", {}), null);
});

test("safeEval preserves real scoring formulas", () => {
  assert.equal(score.safeEval("Math.min(100, x * 8)", { x: 6 }), 48);
  assert.equal(score.safeEval("(door_count_score + team_size_score) / 2", { door_count_score: 76, team_size_score: 48 }), 62);
  assert.equal(score.safeEval("Math.max(0, 100 - (x * 1.5))", { x: 30 }), 55);
  assert.equal(score.safeEval("Math.log10(1000)", {}), 3);
  assert.equal(score.safeEval("x < 50 ? 1 : x < 80 ? 0.5 : 0.25", { x: 40 }), 1);
  assert.equal(score.safeEval("x * 0.5 + reporting_hours / 4.33", { x: 10, reporting_hours: 0 }), 5); // decimals must survive
  assert.equal(score.safeEval("has(stack, 'appfolio')", { stack: ["appfolio", "sheets"] }), true);
  assert.equal(score.safeEval("countSel(stack)", { stack: ["a", "b"] }), 2);
});

test("normalizeAnswer: likert scores by option INDEX (default 1..N options)", () => {
  // default likert, no answers[] -> option index i represents value i+1
  assert.equal(score.normalizeAnswer({ type: "likert", max_score: 5 }, 0), 20);  // first option = value 1 -> 1/5
  assert.equal(score.normalizeAnswer({ type: "likert", max_score: 5 }, 4), 100); // last option = value 5 -> 5/5
  assert.equal(score.normalizeAnswer({ type: "likert", max_score: 4 }, 0), 25);  // 1/4
});
test("normalizeAnswer: likert with explicit answers[].score maps index->score", () => {
  var q = { type: "likert", max_score: 5, answers: [{score:1},{score:2},{score:3},{score:4},{score:5}] };
  assert.equal(score.normalizeAnswer(q, 0), 20);   // answers[0].score=1 -> 1/5
  assert.equal(score.normalizeAnswer(q, 4), 100);  // answers[4].score=5 -> 5/5
});
test("normalizeAnswer: likert guards bad index", () => {
  assert.equal(score.normalizeAnswer({ type: "likert" }, "abc"), null);
  assert.equal(score.normalizeAnswer({ type: "likert" }, -1), null);
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
  const res = score.computeResult(data, { q1: 4 }); // likert index 4 (last option) => value 5/5 => 100
  assert.equal(res.overall, 100);
  assert.equal(res.per_category.c1.score, 100);
  assert.equal(res.computed.leak.value, 1000);
});

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

test("shouldGate defaults ON, respects opt-out flag, captured, and embed", () => {
  assert.equal(score.shouldGate({}, false, false), true);
  assert.equal(score.shouldGate({ capture_gate: false }, false, false), false);
  assert.equal(score.shouldGate({ gate: false }, false, false), false);
  assert.equal(score.shouldGate({}, true, false), false);   // already captured
  assert.equal(score.shouldGate({}, false, true), false);   // embed sample: never gate
});
