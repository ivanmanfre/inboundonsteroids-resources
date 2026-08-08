/* LM Assessment Engine — JSON-spec driven, single <style>, keyboard-accessible, partial-reveal capture */
(function () {
  "use strict";
  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  function $(s, c) { return (c || document).querySelector(s); }
  function make(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html !== undefined) e.innerHTML = html; return e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
  var escapeHtml = esc;
  function toast(msg) { var t = $("#lmc-toast"); if (!t) { t = make("div", { id: "lmc-toast", class: "lmc-toast" }); document.body.appendChild(t); } t.textContent = msg; t.classList.add("show"); setTimeout(function () { t.classList.remove("show"); }, 2500); }
  function beacon(event_type, payload) {
    // Edit mode active → no-op (mitigation #6)
    // Sync URL check catches the race where async token validation hasn't resolved yet
    try {
      if (new URLSearchParams(location.search).get("edit")) return;
      if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) return;
    } catch (_) {}
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({ event_type: event_type, lm_slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || "", src: q.get("src") || "direct", utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign"), term: q.get("utm_term"), content: q.get("utm_content") }, prospect_id: q.get("pid") || null, referrer: document.referrer || "" }, payload || {});
      if (navigator.sendBeacon) navigator.sendBeacon(BEACON, new Blob([JSON.stringify(body)], { type: "application/json" }));
      else fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
    } catch (_) {}
  }

  function storageKey(slug, suf) { return "ivan.assessment." + slug + "." + suf; }
  function loadAnswers(slug) { try { return JSON.parse(localStorage.getItem(storageKey(slug, "answers")) || "{}"); } catch (_) { return {}; } }
  function saveAnswers(slug, a) { try { localStorage.setItem(storageKey(slug, "answers"), JSON.stringify(a)); } catch (_) {} }
  function loadEmail(slug) { try { return localStorage.getItem(storageKey(slug, "email")) || ""; } catch (_) { return ""; } }
  function saveEmail(slug, e) { try { localStorage.setItem(storageKey(slug, "email"), e); } catch (_) {} }

  function flattenQuestions(data) {
    // Build a linear question list across all categories; prepend persona classifier if present
    var qs = [];
    if (data.persona_selector) qs.push(Object.assign({ __persona: true, category_id: "__persona", category_name: "About you" }, data.persona_selector));
    (data.categories || []).forEach(function (cat) {
      (cat.questions || []).forEach(function (q) {
        qs.push(Object.assign({}, q, { category_id: cat.id || cat.name || "", category_name: cat.name || cat.id || "" }));
      });
    });
    return qs;
  }

  function computeResult(data, answers) {
    // Overall score: average of per-category averages, scaled to 0-100
    var perCategory = {};
    // Persona answers store under the selector's own id when it has one
    // (slides key on q.id || "__persona"); index 0 is a valid answer.
    var personaKey = (data.persona_selector && data.persona_selector.id) || "__persona";
    var personaAnswer = answers[personaKey] != null ? answers[personaKey]
                      : (answers.__persona != null ? answers.__persona : null);
    (data.categories || []).forEach(function (cat) {
      var scores = [];
      (cat.questions || []).forEach(function (q) {
        var a = answers[q.id];
        if (a != null) {
          // Answer can be an index into q.answers (if provided) or a 1-5 likert value
          var val = null;
          if (q.answers && q.answers[a] && typeof q.answers[a].score === "number") val = q.answers[a].score;
          else if (typeof a === "number") val = a;
          else if (!isNaN(Number(a))) val = Number(a);
          if (val != null && !isNaN(val)) {
            // D6 guard: when max_score is absent, derive it from the real
            // option maximum instead of assuming 5 — a 0-3 scored question
            // under the 5 default could never reach 100.
            var maxScore = q.max_score;
            if (maxScore == null && q.answers && q.answers.length) {
              var optMax = 0;
              for (var oi = 0; oi < q.answers.length; oi++) {
                var osc = q.answers[oi] && q.answers[oi].score;
                if (typeof osc === "number" && osc > optMax) optMax = osc;
              }
              if (optMax > 0) maxScore = optMax;
            }
            maxScore = maxScore || 5;
            scores.push((val / maxScore) * 100);
          }
        }
      });
      if (scores.length) {
        perCategory[cat.id || cat.name] = {
          name: cat.name || cat.id,
          score: Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length),
          answered: scores.length,
          total: (cat.questions || []).length
        };
      }
    });
    var vals = Object.values(perCategory).map(function (c) { return c.score; });
    var overall = vals.length ? Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) : 0;

    // Tier
    var th = data.tier_thresholds || { low: 40, mid: 70 };
    // D6 guard: thresholds are percentages of the normalized 0-100 scale.
    // A payload emitting absolute-scale or inverted values falls back safely.
    if (!(typeof th.low === "number" && typeof th.mid === "number" && th.low >= 0 && th.mid <= 100 && th.low < th.mid)) {
      try { console.warn("[lm-assessment] invalid tier_thresholds", th, "— using {low:40, mid:70}"); } catch (_) {}
      th = { low: 40, mid: 70 };
    }
    var tier = overall <= th.low ? { name: "Critical", class: "low" } :
               overall <= th.mid ? { name: "Growth Stage", class: "medium" } :
               { name: "Optimized", class: "" };

    // Weakest category
    var weakest = null;
    var sortedCats = Object.entries(perCategory).sort(function (a, b) { return a[1].score - b[1].score; });
    if (sortedCats.length) weakest = { id: sortedCats[0][0], name: sortedCats[0][1].name, score: sortedCats[0][1].score };

    return { overall: overall, tier: tier, per_category: perCategory, weakest: weakest, persona: personaAnswer };
  }

  function pickRec(cat, score) {
    var recs = cat.recommendations || {};
    if (score <= 40) return recs.low || recs.critical || null;
    if (score <= 70) return recs.mid || recs.growth || null;
    return recs.high || recs.optimized || null;
  }


  function buildIntro(data, startTargetSelector, opts) {
    opts = opts || {};
    var intro = data.intro || {};
    var welcomeLine = intro.paragraph || (data.subtitle ? "You just grabbed " + (data.title || "this resource") + ". " + String(data.subtitle).replace(/\.$/, "") + "." : "You just grabbed " + (data.title || "this resource") + ". Here's the quickest way to use it.");
    var pointA = intro.point_time || (data.estimated_minutes ? data.estimated_minutes + " min, at your pace" : "At your own pace");
    var pointB = intro.point_value || opts.defaultValueBullet || "Built to give you the sharpest observation on your team's gaps";
    var pointC = intro.point_next || opts.defaultNextBullet || "Your progress auto-saves to this browser. Email only if you want the full report.";
    var startLabel = (opts.startLabel || "Start");
    var note = intro.note || opts.defaultNote || "No signup required. Scroll back up anytime to reread.";
    var sec = make("section", { class: "lmc-intro", "aria-labelledby": "lmc-intro-h" });
    var inner = make("div", { class: "lmc-intro-inner" });
    // R1B client tenant (matches shared.js clientOf): data.client.id set → this
    // is a white-label lead page, never show Ivan's portrait/greeting.
    // Phase 5 (2026-08-07): data-lm-brand="host" on #lmc-root/<html> is the
    // lighter opt-out for shells with no client{} object at all. Both are
    // opt-in only — absent on every existing LM, so this path is unchanged.
    var _wc = (data && data.client && data.client.id) ? data.client : null;
    var _hostOnly = !_wc && !!(window.LM && window.LM.hostBranded && window.LM.hostBranded());
    // In a prospect scan sample, the assessment must read as THEIR tool. Drop Ivan's portrait
    // and personal greeting; a neutral "How this works." keeps the orientation without the author.
    // Per-LM persona override (e.g. a client-branded assessment): intro.no_avatar drops the
    // portrait, intro.avatar / intro.avatar_alt swap it. Defaults unchanged for every other LM.
    var img = (opts.embed || intro.no_avatar || _hostOnly) ? null
      : _wc ? (_wc.portrait ? make("img", { class: "lmc-intro-avatar", src: _wc.portrait, alt: _wc.name || "" }) : null)
      : make("img", { class: "lmc-intro-avatar", src: intro.avatar || "https://ivanmanfredi.com/ivan-portrait.jpg", alt: intro.avatar_alt || "Ivan Manfredi" });
    var body = make("div", { class: "lmc-intro-body" });
    body.appendChild(make("div", { class: "lmc-intro-badge" }, "Welcome"));
    body.appendChild(make("h2", { class: "lmc-intro-h", id: "lmc-intro-h" }, opts.embed ? "How this works." :
      _wc ? escapeHtml("Hey, I'm " + (_wc.short_name || _wc.name) + ".") :
      _hostOnly ? "Here&rsquo;s how this works." :
      (intro.greeting || "Hey, I&rsquo;m Ivan.")));
    var introPara = make("p", { class: "lmc-intro-p" }, escapeHtml(welcomeLine));
    if (window.LM && window.LM.editMode) {
      window.LM.editMode.registerField(introPara, "intro.paragraph", { multiline: true });
    }
    body.appendChild(introPara);
    var ul = make("ul", { class: "lmc-intro-points" });
    var introPointPaths = ["intro.point_time", "intro.point_value", "intro.point_next"];
    [["a", "\u23F1", pointA], ["b", "\u2192", pointB], ["c", "\u2713", pointC]].forEach(function (p, ix) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0], "aria-hidden": "true" }, p[1]));
      var textSpan = make("span", null, escapeHtml(p[2]));
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(textSpan, introPointPaths[ix], { multiline: true });
      }
      li.appendChild(textSpan);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    var startBtn = make("button", { class: "lmc-intro-start", type: "button", "aria-label": startLabel }, escapeHtml(startLabel) + " <span aria-hidden=\"true\">\u2193</span>");
    startBtn.addEventListener("click", function () {
      var target = document.querySelector(startTargetSelector);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      beacon("cta_click", { answers: { target: "intro_start" } });
    });
    body.appendChild(startBtn);
    // Reset link: only surfaced when there are saved answers. Lets the user
    // wipe localStorage progress without having to complete the gate flow.
    if (opts.hasProgress && opts.onReset) {
      var resetWrap = make("p", { class: "lmc-intro-reset" });
      var resetLink = make("button", { class: "lmc-intro-reset-btn", type: "button" }, "Reset progress");
      resetLink.addEventListener("click", function () {
        if (!confirm("Clear your saved answers and start over?")) return;
        opts.onReset();
      });
      resetWrap.appendChild(make("span", { class: "lmc-intro-reset-prefix" }, "Resuming where you left off. "));
      resetWrap.appendChild(resetLink);
      body.appendChild(resetWrap);
    }
    if (note) {
      var noteEl = make("p", { class: "lmc-intro-note" }, escapeHtml(note));
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(noteEl, "intro.note", { multiline: true });
      }
      body.appendChild(noteEl);
    }
    if (img) inner.appendChild(img);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "assessment";
    if (window.LM && window.LM.tracker) window.LM.tracker.touch(data);
    root.innerHTML = "";

    // Results-forward mode: ?mode=result&seed=<base64 JSON of {questionId: answerIndex}>.
    // Lands the visitor straight on a pre-computed result instead of the questionnaire.
    // Used to embed a personalized assessment inside the prospect scan page.
    var __params = new URLSearchParams(location.search);
    var resultMode = __params.get("mode") === "result";
    // Embed mode: this assessment is shown INSIDE a prospect's scan page as a sample of the
    // lead magnet WE would build for THEM. Strip every "this is Ivan's site" signal — the site
    // chrome (logo, name, Let's Talk) and the closing fit-call CTA — so it reads as their asset.
    var embedMode = __params.get("src") === "scan_embed" || __params.get("embed") === "1";
    if (embedMode) {
      try {
        document.documentElement.classList.add("lmc-embed");
        var __nav = document.querySelector(".im-nav"); if (__nav) __nav.remove();
        var __ft = document.querySelector(".im-footer"); if (__ft) __ft.remove();
        var __skip = document.getElementById("skip-link"); if (__skip) __skip.remove();
        // Recolor the accent to the PROSPECT's brand so the scorecard reads as built for
        // THEM, not Ivan. ?accent=RRGGBB carries the lead's brand color (the same one the
        // cover + post image are rendered in); we derive the light/ink/soft/glow ramp from
        // it. With no brand to read (e.g. a prospect with no website) it falls back to a
        // neutral slate. A scoped rule (.lmc-embed .lmc-root) outranks the base var
        // definition by specificity, so it wins regardless of load timing.
        (function () {
          function clamp(x) { return Math.max(0, Math.min(255, Math.round(x))); }
          function parse(h) {
            h = (h || "").replace(/[^0-9a-fA-F]/g, "");
            if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
            if (h.length !== 6) return null;
            return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
          }
          function hex(c) { return "#" + c.map(function (x) { return clamp(x).toString(16).padStart(2, "0"); }).join(""); }
          function mix(c, t, a) { return [c[0] + (t[0] - c[0]) * a, c[1] + (t[1] - c[1]) * a, c[2] + (t[2] - c[2]) * a]; }
          var rgb = parse(__params.get("accent")) || [91, 130, 166]; // slate fallback
          // Prospect fonts: the pipeline reads the lead's REAL typefaces off their site and (guardrail)
          // only forwards them when they resolve to loadable Google families. ?font= heading, ?fontb=
          // body. Absent (custom/unloadable font, or no brand) → a neutral system sans, never Ivan's serif.
          var NEUTRAL = '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,Helvetica,Arial,sans-serif';
          function safeFam(n) { n = (n || "").replace(/[^\w \-]/g, "").trim(); return n; }
          var qHead = safeFam(__params.get("font"));
          var qBody = safeFam(__params.get("fontb")) || qHead;
          var HEAD = qHead ? '"' + qHead + '",' + NEUTRAL : NEUTRAL;
          var BODY = qBody ? '"' + qBody + '",' + NEUTRAL : NEUTRAL;
          // ?hero=dark — opt-in dark hero theme (see block further down). Parsed early
          // because the dark hero sets the headline at display weight 800 + italic cuts,
          // so the heading family needs those axes requested up front.
          var heroDark = (__params.get("hero") || "").trim() === "dark";
          var headAxes = heroDark
            ? ":ital,wght@0,400;0,500;0,700;0,800;1,400;1,600;1,700;1,800"
            : ":ital,wght@0,400;0,500;0,700;1,400";
          if (qHead || qBody) {
            var fams = [];
            if (qHead) fams.push("family=" + encodeURIComponent(qHead).replace(/%20/g, "+") + headAxes);
            if (qBody && qBody !== qHead) fams.push("family=" + encodeURIComponent(qBody).replace(/%20/g, "+") + ":wght@400;500;600;700");
            var gfl = document.createElement("link");
            gfl.rel = "stylesheet";
            gfl.href = "https://fonts.googleapis.com/css2?" + fams.join("&") + "&display=swap";
            document.head.appendChild(gfl);
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
          var bgRgb = parse(__params.get("bg"));
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
          var rPx = parseInt(__params.get("r") || "", 10);
          if (!isNaN(rPx) && rPx >= 0 && rPx <= 24) {
            css += ".lmc-embed .lmc-btn,.lmc-embed .lmc-intro-start,.lmc-embed .lmc-btn-secondary,.lmc-embed .lmc-opt,.lmc-embed .lmc-card,.lmc-embed .lmc-form-input,.lmc-embed .lmc-capture{border-radius:" + rPx + "px !important}";
          }
          var inkRgb = parse(__params.get("ink"));
          if (inkRgb) {
            var inkHex = hex(inkRgb);
            css += ".lmc-embed .lmc-root{--ink:" + inkHex + ";--ink-soft:" + hex(mix(inkRgb, [255, 255, 255], 0.22)) + ";--ink-mute:" + hex(mix(inkRgb, [255, 255, 255], 0.34)) + "}" +
              ".lmc-embed .lmc-score-eyebrow,.lmc-embed .lmc-score-headline,.lmc-embed .lmc-score-note strong,.lmc-embed .lmc-category-block h4,.lmc-embed .lmc-result-unlock-h,.lmc-embed .lmc-start-h,.lmc-embed .lmc-start-meta{color:" + inkHex + " !important}" +
              ".lmc-embed .lmc-score-note,.lmc-embed .lmc-start-p{color:" + hex(mix(inkRgb, [255, 255, 255], 0.22)) + " !important}";
          }
          // Template-tell pass (all embeds): the graph-paper hero grid and the hard
          // 6px square eyebrow/meta markers are Ivan-editorial signatures — inside a
          // client-brand embed they read as a reused template. Grid off, markers
          // become small round dots. Public (non-embed) LM pages are untouched.
          css += ".lmc-embed .lmc-hero{background-image:none !important}" +
            ".lmc-embed .lmc-badge::before,.lmc-embed .lmc-meta-chip::before,.lmc-embed .lmc-intro-badge::before,.lmc-embed .lmc-category::before,.lmc-embed .lmc-tier-pill::before,.lmc-embed .lmc-start-meta-dot{width:5px !important;height:5px !important;border-radius:50% !important}";
          // ?hero=dark&hero_bg=RRGGBB&accent2=RRGGBB — dark hero theme. Mirrors a
          // dark-hero brand site (e.g. deep forest green with a mint secondary):
          // hero surface = hero_bg, headline white at display weight, the em/i pivot
          // words render INLINE ITALIC in accent2 (their "Paid Ads & SEO" move) with
          // the wavy sweep killed, meta chips as white/50 text with small accent2
          // dots. Everything below the hero keeps the ?bg surface. Opt-in only.
          if (heroDark) {
            // Signal the dark-embed theme to the stylesheet. assessment.css keys
            // the question-flow + results dark rules off html.lmc-embed-dark so
            // they fire ONLY for dark scan embeds (never light standalones).
            try { document.documentElement.classList.add("lmc-embed-dark"); } catch (_) {}
            var hb = parse(__params.get("hero_bg")) || inkRgb || [11, 35, 31];
            var a2 = parse(__params.get("accent2")) || rgb;
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
          var __acc = document.createElement("style");
          __acc.textContent = css;
          document.head.appendChild(__acc);
        })();
        // Identity pass — the static head is Ivan-branded (<title> "… | Ivan Manfredi",
        // og:site_name "Ivan Manfredi", resources.inboundonsteroids.com favicon), which leaks
        // the seller the moment a prospect inspects the tab or the page source of their
        // sample. ?bname= carries the PROSPECT's brand name for the tab title +
        // og:site_name; ?blogo= (optional, absolute URL) swaps the favicon to their
        // logo. Absent params → the head stays exactly as shipped.
        (function () {
          var bname = (__params.get("bname") || "").trim();
          if (bname) {
            var baseTitle = (document.title || "").split(" | ")[0].trim() ||
              String(data.title || "Assessment").replace(/<[^>]*>/g, "").trim();
            document.title = baseTitle + " | " + bname;
            var ogSite = document.querySelector('meta[property="og:site_name"]');
            if (ogSite) ogSite.setAttribute("content", bname);
          }
          var blogo = (__params.get("blogo") || "").trim();
          if (blogo && /^https?:\/\//i.test(blogo)) {
            var icons = document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]');
            for (var ii = 0; ii < icons.length; ii++) icons[ii].setAttribute("href", blogo);
          }
        })();
      } catch (_) {}
    }
    // The prospect's own logo, shown at the top of the sample so it reads as their asset.
    var embedLogoUrl = embedMode ? (__params.get("logo") || "").trim() : "";
    var seedAnswers = null;
    if (resultMode) {
      try {
        var __raw = __params.get("seed");
        if (__raw) seedAnswers = JSON.parse(atob(__raw));
      } catch (_) { seedAnswers = null; }
      if (!seedAnswers || typeof seedAnswers !== "object") resultMode = false;
    }

    var questions = flattenQuestions(data);
    // In result mode, seed answers drive the view and we never touch localStorage
    // (the same niche LM is reused across prospects, so per-browser persistence collides).
    // Embed samples always start fresh: the same LM slug is reused across prospects on the
    // resources domain, so a prior visitor's saved progress would otherwise render as "already
    // completed" the moment the modal opens. Ignore (and never write) localStorage in embed mode.
    var answers = resultMode ? seedAnswers : (embedMode ? {} : loadAnswers(data.slug));
    var idx = 0;
    // Resume from last unanswered question
    for (var i = 0; i < questions.length; i++) {
      if (answers[questions[i].id || "__persona"] == null) { idx = i; break; }
      idx = i + 1;
    }
    // Result mode always shows the gate fresh, even if this browser captured before.
    var captured = (resultMode || embedMode) ? false : !!loadEmail(data.slug);

    // Hero
    var hero = make("section", { class: "lmc-hero" });
    var hi = make("div", { class: "lmc-container" });
    if (embedLogoUrl) {
      var __logo = make("img", { class: "lmc-embed-logo", src: embedLogoUrl, alt: (data.brand && data.brand.wordmark) || "" });
      __logo.addEventListener("error", function () { __logo.remove(); });
      hi.appendChild(__logo);
    }
    var heroBadgeEl = make("div", { class: "lmc-badge" }, esc(data.brand && data.brand.hero_badge || "Interactive Assessment"));
    if (window.LM && window.LM.editMode) window.LM.editMode.registerField(heroBadgeEl, "brand.hero_badge");
    hi.appendChild(heroBadgeEl);
    var h1 = make("h1", { class: "lmc-h1" });
    h1.innerHTML = (window.LM && window.LM.italicizePivot) ? window.LM.italicizePivot(data.title || "Assessment") : esc(data.title || "Assessment");
    if (window.LM && window.LM.editMode) window.LM.editMode.registerField(h1, "title");
    hi.appendChild(h1);
    if (data.subtitle) {
      var sub = make("p", { class: "lmc-sub" }, esc(data.subtitle));
      if (window.LM && window.LM.editMode) window.LM.editMode.registerField(sub, "subtitle");
      hi.appendChild(sub);
    }
    if (!resultMode) {
      var meta = make("div", { class: "lmc-meta" });
      meta.appendChild(make("div", { class: "lmc-meta-chip" }, questions.length + " questions"));
      if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
      meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Auto-saves"));
      hi.appendChild(meta);
    }
    hero.appendChild(hi);
    root.appendChild(hero);

    // The welcome/intro block only makes sense for the live questionnaire.
    if (!resultMode) {
      // Dynamic start label: resume if any answers were saved, start otherwise.
      var introHasProgress = Object.keys(answers).some(function (k) { return answers[k] != null; });
      var introSection = buildIntro(data, ".lmc-widget", {
        embed: embedMode,
        defaultValueBullet: "15-20 questions, 5 categories. Honest answers = honest result",
        defaultNextBullet: "Score + tier shown free. Email unlocks per-category breakdown + personalized fixes",
        startLabel: introHasProgress ? "Resume the assessment" : "Start the assessment",
        defaultNote: "No signup to take it. Results stay private until you unlock the full report.",
        hasProgress: introHasProgress,
        onReset: function () {
          try {
            localStorage.removeItem(storageKey(data.slug, "answers"));
            localStorage.removeItem(storageKey(data.slug, "email"));
          } catch (_) {}
          location.reload();
        }
      });
      root.appendChild(introSection);
    }

    // Widget area
    var widget = make("div", { class: "lmc-widget" });
    var card = make("div", { class: "lmc-card", id: "lmc-card" });
    widget.appendChild(card);
    root.appendChild(widget);

    // Start screen: when there's no progress, the widget renders a visible
    // start card (instead of hiding behind a gate). Click "Begin" slides to q1.
    var hasProgress = Object.keys(answers).some(function (k) { return answers[k] != null; });
    var phase = hasProgress ? "question" : "start";

    function buildStartSlide() {
      var startConf = data.start_screen || {};
      var totalQs = questions.length;
      var minutes = data.estimated_minutes || 12;
      var defaultChips = [
        totalQs + " questions",
        minutes + " min",
        "Auto-saves",
        "Score shown free"
      ];
      var chips = Array.isArray(startConf.chips) && startConf.chips.length ? startConf.chips : defaultChips;
      var defaultDescription = totalQs + " quick questions across " + (data.categories || []).length + " categories. About " + minutes + " minutes. Your progress auto-saves to this browser — close the tab and come back anytime.";
      var eyebrowText = startConf.eyebrow || "Ready when you are";
      // Fallback ladder: page-configured headline, then the LM's own promise line, then
      // the generic audit line (legacy pages with neither).
      var headlineHtml = startConf.headline_html || (data.subtitle ? ((window.LM && window.LM.italicizePivot) ? window.LM.italicizePivot(String(data.subtitle)) : esc(String(data.subtitle))) : "Find <em>where the rot lives</em> in your stack.");
      var descriptionText = startConf.description || defaultDescription;
      var buttonLabel = startConf.button || "Start the audit";

      var slide = make("div", { class: "lmc-slide lmc-start-slide", "data-idx": "start" });
      var eyebrowEl = make("div", { class: "lmc-category lmc-start-eyebrow" }, esc(eyebrowText));
      slide.appendChild(eyebrowEl);
      var h = make("h2", { class: "lmc-start-h", tabindex: "-1" });
      h.innerHTML = headlineHtml;
      slide.appendChild(h);
      var pEl = make("p", { class: "lmc-start-p" }, esc(descriptionText));
      slide.appendChild(pEl);

      var meta = make("div", { class: "lmc-start-meta" });
      var chipEls = chips.map(function (chipText) {
        var item = make("span", { class: "lmc-start-meta-item" });
        item.appendChild(make("span", { class: "lmc-start-meta-dot" }));
        var labelEl = make("span", { class: "lmc-start-meta-text" }, esc(String(chipText)));
        item.appendChild(labelEl);
        meta.appendChild(item);
        return labelEl;
      });
      slide.appendChild(meta);

      var nav = make("div", { class: "lmc-nav lmc-start-nav" });
      var goLabelSpan = make("span", { class: "lmc-start-btn-text" }, esc(buttonLabel));
      var go = make("button", { class: "lmc-btn lmc-start-btn", type: "button" });
      go.appendChild(goLabelSpan);
      go.appendChild(document.createTextNode(" "));
      go.appendChild(make("span", { "aria-hidden": "true" }, "→"));
      go.addEventListener("click", function () {
        // Allowed in edit mode too — Ivan needs to browse slides to edit them.
        // The editable span (.lmc-start-btn-text) stops propagation, so this
        // only fires when clicking the button outside the editable text.
        phase = "question";
        renderQuestion("fwd");
        if (!(window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled())) {
          beacon("cta_click", { answers: { target: "start_screen_begin" } });
        }
      });
      nav.appendChild(go);
      slide.appendChild(nav);

      // Register edit-mode hooks: every text element on the start screen.
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(eyebrowEl, "start_screen.eyebrow");
        window.LM.editMode.registerField(h, "start_screen.headline_html", { multiline: true });
        window.LM.editMode.registerField(pEl, "start_screen.description", { multiline: true });
        window.LM.editMode.registerField(goLabelSpan, "start_screen.button");
        chipEls.forEach(function (chipEl, ix) {
          window.LM.editMode.registerField(chipEl, "start_screen.chips[" + ix + "]");
        });
      }
      return slide;
    }

    function buildQuestionSlide(slideIdx) {
      var q = questions[slideIdx];
      var slide = make("div", { class: "lmc-slide", "data-idx": String(slideIdx) });
      if (!q) return slide;

      // Progress row: "Question N of M" + hairline fill.
      var totalQs = questions.length;
      var pct = Math.round(((slideIdx + 1) / totalQs) * 100);
      var progressWord = (data.results_copy && data.results_copy.progress_label) || "Question";
      var prog = make("div", { class: "lmc-progress" });
      prog.innerHTML =
        '<div class="lmc-progress-row">' +
          '<span class="lmc-progress-label"><span class="lmc-progress-word">' + esc(progressWord) + '</span> ' + (slideIdx + 1) + ' of ' + totalQs + '</span>' +
          '<span class="lmc-progress-pct">' + pct + '%</span>' +
        '</div>' +
        '<div class="lmc-progress-track" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100" aria-label="Assessment progress">' +
          '<div class="lmc-progress-fill" style="width:' + pct + '%"></div>' +
        '</div>';
      slide.appendChild(prog);
      var progressWordEl = prog.querySelector(".lmc-progress-word");
      if (progressWordEl && window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(progressWordEl, "results_copy.progress_label");
      }

      // Resolve data.json paths for this slide so we can wire edit-mode hooks
      // for the category name, question text, and each answer label.
      var isPersona = !!q.__persona;
      var catIdx = isPersona ? -1 : (data.categories || []).findIndex(function (c) { return (c.id || c.name) === q.category_id; });
      var qIdx = catIdx >= 0 ? (data.categories[catIdx].questions || []).findIndex(function (qq) { return qq.id === q.id; }) : -1;
      var basePath = isPersona
        ? "persona_selector"
        : (catIdx >= 0 && qIdx >= 0 ? "categories[" + catIdx + "].questions[" + qIdx + "]" : null);
      var categoryPath = (!isPersona && catIdx >= 0) ? "categories[" + catIdx + "].name" : null;

      if (q.category_name) {
        var catEl = make("div", { class: "lmc-category" }, esc(q.category_name));
        if (categoryPath && window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(catEl, categoryPath);
        }
        slide.appendChild(catEl);
      }
      var qH = make("h2", { class: "lmc-question", id: "lmc-question-" + slideIdx, tabindex: "-1" }, esc(q.text || q.label || ""));
      if (basePath && window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(qH, basePath + ".text", { multiline: true });
      }
      slide.appendChild(qH);

      var options = q.answers || [];
      if (!options.length) {
        options = [
          { label: "1 — Strongly disagree", score: 1 },
          { label: "2 — Disagree", score: 2 },
          { label: "3 — Neutral", score: 3 },
          { label: "4 — Agree", score: 4 },
          { label: "5 — Strongly agree", score: 5 }
        ];
      }

      var ul = make("ul", { class: "lmc-options", role: "radiogroup", "aria-labelledby": "lmc-question-" + slideIdx });
      options.forEach(function (opt, ix) {
        var li = make("li");
        var inputId = "lmc-q" + slideIdx + "-opt" + ix;
        var checked = (answers[q.id || "__persona"] === ix);
        var label = make("label", { class: "lmc-opt" + (checked ? " selected" : ""), for: inputId });
        var input = make("input", { type: "radio", name: "q" + slideIdx, id: inputId, value: String(ix) });
        if (checked) input.setAttribute("checked", "checked");
        label.appendChild(input);
        var labelSpan = make("span", null, esc(opt.label || opt.text || String(opt)));
        label.appendChild(labelSpan);
        ul.appendChild(li);
        li.appendChild(label);

        // Register the answer label text for inline editing.
        if (basePath && window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(labelSpan, basePath + ".answers[" + ix + "].label", { multiline: true });
        }

        label.addEventListener("click", function (e) {
          // In edit mode, clicks should go to the inline editor on the span,
          // not record an answer. The span's edit-mode handler stops propagation,
          // so this fires only for clicks outside the editable text.
          if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) {
            e.preventDefault();
            return;
          }
          answers[q.id || "__persona"] = ix;
          if (opt.tag) answers[(q.id || "__persona") + "__tag"] = opt.tag;
          if (!embedMode) saveAnswers(data.slug, answers);
          setTimeout(function () { goNext(); }, 220);
        });
      });
      slide.appendChild(ul);

      var nav = make("div", { class: "lmc-nav" });
      var back = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Back");
      if (slideIdx === 0) back.setAttribute("disabled", "disabled");
      back.addEventListener("click", function () { if (idx > 0) { idx--; renderQuestion("back"); } });
      var next = make("button", { class: "lmc-btn", type: "button", id: "lmc-next" }, slideIdx === questions.length - 1 ? "See result →" : "Next →");
      var inEditMode = !!(window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled());
      if (answers[q.id || "__persona"] == null && !inEditMode) next.setAttribute("disabled", "disabled");
      next.addEventListener("click", function () {
        if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) {
          // Edit mode: free navigation. Skip the answer-required gate.
          if (idx < questions.length - 1) { idx++; renderQuestion("fwd"); }
          else renderResult();
          return;
        }
        goNext();
      });
      nav.appendChild(back); nav.appendChild(next);
      slide.appendChild(nav);

      return slide;
    }

    function renderQuestion(direction) {
      if (idx >= questions.length) { renderResult(); return; }
      direction = direction === "back" ? "back" : "fwd";
      var newSlide = buildQuestionSlide(idx);
      var current = card.querySelector(".lmc-slide");

      // Honour reduced-motion: skip the slide animation entirely.
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!current || reduced) {
        card.innerHTML = "";
        card.appendChild(newSlide);
        setTimeout(function () { var h = $("#lmc-question-" + idx); if (h) h.focus(); }, 10);
        return;
      }

      // Animate out the current slide, then swap in the new one.
      newSlide.classList.add(direction === "fwd" ? "lmc-in-fwd" : "lmc-in-back");
      current.classList.add(direction === "fwd" ? "lmc-out-fwd" : "lmc-out-back");

      var swapped = false;
      function swap() {
        if (swapped) return; swapped = true;
        if (current && current.parentNode === card) card.removeChild(current);
        card.appendChild(newSlide);
        // Force a reflow before removing the in-* class so the transition fires.
        void newSlide.offsetWidth;
        newSlide.classList.remove("lmc-in-fwd");
        newSlide.classList.remove("lmc-in-back");
        setTimeout(function () { var h = $("#lmc-question-" + idx); if (h) h.focus({ preventScroll: true }); }, 280);
      }
      // Wait for the outgoing transition. Fall back to a hard timeout in case
      // transitionend doesn't fire (e.g. element pulled offscreen).
      current.addEventListener("transitionend", swap, { once: true });
      setTimeout(swap, 320);
    }

    function goNext() {
      var q = questions[idx];
      if (answers[q.id || "__persona"] == null) return;
      if (idx < questions.length - 1) { idx++; renderQuestion("fwd"); }
      else renderResult();
    }

    function renderResult() {
      var res = computeResult(data, answers);
      card.innerHTML = "";
      card.classList.add("lmc-result-card");

      // ── Compute display data ────────────────────────────────────────
      var tierKey = res.tier.class === "low" ? "critical"
                   : res.tier.class === "medium" ? "growth"
                   : "optimized";
      // Headline copy: data.results_copy.tier_headline[tier] overrides
      // the defaults; otherwise we use a generic italicised tier name.
      var copyOverride = (data.results_copy && data.results_copy.tier_headline) || {};
      var tierHeadlineMap = {
        critical:  copyOverride.critical  || "You're at <em>critical</em> risk.",
        growth:    copyOverride.growth    || "You're in <em>growth stage</em>.",
        optimized: copyOverride.optimized || "You're running <em>optimized</em>."
      };
      var headlineHtml = tierHeadlineMap[tierKey] || ("<em>" + esc(res.tier.name || "Score") + "</em>");
      var weakestName = res.weakest && res.weakest.name;
      var weakestPct = res.weakest && res.weakest.score;
      var noteHtml = res.weakest
        ? "Your weakest area is <strong>" + esc(weakestName) + "</strong> (" + weakestPct + "/100). That's where the biggest leak usually lives."
        : "Your overall score tells the story; the category breakdown points to the specific fix.";

      // ── Container ────────────────────────────────────────────────────
      var wrap = make("div", { class: "lmc-result" });

      // ── Score hero (sage progress ring + huge italic score + tier headline)
      var hero = make("div", { class: "lmc-score-hero" });
      hero.setAttribute("data-tier", tierKey);

      // Ring: r=92, circumference ≈ 578. Animation starts at full offset
      // and drops to (1 - score/100) * c on the next paint.
      var R = 92;
      var C = 2 * Math.PI * R;
      var ring = make("div", { class: "lmc-score-ring" });
      ring.innerHTML =
        '<svg viewBox="0 0 200 200" aria-hidden="true">' +
          '<circle class="ring-track" cx="100" cy="100" r="' + R + '"></circle>' +
          '<circle class="ring-fill" cx="100" cy="100" r="' + R + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '"></circle>' +
        '</svg>' +
        '<div class="lmc-score-ring-center">' +
          '<span class="lmc-score-number" data-target="' + res.overall + '">0</span>' +
          '<span class="lmc-score-denom">out of 100</span>' +
        '</div>';
      hero.appendChild(ring);

      var heroBody = make("div", { class: "lmc-score-body" });
      heroBody.appendChild(make("div", { class: "lmc-score-eyebrow" }, "Your read"));
      var scoreHeadlineEl = make("h2", { class: "lmc-score-headline" }, headlineHtml);
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(scoreHeadlineEl, "results_copy.tier_headline." + tierKey, { multiline: true });
      }
      heroBody.appendChild(scoreHeadlineEl);
      heroBody.appendChild(make("p", { class: "lmc-score-note" }, noteHtml));
      hero.appendChild(heroBody);
      wrap.appendChild(hero);

      // Results-forward only: invite the visitor to correct the estimated answers.
      if (resultMode) {
        var adjustWrap = make("div", { class: "lmc-result-section lmc-adjust" });
        adjustWrap.style.setProperty("--lmc-delay", "120ms");
        adjustWrap.appendChild(make("p", { class: "lmc-adjust-note" },
          "These answers are estimated from your public footprint. Adjust any of them to see your real number."));
        var adjustBtn = make("button", { class: "lmc-btn lmc-btn-secondary lmc-adjust-btn", type: "button" },
          "Adjust my answers →");
        adjustBtn.addEventListener("click", function () {
          resultMode = false;            // hand control to the live questionnaire
          idx = 0;
          card.classList.remove("lmc-result-card");
          beacon("cta_click", { answers: { target: "adjust_answers" } });
          renderQuestion("fwd");
        });
        adjustWrap.appendChild(adjustBtn);
        wrap.appendChild(adjustWrap);
      }

      // ── Top-3 gap questions ────────────────────────────────────────
      var gaps = [];
      (data.categories || []).forEach(function (cat) {
        (cat.questions || []).forEach(function (q) {
          var a = answers[q.id];
          if (a == null) return;
          var val = null;
          if (q.answers && q.answers[a] && typeof q.answers[a].score === "number") val = q.answers[a].score;
          else if (typeof a === "number") val = a;
          else if (!isNaN(Number(a))) val = Number(a);
          if (val == null || isNaN(val)) return;
          var maxScore = q.max_score || 5;
          var pct = val / maxScore;
          var rec = pickRec(cat, Math.round(pct * 100));
          var firstFix = null;
          if (rec && Array.isArray(rec.fixes) && rec.fixes.length) firstFix = rec.fixes[0];
          else if (rec && typeof rec === "string") firstFix = rec;
          else if (q.answers && q.answers[a] && q.answers[a].feedback) firstFix = q.answers[a].feedback;
          gaps.push({
            question: q.text || q.label || "",
            category: cat.name || cat.id,
            score: pct,
            gapScore: (1 - pct),
            fix: firstFix
          });
        });
      });
      gaps.sort(function (a, b) { return b.gapScore - a.gapScore; });
      var topGaps = gaps.filter(function (g) { return g.gapScore > 0.2; }).slice(0, 3);

      // Result-copy config — editable text labels for generated sections.
      var resultsCopy = (data.results_copy) || {};
      var gapsHeadlineHtml = resultsCopy.gaps_headline_html ||
        ("Top " + topGaps.length + " gap" + (topGaps.length === 1 ? "" : "s") + " to close <em>this week</em>");
      var mondayLabel = resultsCopy.monday_label || "What to do Monday";
      var gapFixLabel = resultsCopy.gap_fix_label || "Fix";

      if (topGaps.length) {
        var gapsSec = make("section", { class: "lmc-result-section" });
        gapsSec.style.setProperty("--lmc-delay", "240ms");
        var h = make("h3", { class: "lmc-results-h" });
        h.innerHTML = gapsHeadlineHtml;
        if (window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(h, "results_copy.gaps_headline_html", { multiline: true });
        }
        gapsSec.appendChild(h);
        var list = make("ol", { class: "lmc-gap-list" });
        list.innerHTML = topGaps.map(function (g, i) {
          return '<li class="lmc-gap">' +
            '<div class="lmc-gap-rank">' + (i + 1) + '</div>' +
            '<div class="lmc-gap-body">' +
              '<div class="lmc-gap-head"><span class="lmc-gap-text">' + esc(g.question) + '</span></div>' +
              (g.fix ? '<div class="lmc-gap-fix"><span class="lmc-gap-fix-label">' + esc(gapFixLabel) + '</span>' + esc(g.fix) + '</div>' : '') +
            '</div>' +
          '</li>';
        }).join("");
        gapsSec.appendChild(list);
        if (window.LM && window.LM.editMode) {
          var fixLabelEls = list.querySelectorAll(".lmc-gap-fix-label");
          for (var __fli = 0; __fli < fixLabelEls.length; __fli++) {
            window.LM.editMode.registerField(fixLabelEls[__fli], "results_copy.gap_fix_label");
          }
        }

        var mondayTxt = (topGaps[0] && topGaps[0].fix) || (res.weakest ? "Start with your weakest category: " + res.weakest.name + "." : "Pick the gap that hurts most this week and ship one fix.");
        var nm = make("p", { class: "lmc-next-move" });
        var mondayLabelEl = make("span", { class: "lmc-next-label" }, esc(mondayLabel));
        var mondayBodyEl = document.createElement("span");
        mondayBodyEl.className = "lmc-next-body";
        mondayBodyEl.textContent = mondayTxt;
        nm.appendChild(mondayLabelEl);
        nm.appendChild(mondayBodyEl);
        if (window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(mondayLabelEl, "results_copy.monday_label");
        }
        gapsSec.appendChild(nm);
        wrap.appendChild(gapsSec);
      }

      // ── Capture or unlocked ────────────────────────────────────────
      var captureHost = make("div", { class: "lmc-result-section", id: "lmc-result-capture-host" });
      captureHost.style.setProperty("--lmc-delay", "420ms");
      wrap.appendChild(captureHost);

      if (!captured) {
        var gateConf = data.capture_gate || {};
        var gateHeadlineHtml = gateConf.headline_html || "Unlock your <em>full report</em>";
        var gateDescription = gateConf.description || "Enter your email and we'll reveal your per-category breakdown, personalised recommendations, and the 3 fixes I'd prioritise based on your weakest category.";
        var gateButton = gateConf.button || "Unlock report";
        var gateNote = gateConf.note || "No spam. One email with your report, then you decide.";
        var gatePlaceholder = gateConf.placeholder || "you@company.com";

        var gate = make("div", { class: "lmc-capture", id: "lmc-capture" });
        gate.innerHTML =
          '<h2>' + gateHeadlineHtml + '</h2>' +
          '<p>' + esc(gateDescription) + '</p>' +
          '<form class="lmc-form" id="lmc-capture-form">' +
          '<label class="sr-only" for="lmc-email">Email</label>' +
          '<input class="lmc-form-input" id="lmc-email" type="email" autocomplete="email" required placeholder="' + esc(gatePlaceholder) + '" />' +
          '<button class="lmc-btn" type="submit"><span class="lmc-capture-btn-text">' + esc(gateButton) + '</span></button>' +
          '</form>' +
          '<p class="lmc-note">' + esc(gateNote) + '</p>';
        captureHost.appendChild(gate);
        var form = gate.querySelector("#lmc-capture-form");
        var emailInput = gate.querySelector("#lmc-email");

        if (window.LM && window.LM.editMode) {
          var gateH2 = gate.querySelector("h2");
          var gateDescEl = gate.querySelector("p");
          var gateNoteEl = gate.querySelector(".lmc-note");
          var gateBtnTextEl = gate.querySelector(".lmc-capture-btn-text");
          if (gateH2)        window.LM.editMode.registerField(gateH2, "capture_gate.headline_html", { multiline: true });
          if (gateDescEl)    window.LM.editMode.registerField(gateDescEl, "capture_gate.description", { multiline: true });
          if (gateBtnTextEl) window.LM.editMode.registerField(gateBtnTextEl, "capture_gate.button");
          if (gateNoteEl)    window.LM.editMode.registerField(gateNoteEl, "capture_gate.note", { multiline: true });
        }
        form.addEventListener("submit", function (e) {
          e.preventDefault();
          var em = (emailInput || {}).value || "";
          if (!em || em.indexOf("@") === -1) { toast("Enter a valid email"); return; }
          if (!resultMode && !embedMode) saveEmail(data.slug, em);
          captured = true;
          beacon("complete", {
            email: em,
            overall_score: res.overall,
            tier: res.tier.name,
            per_category: res.per_category,
            weakest_category: res.weakest && res.weakest.id,
            persona: typeof res.persona === "number" && data.persona_selector && data.persona_selector.answers ? (data.persona_selector.answers[res.persona] || {}).tag || null : null,
            answers: answers
          });
          generateShareCard(data, res);
          renderUnlocked(res, captureHost);
        });
      } else {
        generateShareCard(data, res);
        renderUnlocked(res, captureHost);
      }

      card.appendChild(wrap);

      // ── Kick off score-ring + count-up animation after paint ────────
      var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var fillEl = hero.querySelector(".ring-fill");
      var numEl = hero.querySelector(".lmc-score-number");
      if (reduced) {
        if (fillEl) fillEl.style.strokeDashoffset = (C * (1 - res.overall / 100)).toFixed(2);
        if (numEl) numEl.textContent = String(res.overall);
      } else {
        requestAnimationFrame(function () {
          setTimeout(function () {
            if (fillEl) fillEl.style.strokeDashoffset = (C * (1 - res.overall / 100)).toFixed(2);
            if (numEl) countUp(numEl, 0, res.overall, 1300);
          }, 220);
        });
      }
    }

    // Tween a number element from `from` to `to` over `duration` ms.
    function countUp(el, from, to, duration) {
      var start = null;
      function step(ts) {
        if (start == null) start = ts;
        var t = Math.min(1, (ts - start) / duration);
        // easeOutCubic
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = String(Math.round(from + (to - from) * eased));
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = String(to);
      }
      requestAnimationFrame(step);
    }

    // D3.3: best-effort share card generation (legacy engine)
    function generateShareCard(data, res) {
      try {
        var url = window.__scroll_recorder_url || "https://scroll-recorder-production.up.railway.app";
        fetch(url + "/share-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: data.slug,
            score: res.overall,
            tier: res.tier && res.tier.name,
            persona: typeof res.persona === "number" && data.persona_selector && data.persona_selector.answers ? (data.persona_selector.answers[res.persona] || {}).tag : null,
            weakest: res.weakest && res.weakest.name,
            title: data.title,
          }),
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          if (j && j.url) {
            ["og:image", "twitter:image"].forEach(function (prop) {
              var sel = prop.indexOf("twitter") === 0 ? 'meta[name="' + prop + '"]' : 'meta[property="' + prop + '"]';
              var m = document.head.querySelector(sel);
              if (!m) { m = document.createElement("meta"); if (prop.indexOf("twitter") === 0) m.setAttribute("name", prop); else m.setAttribute("property", prop); document.head.appendChild(m); }
              m.setAttribute("content", j.url);
            });
            window.__lm_share_card_url = j.url;
          }
        }).catch(function () {});
      } catch (_) {}
    }

    function renderUnlocked(res, host) {
      // host = the .lmc-result-section that previously held the gate.
      // Replace its contents with the unlocked breakdown.
      if (!host) host = card;
      host.innerHTML = "";

      // R2 (2026-07-23): thank-you video, rendered ONLY when data.thank_you.video_embed
      // is set (client directive: every LM thank-you carries the founder video).
      // Pages without the key (all Ivan assessments today) are untouched.
      var __tyv = data.thank_you && data.thank_you.video_embed;
      if (__tyv) {
        var __vwrap = make("div", { class: "lmc-ty-video" });
        __vwrap.style.cssText = "position:relative;padding-bottom:56.25%;height:0;margin:0 0 28px;border-radius:12px;overflow:hidden;background:#000";
        var __abs = "position:absolute;top:0;left:0;width:100%;height:100%;border:0";
        // Self-hosted .mp4 (Supabase) renders as a native player; embed URLs (Loom, etc) stay iframes.
        __vwrap.innerHTML = /\.mp4(\?|$)/i.test(String(__tyv))
          ? '<video src="' + esc(String(__tyv)) + '" title="Walkthrough" controls playsinline preload="metadata" style="' + __abs + ';background:#000"></video>'
          : '<iframe src="' + esc(String(__tyv)) + '" title="Walkthrough" style="' + __abs + '" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe>';
        host.appendChild(__vwrap);
      }

      host.appendChild(make("h3", { class: "lmc-result-unlock-h" }, "Per-category <em>breakdown</em>"));

      var catFills = []; // collect to arm bar widths after paint
      var catOrder = 0;
      (data.categories || []).forEach(function (cat, catIdx) {
        var key = cat.id || cat.name;
        var catRes = res.per_category[key];
        if (!catRes) return;
        var block = make("div", { class: "lmc-category-block" });
        block.style.setProperty("--lmc-delay", (catOrder * 90) + "ms");
        var h4 = make("h4", null, esc(cat.name || cat.id));
        if (window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(h4, "categories[" + catIdx + "].name");
        }
        block.appendChild(h4);
        var bar = make("div", { class: "lmc-cat-bar" });
        bar.innerHTML = '<div class="lmc-cat-track"><div class="lmc-cat-fill" style="--lmc-cat-target:' + catRes.score + '%"></div></div><span class="lmc-cat-pct">' + catRes.score + '<span style="font-size:.75em;color:rgba(19, 18, 16,.5)">/100</span></span>';
        block.appendChild(bar);
        var rec = pickRec(cat, catRes.score);
        // Resolve which tier-key was picked so we can build the edit path.
        var tierKey = catRes.score <= 40 ? "low" : (catRes.score <= 70 ? "mid" : "high");
        // Some data.json files use {critical, growth, optimized} instead.
        var altKey = ({ low: "critical", mid: "growth", high: "optimized" })[tierKey];
        var recBranchKey = (cat.recommendations && (cat.recommendations[tierKey] != null ? tierKey : (cat.recommendations[altKey] != null ? altKey : tierKey)));
        if (rec) {
          var rc = make("div", { class: "lmc-rec" });
          var tag = "Next step";
          if (catRes.score <= 40) tag = "Critical — fix first";
          else if (catRes.score <= 70) tag = "Growth unlock";
          else tag = "Keep sharpening";
          rc.appendChild(make("strong", null, esc(tag)));
          var recPath = "categories[" + catIdx + "].recommendations." + recBranchKey;
          var text = typeof rec === "string" ? rec : (rec.text || rec.headline || "");
          var textNode = document.createTextNode(text);
          // Wrap the text in an editable span so we can register it.
          var textSpan = make("span", { class: "lmc-rec-text" });
          textSpan.appendChild(textNode);
          rc.appendChild(textSpan);
          if (window.LM && window.LM.editMode && typeof rec !== "string") {
            window.LM.editMode.registerField(textSpan, recPath + ".text", { multiline: true });
          }
          var steps = (typeof rec === "object" && Array.isArray(rec.steps)) ? rec.steps : null;
          if (steps && steps.length) {
            var ulSteps = make("ul");
            steps.forEach(function (s, si) {
              var li = make("li", null, esc(s));
              if (window.LM && window.LM.editMode) {
                window.LM.editMode.registerField(li, recPath + ".steps[" + si + "]", { multiline: true });
              }
              ulSteps.appendChild(li);
            });
            rc.appendChild(ulSteps);
          }
          block.appendChild(rc);
        }
        host.appendChild(block);
        catFills.push({ el: block.querySelector(".lmc-cat-fill"), delayMs: 400 + catOrder * 90 });
        catOrder++;
      });

      // Arm bar widths after their parent blocks fade in.
      catFills.forEach(function (entry) {
        setTimeout(function () { if (entry.el) entry.el.classList.add("lmc-cat-fill-armed"); }, entry.delayMs);
      });

      // Persona-branched closing (persona_copy, 2026-07-10 — D5): authored
      // per-audience closing + proof line. Renders only when data.persona_copy
      // carries the reader's persona tag; otherwise the neutral close is unchanged.
      var personaTag = typeof res.persona === "number" && data.persona_selector && data.persona_selector.answers
        ? ((data.persona_selector.answers[res.persona] || {}).tag || null) : null;
      var pCopy = (personaTag && data.persona_copy && data.persona_copy[personaTag]) || null;
      if (pCopy && (pCopy.closing || pCopy.proof) && !embedMode) {
        var pBlock = make("div", { class: "lmc-persona-close" });
        if (pCopy.closing) pBlock.appendChild(make("p", { class: "lmc-persona-close-p" }, esc(pCopy.closing)));
        if (pCopy.proof) pBlock.appendChild(make("p", { class: "lmc-persona-proof" }, esc(pCopy.proof)));
        if (window.LM && window.LM.editMode) {
          var pcp = pBlock.querySelector(".lmc-persona-close-p");
          var ppf = pBlock.querySelector(".lmc-persona-proof");
          if (pcp) window.LM.editMode.registerField(pcp, "persona_copy." + personaTag + ".closing", { multiline: true });
          if (ppf) window.LM.editMode.registerField(ppf, "persona_copy." + personaTag + ".proof", { multiline: true });
        }
        host.appendChild(pBlock);
      }

      // Bottom CTA — Ivan's fit-call close. Suppressed in embed mode: inside a prospect's
      // scan this is THEIR sample asset, and the page itself drives to Ivan; pushing his
      // Calendly inside the embed would break the "this is your lead magnet" frame.
      var ctaConf = data.cta || {};
      if (embedMode) { ctaConf = null; }
      // …unless the scan passes the PROSPECT's own close: ?cta= (button label) +
      // ?ctaurl= (booking href). Then the end screen drives to THEIR funnel with
      // neutral copy — never Ivan's Calendly. Both params required; absent → the
      // embed stays CTA-free exactly as before.
      var embedCtaLabel = embedMode ? (__params.get("cta") || "").trim() : "";
      var embedCtaUrl = embedMode ? (__params.get("ctaurl") || "").trim() : "";
      if (embedMode && embedCtaLabel && /^https?:\/\//i.test(embedCtaUrl)) {
        ctaConf = {
          url: embedCtaUrl,
          button: embedCtaLabel,
          description: "Book a call to walk through your results and get a concrete plan for the weakest categories above."
        };
      }
      if (ctaConf) {
      // (Ivan-CTA block runs only when NOT embedded)
      var ctaUrl = (window.LM && window.LM.normalizeCtaUrl ? window.LM.normalizeCtaUrl(ctaConf.url, "closing-cta") : ctaConf.url) || (window.LM && window.LM.callUrl ? window.LM.callUrl("closing-cta") : "https://calendly.com/im-ivanmanfredi/30min");
      var ctaHeadlineHtml = ctaConf.headline_html || ctaConf.headline;
      if (!ctaHeadlineHtml) {
        ctaHeadlineHtml = res.tier && res.tier.class === "low"
          ? "Want help <em>closing these gaps</em>?"
          : "Want a second pair of eyes on <em>what to fix first</em>?";
      }
      // Tier-conditional default CTA strength: critical → direct fix-first ask,
      // optimized → soft sanity-check. persona_copy may supply its own line.
      var tierCtaDefaults = {
        low:    "Book a free 30-minute fit call. I'll walk your weakest category live and tell you exactly how I'd fix it first. If you can run it yourself, I'll tell you that too.",
        medium: "Book a free 30-minute fit call. I'll walk your weakest category live and tell you exactly how I'd fix it. If you can run it yourself, I'll tell you that too.",
        "":     "Book a free 30-minute fit call if you want a second read on the few gaps left. If there's nothing worth building, I'll say so and you keep the plan."
      };
      var ctaDescription = ctaConf.description || (pCopy && pCopy.cta_description) || tierCtaDefaults[res.tier.class] || tierCtaDefaults.medium;
      var ctaButton = ctaConf.button || "Book the free fit call";
      var ctaBox = make("div", { class: "lmc-unlocked-cta" });
      ctaBox.appendChild(make("p", { class: "lmc-unlocked-cta-eyebrow" }, "Next move"));
      var ctaH3 = make("h3", null, ctaHeadlineHtml);
      ctaBox.appendChild(ctaH3);
      var ctaDescEl = make("p", null, esc(ctaDescription));
      ctaBox.appendChild(ctaDescEl);
      var ctaLink = make("a", { class: "lmc-btn", href: ctaUrl, target: "_blank", rel: "noopener" });
      var ctaBtnSpan = make("span", { class: "lmc-cta-btn-text" }, esc(ctaButton));
      ctaLink.appendChild(ctaBtnSpan);
      ctaLink.appendChild(document.createTextNode(" "));
      ctaLink.appendChild(make("span", { "aria-hidden": "true" }, "→"));
      ctaBox.appendChild(ctaLink);
      host.appendChild(ctaBox);
      if (window.LM && window.LM.editMode) {
        // Edit-mode hooks: writing here creates cta.{} if it doesn't exist.
        window.LM.editMode.registerField(ctaH3, "cta.headline", { multiline: true });
        window.LM.editMode.registerField(ctaDescEl, "cta.description", { multiline: true });
        window.LM.editMode.registerField(ctaBtnSpan, "cta.button");
      }
      ctaLink.addEventListener("click", function (e) {
        if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) {
          e.preventDefault();
          return;
        }
        beacon("cta_click", { answers: { score: res.overall, tier: res.tier.name, default_cta: !data.cta } });
      });
      } // end if (ctaConf) — Ivan CTA suppressed in embed mode

      // Retake — quiet text link, not a hard button.
      // Suppressed in result mode: retaking a seeded result is meaningless (reload re-enters
      // result mode) and the removeItem calls would write the shared resources-domain localStorage.
      if (!resultMode) {
        var retakeWrap = make("div", { class: "lmc-retake-wrap" });
        var retake = make("button", { class: "lmc-retake", type: "button" }, "Retake the assessment");
        retake.addEventListener("click", function () {
          if (!confirm("Clear your answers and retake?")) return;
          try { localStorage.removeItem(storageKey(data.slug, "answers")); localStorage.removeItem(storageKey(data.slug, "email")); } catch (_) {}
          location.reload();
        });
        retakeWrap.appendChild(retake);
        host.appendChild(retakeWrap);
      }
    }

    // Initial render: results-forward (seeded) → straight to result; else start/resume.
    if (resultMode) {
      renderResult();
    } else if (phase === "start") {
      card.appendChild(buildStartSlide());
    } else {
      renderQuestion();
    }
    beacon("view", {});
  }

  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-assessment-src]");
    if (!root) return;
    var defaultSrc = root.getAttribute("data-lm-assessment-src") || "./data.json";
    var params = new URLSearchParams(location.search);
    var src = params.get("preview") === "draft" ? "./data.draft.json" : defaultSrc;
    fetch(src, { credentials: "same-origin" }).then(function (r) {
      if (params.get("preview") === "draft" && !r.ok) {
        return fetch(defaultSrc, { credentials: "same-origin" }).then(function (r2) {
          if (!r2.ok) throw new Error("data.json " + r2.status);
          return r2.json();
        });
      }
      if (!r.ok) throw new Error("data.json " + r.status);
      return r.json();
    }).then(function (data) { render(data, root); window.__lm_rerender = function(){ render(window.__lm_data, root); }; }).catch(function (e) {
      root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading assessment:</strong> ' + esc(e.message) + '</div>';
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();

// deploy nudge 2026-05-26T11:59:49Z
