#!/usr/bin/env node
/**
 * Migrate baked-HTML guide LMs to the _engine/guide.js engine.
 *
 * Usage:
 *   node migrate-guides-to-engine.js               # dry-run, writes to migration-output/
 *   node migrate-guides-to-engine.js --slug=<x>    # single guide
 *   node migrate-guides-to-engine.js --commit      # write to the live repo (one commit per guide)
 *   node migrate-guides-to-engine.js --no-diff     # skip visual diff (faster, riskier)
 *   node migrate-guides-to-engine.js --list        # just print slugs and exit
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from "node:fs";
import { execSync, spawn } from "node:child_process";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBakedGuide } from "./parser.js";
import { captureToBuffer, diffPngs } from "./visual-diff.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = resolve(__dirname, "..", "migration-output");
const LIVE_BASE = "https://resources.inboundonsteroids.com";
// Threshold = catastrophic-only. The engine intentionally restyles guides from
// the old Tailwind/comic baked palette to the paper/sage brand + adds Ivan's
// portrait, so a 5–25% pixel diff is expected design migration. We only refuse
// to commit when drift exceeds 50% (signals a totally broken render) OR when
// the parser produced 0 sections (signals structural extraction failure).
const DIFF_THRESHOLD_PCT = 50.0;
const MIN_SECTIONS = 1;

const argv = process.argv.slice(2);
const args = new Set(argv);
const slugArg = (argv.find((a) => a.startsWith("--slug=")) || "").split("=")[1];
const COMMIT = args.has("--commit");
const NO_DIFF = args.has("--no-diff");
const LIST = args.has("--list");

const SKIP_DIRS = new Set([
  "_engine", "assets", "dashboard", "proposals", "test", "workflow",
  "scripts", "migration-output", ".git", ".github", "node_modules",
]);

// Slugs to skip from migration. Reasoned exclusions only.
// - how-to-document-...specialist: content lives in a Google Sheet <iframe>;
//   .resource-content is empty. Migration would discard the iframe payload.
const SKIP_SLUGS = new Set([
  "how-to-document-your-processes-for-automation-the-right-way-to-brief-an-automation-specialist",
]);

function isBakedGuide(slug) {
  if (SKIP_DIRS.has(slug)) return false;
  if (SKIP_SLUGS.has(slug)) return false;
  if (slug.startsWith("test-") || slug.startsWith(".") || slug.startsWith("_")) return false;
  const dir = resolve(RESOURCES_ROOT, slug);
  if (!existsSync(join(dir, "index.html"))) return false;
  if (existsSync(join(dir, "data.json"))) return false; // already engine-driven
  const html = readFileSync(join(dir, "index.html"), "utf8");
  // Must have resource-content (true baked guide layout). Title can come from
  // .hero-title, the first <h1>, or fall back to <title>.
  return /class=["'][^"']*\bresource-content\b[^"']*["']/.test(html);
}

function listCandidateSlugs() {
  if (slugArg) return [slugArg];
  return readdirSync(RESOURCES_ROOT).filter(isBakedGuide).sort();
}

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function buildThinWrapper(slug, data) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(data.title)} | Ivan Manfredi</title>
<meta name="description" content="${escapeHtml(data.subtitle || "")}">
<link rel="canonical" href="${LIVE_BASE}/${slug}/">
<meta property="og:title" content="${escapeHtml(data.title)}">
<meta property="og:description" content="${escapeHtml(data.subtitle || "")}">
<meta property="og:type" content="article">
<meta property="og:image" content="${LIVE_BASE}/${slug}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#4C6E3D">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${LIVE_BASE}/_engine/shared.css">
<link rel="stylesheet" href="${LIVE_BASE}/_engine/guide.css">
<style>body{margin:0;font-family:'Space Grotesk',sans-serif;background:#F7F4EF;color:#1A1A1A;}</style>
</head>
<body>
<main id="lmc-root" data-lm-guide-src="./data.json"></main>
<script src="${LIVE_BASE}/_engine/shared.js"></script>
<script src="${LIVE_BASE}/_engine/guide.js"></script>
</body>
</html>
`;
}

function startStaticServer(dir) {
  // Pick a random high port to avoid collisions
  const port = 8000 + Math.floor(Math.random() * 1500);
  const proc = spawn("python3", ["-m", "http.server", String(port), "-d", dir, "--bind", "127.0.0.1"], {
    stdio: ["ignore", "ignore", "ignore"],
    detached: true,
  });
  return { port, proc, kill: () => { try { process.kill(-proc.pid); } catch (_) { try { proc.kill("SIGKILL"); } catch (__) {} } } };
}

async function waitForPort(port, ms = 3000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`);
      if (r.status === 200 || r.status === 404) return true;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function migrateOne(slug, opts) {
  console.log(`\n▶ ${slug}`);
  const dir = resolve(RESOURCES_ROOT, slug);
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const data = parseBakedGuide(html, slug);
  const wrapper = buildThinWrapper(slug, data);
  console.log(`  parsed: ${data.sections.length} sections · ${data.estimated_minutes} min · "${data.title}"`);

  if (data.sections.length < MIN_SECTIONS) {
    console.log(`  ✕ parser produced ${data.sections.length} sections (< ${MIN_SECTIONS}) — refusing`);
    return { slug, ok: false, reason: "no_sections_extracted" };
  }

  const outDir = opts.commit ? dir : join(OUTPUT_DIR, slug);
  if (!opts.commit) {
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  }

  // Visual diff first (if not skipped)
  let diffResult = null;
  if (!opts.noDiff) {
    const liveUrl = `${LIVE_BASE}/${slug}/`;
    const tmpDir = `/tmp/lm-migrate-${slug}-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, "index.html"), wrapper);
    writeFileSync(join(tmpDir, "data.json"), JSON.stringify(data, null, 2));
    const server = startStaticServer(tmpDir);
    await waitForPort(server.port);
    try {
      const [liveBuf, newBuf] = await Promise.all([
        captureToBuffer(liveUrl),
        captureToBuffer(`http://127.0.0.1:${server.port}/`),
      ]);
      const diffDir = opts.commit ? "/tmp/lm-migrate-diffs" : outDir;
      if (!existsSync(diffDir)) mkdirSync(diffDir, { recursive: true });
      const diffPath = join(diffDir, `${opts.commit ? slug + "-" : ""}_diff.png`);
      const livePath = join(diffDir, `${opts.commit ? slug + "-" : ""}_live.png`);
      const newPath = join(diffDir, `${opts.commit ? slug + "-" : ""}_new.png`);
      writeFileSync(livePath, liveBuf);
      writeFileSync(newPath, newBuf);
      diffResult = diffPngs(liveBuf, newBuf, diffPath);
      console.log(`  visual diff: ${diffResult.pctDiff.toFixed(2)}% (${diffResult.numDiff} / ${diffResult.totalPixels} px)`);
      console.log(`    live:  ${livePath}`);
      console.log(`    new:   ${newPath}`);
      console.log(`    diff:  ${diffPath}`);
      if (diffResult.pctDiff > DIFF_THRESHOLD_PCT) {
        console.log(`  ⚠ DIFF EXCEEDS ${DIFF_THRESHOLD_PCT}%`);
        if (opts.commit) {
          console.log(`  ✕ refusing to commit ${slug} — review diff before forcing`);
          return { slug, ok: false, reason: "visual_diff_exceeded", pctDiff: diffResult.pctDiff };
        }
      }
    } finally {
      server.kill();
    }
  }

  // Write the actual files
  if (opts.commit) {
    copyFileSync(join(dir, "index.html"), join(dir, "original.html.bak"));
    writeFileSync(join(dir, "data.json"), JSON.stringify(data, null, 2));
    writeFileSync(join(dir, "index.html"), wrapper);
    execSync(`git add "${slug}/data.json" "${slug}/index.html" "${slug}/original.html.bak"`, { cwd: RESOURCES_ROOT });
    const msg = `migrate(${slug}): convert baked guide to engine-driven data.json\n\nPhase C migration. Original preserved at ${slug}/original.html.bak.\nSections: ${data.sections.length} · Est min: ${data.estimated_minutes}\nVisual drift: ${diffResult ? diffResult.pctDiff.toFixed(2) + "%" : "skipped"}\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`;
    execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: RESOURCES_ROOT });
    console.log(`  ✓ committed`);
  } else {
    writeFileSync(join(outDir, "data.json"), JSON.stringify(data, null, 2));
    writeFileSync(join(outDir, "index.html"), wrapper);
    console.log(`  ✓ wrote to ${outDir}`);
  }
  return { slug, ok: true, pctDiff: diffResult?.pctDiff ?? null };
}

async function main() {
  const slugs = listCandidateSlugs();
  console.log(`Found ${slugs.length} baked guides`);
  if (LIST) {
    slugs.forEach((s) => console.log(s));
    return;
  }
  if (!COMMIT) {
    if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Dry-run output: ${OUTPUT_DIR}`);
  } else {
    // Sanity: ensure clean tree
    const st = execSync(`git status --porcelain`, { cwd: RESOURCES_ROOT }).toString().trim();
    if (st) {
      console.error("✕ working tree not clean. commit or stash before --commit.");
      process.exit(1);
    }
  }
  const results = [];
  for (const slug of slugs) {
    try {
      const r = await migrateOne(slug, { commit: COMMIT, noDiff: NO_DIFF });
      results.push(r);
    } catch (err) {
      console.error(`  ✕ ${slug} failed: ${err.message}`);
      results.push({ slug, ok: false, reason: err.message });
    }
  }
  console.log(`\n${results.filter((r) => r.ok).length} OK / ${results.filter((r) => !r.ok).length} FAIL`);
  results.filter((r) => !r.ok).forEach((r) => console.log(`  FAIL: ${r.slug} (${r.reason || "?"})`));
  if (!COMMIT) console.log(`Inspect dry-run output, then re-run with --commit when ready.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
