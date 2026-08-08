/* LM embed brand-mirror math — pure, DOM-free. window.LMEmbed + Node module.
   Ported verbatim from assessment.js:198-382 (embed color/font/identity CSS
   generation). All DOM writes there (createElement/appendChild) become
   string return values here so this module is testable without a browser
   and reusable by v2's render(). Do not drop rules when editing — see
   task-4-brief.md for the port contract. */
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
  // --- HSL + WCAG luminance (hero-hue math, 2026-07-23) -----------------------
  // The old hero mixed the accent 80% toward near-black, which drains the hue: a
  // muted mid-tone (5B82A6) collapsed to charcoal. To keep the hue we work in HSL
  // (hue is preserved exactly) and pick the BRIGHTEST lightness that still clears
  // AA contrast (relative luminance <= target) against the white headline — so the
  // band reads as a confident, saturated version of the accent, never black.
  function rgb2hsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var h = 0, s = 0, l = (mx + mn) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, s, l];
  }
  function hsl2rgb(h, s, l) {
    var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  function relLum(rgb) {
    function lin(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  }
  // Accent recolored to a given max relative-luminance, hue preserved, saturation
  // floored at minSat (so a muted accent still reads vivid). Binary-searches the
  // largest lightness whose luminance <= targetLum → maximally hued yet AA-legible.
  function accentAtLum(rgb, targetLum, minSat) {
    var hsl = rgb2hsl(rgb), h = hsl[0], s = Math.max(hsl[1], minSat);
    var lo = 0.03, hi = 0.6;
    for (var i = 0; i < 24; i++) {
      var mid = (lo + hi) / 2;
      if (relLum(hsl2rgb(h, s, mid)) <= targetLum) lo = mid; else hi = mid;
    }
    return hsl2rgb(h, s, lo);
  }

  function buildEmbedVars(params) {
    var accentParsed = parse(params.get("accent"));
    var rgb = accentParsed || [91, 130, 166]; // slate fallback
    // Prospect fonts: the pipeline reads the lead's REAL typefaces off their site and (guardrail)
    // only forwards them when they resolve to loadable Google families. ?font= heading, ?fontb=
    // body. Absent (custom/unloadable font, or no brand) → a neutral system sans, never Ivan's serif.
    var NEUTRAL = '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif';
    var qHead = safeFam(params.get("font"));
    var qBody = safeFam(params.get("fontb")) || qHead;
    // ?headstyle=serif — the lead's headline is an UPRIGHT serif (editorial brands like NoShoot:
    // a ui-serif/Georgia display headline over a sans body). The heading family renders upright
    // with the light-italic pivot killed (see the pivot block below), and its fallback becomes a
    // serif stack (not the sans NEUTRAL) so a serif still shows before the webfont loads. Body
    // stays sans regardless — the editorial pattern is serif display + sans UI.
    // Serif headline is triggered either explicitly (?headstyle=serif, set by the capture pipeline
    // via font_heading_style) OR by auto-detecting that the passed heading family (?font=, already
    // forwarded today) is a serif — so an editorial lead renders upright-serif even before the
    // frontend forwards the explicit flag. A sans ?font= never triggers it. Kept narrow to real
    // serif families so a sans brand is never mis-routed.
    var qHeadIsSerif = qHead && /(georgia|times|garamond|playfair|merriweather|lora|source serif|pt serif|noto serif|newsreader|fraunces|dm serif|freight|tiempos|canela|cormorant|book antiqua|palatino|spectral|baskerville|caslon|minion|didot|bodoni|recoleta)/i.test(qHead);
    var headSerif = ((params.get("headstyle") || "").trim() === "serif") || qHeadIsSerif;
    var SERIF_FALL = 'Georgia,"Times New Roman",Times,serif';
    var HEADFALL = headSerif ? SERIF_FALL : NEUTRAL;
    var HEAD = qHead ? '"' + qHead + '",' + HEADFALL : HEADFALL;
    var BODY = qBody ? '"' + qBody + '",' + NEUTRAL : NEUTRAL;
    // ?hero=dark — opt-in dark hero theme (see block further down). Parsed early
    // because the dark hero sets the headline at display weight 800 + italic cuts,
    // so the heading family needs those axes requested up front.
    var heroDark = (params.get("hero") || "").trim() === "dark";
    var headAxes = heroDark
      ? ":ital,wght@0,400;0,500;0,700;0,800;1,400;1,600;1,700;1,800"
      : ":ital,wght@0,400;0,500;0,700;1,400";
    var fontLink = null;
    if (qHead || qBody) {
      var fams = [];
      if (qHead) fams.push("family=" + encodeURIComponent(qHead).replace(/%20/g, "+") + headAxes);
      if (qBody && qBody !== qHead) fams.push("family=" + encodeURIComponent(qBody).replace(/%20/g, "+") + ":wght@400;500;600;700");
      fontLink = "https://fonts.googleapis.com/css2?" + fams.join("&") + "&display=swap";
    }
    var css = ".lmc-embed .lmc-root{" +
      "--accent:" + hex(rgb) + ";" +
      "--accent-light:" + hex(mix(rgb, [255, 255, 255], 0.32)) + ";" +
      "--accent-ink:" + hex(mix(rgb, [0, 0, 0], 0.26)) + ";" +
      "--accent-soft:" + hex(rgb) + "14;" +
      "--accent-glow:rgba(" + clamp(rgb[0]) + "," + clamp(rgb[1]) + "," + clamp(rgb[2]) + ",.18);" +
      "--font-sans:" + BODY + ";--font-drama:" + HEAD + ";--font-mono:" + BODY + "}" +
      // Beat the hardcoded `!important` serif rules in shared.css/assessment.css. Body font
      // everywhere, the lead's display font on the headline surfaces.
      "html.lmc-embed .lmc-root,html.lmc-embed .lmc-root *{font-family:" + BODY + " !important;letter-spacing:normal !important}" +
      "html.lmc-embed .lmc-h1,html.lmc-embed .lmc-h1 *,html.lmc-embed .lmc-question,html.lmc-embed .lmc-question *,html.lmc-embed .lmc-intro-h,html.lmc-embed .lmc-intro-h *,html.lmc-embed .lmc-start-h,html.lmc-embed .lmc-start-h *,html.lmc-embed .lmc-capture h3,html.lmc-embed .lmc-score-ring .num,html.lmc-embed .lmc-score-hero .lmc-score-num{font-family:" + HEAD + " !important}";
    // Serif brands set the DISPLAY headlines in their serif but the section prompts in their sans
    // UI face — an upright-serif question reads heavy/wrong, so put questions back on the body sans.
    // shared.css forces headlines to a sans 800 weight + -0.035em tracking; a display serif reads
    // elegant at a book weight with near-normal tracking, so relax both on the serif surfaces.
    if (headSerif) {
      css += "html.lmc-embed .lmc-question,html.lmc-embed .lmc-question *{font-family:" + BODY + " !important}" +
        "html.lmc-embed .lmc-h1,html.lmc-embed .lmc-intro-h,html.lmc-embed .lmc-start-h,html.lmc-embed .lmc-capture h2,html.lmc-embed .lmc-capture h3,html.lmc-embed .lmc-score-headline,html.lmc-embed .lmc-unlocked>h3{font-weight:500 !important;letter-spacing:-0.005em !important}";
    }
    // The italic-pivot highlight sweep behind the H1/intro headline is a hardcoded green
    // SVG (fill=#131210) — the accent CSS var can't reach a data-uri, so it stayed Ivan-green
    // even in a slate/orange embed. Rebuild the same wavy sweep in the LEAD's accent.
    var sweep = "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 100' preserveAspectRatio='none'><path d='M 6 14 Q 70 10 140 14 Q 220 18 290 12 Q 350 15 394 16 L 394 86 Q 350 88 290 84 Q 220 92 140 86 Q 70 90 6 84 Z' fill='%23" + hex(rgb).slice(1) + "' opacity='0.78'/></svg>\")";
    css += "html.lmc-embed .lmc-h1 em::after,html.lmc-embed .lmc-h1 i::after,html.lmc-embed .lmc-start-h em::after,html.lmc-embed .lmc-start-h i::after,html.lmc-embed .lmc-intro-h em::after,html.lmc-embed .lmc-intro-h i::after{background-image:" + sweep + " !important}";
    css += ".lmc-embed-logo{display:block;height:34px;width:auto;max-width:190px;margin:0 0 1.5rem;object-fit:contain}";
    // Uniform intro icons: the editorial a/b/c treatment (accent / ink / outline)
    // reads as three accidental styles inside a client brand — one accent chip.
    // Emitted BEFORE the light-accent contrast guard so the deepened version
    // still wins when the accent is too light for white glyphs.
    css += "html.lmc-embed .lmc-intro-icon,html.lmc-embed .lmc-intro-icon.a,html.lmc-embed .lmc-intro-icon.b,html.lmc-embed .lmc-intro-icon.c{background:" + hex(rgb) + " !important;color:#fff !important;border:none !important}";
    // Contrast guard: a light brand accent (amber, mint, yellow) with white glyphs on it reads
    // washed out. When the accent is light, deepen the filled icon/pill chips so the white text
    // stays legible on the light paper.
    var lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    if (lum > 0.62) {
      var deep = hex(mix(rgb, [0, 0, 0], 0.45));
      css += "html.lmc-embed .lmc-intro-icon,html.lmc-embed .lmc-intro-icon.a,html.lmc-embed .lmc-intro-icon.b,html.lmc-embed .lmc-intro-icon.c{background:" + deep + " !important}";
    }
    // ?bg=RRGGBB — surface override. Ivan's warm cream paper reads off-brand inside a
    // clean-white or dark prospect site mockup; this swaps the paper family for theirs.
    var bgRgb = parse(params.get("bg"));
    if (bgRgb) {
      var sunk = hex(mix(bgRgb, [15, 23, 42], 0.05));
      css += "html.lmc-embed body,html.lmc-embed .lmc-root{--paper:" + hex(bgRgb) + ";--paper-sunk:" + sunk + ";background:" + hex(bgRgb) + " !important}";
    }
    // Deep brand pass. The engine's editorial ink-black buttons, DM Serif capture
    // heading, sage score-glow and critical-tier ink are IVAN tells inside a client
    // brand embed — accent-drive them. ?r= (radius px) + ?ink=RRGGBB complete the kit;
    // several targets hardcode colors/radius literals, so vars alone can't reach them.
    css += ".lmc-embed .lmc-btn,.lmc-embed .lmc-intro-start{background:" + hex(rgb) + " !important;color:#fff !important}" +
      ".lmc-embed .lmc-btn:hover,.lmc-embed .lmc-intro-start:hover{background:" + hex(mix(rgb, [0, 0, 0], 0.26)) + " !important}" +
      "html.lmc-embed .lmc-capture h2{font-family:" + HEAD + " !important}" +
      ".lmc-embed .lmc-score-hero{background:radial-gradient(ellipse at 50% 0%,rgba(" + clamp(rgb[0]) + "," + clamp(rgb[1]) + "," + clamp(rgb[2]) + ",0.10) 0%,transparent 70%) !important}" +
      ".lmc-embed [data-tier=critical] .ring-fill{stroke:" + hex(rgb) + " !important}" +
      ".lmc-embed [data-tier=critical] .lmc-score-number{color:" + hex(rgb) + " !important}" +
      ".lmc-embed [data-tier=critical] .lmc-score-eyebrow::before{background:" + hex(rgb) + " !important}" +
      ".lmc-embed [data-tier=critical] .lmc-score-headline em{color:" + hex(rgb) + " !important}" +
      ".lmc-embed .lmc-result .lmc-rec{border-left-color:rgba(" + clamp(rgb[0]) + "," + clamp(rgb[1]) + "," + clamp(rgb[2]) + ",0.35) !important}";
    var rPx = parseInt(params.get("r") || "", 10);
    if (!isNaN(rPx) && rPx >= 0 && rPx <= 24) {
      css += ".lmc-embed .lmc-btn,.lmc-embed .lmc-intro-start,.lmc-embed .lmc-btn-secondary,.lmc-embed .lmc-opt,.lmc-embed .lmc-card,.lmc-embed .lmc-form-input,.lmc-embed .lmc-capture{border-radius:" + rPx + "px !important}";
      // A rounded brand doesn't use a hard editorial left-rule on the question card — that's an
      // Ivan template tell. Turn the card into a soft rounded panel (white on the tinted field,
      // hairline border, even padding), matching how modern brands (NoShoot) box content.
      css += "html.lmc-embed .lmc-card{border-left:none !important;border:1px solid var(--line) !important;background:var(--paper-raise,#fff) !important;padding:1.9rem 2rem 2.2rem !important;box-shadow:0 1px 2px rgba(20,18,24,0.04) !important}";
    }
    var inkRgb = parse(params.get("ink"));
    if (inkRgb) {
      var inkHex = hex(inkRgb);
      css += ".lmc-embed .lmc-root{--ink:" + inkHex + ";--ink-soft:" + hex(mix(inkRgb, [255, 255, 255], 0.22)) + ";--ink-mute:" + hex(mix(inkRgb, [255, 255, 255], 0.34)) + "}" +
        ".lmc-embed .lmc-score-eyebrow,.lmc-embed .lmc-score-headline,.lmc-embed .lmc-score-note strong,.lmc-embed .lmc-category-block h4,.lmc-embed .lmc-result-unlock-h,.lmc-embed .lmc-start-h,.lmc-embed .lmc-start-meta{color:" + inkHex + " !important}" +
        ".lmc-embed .lmc-score-note,.lmc-embed .lmc-start-p{color:" + hex(mix(inkRgb, [255, 255, 255], 0.22)) + " !important}";
    }
    // De-template the editorial furniture for EXPLICITLY-branded embeds too (2026-07-23). The
    // sparse block below re-points --sage (the near-black #131210 that paints the question-card
    // rule, selected-option rails, score ring, progress fill, and category/tier dots) into the
    // accent hue — but it only fires when the accent is the SOLE brand signal. A lead WITH a
    // captured surface/ink fell to the less-branded path and kept the BLACK editorial furniture
    // (the hard left-rule on the question card that reads as a reused Ivan template). Re-point it
    // here whenever a brand accent is present alongside an explicit surface/ink. Mutually exclusive
    // with the sparse block (which requires no bg AND no ink); ?hero=dark owns its own treatment.
    if (accentParsed && !heroDark && (bgRgb || inkRgb)) {
      var aSage = hex(mix(rgb, [0, 0, 0], 0.30));
      css += "html.lmc-embed .lmc-root{--sage:" + aSage + ";--sage-ink:" + aSage + ";--sage-soft:rgba(" + clamp(rgb[0]) + "," + clamp(rgb[1]) + "," + clamp(rgb[2]) + ",0.10);--sage-faint:rgba(" + clamp(rgb[0]) + "," + clamp(rgb[1]) + "," + clamp(rgb[2]) + ",0.05)}";
    }
    // Template-tell pass (all embeds): the graph-paper hero grid and the hard
    // 6px square eyebrow/meta markers are Ivan-editorial signatures — inside a
    // client-brand embed they read as a reused template. Grid off, markers
    // become small round dots. Public (non-embed) LM pages are untouched.
    css += ".lmc-embed .lmc-hero{background-image:none !important}" +
      ".lmc-embed .lmc-badge::before,.lmc-embed .lmc-meta-chip::before,.lmc-embed .lmc-intro-badge::before,.lmc-embed .lmc-category::before,.lmc-embed .lmc-tier-pill::before,.lmc-embed .lmc-start-meta-dot{width:5px !important;height:5px !important;border-radius:50% !important}";
    // Ivan-identity strip (all embeds): the embed is framed as the PROSPECT's own deployed asset,
    // so every Ivan-voiced element must go: the site nav/footer (shared.js re-injects .im-footer
    // with Ivan's Calendly AFTER assessment-v2 strips the shell one — CSS outlives that race) and
    // the results share row (its share text attributes the assessment to Ivan Manfredi).
    // NOTE (2026-07-23): the intro is NO LONGER hidden — the embed now builds its own de-Ivanized
    // lead-in (buildIntroEmbed: no portrait, no "Hey I'm Ivan") so the sample opens with the same
    // orient-before-you-start card a resource page has. Only nav/footer/share stay stripped.
    // Public (non-embed) LM pages are untouched — this css only ships in embed mode.
    css += "html.lmc-embed .im-nav,html.lmc-embed .im-footer,html.lmc-embed .lmc-share{display:none !important}";
    // The embed intro carries no avatar, so collapse the avatar grid column and keep it airy.
    css += "html.lmc-embed .lmc-intro-inner{grid-template-columns:1fr !important}";
    // The question heading is programmatically focused for screen-reader flow; the default UA
    // focus ring on a non-interactive <h2> reads as a stray blue box in a branded sample. Hide it
    // (focus is still set for a11y; keyboard focus on the actual options keeps its own ring).
    css += "html.lmc-embed .lmc-question:focus{outline:none !important}";
    // Italic-pivot kill (embed mode, 2026-07-23): the light-italic second phrase on the
    // H1/intro/start headlines ("Campaign *Maturity Score*") is an Ivan editorial signature —
    // inside a client embed it reads as a reused template. When the lead did NOT pass a real
    // font (qHead), neutralize it: the em/i words render at the headline's own weight and style
    // (one coherent phrase), and the wavy accent sweep behind them is killed. When a font WAS
    // passed, the pivot renders in the lead's actual typeface, so it's a legit brand move — kept,
    // UNLESS ?headstyle=serif: an editorial serif brand (NoShoot) has a fully upright headline, so
    // the italic pivot + sweep are killed and the whole H1 renders as one upright serif phrase.
    // The ?hero=dark branch owns its own inline-italic accent2 pivot, so it opts out here.
    if ((!qHead || headSerif) && !heroDark) {
      css += "html.lmc-embed .lmc-h1 em,html.lmc-embed .lmc-h1 i,html.lmc-embed .lmc-start-h em,html.lmc-embed .lmc-start-h i,html.lmc-embed .lmc-intro-h em,html.lmc-embed .lmc-intro-h i{font-style:normal !important;font-weight:inherit !important}" +
        "html.lmc-embed .lmc-h1 em::after,html.lmc-embed .lmc-h1 i::after,html.lmc-embed .lmc-start-h em::after,html.lmc-embed .lmc-start-h i::after,html.lmc-embed .lmc-intro-h em::after,html.lmc-embed .lmc-intro-h i::after{content:none !important;background-image:none !important}";
    }
    // ?hero=dark&hero_bg=RRGGBB&accent2=RRGGBB — dark hero theme. Mirrors a
    // dark-hero brand site (e.g. deep forest green with a mint secondary):
    // hero surface = hero_bg, headline white at display weight, the em/i pivot
    // words render INLINE ITALIC in accent2 (their "Paid Ads & SEO" move) with
    // the wavy sweep killed, meta chips as white/50 text with small accent2
    // dots. Everything below the hero keeps the ?bg surface. Opt-in only.
    if (heroDark) {
      var hb = parse(params.get("hero_bg")) || inkRgb || [11, 35, 31];
      var a2 = parse(params.get("accent2")) || rgb;
      var hbHex = hex(hb), a2Hex = hex(a2);
      css += "html.lmc-embed .lmc-hero{background:" + hbHex + " !important;border-bottom:none !important;padding:4.5rem 1.5rem 4rem}" +
        "html.lmc-embed .lmc-hero::after{background:radial-gradient(ellipse 75% 60% at 82% 18%,rgba(" + clamp(a2[0]) + "," + clamp(a2[1]) + "," + clamp(a2[2]) + ",0.10),transparent 65%) !important}" +
        "html.lmc-embed .lmc-h1{color:#fff !important;font-weight:800 !important;font-size:clamp(2.35rem,5.5vw,3.7rem) !important;line-height:1.1 !important;letter-spacing:-0.015em !important;max-width:46rem}" +
        "html.lmc-embed .lmc-h1 em,html.lmc-embed .lmc-h1 i{color:" + a2Hex + " !important;font-style:italic !important;font-weight:800 !important;display:inline !important;padding:0 !important;isolation:auto !important}" +
        "html.lmc-embed .lmc-h1 em::after,html.lmc-embed .lmc-h1 i::after{content:none !important;background-image:none !important}" +
        "html.lmc-embed .lmc-sub{color:rgba(255,255,255,0.75) !important;font-style:italic}" +
        "html.lmc-embed .lmc-badge{color:rgba(255,255,255,0.55) !important}" +
        "html.lmc-embed .lmc-badge::before{background:" + a2Hex + " !important}" +
        "html.lmc-embed .lmc-meta,html.lmc-embed .lmc-meta-chip{color:rgba(255,255,255,0.5) !important}" +
        "html.lmc-embed .lmc-meta-chip::before{background:" + a2Hex + " !important}" +
        "html.lmc-embed .lmc-embed-logo{margin-bottom:2rem}" +
        // Below the hero the sweep highlighter is the loudest Ivan tell — off.
        // Italic pivots there render inline in the primary accent (dark enough
        // on the ?bg white surface), matching the brand's light sections.
        "html.lmc-embed .lmc-start-h em::after,html.lmc-embed .lmc-start-h i::after,html.lmc-embed .lmc-intro-h em::after,html.lmc-embed .lmc-intro-h i::after{content:none !important;background-image:none !important}" +
        "html.lmc-embed .lmc-start-h em,html.lmc-embed .lmc-start-h i,html.lmc-embed .lmc-intro-h em,html.lmc-embed .lmc-intro-h i{color:" + hex(rgb) + " !important;display:inline !important;padding:0 !important;isolation:auto !important}" +
        // Dark-hero brands set section headings bold — the 400-weight display
        // serif metrics read as someone else's site once the serif is swapped out.
        "html.lmc-embed .lmc-intro-h,html.lmc-embed .lmc-start-h,html.lmc-embed .lmc-question{font-weight:700 !important;letter-spacing:-0.01em !important}" +
        "html.lmc-embed .lmc-start-h{max-width:34rem !important}";
    }
    // Sparse-brand derivation (2026-07-22): scans almost always capture ONLY ?accent
    // (bg/hero/ink/fonts empty — real example anthony-hodges-94 → accent=5B82A6, rest blank).
    // With accent alone the engine keeps its ink-black editorial furniture (progress bar,
    // score ring, tier dots, option rails, italic pivots — all hardcoded to --sage=#131210 in
    // assessment-v2.css) and its near-white paper everywhere but the buttons, so the embed
    // reads as a cheap palette swap, not the lead's designed asset. When accent is the ONLY
    // brand signal, SYNTHESIZE a full treatment FROM the accent: a barely-there accent-tinted
    // page field, a confident deep accent-dark hero band with a white headline, and the whole
    // ink/score family re-pointed into the accent hue so the page carries one brand color end
    // to end. Generalizes across hues (blue/red/green all read intentional, never neon/muddy).
    // Explicit ?bg/?hero/?ink already fully brand the page, so they SUPPRESS this entirely —
    // it fires only in the sparse case and leaves every explicit-param output byte-identical.
    if (accentParsed && !bgRgb && !inkRgb && !heroDark) {
      var R = clamp(rgb[0]), G = clamp(rgb[1]), B = clamp(rgb[2]);
      var field = hex(mix(rgb, [255, 255, 255], 0.955)); // ~4.5% accent — barely-there page field
      var fieldSunk = hex(mix(rgb, [255, 255, 255], 0.91)); // deeper tint for sunk panels/hover
      // Hero band: a confident, saturated deep version of THE accent (hue preserved via HSL),
      // as a soft top-to-bottom gradient for depth. Both stops clear AA against white text
      // (luminance <= 0.16 → contrast >= 5.0); a stranger reads "this page is blue/red/green",
      // never "black". heroTop is the brightest AA-legal shade (most hue); heroBot is deeper.
      var heroTop = hex(accentAtLum(rgb, 0.150, 0.46));
      var heroBot = hex(accentAtLum(rgb, 0.075, 0.52));
      var aInk = hex(mix(rgb, [0, 0, 0], 0.35)); // accent-dark for ink moments (rings, rails, dots, pivots)
      var aLight = hex(mix(rgb, [255, 255, 255], 0.55)); // light accent for dots on the dark hero
      var bodyInk = hex(mix([19, 18, 16], rgb, 0.08)); // near-ink body text carrying a hint of the hue
      var lineA = "rgba(" + R + "," + G + "," + B + ",0.20)"; // hairlines in-hue
      // Page field + paper family: tints the hero/intro/widget surfaces the engine paints with
      // var(--paper); the dark score/capture panels (var(--ink)) pick up bodyInk = deep in-hue ink.
      css += "html.lmc-embed body,html.lmc-embed .lmc-root{--paper:" + field + ";--paper-sunk:" + fieldSunk + ";--paper-raise:#fff;background:" + field + " !important}" +
        // Re-point the editorial ink accents (assessment-v2.css --sage=#131210) into the accent
        // family: progress fill, score-ring arc, selected-option rail, tier/category/badge dots,
        // question & heading italics, form-focus ring — one var swap carries the whole hue.
        "html.lmc-embed .lmc-root{--sage:" + aInk + ";--sage-ink:" + aInk + ";--sage-soft:rgba(" + R + "," + G + "," + B + ",0.10);--sage-faint:rgba(" + R + "," + G + "," + B + ",0.05);--line:" + lineA + ";--line-soft:rgba(" + R + "," + G + "," + B + ",0.10);--ink:" + bodyInk + "}" +
        // Confident deep accent hero band with a white headline — the lead's brand moment,
        // replacing the flat near-black hero. The whole headline (incl. the former italic pivot)
        // reads as one solid white phrase; the italic/weight neutralization + sweep-kill are
        // handled by the embed-wide italic-pivot block above (fires when no font was passed).
        "html.lmc-embed .lmc-hero{background:linear-gradient(157deg," + heroTop + " 0%," + heroBot + " 100%) !important;border-bottom:none !important}" +
        "html.lmc-embed .lmc-h1{color:#fff !important}" +
        "html.lmc-embed .lmc-h1 em,html.lmc-embed .lmc-h1 i{color:#fff !important}" +
        "html.lmc-embed .lmc-sub{color:rgba(255,255,255,0.78) !important}" +
        "html.lmc-embed .lmc-badge{color:rgba(255,255,255,0.62) !important}" +
        "html.lmc-embed .lmc-badge::before{background:" + aLight + " !important}" +
        "html.lmc-embed .lmc-meta,html.lmc-embed .lmc-meta-chip{color:rgba(255,255,255,0.60) !important}" +
        "html.lmc-embed .lmc-meta-chip::before{background:" + aLight + " !important}" +
        // Options read as crisp white cards on the tinted field; selected rail is accent (via --sage).
        "html.lmc-embed .lmc-opt{background:#fff !important}" +
        "html.lmc-embed .lmc-opt:hover{background:" + fieldSunk + " !important}" +
        // Score-ring number joins the family (the arc/track already follow --sage/--line).
        "html.lmc-embed .lmc-score-ring .score-num .num{color:" + aInk + " !important}";
    }
    return { css: css, fontLink: fontLink };
  }

  return { clamp: clamp, parse: parse, hex: hex, mix: mix, safeFam: safeFam, rgb2hsl: rgb2hsl, hsl2rgb: hsl2rgb, relLum: relLum, accentAtLum: accentAtLum, buildEmbedVars: buildEmbedVars };
});
