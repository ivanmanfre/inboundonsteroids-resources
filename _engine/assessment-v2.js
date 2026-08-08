/* LM Assessment Engine v2 — mixed-type inputs (number / multi_select / short_text / likert) + computed personalized output
   Score = normalized per-question 0-100 → weighted average per category → average across categories
   Computed outputs (currency/hours/integer) run safeEval against the raw answer context
   Recommendations fire on `when` expressions referencing question ids + computed values */
(function () {
  "use strict";
  var LMScore = (typeof window !== "undefined" && window.LMScore) || {};
  var fmt = LMScore.fmt, safeEval = LMScore.safeEval, normalizeAnswer = LMScore.normalizeAnswer;
  function computeResult(data, answers) { return LMScore.computeResult(data, answers); }
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
  // D3.2: Supabase REST helpers for new RPCs (publishable anon key — safe for browser)
  var SUPABASE_ANON_KEY = window.__supabase_anon_key || "sb_publishable_Q-kfisfhqxXV5xiIhCduMQ_QSIflf4h";
  var SUPABASE_REST_BASE = "https://bjbvqvzbzczjbatgmccb.supabase.co/rest/v1";
  function rpc(name, body) {
    return fetch(SUPABASE_REST_BASE + "/rpc/" + name, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY },
      body: JSON.stringify(body || {}),
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // D3.3: scroll-recorder /share-card URL (auth-disabled in prod; token optional)
  var SCROLL_RECORDER_URL = window.__scroll_recorder_url || "https://scroll-recorder-production.up.railway.app";
  var SCROLL_RECORDER_TOKEN = window.__scroll_recorder_token || "";

  // D3.4: leaky bucket SVG — droplets fall out of trapezoid bucket; sage for currency, blue-ish ink for hours
  function leakyBucketSvg(co) {
    var isCurrency = co.format === "currency_per_period";
    var fill = isCurrency ? "#131210" : "#131210";
    var fillRgb = isCurrency ? "42,143,101" : "76,110,61";
    var drops = [];
    for (var i = 0; i < 6; i++) {
      var dur = 1.2 + Math.random() * 1.4;
      var delay = (i * 0.35).toFixed(2);
      var x = 90 + (i % 3 - 1) * 14;
      drops.push('<circle cx="' + x + '" cy="118" r="3" fill="' + fill + '">' +
        '<animate attributeName="cy" from="118" to="172" dur="' + dur.toFixed(2) + 's" begin="' + delay + 's" repeatCount="indefinite" />' +
        '<animate attributeName="opacity" from="1" to="0" dur="' + dur.toFixed(2) + 's" begin="' + delay + 's" repeatCount="indefinite" />' +
        '</circle>');
    }
    return '<div class="lmc-leaky" aria-label="' + esc(co.label) + ': ' + esc(fmt(co.format, co.value)) + '">' +
      '<svg viewBox="0 0 180 180" width="180" height="180" aria-hidden="true">' +
        '<defs><linearGradient id="lb-' + (co.id || "x") + '" x1="0" y1="0" x2="0" y2="1">' +
          '<stop offset="0%" stop-color="rgba(' + fillRgb + ',0.4)" />' +
          '<stop offset="100%" stop-color="rgba(' + fillRgb + ',0.12)" />' +
        '</linearGradient></defs>' +
        // Bucket trapezoid outline
        '<path d="M 50 38 L 130 38 L 122 118 L 58 118 Z" fill="url(#lb-' + (co.id || "x") + ')" stroke="rgba(19, 18, 16,0.55)" stroke-width="1.5" />' +
        // Surface line
        '<line x1="58" y1="54" x2="122" y2="54" stroke="rgba(' + fillRgb + ',0.6)" stroke-width="1.5" stroke-dasharray="3,3" />' +
        // Crack at the bottom
        '<line x1="84" y1="118" x2="96" y2="118" stroke="rgba(19, 18, 16,0.8)" stroke-width="1.5" />' +
        drops.join("") +
      '</svg>' +
      '<div class="lmc-leaky-meta">' +
        '<div class="lmc-leaky-label">' + esc(co.label) + '</div>' +
        '<div class="lmc-leaky-value">' + esc(fmt(co.format, co.value)) + '</div>' +
      '</div>' +
    '</div>';
  }
  // --- Flatten questions with persona classifier prepended ---
  function flattenQuestions(data) {
    var qs = [];
    if (data.persona_selector) qs.push(Object.assign({ __persona: true, category_id: "__persona", category_name: "About you", type: "likert_picker" }, data.persona_selector));
    (data.categories || []).forEach(function (cat) {
      (cat.questions || []).forEach(function (q) {
        qs.push(Object.assign({}, q, { category_id: cat.id || cat.name || "", category_name: cat.name || cat.id || "" }));
      });
    });
    return qs;
  }

  // --- Intro block (unchanged from v1) ---
  function buildIntro(data, startTargetSelector) {
    var welcomeLine = (data.intro && data.intro.paragraph) || (data.subtitle ? "You just grabbed " + (data.title || "this resource") + ". " + String(data.subtitle).replace(/\.$/, "") + "." : "You just grabbed " + (data.title || "this resource") + ".");
    var pointA = (data.intro && data.intro.point_time) || (data.estimated_minutes ? data.estimated_minutes + " min, at your pace" : "At your own pace");
    var pointB = (data.intro && data.intro.point_value) || "Honest inputs (not Likert vibes) so your output reflects your actual situation";
    var pointC = (data.intro && data.intro.point_next) || "Score + tier shown free. Email unlocks per-category breakdown + personalized fixes.";
    var sec = make("section", { class: "lmc-intro" });
    var inner = make("div", { class: "lmc-intro-inner" });
    // White-label tenant (data.client.id), mirroring shared.js clientOf(): a client page
    // must never greet with Ivan's name or portrait. Additive — no existing v2 assessment
    // carries a `client` block, so this is inert for the whole published catalog.
    var _wc = (data && data.client && data.client.id) ? data.client : null;
    // Phase 5 (2026-08-07): data-lm-brand="host" opt-out, same contract as shared.js/assessment.js.
    var _hostOnly = !_wc && !!(window.LM && window.LM.hostBranded && window.LM.hostBranded());
    var avatarEl = _wc
      ? (_wc.portrait ? make("img", { class: "lmc-intro-avatar", src: _wc.portrait, alt: _wc.name || "" }) : null)
      : (_hostOnly ? null : make("img", { class: "lmc-intro-avatar", src: "https://ivanmanfredi.com/ivan-portrait.jpg", alt: "Ivan Manfredi" }));
    if (avatarEl) inner.appendChild(avatarEl);
    var body = make("div", { class: "lmc-intro-body" });
    body.appendChild(make("div", { class: "lmc-intro-badge" }, "Welcome"));
    body.appendChild(make("h2", { class: "lmc-intro-h" },
      _wc ? esc("Hey, I'm " + (_wc.short_name || _wc.name) + ".") :
      (_hostOnly ? "Here&rsquo;s how this works." : "Hey, I&rsquo;m Ivan.")));
    var introPara = make("p", { class: "lmc-intro-p" }, esc(welcomeLine));
    if (window.LM && window.LM.editMode) {
      window.LM.editMode.registerField(introPara, "intro.paragraph", { multiline: true });
    }
    body.appendChild(introPara);
    var ul = make("ul", { class: "lmc-intro-points" });
    var introPointPaths = ["intro.point_time", "intro.point_value", "intro.point_next"];
    [["a", "⏱", pointA], ["b", "→", pointB], ["c", "✓", pointC]].forEach(function (p, ix) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0] }, p[1]));
      var pointSpan = make("span", null, esc(p[2]));
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(pointSpan, introPointPaths[ix], { multiline: true });
      }
      li.appendChild(pointSpan);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    var startBtn = make("button", { class: "lmc-intro-start", type: "button" }, "Start the assessment <span>&darr;</span>");
    startBtn.addEventListener("click", function () {
      var t = document.querySelector(startTargetSelector);
      if (t) t.scrollIntoView({ behavior: "smooth" });
      beacon("cta_click", { answers: { target: "intro_start" } });
    });
    body.appendChild(startBtn);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  // --- Embed intro (de-Ivanized lead-in) ---
  // The public intro (buildIntro) is Ivan's personal greeting: portrait + "Hey, I'm Ivan." Inside
  // a prospect's scan the sample must read as THEIR asset, so this variant drops the portrait and
  // the first-person Ivan copy and keeps only the orient-before-you-start card: a neutral "how this
  // works" heading, the resource's own welcome line, the three what-to-expect points (time / honest
  // inputs / free score), and a Start button. Same .lmc-intro classes so it inherits the brand CSS
  // (serif heading, accent chips, accent Start button); no edit-mode fields (embeds aren't edited).
  function buildIntroEmbed(data, bname) {
    var titleText = String(data.title || "this assessment").replace(/<[^>]*>/g, "").trim();
    var welcomeLine = (data.intro && data.intro.paragraph)
      || (data.subtitle
        ? "You just opened " + titleText + ". " + String(data.subtitle).replace(/\.$/, "") + "."
        : "A quick, honest read on where you stand right now — and the few things worth fixing first.");
    var pointA = (data.intro && data.intro.point_time) || (data.estimated_minutes ? data.estimated_minutes + " min, at your own pace" : "A few minutes, at your own pace");
    var pointB = (data.intro && data.intro.point_value) || "Answer honestly — real numbers, not Likert vibes — so the result reflects your actual situation";
    var pointC = (data.intro && data.intro.point_next) || "Your score and tier are free. Email unlocks the per-category breakdown and the fixes to prioritise.";
    var sec = make("section", { class: "lmc-intro lmc-intro-embed" });
    var inner = make("div", { class: "lmc-intro-inner" });
    var body = make("div", { class: "lmc-intro-body" });
    body.appendChild(make("div", { class: "lmc-intro-tag" }, "Before you start"));
    body.appendChild(make("h2", { class: "lmc-intro-h" }, "How this works"));
    body.appendChild(make("p", { class: "lmc-intro-p" }, esc(welcomeLine)));
    var ul = make("ul", { class: "lmc-intro-points" });
    [["a", "⏱", pointA], ["b", "→", pointB], ["c", "✓", pointC]].forEach(function (p) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0] }, p[1]));
      li.appendChild(make("span", null, esc(p[2])));
      ul.appendChild(li);
    });
    body.appendChild(ul);
    var startBtn = make("button", { class: "lmc-intro-start", type: "button" }, "Start the assessment <span>&darr;</span>");
    startBtn.addEventListener("click", function () {
      var t = document.querySelector(".lmc-widget");
      if (t) t.scrollIntoView({ behavior: "smooth" });
      beacon("cta_click", { answers: { target: "intro_start" } });
    });
    body.appendChild(startBtn);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  // --- Render ---
  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "assessment";
    if (window.LM && window.LM.tracker) window.LM.tracker.touch(data);

    // Embed mode: this assessment is shown INSIDE a prospect's scan page as a sample of the
    // lead magnet WE would build for THEM. Strip every "this is Ivan's site" signal — the site
    // chrome (logo, name, Let's Talk) and the closing fit-call CTA — so it reads as their asset.
    // Ported from assessment.js:198-382 via the pure embed-brand.js module (task-4-brief.md).
    var __params = new URLSearchParams(location.search);
    var embedMode = __params.get("src") === "scan_embed" || __params.get("embed") === "1";
    var embedLogoUrl = "";
    if (embedMode && window.LMEmbed) {
      try {
        document.documentElement.classList.add("lmc-embed");
        var __nav = document.querySelector(".im-nav"); if (__nav) __nav.remove();
        var __ft = document.querySelector(".im-footer"); if (__ft) __ft.remove();
        var __skip = document.getElementById("skip-link"); if (__skip) __skip.remove();
        var built = window.LMEmbed.buildEmbedVars(__params);
        if (built.fontLink) { var gfl = document.createElement("link"); gfl.rel = "stylesheet"; gfl.href = built.fontLink; document.head.appendChild(gfl); }
        var st = document.createElement("style"); st.textContent = built.css; document.head.appendChild(st);
        // Signal the dark-embed theme to the stylesheet (assessment.css keys the
        // question-flow + results dark rules off html.lmc-embed-dark). Ported
        // verbatim from assessment.js:329.
        try { if ((__params.get("hero") || "").trim() === "dark") document.documentElement.classList.add("lmc-embed-dark"); } catch (_) {}
        // Identity pass (bname/blogo) — ported verbatim from assessment.js:364-378
        var bname = (__params.get("bname") || "").trim();
        if (bname) { var baseTitle = (document.title || "").split(" | ")[0].trim() || String(data.title || "Assessment").replace(/<[^>]*>/g, "").trim(); document.title = baseTitle + " | " + bname; var ogSite = document.querySelector('meta[property="og:site_name"]'); if (ogSite) ogSite.setAttribute("content", bname); }
        var blogo = (__params.get("blogo") || "").trim();
        if (blogo && /^https?:\/\//i.test(blogo)) { var icons = document.querySelectorAll('link[rel~="icon"],link[rel="apple-touch-icon"]'); for (var ii = 0; ii < icons.length; ii++) icons[ii].setAttribute("href", blogo); }
        // The prospect's own logo, shown at the top of the sample so it reads as their asset.
        // The scan-side URL builder (assessmentEmbed.ts) sends the prospect logo as ?blogo=;
        // accept it alongside the older ?logo= so the prospect's mark actually renders.
        embedLogoUrl = (__params.get("logo") || __params.get("blogo") || "").trim();
      } catch (_) {}
    }

    var key = "ivan.assessment." + data.slug;
    var questions = flattenQuestions(data);
    // Embed samples always start fresh: the same LM slug is reused across prospects on the
    // resources domain, so a prior visitor's saved progress would otherwise render as "already
    // completed" the moment the modal opens. Ignore (and never write) localStorage in embed mode.
    var answers = embedMode ? {} : (function () { try { return JSON.parse(localStorage.getItem(key + ".answers") || "{}"); } catch (_) { return {}; } })();
    var idx = 0;
    for (var i = 0; i < questions.length; i++) {
      if (answers[questions[i].id || "__persona"] == null) { idx = i; break; }
      idx = i + 1;
    }
    var captured = embedMode ? false : !!localStorage.getItem(key + ".email");
    root.innerHTML = "";

    // Hero
    var hero = make("section", { class: "lmc-hero" });
    var hi = make("div", { class: "lmc-container" });
    if (embedLogoUrl) {
      var __logo = make("img", { class: "lmc-embed-logo", src: embedLogoUrl, alt: (data.brand && data.brand.wordmark) || "" });
      __logo.addEventListener("error", function () { __logo.remove(); });
      hi.appendChild(__logo);
    }
    var heroBadgeEl = make("div", { class: "lmc-badge" }, esc((data.brand && data.brand.hero_badge) || "Interactive Assessment"));
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
    var meta = make("div", { class: "lmc-meta" });
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, questions.length + " questions"));
    if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Auto-saves"));
    hi.appendChild(meta);
    hero.appendChild(hi);
    root.appendChild(hero);

    // Intro / lead-in before the questions. The public page uses Ivan's personal greeting
    // (portrait + "Hey, I'm Ivan."). Inside a prospect's scan that must read as THEIR asset, so
    // embed mode builds a de-Ivanized lead-in instead of skipping the intro entirely — the sample
    // now opens with the same orient-before-you-start card a resource page has (2026-07-23).
    if (embedMode) root.appendChild(buildIntroEmbed(data, bname));
    else root.appendChild(buildIntro(data, ".lmc-widget"));

    var widget = make("div", { class: "lmc-widget" });
    var card = make("div", { class: "lmc-card", id: "lmc-card" });
    widget.appendChild(card);
    root.appendChild(widget);

    function save() { if (embedMode) return; try { localStorage.setItem(key + ".answers", JSON.stringify(answers)); } catch (_) {} }

    function renderQuestion() {
      card.innerHTML = "";
      var q = questions[idx];
      // Resolve the data.json path for this question so edit-mode hooks can be
      // wired for its text/hint + type-specific renderer. Persona classifier
      // lives at "persona_selector" (not inside categories[]).
      var isPersona = !!q.__persona;
      var catIdx = -1, qIdx = -1, basePath = null;
      if (isPersona) {
        basePath = "persona_selector";
      } else if (q.category_id && q.id) {
        catIdx = (data.categories || []).findIndex(function (c) { return (c.id || c.name) === q.category_id; });
        qIdx = catIdx >= 0 ? (data.categories[catIdx].questions || []).findIndex(function (qq) { return qq.id === q.id; }) : -1;
        if (catIdx >= 0 && qIdx >= 0) basePath = "categories[" + catIdx + "].questions[" + qIdx + "]";
      }
      if (q.category_name) {
        var catEl = make("div", { class: "lmc-category" }, esc(q.category_name));
        if (!isPersona && catIdx >= 0 && window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(catEl, "categories[" + catIdx + "].name");
        }
        card.appendChild(catEl);
      }
      var qH = make("h2", { class: "lmc-question", id: "lmc-q" + idx, tabindex: "-1" }, esc(q.text || q.label || ""));
      if (basePath && window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(qH, basePath + ".text", { multiline: true });
      }
      card.appendChild(qH);
      if (q.hint) {
        var hintEl = make("p", { class: "lmc-hint" }, esc(q.hint));
        if (basePath && window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(hintEl, basePath + ".hint");
        }
        card.appendChild(hintEl);
      }

      // Type-dispatched input
      if (q.type === "number") renderNumberInput(q, basePath);
      else if (q.type === "multi_select") renderMultiSelect(q, basePath);
      else if (q.type === "short_text") renderShortText(q);
      else renderLikert(q, basePath); // likert, likert_picker, or anything else defaults to radio list

      // Nav
      var nav = make("div", { class: "lmc-nav" });
      var back = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Back");
      if (idx === 0) back.setAttribute("disabled", "disabled");
      back.addEventListener("click", function () { if (idx > 0) { idx--; renderQuestion(); } });
      var nextLabel = idx === questions.length - 1 ? "See result →" : "Next →";
      var nextBtn = make("button", { class: "lmc-btn", type: "button", id: "lmc-next" }, nextLabel);
      if (!hasValidAnswer(q)) nextBtn.setAttribute("disabled", "disabled");
      nextBtn.addEventListener("click", goNext);
      nav.appendChild(back); nav.appendChild(nextBtn);
      card.appendChild(nav);
      setTimeout(function () { var h = $("#lmc-q" + idx); if (h) h.focus(); }, 10);
    }

    function hasValidAnswer(q) {
      var a = answers[q.id || "__persona"];
      if (q.type === "number") return a != null && a !== "" && !isNaN(Number(a));
      if (q.type === "multi_select") return Array.isArray(a) && a.length > 0;
      if (q.type === "short_text") return typeof a === "string" && a.trim().length > 0;
      return a != null;
    }

    function renderLikert(q, basePath) {
      var options = q.answers || [
        { label: "1 — Strongly disagree", score: 1 },
        { label: "2 — Disagree", score: 2 },
        { label: "3 — Neutral", score: 3 },
        { label: "4 — Agree", score: 4 },
        { label: "5 — Strongly agree", score: 5 }
      ];
      var ul = make("ul", { class: "lmc-options" });
      options.forEach(function (opt, ix) {
        var li = make("li");
        var checked = (answers[q.id || "__persona"] === ix);
        var label = make("label", { class: "lmc-opt" + (checked ? " selected" : ""), for: "lmc-q" + idx + "-o" + ix });
        var input = make("input", { type: "radio", name: "q" + idx, id: "lmc-q" + idx + "-o" + ix, value: String(ix) });
        if (checked) input.setAttribute("checked", "checked");
        label.appendChild(input);
        var labelSpan = make("span", null, esc(opt.label || opt.text || String(opt)));
        if (basePath && window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(labelSpan, basePath + ".answers[" + ix + "].label", { multiline: true });
        }
        label.appendChild(labelSpan);
        li.appendChild(label); ul.appendChild(li);
        label.addEventListener("click", function (e) {
          // In edit mode, clicks on the option should go to the inline editor on
          // the label span, not record an answer. The span's edit-mode handler
          // stops propagation, so this only fires for clicks outside the text
          // (e.g. the radio hit-area) — guard those too.
          if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) {
            if (e) e.preventDefault();
            return;
          }
          answers[q.id || "__persona"] = ix;
          save();
          setTimeout(function () { goNext(); }, 200);
        });
      });
      card.appendChild(ul);
    }

    function renderNumberInput(q, basePath) {
      var wrap = make("div", { class: "lmc-input-row" });
      if (q.prefix) {
        var prefixEl = make("span", { class: "lmc-prefix" }, esc(q.prefix));
        if (basePath && window.LM && window.LM.editMode) window.LM.editMode.registerField(prefixEl, basePath + ".prefix");
        wrap.appendChild(prefixEl);
      }
      var input = make("input", { type: "number", class: "lmc-number", id: "lmc-q" + idx + "-n", inputmode: "decimal" });
      if (q.min != null) input.setAttribute("min", q.min);
      if (q.max != null) input.setAttribute("max", q.max);
      if (q.step != null) input.setAttribute("step", q.step);
      var current = answers[q.id];
      if (current != null) input.value = current;
      else if (q.default != null) input.value = q.default;
      input.addEventListener("input", function () {
        answers[q.id] = input.value === "" ? null : Number(input.value);
        save();
        var nb = $("#lmc-next"); if (nb) { if (hasValidAnswer(q)) nb.removeAttribute("disabled"); else nb.setAttribute("disabled", "disabled"); }
      });
      wrap.appendChild(input);
      if (q.suffix) {
        var suffixEl = make("span", { class: "lmc-suffix" }, esc(q.suffix));
        if (basePath && window.LM && window.LM.editMode) window.LM.editMode.registerField(suffixEl, basePath + ".suffix");
        wrap.appendChild(suffixEl);
      }
      card.appendChild(wrap);
      setTimeout(function () { input.focus(); }, 50);
    }

    function renderMultiSelect(q, basePath) {
      var ul = make("ul", { class: "lmc-options lmc-multi" });
      var current = Array.isArray(answers[q.id]) ? answers[q.id].slice() : [];
      (q.answers || []).forEach(function (opt, ix) {
        var li = make("li");
        var selected = current.indexOf(opt.tag) !== -1;
        var label = make("label", { class: "lmc-opt lmc-opt-check" + (selected ? " selected" : ""), for: "lmc-q" + idx + "-c" + ix });
        var input = make("input", { type: "checkbox", id: "lmc-q" + idx + "-c" + ix, value: opt.tag });
        if (selected) input.setAttribute("checked", "checked");
        label.appendChild(input);
        label.appendChild(make("span", { class: "lmc-check-box" }, "&#10003;"));
        var checkTextSpan = make("span", { class: "lmc-check-text" }, esc(opt.label || opt.text));
        if (basePath && window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(checkTextSpan, basePath + ".answers[" + ix + "].label", { multiline: true });
        }
        label.appendChild(checkTextSpan);
        li.appendChild(label); ul.appendChild(li);
        label.addEventListener("click", function (e) {
          e.preventDefault();
          // In edit mode, clicks go to the inline editor on the label span
          // (which stops propagation); guard clicks elsewhere on the label
          // (checkbox hit-area) so they don't toggle a selection while editing.
          if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) return;
          var arr = Array.isArray(answers[q.id]) ? answers[q.id].slice() : [];
          var pos = arr.indexOf(opt.tag);
          if (pos === -1) arr.push(opt.tag); else arr.splice(pos, 1);
          answers[q.id] = arr;
          save();
          label.classList.toggle("selected", arr.indexOf(opt.tag) !== -1);
          input.checked = arr.indexOf(opt.tag) !== -1;
          var nb = $("#lmc-next"); if (nb) { if (hasValidAnswer(q)) nb.removeAttribute("disabled"); else nb.setAttribute("disabled", "disabled"); }
        });
      });
      card.appendChild(ul);
      var multiHintEl = make("p", { class: "lmc-multi-hint" }, esc(q.multi_hint || "Check all that apply."));
      if (basePath && window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(multiHintEl, basePath + ".multi_hint");
      }
      card.appendChild(multiHintEl);
    }

    function renderShortText(q) {
      var ta = make("textarea", { class: "lmc-textarea", id: "lmc-q" + idx + "-t", rows: "3", placeholder: q.placeholder || "One sentence is fine." });
      var current = answers[q.id];
      if (typeof current === "string") ta.value = current;
      ta.addEventListener("input", function () {
        answers[q.id] = ta.value;
        save();
        var nb = $("#lmc-next"); if (nb) { if (hasValidAnswer(q)) nb.removeAttribute("disabled"); else nb.setAttribute("disabled", "disabled"); }
      });
      card.appendChild(ta);
      setTimeout(function () { ta.focus(); }, 50);
    }

    // D3.2: Per-question social proof reveal. Skips first 3 questions (no capture overhead),
    // skips persona classifier, requires ≥ 10 prior captures for that q+persona combo.
    function ctxPersonaTag() {
      if (data.persona_selector && answers["__persona"] != null) {
        var p = data.persona_selector.answers && data.persona_selector.answers[answers["__persona"]];
        return p && p.tag ? p.tag : null;
      }
      return null;
    }

    function showSocialProof(match, sampleSize, persona, onClose) {
      if (document.querySelector(".lmc-social-proof")) { onClose(); return; }
      var overlay = make("div", { class: "lmc-social-proof" });
      overlay.innerHTML =
        '<div class="lmc-social-proof-card">' +
          '<div class="lmc-social-proof-pct">' + Math.round(match.pct) + '%</div>' +
          '<div class="lmc-social-proof-label">of ' + esc(persona || "respondents") + ' also chose this answer</div>' +
          '<div class="lmc-social-proof-meta">based on ' + sampleSize + ' completions</div>' +
        '</div>';
      document.body.appendChild(overlay);
      setTimeout(function () { overlay.classList.add("show"); }, 10);
      var done = false;
      var finish = function () {
        if (done) return; done = true;
        overlay.classList.remove("show");
        setTimeout(function () { try { overlay.remove(); } catch (_) {} onClose(); }, 200);
      };
      setTimeout(finish, 1500);
    }

    function goNext() {
      var q = questions[idx];
      if (!hasValidAnswer(q)) return;
      var advance = function () {
        if (idx < questions.length - 1) { idx++; renderQuestion(); }
        else renderResult();
      };
      // Skip social-proof reveal on first 3 questions, persona classifier, or short_text (no discrete answer to match)
      var qNum = idx + (data.persona_selector ? 0 : 1);  // 0-indexed; we want to skip 0,1,2
      var eligible = !!q.id && idx >= 3 && q.type !== "short_text" && answers[q.id] != null;
      if (!eligible) { advance(); return; }
      var persona = ctxPersonaTag();
      rpc("lm_assessment_answer_distribution", { p_slug: data.slug, p_question_id: q.id, p_persona: persona })
        .then(function (rows) {
          if (!rows || rows.length === 0 || (rows[0].sample_size || 0) < 10) { advance(); return; }
          var yourAns = String(answers[q.id]);
          var match = (rows || []).find(function (r) { return String(r.answer_value) === yourAns; });
          if (!match) { advance(); return; }
          showSocialProof(match, rows[0].sample_size, persona, advance);
        }).catch(function () { advance(); });
    }

    function renderResult() {
      var res = computeResult(data, answers);
      card.innerHTML = "";
      var wrap = make("div", { class: "lmc-result" });
      var circ = 2 * Math.PI * 70;
      var finalOffset = circ - (res.overall / 100) * circ;
      // D3.1: render arc fully empty initially, then transition to final offset for draw animation
      wrap.innerHTML = '<div class="lmc-score-ring entering"><svg width="180" height="180" viewBox="0 0 180 180"><circle class="track" cx="90" cy="90" r="70"/><circle class="arc" cx="90" cy="90" r="70" stroke-dasharray="' + circ.toFixed(2) + '" stroke-dashoffset="' + circ.toFixed(2) + '" data-final-offset="' + finalOffset.toFixed(2) + '"/></svg><div class="score-num"><div class="num">0</div><div class="suffix">out of 100</div></div></div>';
      var tierPillEl = make("div", { class: "lmc-tier-pill " + (res.tier.class || "") }, esc(res.tier.name));
      if (window.LM && window.LM.editMode) {
        // The pill shows whichever tier_thresholds.*_label the score selected —
        // a tier name chosen by score logic, not free text. Locked: edit via Raw JSON.
        var tierLabelKey = res.tier.class === "low" ? "low_label" : (res.tier.class === "medium" ? "mid_label" : "high_label");
        window.LM.editMode.registerField(tierPillEl, "tier_thresholds." + tierLabelKey, { locked: true });
      }
      wrap.appendChild(tierPillEl);

      // Computed outputs rendered prominently (this is the $ leak / hrs lost).
      // D3.4: currency_per_period + hours_per_period get replaced with leaky-bucket SVG
      var visibleComputed = Object.values(res.computed).filter(function (co) { return co.show; });
      if (visibleComputed.length > 0) {
        var cb = make("div", { class: "lmc-computed-block" });
        visibleComputed.forEach(function (co) {
          // Labels are raw copy (data.computed_outputs[i].label); values are
          // fully computed from a formula with no backing text path — never
          // registered.
          var coIdx = (data.computed_outputs || []).findIndex(function (o) { return o.id === co.id; });
          if (co.format === "currency_per_period" || co.format === "hours_per_period") {
            var lb = make("div", { class: "lmc-leaky-wrap", "data-computed-id": co.id });
            lb.innerHTML = leakyBucketSvg(co);
            cb.appendChild(lb);
            if (coIdx >= 0 && window.LM && window.LM.editMode) {
              var leakyLabelEl = lb.querySelector(".lmc-leaky-label");
              if (leakyLabelEl) window.LM.editMode.registerField(leakyLabelEl, "computed_outputs[" + coIdx + "].label");
            }
          } else {
            var row = make("div", { class: "lmc-computed-row" });
            row.innerHTML = '<div class="lmc-computed-label">' + esc(co.label) + '</div><div class="lmc-computed-value">' + fmt(co.format, co.value) + '</div>';
            cb.appendChild(row);
            if (coIdx >= 0 && window.LM && window.LM.editMode) {
              var computedLabelEl = row.querySelector(".lmc-computed-label");
              if (computedLabelEl) window.LM.editMode.registerField(computedLabelEl, "computed_outputs[" + coIdx + "].label");
            }
          }
        });
        wrap.appendChild(cb);
      }

      // Weakest-category headline sentence (uses real user inputs)
      if (res.weakest) {
        var headline = buildHeadline(data, res);
        wrap.appendChild(make("p", { class: "lmc-result-lead" }, headline));
      }
      card.appendChild(wrap);

      // D3.1: trigger arc draw + number count-up after the DOM is committed
      var ring = wrap.querySelector(".lmc-score-ring");
      var arc = ring && ring.querySelector(".arc");
      var numEl = ring && ring.querySelector(".score-num .num");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (ring) ring.classList.add("in-view");
          if (arc) arc.setAttribute("stroke-dashoffset", arc.getAttribute("data-final-offset"));
          if (numEl) {
            var finalScore = res.overall;
            if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
              numEl.textContent = String(finalScore);
            } else {
              var start = performance.now();
              (function tickNum(now) {
                var t = Math.min(1, ((now || performance.now()) - start) / 1000);
                var eased = 1 - Math.pow(1 - t, 3);
                numEl.textContent = String(Math.round(finalScore * eased));
                if (t < 1) requestAnimationFrame(tickNum);
              })(start);
            }
          }
        });
      });

      // D3.3: generate share card + set og:image meta (best-effort, async)
      try {
        var hdrs = { "Content-Type": "application/json" };
        if (SCROLL_RECORDER_TOKEN) hdrs["Authorization"] = "Bearer " + SCROLL_RECORDER_TOKEN;
        fetch(SCROLL_RECORDER_URL + "/share-card", {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({
            slug: data.slug,
            score: res.overall,
            tier: res.tier && res.tier.name,
            persona: res.persona,
            weakest: res.weakest && res.weakest.name,
            title: data.title,
          }),
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
          if (j && j.url) {
            // Update / inject og:image + twitter:image so re-share previews use the result image
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

      var alreadyCaptured = embedMode ? false : !!localStorage.getItem(key + ".email");
      var gated = LMScore.shouldGate(data, alreadyCaptured, embedMode);

      beacon("complete", {
        email: null,
        overall_score: res.overall,
        tier: res.tier.name,
        per_category: res.per_category,
        weakest_category: res.weakest && res.weakest.id,
        persona: res.persona,
        computed: Object.fromEntries(Object.entries(res.computed).map(function (e) { return [e[0], e[1].value]; })),
        answers: res.ctx
      });

      if (gated) renderGate(res, wrap);
      else renderUnlocked(res);
    }

    // Pre-reveal capture barrier — ported from assessment.js:855-913 (data.capture_gate config).
    // Renders into `wrap` (appended after the score hero / computed block / headline, before
    // any category breakdown), and reveals the full report via renderUnlocked() only once a
    // valid email is submitted. Distinct from the optional opt-in form inside renderUnlocked,
    // which is additive and never blocks anything.
    function renderGate(res, wrap) {
      var gateConf = (data.capture_gate && typeof data.capture_gate === "object") ? data.capture_gate : {};
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
      wrap.appendChild(gate);
      var form = gate.querySelector("#lmc-capture-form");
      var emailInput = gate.querySelector("#lmc-email");

      if (window.LM && window.LM.editMode) {
        var gateH2 = gate.querySelector("h2");
        var gateDescEl = gate.querySelector("p");
        var gateNoteEl = gate.querySelector(".lmc-note");
        var gateBtnTextEl = gate.querySelector(".lmc-capture-btn-text");
        if (gateH2) window.LM.editMode.registerField(gateH2, "capture_gate.headline_html", { multiline: true });
        if (gateDescEl) window.LM.editMode.registerField(gateDescEl, "capture_gate.description", { multiline: true });
        if (gateBtnTextEl) window.LM.editMode.registerField(gateBtnTextEl, "capture_gate.button");
        if (gateNoteEl) window.LM.editMode.registerField(gateNoteEl, "capture_gate.note", { multiline: true });
      }

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var em = (emailInput || {}).value || "";
        if (!em || em.indexOf("@") === -1) { toast("Enter a valid email"); return; }
        if (!embedMode) { try { localStorage.setItem(key + ".email", em); } catch (_) {} }
        beacon("capture", {
          email: em,
          overall_score: res.overall,
          tier: res.tier.name,
          per_category: res.per_category,
          weakest_category: res.weakest && res.weakest.id,
          persona: res.persona,
          computed: Object.fromEntries(Object.entries(res.computed).map(function (e) { return [e[0], e[1].value]; })),
          answers: res.ctx
        });
        renderUnlocked(res); // removes #lmc-capture itself (see top of renderUnlocked)
      });
    }

    function renderUnlocked(res) {
      var g = $("#lmc-capture"); if (g) g.parentNode.removeChild(g);
      var unl = make("div", { class: "lmc-unlocked" });
      unl.appendChild(make("h3", { style: "font-size:1.5rem;font-weight:900;text-transform:uppercase;margin:1.5rem 0 1rem;" }, "Your full report"));
      (data.categories || []).forEach(function (cat, catIdx) {
        var key2 = cat.id || cat.name;
        var catRes = res.per_category[key2];
        if (!catRes) return;
        var block = make("div", { class: "lmc-category-block" });
        var h4 = make("h4", null, esc(cat.name || cat.id));
        if (window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(h4, "categories[" + catIdx + "].name");
        }
        block.appendChild(h4);
        block.innerHTML += '<div class="lmc-cat-bar"><div class="lmc-cat-track"><div class="lmc-cat-fill" style="width:' + catRes.score + '%"></div></div><span class="lmc-cat-pct">' + catRes.score + '/100</span></div>';
        var rec = pickRec(cat, catRes.score, res.ctx);
        if (rec) {
          var rc = make("div", { class: "lmc-rec" });
          var tag = catRes.score <= 40 ? "Fix first" : catRes.score <= 70 ? "Next unlock" : "Keep sharpening";
          rc.appendChild(make("strong", null, esc(tag)));
          var recTextSpan = make("span", { class: "lmc-rec-text" }, esc(rec.text || rec.headline || ""));
          rc.appendChild(recTextSpan);
          // Only the legacy {low,mid,high} recommendations object resolves to a
          // stable path (the matched key). The newer `when`-expression array
          // format doesn't expose which entry matched, so it's left unregistered
          // rather than risk writing to the wrong index.
          var recIsLegacy = !Array.isArray(cat.recommendations);
          var recPath = null;
          if (recIsLegacy) {
            var recTierKey = catRes.score <= 40 ? "low" : (catRes.score <= 70 ? "mid" : "high");
            var recAltKey = ({ low: "critical", mid: "growth", high: "optimized" })[recTierKey];
            var recsObj = cat.recommendations || {};
            var recBranchKey = recsObj[recTierKey] != null ? recTierKey : (recsObj[recAltKey] != null ? recAltKey : recTierKey);
            recPath = "categories[" + catIdx + "].recommendations." + recBranchKey;
            if (window.LM && window.LM.editMode) {
              window.LM.editMode.registerField(recTextSpan, recPath + ".text", { multiline: true });
            }
          }
          if (rec.steps) {
            var ulSteps = make("ul");
            rec.steps.forEach(function (s, si) {
              var li = make("li", null, esc(s));
              if (recIsLegacy && recPath && window.LM && window.LM.editMode) {
                window.LM.editMode.registerField(li, recPath + ".steps[" + si + "]", { multiline: true });
              }
              ulSteps.appendChild(li);
            });
            rc.appendChild(ulSteps);
          }
          block.appendChild(rc);
        }
        unl.appendChild(block);
      });
      // Share + retake
      var share = make("div", { class: "lmc-share" });
      var currentUrl = location.href.split("?")[0];
      // Embed mode: the sample is the PROSPECT's asset — never attribute it to Ivan in the
      // share line. Use their brand name (?bname=) when the scan passed one, else no owner.
      var shareOwner = embedMode ? ((typeof bname === "string" && bname) ? bname + "’s " : "") : "Ivan Manfredi’s ";
      var shareText = "I scored " + res.overall + "/100 on " + shareOwner + (data.title || "assessment") + " (" + res.tier.name + (res.weakest ? "). Biggest gap: " + res.weakest.name : "") + ". Worth the time:";
      var liUrl = "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(currentUrl) + "&summary=" + encodeURIComponent(shareText);
      var liBtn = make("a", { class: "lmc-btn", href: liUrl, target: "_blank", rel: "noopener" }, "Share on LinkedIn →");
      liBtn.addEventListener("click", function () { beacon("share", { answers: { target: "linkedin", score: res.overall } }); });
      share.appendChild(liBtn);
      var waUrl = window.LM && window.LM.share ? window.LM.share.whatsapp(shareText) : "#";
      var waBtn = make("a", { class: "lmc-btn lm-share-whatsapp", href: waUrl, target: "_blank", rel: "noopener" }, "Share on WhatsApp");
      waBtn.addEventListener("click", function () { beacon("share", { answers: { target: "whatsapp", score: res.overall } }); });
      share.appendChild(waBtn);
      var copy = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Copy link");
      copy.addEventListener("click", function () { if (navigator.clipboard) navigator.clipboard.writeText(currentUrl).then(function () { toast("Link copied"); }); beacon("share", { answers: { target: "copy_link" } }); });
      share.appendChild(copy);
      var retake = make("button", { class: "lmc-btn lmc-btn-secondary", type: "button" }, "Retake");
      retake.addEventListener("click", function () {
        if (!confirm("Clear answers and retake?")) return;
        if (!embedMode) { try { localStorage.removeItem(key + ".answers"); localStorage.removeItem(key + ".email"); } catch (_) {} }
        location.reload();
      });
      share.appendChild(retake);
      unl.appendChild(share);
      // Optional email opt-in — NOT a gate. Pure additive.
      var optin = make("div", { class: "lmc-optin" });
      optin.innerHTML =
        '<h4>Save this for later?</h4>' +
        '<p>If you want this report emailed to you, with what I\'d fix first, drop your address. Otherwise feel free to close the tab or bookmark the page.</p>' +
        '<form class="lmc-form" id="lmc-optin-form">' +
        '<input class="lmc-form-input" id="lmc-optin-email" type="email" autocomplete="email" placeholder="Optional, your email" />' +
        '<button class="lmc-btn lmc-btn-secondary" type="submit">Email me the report</button>' +
        '</form>';
      unl.appendChild(optin);
      var of = optin.querySelector("form");
      of.addEventListener("submit", function (e) {
        e.preventDefault();
        var em = (optin.querySelector("#lmc-optin-email") || {}).value || "";
        if (!em || em.indexOf("@") === -1) { toast("Enter a valid email"); return; }
        if (!embedMode) { try { localStorage.setItem(key + ".email", em); } catch (_) {} }
        beacon("capture", {
          email: em,
          overall_score: res.overall,
          tier: res.tier.name,
          per_category: res.per_category,
          weakest_category: res.weakest && res.weakest.id,
          persona: res.persona,
          computed: Object.fromEntries(Object.entries(res.computed).map(function (e) { return [e[0], e[1].value]; })),
          answers: res.ctx
        });
        optin.innerHTML = '<h4>Sent.</h4><p>Look for "your ' + esc(data.title || "report") + '" in your inbox. If it doesn\'t show in 2 min, check Promotions or Spam.</p>';
      });

      // Embed mode: this sample lives inside a PROSPECT's scan page — never surface
      // Ivan's own booking CTA (per-LM cta.url or the hardcoded fit-call fallback)
      // inside someone else's asset. Mirrors assessment.js:1072 (`if (embedMode) { ctaConf = null; }`).
      if (!embedMode) {
        if (data.cta && data.cta.url) {
          var cta = make("div", { class: "lmc-cta-box" });
          cta.innerHTML = '<h3>' + esc(data.cta.headline || "Want help closing these gaps?") + '</h3><p>' + esc(data.cta.description || "") + '</p><a class="lmc-btn" href="' + esc(data.cta.url) + '" target="_blank" rel="noopener"><span class="lmc-cta-btn-text">' + esc(data.cta.button || "Book Strategy Call") + '</span></a>';
          unl.appendChild(cta);
          if (window.LM && window.LM.editMode) {
            var ctaH3 = cta.querySelector("h3");
            var ctaDescEl = cta.querySelector("p");
            var ctaBtnTextEl = cta.querySelector(".lmc-cta-btn-text");
            if (ctaH3) window.LM.editMode.registerField(ctaH3, "cta.headline", { multiline: true });
            if (ctaDescEl) window.LM.editMode.registerField(ctaDescEl, "cta.description", { multiline: true });
            if (ctaBtnTextEl) window.LM.editMode.registerField(ctaBtnTextEl, "cta.button");
          }
          cta.querySelector("a").addEventListener("click", function (e) {
            if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) {
              e.preventDefault();
              return;
            }
            beacon("cta_click", { answers: { score: res.overall, tier: res.tier.name } });
          });
        } else {
          // No per-LM CTA configured — default fit-call CTA so every assessment
          // ends with a clear next step (2026-06-09).
          var fallbackCta = make("div", { class: "lmc-cta-box" });
          var fallbackUrl = window.LM && window.LM.callUrl ? window.LM.callUrl("closing-cta") : "https://calendly.com/im-ivanmanfredi/30min";
          fallbackCta.innerHTML = '<h3>Want help closing these gaps?</h3>' +
            '<p>Book a free 30-minute fit call. I\'ll walk your weakest category live and tell you exactly how I\'d fix it. If you can run it yourself, I\'ll tell you that too.</p>' +
            '<a class="lmc-btn" href="' + esc(fallbackUrl) + '" target="_blank" rel="noopener">Book the free fit call</a>';
          unl.appendChild(fallbackCta);
          fallbackCta.querySelector("a").addEventListener("click", function () { beacon("cta_click", { answers: { score: res.overall, tier: res.tier.name, default_cta: true } }); });
        }
      }
      card.appendChild(unl);

      // D3.5: time-series sparkline for repeat takers (requires localStorage email + ≥ 2 prior captures)
      try {
        var prevEmail = "";
        if (!embedMode) { try { prevEmail = localStorage.getItem(key + ".email") || ""; } catch (_) {} }
        if (prevEmail) {
          rpc("lm_assessment_score_history", { p_slug: data.slug, p_email: prevEmail }).then(function (rows) {
            if (!Array.isArray(rows) || rows.length < 2) return;
            var ts = make("div", { class: "lmc-timeseries" });
            var scores = rows.map(function (r) { return r.overall_score; });
            var maxS = Math.max.apply(null, scores);
            var minS = Math.min.apply(null, scores);
            var range = Math.max(1, maxS - minS);
            var points = rows.map(function (r, i) {
              var x = rows.length > 1 ? (i / (rows.length - 1)) * 240 : 120;
              var y = 40 - ((r.overall_score - minS) / range) * 36;
              return x.toFixed(1) + "," + y.toFixed(1);
            }).join(" ");
            var dotsHtml = rows.map(function (r, i) {
              var x = rows.length > 1 ? (i / (rows.length - 1)) * 240 : 120;
              var y = 40 - ((r.overall_score - minS) / range) * 36;
              return '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="3" fill="#131210" />';
            }).join("");
            ts.innerHTML = '<h4>Your scores over time</h4>' +
              '<svg viewBox="0 0 240 40" width="240" height="40" preserveAspectRatio="xMinYMid meet" aria-hidden="true">' +
                '<polyline points="' + points + '" fill="none" stroke="#131210" stroke-width="2" />' +
                dotsHtml +
              '</svg>' +
              '<p>From ' + scores[0] + ' to ' + scores[scores.length - 1] + ' across ' + rows.length + ' takes.</p>';
            unl.appendChild(ts);
          });
        }
      } catch (_) {}
    }

    function pickRec(cat, score, ctx) {
      // Support both old recommendations object AND new dynamic recommendations with when expressions
      if (Array.isArray(cat.recommendations)) {
        // New format: array of {when, text, steps, headline}
        for (var i = 0; i < cat.recommendations.length; i++) {
          var r = cat.recommendations[i];
          if (r.when) { if (safeEval(r.when, ctx)) return r; }
          else if (r.if_score_below != null && score < r.if_score_below) return r;
          else if (r.if_score_above != null && score > r.if_score_above) return r;
        }
        return cat.recommendations[cat.recommendations.length - 1];
      }
      // Legacy object format
      var recs = cat.recommendations || {};
      if (score <= 40) return recs.low || recs.critical || null;
      if (score <= 70) return recs.mid || recs.growth || null;
      return recs.high || recs.optimized || null;
    }

    function buildHeadline(data, res) {
      if (data.headline_formula) {
        // Claude can template the headline: "You scored {overall}/100. With {door_count} doors..."
        var tpl = data.headline_formula;
        Object.keys(res.ctx || {}).forEach(function (k) {
          tpl = tpl.replace(new RegExp("\\{" + k + "\\}", "g"), res.ctx[k] != null ? String(res.ctx[k]) : "");
        });
        Object.entries(res.computed).forEach(function (e) {
          tpl = tpl.replace(new RegExp("\\{" + e[0] + "\\}", "g"), fmt(e[1].format, e[1].value));
        });
        if (res.weakest) {
          tpl = tpl.replace(/\{weakest_category_name\}/g, res.weakest.name);
          tpl = tpl.replace(/\{weakest_category_score\}/g, String(res.weakest.score));
        }
        return tpl;
      }
      return "Your weakest area is <strong>" + esc(res.weakest.name) + "</strong> (" + res.weakest.score + "/100). That's where the biggest hours-per-week leak usually lives.";
    }

    renderQuestion();
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
