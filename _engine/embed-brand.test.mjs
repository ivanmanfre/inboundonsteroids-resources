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

test("buildEmbedVars builds Google Fonts link + font-family overrides", () => {
  const p = new URLSearchParams("font=Poppins");
  const { css, fontLink } = embed.buildEmbedVars(p);
  assert.ok(fontLink && fontLink.includes("Poppins"));
  assert.ok(css.includes('"Poppins"'));
});

test("buildEmbedVars applies ?bg surface override", () => {
  const p = new URLSearchParams("bg=ffffff");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("--paper:#ffffff"));
});

test("buildEmbedVars applies ?ink pass", () => {
  const p = new URLSearchParams("ink=112233");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("--ink:#112233"));
});

test("buildEmbedVars applies ?r radius override within bounds", () => {
  const p = new URLSearchParams("r=8");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("border-radius:8px !important"));
});

test("buildEmbedVars ignores out-of-range ?r", () => {
  const p = new URLSearchParams("r=99");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(!css.includes("border-radius:99px"));
});

test("buildEmbedVars applies ?hero=dark theme with hero_bg/accent2", () => {
  const p = new URLSearchParams("hero=dark&hero_bg=0b231f&accent2=00ff88");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("background:#0b231f !important"));
  assert.ok(css.includes("color:#00ff88 !important"));
});

test("buildEmbedVars always includes the template-tell pass", () => {
  const p = new URLSearchParams("accent=ff6a00");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes(".lmc-embed .lmc-hero{background-image:none !important}"));
});

// Color-math coverage: mix()-derived var, the lum > 0.62 contrast-guard branch,
// and the no-?accent slate fallback. Expected hex literals computed via
// `embed.hex(embed.mix(...))` for the exact inputs below and pinned here so the
// tests assert the port's math, not just direct hex passthrough.
test("buildEmbedVars derives --accent-light via mix(), not passthrough", () => {
  const p = new URLSearchParams("accent=2a8f65");
  const { css } = embed.buildEmbedVars(p);
  // mix([42,143,101],[255,255,255],0.32) -> hex -> #6eb396
  assert.ok(css.includes("--accent-light:#6eb396"));
});

test("buildEmbedVars deepens intro-icon fill when accent is light (lum > 0.62 contrast guard)", () => {
  const p = new URLSearchParams("accent=ffe08a");
  const rgb = embed.parse("ffe08a");
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  assert.ok(lum > 0.62, "fixture accent must exceed the contrast-guard threshold");
  const { css } = embed.buildEmbedVars(p);
  // mix([255,224,138],[0,0,0],0.45) -> hex -> #8c7b4c
  assert.ok(css.includes(".lmc-intro-icon.c{background:#8c7b4c !important}"));
});

test("buildEmbedVars falls back to slate #5b82a6 when ?accent is absent", () => {
  const p = new URLSearchParams("");
  const { css } = embed.buildEmbedVars(p);
  assert.ok(css.includes("--accent:#5b82a6"));
});

