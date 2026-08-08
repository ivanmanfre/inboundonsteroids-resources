import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBakedGuide } from "./parser.js";

const FIXTURE_HTML = `<!DOCTYPE html><html><head>
<title>Test Guide | Ivan</title>
<meta name="description" content="A test guide subtitle." />
</head><body>
<div class="hero-title">Test Guide Title</div>
<p class="hero-intro">Welcome to this test guide. Here's what it's about.</p>
<div class="text-accent">2,259</div>
<div>11 Min Read</div>
<div>31 Sections</div>
<div class="resource-content">
  <p>Opening paragraph before any h2.</p>
  <hr>
  <h2>Section One Title</h2>
  <p>Body of section one paragraph A.</p>
  <p>Body of section one paragraph B.</p>
  <hr>
  <h2>Section Two Title</h2>
  <ul><li>Bullet 1</li><li>Bullet 2</li></ul>
</div>
</body></html>`;

test("parseBakedGuide extracts title from hero-title", () => {
  const data = parseBakedGuide(FIXTURE_HTML, "test-guide-slug");
  assert.equal(data.title, "Test Guide Title");
});

test("parseBakedGuide extracts subtitle from meta description", () => {
  const data = parseBakedGuide(FIXTURE_HTML, "test-guide-slug");
  assert.equal(data.subtitle, "A test guide subtitle.");
});

test("parseBakedGuide sets estimated_minutes from min-read chip", () => {
  const data = parseBakedGuide(FIXTURE_HTML, "test-guide-slug");
  assert.equal(data.estimated_minutes, 11);
});

test("parseBakedGuide splits sections on <hr>", () => {
  const data = parseBakedGuide(FIXTURE_HTML, "test-guide-slug");
  // Opening paragraph becomes intro; <hr> splits remaining
  assert.ok(data.sections.length === 2, "expected 2 sections, got " + data.sections.length);
});

test("parseBakedGuide assigns section IDs from slugified titles", () => {
  const data = parseBakedGuide(FIXTURE_HTML, "test-guide-slug");
  assert.equal(data.sections[0].id, "section-one-title");
  assert.equal(data.sections[1].id, "section-two-title");
});

test("parseBakedGuide preserves HTML body of sections", () => {
  const data = parseBakedGuide(FIXTURE_HTML, "test-guide-slug");
  assert.match(data.sections[0].html, /paragraph A/);
  assert.match(data.sections[1].html, /Bullet 1/);
});

test("parseBakedGuide includes slug in output", () => {
  const data = parseBakedGuide(FIXTURE_HTML, "test-guide-slug");
  assert.equal(data.slug, "test-guide-slug");
});

test("parseBakedGuide sets default self_prompt on each section", () => {
  const data = parseBakedGuide(FIXTURE_HTML, "test-guide-slug");
  data.sections.forEach((s) => {
    assert.ok(typeof s.self_prompt === "string" && s.self_prompt.length > 0);
  });
});

// Edge case: no <hr> separators — must still split on <h2>
const FIXTURE_NO_HR = `<!DOCTYPE html><html><head>
<title>NoHr Guide</title><meta name="description" content="No HR" />
</head><body>
<div class="hero-title">NoHr Guide</div>
<div>5 Min Read</div>
<div class="resource-content">
<p>Intro paragraph.</p>
<h2>First Section</h2>
<p>First body.</p>
<h2>Second Section</h2>
<p>Second body.</p>
</div>
</body></html>`;

test("parseBakedGuide splits on <h2> when no <hr>", () => {
  const data = parseBakedGuide(FIXTURE_NO_HR, "no-hr");
  assert.equal(data.sections.length, 2, "expected 2 sections, got " + data.sections.length);
  assert.equal(data.sections[0].title, "First Section");
  assert.equal(data.sections[1].title, "Second Section");
  assert.match(data.sections[0].html, /First body/);
  assert.match(data.sections[1].html, /Second body/);
});

// Edge case: section with h3 nested inside — preserve in section.html
const FIXTURE_NESTED = `<!DOCTYPE html><html><head>
<title>Nested</title><meta name="description" content="Has h3" />
</head><body>
<div class="hero-title">Nested</div>
<div>5 Min Read</div>
<div class="resource-content">
<h2>Main Section</h2>
<h3>Sub heading</h3>
<p>Body.</p>
<pre><code>preserved code block</code></pre>
</div>
</body></html>`;

test("parseBakedGuide preserves h3 + pre/code inside sections", () => {
  const data = parseBakedGuide(FIXTURE_NESTED, "nested");
  assert.equal(data.sections.length, 1);
  assert.match(data.sections[0].html, /Sub heading/);
  assert.match(data.sections[0].html, /preserved code block/);
});

// Edge case: estimated_minutes fallback to default when no chip
const FIXTURE_NO_MIN = `<!DOCTYPE html><html><head><title>X</title><meta name="description" content="x"/></head><body>
<div class="hero-title">X</div>
<div class="resource-content"><h2>S</h2><p>body</p></div>
</body></html>`;
test("parseBakedGuide defaults estimated_minutes when chip missing", () => {
  const data = parseBakedGuide(FIXTURE_NO_MIN, "x");
  assert.equal(typeof data.estimated_minutes, "number");
  assert.ok(data.estimated_minutes > 0);
});

// Edge case: empty .resource-content (e.g. content lives in an iframe).
// Parser returns 0 sections — caller is responsible for the SKIP_SLUGS guard.
const FIXTURE_EMPTY_CONTENT = `<!DOCTYPE html><html><head>
<title>IframeOnly</title><meta name="description" content="iframe-driven"/>
</head><body>
<div class="hero-title">IframeOnly</div>
<div>10 Min Read</div>
<div class="resource-content"></div>
<iframe src="https://example.com/sheet"></iframe>
</body></html>`;
test("parseBakedGuide returns 0 sections when resource-content is empty", () => {
  const data = parseBakedGuide(FIXTURE_EMPTY_CONTENT, "iframe-only");
  assert.equal(data.sections.length, 0);
  assert.equal(data.title, "IframeOnly");
});
