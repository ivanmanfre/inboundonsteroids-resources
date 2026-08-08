// R1B (2026-07-22): report-only smoke test for deployed resource pages.
// For each top-level resource dir touched by the deployed commit:
//   1. live page fetch: 200 + closes </html>
//   2. every /_engine/*.js|css referenced by the page resolves 200
//   3. data.json (when the dir ships one) fetches 200 + parses as JSON
//   4. capture path: lm-beacon POST for a synthetic view (src=ci_smoke) returns non-5xx
// Failures are written to .ci/smoke-report.md (committed by the workflow). Exit code is
// always 0 — this gate reports, it never blocks (Ivan flips it to blocking if he wants).
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const BASE = "https://resources.ivanmanfredi.com";
const BEACON = "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

const changed = execSync("git diff --name-only HEAD~1 HEAD", { encoding: "utf8" })
  .split("\n").filter(Boolean);
const dirs = [...new Set(changed
  .map(f => f.split("/")[0])
  .filter(d => d && !d.startsWith(".") && !d.startsWith("_") &&
               !["scripts", "supabase", "assets", "node_modules"].includes(d) &&
               existsSync(`${d}/index.html`)))];

if (!dirs.length) { console.log("no resource dirs changed - nothing to smoke"); process.exit(0); }
console.log("smoking:", dirs.join(", "));

const failures = [];
const get = async (url) => {
  try { const r = await fetch(url, { redirect: "follow" }); return { status: r.status, text: await r.text() }; }
  catch (e) { return { status: 0, text: String(e) }; }
};

for (const dir of dirs) {
  const page = await get(`${BASE}/${dir}/`);
  if (page.status !== 200) { failures.push(`${dir}: page HTTP ${page.status}`); continue; }
  if (!/<\/html>\s*$/i.test(page.text.trim())) failures.push(`${dir}: page HTML does not close </html>`);
  const assets = [...page.text.matchAll(/(?:src|href)="(\/_engine\/[^"]+\.(?:js|css))"/g)].map(m => m[1]);
  for (const a of [...new Set(assets)]) {
    const r = await get(`${BASE}${a}`);
    if (r.status !== 200) failures.push(`${dir}: engine asset ${a} HTTP ${r.status}`);
  }
  if (existsSync(`${dir}/data.json`)) {
    const dj = await get(`${BASE}/${dir}/data.json`);
    if (dj.status !== 200) failures.push(`${dir}: data.json HTTP ${dj.status}`);
    else { try { JSON.parse(dj.text); } catch { failures.push(`${dir}: data.json does not parse`); } }
  }
  try {
    const b = await fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_type: "view", tool_type: "ci", lm_slug: dir, src: "ci_smoke" }) });
    if (b.status >= 500) failures.push(`${dir}: beacon POST HTTP ${b.status}`);
  } catch (e) { failures.push(`${dir}: beacon POST unreachable (${e})`); }
}

if (failures.length) {
  mkdirSync(".ci", { recursive: true });
  writeFileSync(".ci/smoke-report.md",
    `# Resource smoke failures\n\nDeploy: ${process.env.GITHUB_SHA || "local"} at ${new Date().toISOString()}\n\n` +
    failures.map(f => `- ${f}`).join("\n") + "\n");
  console.error("FAILURES:\n" + failures.join("\n"));
} else {
  console.log("all green:", dirs.length, "dir(s)");
}
process.exit(0);
