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