// --- Sparse-brand derivation: accent is the ONLY brand signal (the common scan case).
// Synthesizes a tinted page field, a deep accent-dark hero band, and re-points the
// editorial ink family (--sage/--ink/--line) into the accent hue.
// Pull the first hex color out of the synthesized hero `background:` declaration
// (a linear-gradient of two deep-accent stops). Returns [r,g,b] or null.
function heroBandColor(css) {
  const m = css.match(/html\.lmc-embed \.lmc-hero\{background:[^;]*?(#[0-9a-fA-F]{6})/);
  return m ? embed.parse(m[1]) : null;
}

test("sparse derivation fires when only ?accent is present (accent=5b82a6)", () => {
  const p = new URLSearchParams("accent=5b82a6");
  const { css } = embed.buildEmbedVars(p);
  const rgb = embed.parse("5b82a6");
  // Tinted page field: mix(accent,white,0.955)
  assert.ok(css.includes("--paper:" + embed.hex(embed.mix(rgb, [255, 255, 255], 0.955))));
  // Synthesized deep-accent hero band (a gradient, not the old near-black mix)
  assert.ok(css.includes("html.lmc-embed .lmc-hero{background:linear-gradient("), "hero is a synthesized gradient band");
  // White headline on the dark band
  assert.ok(css.includes("html.lmc-embed .lmc-h1{color:#fff !important}"));
  // Editorial ink accents re-pointed into the accent hue via --sage = mix(accent,black,0.35)
  assert.ok(css.includes("--sage:" + embed.hex(embed.mix(rgb, [0, 0, 0], 0.35))));
});

// The core fix: for a muted mid-tone accent the hero must read as THAT hue, not black.
// Assert the synthesized band (a) keeps the accent's hue, (b) is clearly chromatic, and
// (c) clears AA vs white text.
test("sparse hero stays IN-HUE and never collapses to near-black (muted 5b82a6)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6"));
  const band = heroBandColor(css);
  assert.ok(band, "hero band color parsed");
  const accentHsl = embed.rgb2hsl(embed.parse("5b82a6"));
  const bandHsl = embed.rgb2hsl(band);
  const hueDelta = Math.abs(bandHsl[0] - accentHsl[0]);
  assert.ok(Math.min(hueDelta, 360 - hueDelta) < 12, `hue preserved (Δ=${hueDelta.toFixed(1)}°)`);
  assert.ok(bandHsl[1] > 0.30, `band is saturated, not grey (s=${bandHsl[1].toFixed(2)})`);
  assert.ok(embed.relLum(band) <= 0.18, `AA vs white headline (lum=${embed.relLum(band).toFixed(3)})`);
});

test("sparse hero stays in-hue across red / green / light-amber and holds AA", () => {
  for (const h of ["e02020", "2a8f65", "f4b400"]) {
    const { css } = embed.buildEmbedVars(new URLSearchParams("accent=" + h));
    const band = heroBandColor(css);
    assert.ok(band, h + " band parsed");
    const aH = embed.rgb2hsl(embed.parse(h))[0], bH = embed.rgb2hsl(band)[0];
    const dHue = Math.min(Math.abs(bH - aH), 360 - Math.abs(bH - aH));
    assert.ok(dHue < 12, h + ` hue preserved (Δ=${dHue.toFixed(1)}°)`);
    assert.ok(embed.rgb2hsl(band)[1] > 0.30, h + " band saturated");
    assert.ok(embed.relLum(band) <= 0.18, h + ` AA vs white (lum=${embed.relLum(band).toFixed(3)})`);
    assert.ok(css.includes("--paper:" + embed.hex(embed.mix(embed.parse(h), [255, 255, 255], 0.955))), h + " field");
  }
});

// The generic light-italic pivot is an Ivan tell — killed in embed mode unless a font was passed.
test("italic pivot is neutralized in embed mode when no font is passed", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6"));
  assert.ok(css.includes("html.lmc-embed .lmc-h1 em,html.lmc-embed .lmc-h1 i,html.lmc-embed .lmc-start-h em,html.lmc-embed .lmc-start-h i,html.lmc-embed .lmc-intro-h em,html.lmc-embed .lmc-intro-h i{font-style:normal !important;font-weight:inherit !important}"), "em/i forced upright + same weight");
});

test("italic pivot is PRESERVED when the lead passed a real font (legit brand styling)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6&font=Poppins"));
  assert.ok(!css.includes("{font-style:normal !important;font-weight:inherit !important}"), "font present → pivot kept in the lead's typeface");
});

test("sparse derivation is SUPPRESSED when ?bg is explicit (existing behavior preserved)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6&bg=ffffff"));
  assert.ok(!css.includes("html.lmc-embed .lmc-hero{background:"), "no synthesized hero band");
  assert.ok(css.includes("--paper:#ffffff"), "explicit bg still wins");
});

test("sparse derivation is SUPPRESSED when ?ink is explicit", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6&ink=112233"));
  assert.ok(!css.includes("html.lmc-embed .lmc-hero{background:"));
});

test("sparse derivation is SUPPRESSED when ?hero=dark is explicit", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6&hero=dark"));
  // The dark-hero branch owns the hero here; the sparse --sage re-point must NOT appear.
  assert.ok(!css.includes("--sage:" + embed.hex(embed.mix(embed.parse("5b82a6"), [0, 0, 0], 0.35))));
});

test("sparse derivation does NOT fire when ?accent is absent (no synthesized band on bare fallback)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams(""));
  assert.ok(!css.includes("html.lmc-embed .lmc-hero{background:"));
});

// --- ?headstyle=serif — upright serif headline path (editorial brands like NoShoot) ---
test("headstyle=serif kills the italic pivot EVEN WITH a font passed (upright serif headline)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=4e347f&font=Newsreader&headstyle=serif"));
  assert.ok(css.includes("{font-style:normal !important;font-weight:inherit !important}"), "em/i forced upright in serif mode");
  assert.ok(css.includes('"Newsreader"'), "serif heading family still applied to the headline");
});

test("headstyle=serif puts questions back on the sans body face", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=4e347f&font=Newsreader&fontb=Geist&headstyle=serif"));
  const NEUTRAL = '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif';
  assert.ok(css.includes('html.lmc-embed .lmc-question,html.lmc-embed .lmc-question *{font-family:"Geist",' + NEUTRAL + ' !important}'), "questions on the sans body face");
});

test("headstyle=serif uses a serif fallback stack on the heading (not the sans neutral)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=4e347f&font=Newsreader&headstyle=serif"));
  assert.ok(css.includes('"Newsreader",Georgia,"Times New Roman",Times,serif'), "serif fallback under the webfont");
});

test("auto-detect: a passed SERIF font triggers the upright-serif path without ?headstyle", () => {
  // The deployed frontend forwards ?font= but not ?headstyle yet — a serif heading family alone
  // must route to upright serif so an editorial lead resembles their site today.
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=4e347f&font=Newsreader"));
  assert.ok(css.includes("{font-style:normal !important;font-weight:inherit !important}"), "serif font auto-triggers upright pivot-kill");
  assert.ok(css.includes('"Newsreader",Georgia,"Times New Roman",Times,serif'), "serif fallback stack applied");
});

test("auto-detect: a passed SANS font keeps the italic pivot (not mis-routed to serif)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=4e347f&font=Poppins"));
  assert.ok(!css.includes("{font-style:normal !important;font-weight:inherit !important}"), "sans font → pivot preserved, no serif path");
  assert.ok(!css.includes('Georgia,"Times New Roman",Times,serif'), "no serif fallback for a sans brand");
});

// --- De-template: --sage re-points to accent for explicitly-branded embeds too ---
test("explicit-brand embed (accent + bg) re-points --sage into the accent hue (no black rails)", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=4e347f&bg=f7f5fb&ink=171429"));
  const aSage = embed.hex(embed.mix(embed.parse("4e347f"), [0, 0, 0], 0.30));
  assert.ok(css.includes("--sage:" + aSage), "card rule / rails / rings re-pointed to accent");
  assert.ok(!css.includes("html.lmc-embed .lmc-hero{background:linear-gradient("), "sparse band NOT fired when bg/ink explicit");
});

test("accent-only embed still routes through the SPARSE path, not the explicit re-point", () => {
  // The explicit re-point must be mutually exclusive with sparse (which requires no bg AND no ink).
  const { css } = embed.buildEmbedVars(new URLSearchParams("accent=5b82a6"));
  assert.ok(css.includes("html.lmc-embed .lmc-hero{background:linear-gradient("), "accent-only → sparse band");
});

test("bare fallback (no accent) does NOT emit the explicit --sage re-point", () => {
  const { css } = embed.buildEmbedVars(new URLSearchParams("bg=ffffff"));
  const aSage = embed.hex(embed.mix([91, 130, 166], [0, 0, 0], 0.30));
  assert.ok(!css.includes("--sage:" + aSage), "no accent parsed → no re-point");
});
