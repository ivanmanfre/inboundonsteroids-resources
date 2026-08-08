/* LM Calculator Engine — vanilla JS, reads data.json, live-computes outputs, email-gated beacon integration */
(function () {
  "use strict";
  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function make(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html !== undefined) e.innerHTML = html; return e; }
  function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }
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

  function fmt(spec, val) {
    if (val == null || isNaN(val)) return "—";
    var n = Number(val);
    if (spec === "currency") return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (spec === "percent") return n.toFixed(0) + "%";
    if (spec === "hours") return n.toFixed(n < 10 ? 1 : 0) + " hrs";
    if (spec === "decimal") return n.toFixed(2);
    if (spec === "integer") return Math.round(n).toLocaleString("en-US");
    return n.toLocaleString("en-US");
  }

  function safeEval(expr, ctx) {
    // Whitelist: only allow variable names (a-z 0-9 _ .), numbers, operators ( + - * / % ( ) ), ternary ? :, Math.*, and comparison
    // Replace identifiers with ctx[name]
    try {
      var allowed = /^[\s0-9a-zA-Z_\.\+\-\*\/\%\(\)\?\:\,\<\>\=\!\&\|]+$/;
      if (!allowed.test(expr)) return null;
      // eslint-disable-next-line no-new-func
      var fn = new Function("ctx", "Math", "with (ctx) { return (" + expr + "); }");
      var v = fn(ctx, Math);
      if (typeof v === "number" && isFinite(v)) return v;
      if (typeof v === "boolean") return v;
      return null;
    } catch (_) { return null; }
  }

  function tierFor(value, thresholds) {
    if (!thresholds) return { name: null, class: "" };
    if (value >= (thresholds.high || Infinity)) return { name: thresholds.high_label || "Optimized", class: "" };
    if (value >= (thresholds.mid || 0)) return { name: thresholds.mid_label || "Growth", class: "medium" };
    return { name: thresholds.low_label || "Critical", class: "low" };
  }

  // D2.1: animated count-up between prev and target output values
  function tickTo(el, fromVal, toVal, formatFn, durationMs) {
    if (!el) return;
    if (typeof fromVal !== "number" || !isFinite(fromVal)) fromVal = 0;
    if (typeof toVal !== "number" || !isFinite(toVal)) { el.textContent = formatFn(toVal); return; }
    durationMs = durationMs || 280;
    // Skip animation for reduced-motion users
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = formatFn(toVal); return;
    }
    var startedAt = performance.now();
    function step(now) {
      var t = Math.min(1, (now - startedAt) / durationMs);
      var eased = 1 - Math.pow(1 - t, 3);
      var v = fromVal + (toVal - fromVal) * eased;
      el.textContent = formatFn(v);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // D2.2: sensitivity = per-input contribution to a single output, by bumping each input +10%
  function computeSensitivity(data, ctx, outId) {
    var baseline = {};
    (data.outputs || []).forEach(function (o) {
      baseline[o.id] = o.formula ? safeEval(o.formula, Object.assign({}, ctx, baseline)) : null;
    });
    var perInput = (data.inputs || []).map(function (inp) {
      if (inp.type === "text" || typeof ctx[inp.id] !== "number") return null;
      var orig = ctx[inp.id];
      if (orig === 0) {
        // Avoid zero-baseline ambiguity; bump by absolute 1 unit instead
        var bumped0 = Object.assign({}, ctx);
        bumped0[inp.id] = orig + 1;
        var rec0 = {};
        (data.outputs || []).forEach(function (o) { rec0[o.id] = o.formula ? safeEval(o.formula, Object.assign({}, bumped0, rec0)) : null; });
        var delta0 = Math.abs((rec0[outId] || 0) - (baseline[outId] || 0));
        return { id: inp.id, label: inp.label || inp.id, delta: delta0 };
      }
      var bumped = Object.assign({}, ctx);
      bumped[inp.id] = orig * 1.1;
      var rec = {};
      (data.outputs || []).forEach(function (o) { rec[o.id] = o.formula ? safeEval(o.formula, Object.assign({}, bumped, rec)) : null; });
      var delta = Math.abs((rec[outId] || 0) - (baseline[outId] || 0));
      return { id: inp.id, label: inp.label || inp.id, delta: delta };
    }).filter(Boolean);
    var totalDelta = 0;
    perInput.forEach(function (p) { totalDelta += p.delta; });
    return perInput
      .map(function (p) { return { id: p.id, label: p.label, contribution_pct: totalDelta > 0 ? (p.delta / totalDelta) * 100 : 0 }; })
      .sort(function (a, b) { return b.contribution_pct - a.contribution_pct; })
      .slice(0, 4);
  }

  // D2.3: cached Supabase RPC fetch for benchmark distribution
  var SUPABASE_ANON_KEY = window.__supabase_anon_key || "sb_publishable_Q-kfisfhqxXV5xiIhCduMQ_QSIflf4h";
  var SUPABASE_REST_BASE = "https://bjbvqvzbzczjbatgmccb.supabase.co/rest/v1";
  function fetchBenchmark(slug, outputId) {
    var benchKey = slug + ":" + outputId;
    window.__lmc_bench_cache = window.__lmc_bench_cache || {};
    if (window.__lmc_bench_cache[benchKey]) return Promise.resolve(window.__lmc_bench_cache[benchKey]);
    return fetch(SUPABASE_REST_BASE + "/rpc/lm_calculator_benchmark", {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY },
      body: JSON.stringify({ p_slug: slug, p_output_id: outputId }),
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (rows) { window.__lmc_bench_cache[benchKey] = rows; return rows; })
      .catch(function () { return null; });
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
    var img = make("img", { class: "lmc-intro-avatar", src: "https://ivanmanfredi.com/ivan-portrait.jpg", alt: "Ivan Manfredi" });
    var body = make("div", { class: "lmc-intro-body" });
    body.appendChild(make("div", { class: "lmc-intro-badge" }, "Welcome"));
    body.appendChild(make("h2", { class: "lmc-intro-h", id: "lmc-intro-h" }, "Hey, I&rsquo;m Ivan."));
    body.appendChild(make("p", { class: "lmc-intro-p" }, escapeHtml(welcomeLine)));
    var ul = make("ul", { class: "lmc-intro-points" });
    [["a", "\u23F1", pointA], ["b", "\u2192", pointB], ["c", "\u2713", pointC]].forEach(function (p) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0], "aria-hidden": "true" }, p[1]));
      li.appendChild(make("span", null, escapeHtml(p[2])));
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
    if (note) body.appendChild(make("p", { class: "lmc-intro-note" }, escapeHtml(note)));
    inner.appendChild(img);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "calculator";
    if (window.LM && window.LM.tracker) window.LM.tracker.touch(data);
    root.innerHTML = "";

    // Hero
    var hero = make("section", { class: "lmc-hero" });
    var inner = make("div", { class: "lmc-container" });
    var badgeEl = make("div", { class: "lmc-badge" }, escapeHtml(data.brand && data.brand.hero_badge || "Interactive Calculator"));
    if (window.LM && window.LM.editMode) window.LM.editMode.registerField(badgeEl, "brand.hero_badge");
    inner.appendChild(badgeEl);
    var h1 = make("h1", { class: "lmc-h1" });
    h1.innerHTML = (window.LM && window.LM.italicizePivot) ? window.LM.italicizePivot(data.title || "Calculator") : escapeHtml(data.title || "Calculator");
    if (window.LM && window.LM.editMode) window.LM.editMode.registerField(h1, "title");
    inner.appendChild(h1);
    if (data.subtitle) {
      var sub = make("p", { class: "lmc-sub" }, escapeHtml(data.subtitle));
      if (window.LM && window.LM.editMode) window.LM.editMode.registerField(sub, "subtitle");
      inner.appendChild(sub);
    }
    var meta = make("div", { class: "lmc-meta" });
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, (data.inputs || []).length + " inputs"));
    if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Live math"));
    inner.appendChild(meta);
    hero.appendChild(inner);
    root.appendChild(hero);

    var introSection = buildIntro(data, ".lmc-grid", {
      defaultValueBullet: "Plug in your numbers; live math shows payback window + top 3 priorities",
      defaultNextBullet: "If you want the leak fixed for you, there's a free fit call at the end",
      startLabel: "Run the calculator",
      defaultNote: "Nothing is stored until you submit. Tweak freely."
    });
    root.appendChild(introSection);

    // Content grid
    var container = make("div", { class: "lmc-container" });
    var grid = make("div", { class: "lmc-grid" });

    // LEFT: inputs
    var inputsCard = make("div", { class: "lmc-card" });
    inputsCard.appendChild(make("h2", null, "Your numbers"));
    (data.inputs || []).forEach(function (inp, idx) {
      var field = make("div", { class: "lmc-field" });
      var labelId = "lmc-in-" + inp.id;
      // Label row holds label + (?) hint chip when a hint exists
      var labelRow = make("div", { class: "lmc-field-label-row" });
      var lbl = make("label", { for: labelId }, escapeHtml(inp.label || inp.id));
      if (window.LM && window.LM.editMode) window.LM.editMode.registerField(lbl, "inputs[" + idx + "].label");
      labelRow.appendChild(lbl);
      var hintBtn = null;
      if (inp.hint) {
        hintBtn = make("button", { type: "button", class: "lmc-hint-btn", "aria-label": "Show hint", "aria-expanded": "false" }, "?");
        labelRow.appendChild(hintBtn);
      }
      field.appendChild(labelRow);
      var wrap = make("div", { class: "lmc-input-wrap" });
      if (inp.prefix) {
        var prefixEl = make("span", { class: "lmc-prefix" }, escapeHtml(inp.prefix));
        if (window.LM && window.LM.editMode) window.LM.editMode.registerField(prefixEl, "inputs[" + idx + "].prefix");
        wrap.appendChild(prefixEl);
      }
      var attrs = { id: labelId, class: "lmc-input", name: inp.id, type: inp.type === "range" ? "number" : (inp.type || "number"), inputmode: inp.type === "text" ? "text" : "decimal" };
      if (inp.min != null) attrs.min = inp.min;
      if (inp.max != null) attrs.max = inp.max;
      if (inp.step != null) attrs.step = inp.step;
      if (inp.placeholder) attrs.placeholder = inp.placeholder;
      var el = make("input", attrs);
      el.value = inp.default != null ? inp.default : "";
      wrap.appendChild(el);
      if (inp.suffix) {
        var suffixEl = make("span", { class: "lmc-suffix" }, escapeHtml(inp.suffix));
        if (window.LM && window.LM.editMode) window.LM.editMode.registerField(suffixEl, "inputs[" + idx + "].suffix");
        wrap.appendChild(suffixEl);
      }
      field.appendChild(wrap);
      if (inp.type === "range" || inp.slider) {
        var r = make("input", { type: "range", class: "lmc-range", min: inp.min != null ? inp.min : 0, max: inp.max != null ? inp.max : 100, step: inp.step != null ? inp.step : 1, value: inp.default != null ? inp.default : 0 });
        r.addEventListener("input", function () { el.value = r.value; el.dispatchEvent(new Event("input", { bubbles: true })); });
        el.addEventListener("input", function () { if (!isNaN(Number(el.value))) r.value = el.value; });
        field.appendChild(r);
      }
      if (inp.hint) {
        var hintEl = make("span", { class: "hint" }, escapeHtml(inp.hint));
        if (window.LM && window.LM.editMode) window.LM.editMode.registerField(hintEl, "inputs[" + idx + "].hint");
        field.appendChild(hintEl);
        if (hintBtn) {
          hintBtn.addEventListener("click", function () {
            var open = field.classList.toggle("hint-open");
            hintBtn.setAttribute("aria-expanded", open ? "true" : "false");
          });
        }
      }
      inputsCard.appendChild(field);
    });
    if (window.LM && window.LM.editMode) window.LM.editMode.registerArray(inputsCard, "inputs", { itemLabel: "input", template: { id: "", label: "New input", type: "number", default: 0 } });
    grid.appendChild(inputsCard);

    // RIGHT: outputs
    var outputsCard = make("div", { class: "lmc-card", id: "lmc-outputs" });
    outputsCard.appendChild(make("h2", null, "Your result"));
    var primary = (data.outputs || []).find(function (o) { return o.primary; }) || (data.outputs || [])[0];
    var primaryIdx = (data.outputs || []).indexOf(primary);
    if (primary) {
      var ring = make("div", { class: "lmc-output-ring" });
      ring.appendChild(make("div", { class: "lmc-big-num", id: "lmc-big-num" }, "—"));
      var bigUnitEl = make("div", { class: "lmc-big-unit" }, escapeHtml(primary.label || ""));
      if (window.LM && window.LM.editMode && primaryIdx >= 0) window.LM.editMode.registerField(bigUnitEl, "outputs[" + primaryIdx + "].label");
      ring.appendChild(bigUnitEl);
      ring.appendChild(make("span", { class: "lmc-tier-pill", id: "lmc-tier" }, "Fill in the numbers"));
      outputsCard.appendChild(ring);
    }
    var secondaryWrap = make("div", { id: "lmc-secondary-outputs" });
    var heroSeen = false;
    (data.outputs || []).forEach(function (out, idx) {
      if (out === primary) return;
      var isHero = !heroSeen;
      heroSeen = true;
      var row = make("div", { class: "lmc-output-row" + (isHero ? " lmc-output-row--hero" : "") });
      var lblSpan = make("span", { class: "label" }, escapeHtml(out.label || out.id));
      if (window.LM && window.LM.editMode) window.LM.editMode.registerField(lblSpan, "outputs[" + idx + "].label");
      var valSpan = make("span", { class: "value", "data-out-id": out.id }, "—");
      row.appendChild(lblSpan);
      row.appendChild(valSpan);
      secondaryWrap.appendChild(row);
    });
    if (window.LM && window.LM.editMode) window.LM.editMode.registerArray(secondaryWrap, "outputs", { itemLabel: "output", template: { id: "", label: "New output", format: "decimal", formula: "0" } });
    outputsCard.appendChild(secondaryWrap);

    // Model-currency stamp (Spec 3): renders ONLY when confirmed frontier data
    // loaded — fetch failure / stale / bad schema means no stamp, never a
    // wrong one. Date shown is the human-confirm date, not regen time.
    if (window.LM && window.LM.frontier) {
      window.LM.frontier.load().then(function () {
        var s = window.LM.frontier.stamp();
        if (!s) return;
        outputsCard.appendChild(make("div", { class: "lmc-currency-stamp", style: "margin-top:.9rem;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.72rem;letter-spacing:.06em;color:rgba(19, 18, 16,.5)" }, s));
      });
    }
    // D2.2: Sensitivity slot (populated after each compute())
    var sensSlot = make("div", { id: "lmc-sensitivity", class: "lmc-sensitivity", hidden: "hidden" });
    outputsCard.appendChild(sensSlot);
    // D2.3: Benchmark slot (only populated if primary.show_benchmark === true)
    var benchSlot = make("div", { id: "lmc-benchmark", class: "lmc-benchmark", hidden: "hidden" });
    outputsCard.appendChild(benchSlot);
    // D2.4: Top-3-fixes toggle — opt-in via data.fixes_scenario block
    if (data.fixes_scenario && Array.isArray(data.fixes_scenario.input_overrides) && data.fixes_scenario.input_overrides.length) {
      var fixToggle = make("label", { class: "lmc-fix-toggle", for: "lmc-fix-on" });
      var fixLabel = (data.fixes_scenario.label || "See what happens with the top 3 fixes");
      fixToggle.innerHTML = '<input type="checkbox" id="lmc-fix-on" /> <span>' + escapeHtml(fixLabel) + '</span>';
      var fixLabelEl = fixToggle.querySelector("span");
      if (window.LM && window.LM.editMode && fixLabelEl) window.LM.editMode.registerField(fixLabelEl, "fixes_scenario.label");
      outputsCard.appendChild(fixToggle);
    }
    // Recommendations
    var recsWrap = make("div", { class: "lmc-recs", id: "lmc-recs" });
    outputsCard.appendChild(recsWrap);
    grid.appendChild(outputsCard);

    container.appendChild(grid);

    // Tiered CTA (cta_rules, 2026-07-10) — first matching rule personalizes the
    // closing move per score band. Rules carry copy only; the engine owns the
    // URL (callUrl), so a payload can never route the call CTA off-funnel.
    // Legacy data.ctas (pre-wire shape, carries retired-offer copy) stays unrendered.
    var tierCta = make("div", { class: "lmc-tier-cta", id: "lmc-tier-cta", hidden: "hidden" });
    tierCta.innerHTML =
      '<p class="lmc-tier-cta-eyebrow">Based on your numbers</p>' +
      '<h3 class="lmc-tier-cta-h"></h3>' +
      '<p class="lmc-tier-cta-d"></p>' +
      '<a class="lmc-btn lmc-tier-cta-btn" target="_blank" rel="noopener"></a>';
    tierCta.querySelector("a").addEventListener("click", function () {
      beacon("cta_click", { answers: { target: "tiered_cta", rule_id: tierCta.getAttribute("data-rule-id") || null } });
    });
    container.appendChild(tierCta);

    // capture_cta (authored on every calculator payload, previously dead — D5)
    // feeds the closing email lead when no explicit override exists.
    if (data.capture_cta && data.capture_cta.description) {
      data.closing_cta = Object.assign({}, data.closing_cta);
      if (!data.closing_cta.email_lead) data.closing_cta.email_lead = data.capture_cta.description;
    }

    // Closing CTA — call-first finale (replaces the PDF email gate 2026-06-09)
    var closing = window.LM.buildClosingCta("calculator", data, {
      toolType: "calculator",
      captureExtra: function () {
        var snap = compute();
        return { answers: { inputs: snap.ctx, outputs: snap.results, matched_recs: snap.matched_recs } };
      },
    });
    container.appendChild(closing);

    // Footer actions
    var footer = make("div", { class: "lmc-footer-actions" });
    var shareTextCalc = "Just ran " + (data.title || "this calculator") + " from Ivan Manfredi.";
    footer.innerHTML =
      '<button class="lmc-btn lmc-btn-secondary" id="lmc-copy" type="button">Copy result</button>' +
      '<a class="lmc-btn lm-share-whatsapp" id="lmc-share-wa" target="_blank" rel="noopener" href="' +
        (window.LM && window.LM.share ? window.LM.share.whatsapp(shareTextCalc) : "#") +
      '">Share on WhatsApp</a>' +
      '<button class="lmc-btn lmc-btn-secondary" id="lmc-reset" type="button">Reset</button>';
    container.appendChild(footer);
    root.appendChild(container);

    // No sticky progress on calculator — primary output ring already shows progress.
    // Calculators aren't stepped flows; an extra "X / N inputs filled" bar adds noise.

    // Live compute
    function getCtx() {
      var ctx = {};
      (data.inputs || []).forEach(function (inp) {
        var el = document.getElementById("lmc-in-" + inp.id);
        var v = el ? (inp.type === "text" ? el.value : Number(el.value)) : null;
        ctx[inp.id] = (v == null || (typeof v === "number" && isNaN(v))) ? (inp.default != null ? inp.default : 0) : v;
      });
      return ctx;
    }
    function compute() {
      var ctxBase = getCtx();
      // D2.4: apply fixes_scenario overrides when toggle is on
      var fixToggleEl = $("#lmc-fix-on");
      var fixOn = !!(fixToggleEl && fixToggleEl.checked);
      var ctx = Object.assign({}, ctxBase);
      if (fixOn && data.fixes_scenario && Array.isArray(data.fixes_scenario.input_overrides)) {
        data.fixes_scenario.input_overrides.forEach(function (ov) {
          if (ov && ov.input_id != null && ov.value != null) ctx[ov.input_id] = ov.value;
        });
      }
      var results = {};
      (data.outputs || []).forEach(function (out) {
        var val = out.formula ? safeEval(out.formula, Object.assign({}, ctx, results)) : null;
        results[out.id] = val;
      });
      // Apply CSS class to outputs card when fix-on mode active
      outputsCard.classList.toggle("lmc-fixes-on", fixOn);
      // D2.1: Paint with ticker — track previous values across compute() calls
      window.__lmc_prev_outputs = window.__lmc_prev_outputs || {};
      var prev = window.__lmc_prev_outputs;
      if (primary) {
        var main = results[primary.id];
        var bn = $("#lmc-big-num");
        if (bn && typeof main === "number") {
          tickTo(bn, typeof prev[primary.id] === "number" ? prev[primary.id] : 0, main, function (v) { return fmt(primary.format, v); });
          prev[primary.id] = main;
        } else if (bn) {
          bn.textContent = fmt(primary.format, main);
        }
        var tp = $("#lmc-tier");
        if (tp && primary.tier_thresholds && typeof main === "number") {
          var t = tierFor(main, primary.tier_thresholds);
          tp.className = "lmc-tier-pill " + (t.class || "");
          tp.textContent = t.name || "—";
        }
      }
      (data.outputs || []).forEach(function (out) {
        if (out === primary) return;
        var el = document.querySelector('[data-out-id="' + out.id + '"]');
        if (el && typeof results[out.id] === "number") {
          tickTo(el, typeof prev[out.id] === "number" ? prev[out.id] : 0, results[out.id], function (v) { return fmt(out.format, v); });
          prev[out.id] = results[out.id];
        } else if (el) {
          el.textContent = fmt(out.format, results[out.id]);
        }
      });
      // Tiered CTA — evaluate cta_rules against current inputs+outputs (safeEval
      // whitelist; `when` is an expression string, e.g. "annual_savings > 50000").
      var tierCtaEl = $("#lmc-tier-cta");
      if (tierCtaEl) {
        var ctaRules = Array.isArray(data.cta_rules) ? data.cta_rules : [];
        var hitRule = null;
        for (var cri = 0; cri < ctaRules.length && !hitRule; cri++) {
          var crr = ctaRules[cri];
          if (crr && crr.when && safeEval(crr.when, Object.assign({}, ctx, results)) === true) hitRule = crr;
        }
        if (hitRule) {
          tierCtaEl.hidden = false;
          tierCtaEl.querySelector(".lmc-tier-cta-h").textContent = hitRule.headline || "Want a second pair of eyes on this?";
          tierCtaEl.querySelector(".lmc-tier-cta-d").textContent = hitRule.description || "";
          var tierBtn = tierCtaEl.querySelector(".lmc-tier-cta-btn");
          tierBtn.textContent = hitRule.button || "Book the free fit call";
          tierBtn.setAttribute("href", (window.LM && window.LM.callUrl) ? window.LM.callUrl("tiered-cta") : "https://calendly.com/im-ivanmanfredi/30min");
          tierCtaEl.setAttribute("data-rule-id", hitRule.id || "");
        } else {
          tierCtaEl.hidden = true;
        }
      }
      // Recs
      var recs = data.recommendations || [];
      var matched = recs.filter(function (r) { return r.when ? !!safeEval(r.when, Object.assign({}, ctx, results)) : false; }).slice(0, 3);
      var rcEl = $("#lmc-recs");
      if (rcEl) {
        rcEl.innerHTML = "";
        if (matched.length > 0) {
          rcEl.appendChild(make("h3", null, "What to do next"));
          matched.forEach(function (m) {
            var recDiv = make("div", { class: "lmc-rec" });
            var origIdx = recs.indexOf(m);
            var tagEl = make("strong", null, escapeHtml(m.tag || "Recommended"));
            if (window.LM && window.LM.editMode && origIdx >= 0) {
              window.LM.editMode.registerField(tagEl, "recommendations[" + origIdx + "].tag");
            }
            recDiv.appendChild(tagEl);
            var textSpan = make("span", { class: "lmc-rec-text" });
            textSpan.textContent = m.text || "";
            recDiv.appendChild(textSpan);
            if (window.LM && window.LM.editMode && origIdx >= 0) {
              window.LM.editMode.registerField(textSpan, "recommendations[" + origIdx + "].text");
            }
            rcEl.appendChild(recDiv);
          });
        }
      }
      // D2.2: Sensitivity bars (only shows when primary + ≥ 2 numeric inputs)
      // Collapsed by default — click toggle to expand
      var sensEl = $("#lmc-sensitivity");
      if (sensEl && primary) {
        var sens = computeSensitivity(data, ctx, primary.id);
        var hasMeaningful = sens.length >= 2 && sens.some(function (s) { return s.contribution_pct > 0.5; });
        if (hasMeaningful) {
          sensEl.removeAttribute("hidden");
          sensEl.innerHTML =
            '<button class="lmc-sensitivity-toggle" type="button" aria-expanded="false">How was this calculated?</button>' +
            '<div class="lmc-sensitivity-body">' +
              sens.map(function (s) {
                return '<div class="lmc-sens-row">' +
                  '<span class="lmc-sens-label">' + escapeHtml(s.label) + '</span>' +
                  '<div class="lmc-sens-bar"><div class="lmc-sens-fill" style="width:' + s.contribution_pct.toFixed(0) + '%"></div></div>' +
                  '<span class="lmc-sens-pct">' + s.contribution_pct.toFixed(0) + '%</span>' +
                '</div>';
              }).join('') +
            '</div>';
          var sensToggle = sensEl.querySelector(".lmc-sensitivity-toggle");
          if (sensToggle && !sensToggle.dataset.bound) {
            sensToggle.dataset.bound = "1";
            sensToggle.addEventListener("click", function () {
              var open = sensEl.classList.toggle("open");
              sensToggle.setAttribute("aria-expanded", open ? "true" : "false");
            });
          }
        } else {
          sensEl.setAttribute("hidden", "hidden");
        }
      }
      // D2.3: Benchmark overlay (opt-in via primary.show_benchmark === true)
      var benchEl = $("#lmc-benchmark");
      if (benchEl && primary && primary.show_benchmark === true) {
        fetchBenchmark(data.slug, primary.id).then(function (rows) {
          if (!rows || !rows.length) { benchEl.setAttribute("hidden", "hidden"); return; }
          benchEl.removeAttribute("hidden");
          var mainVal = results[primary.id];
          var min = rows[0].bucket_lo;
          var max = rows[rows.length - 1].bucket_hi;
          var span = (max - min) || 1;
          var clamp = function (v) { return Math.max(0, Math.min(100, v)); };
          var youPct = (typeof mainVal === "number") ? clamp(((mainVal - min) / span) * 100) : 50;
          var medianPct = clamp(((Number(rows[0].median) - min) / span) * 100);
          var hMax = Math.max.apply(null, rows.map(function (rr) { return rr.bucket_count; }));
          benchEl.innerHTML = '<h4>How you compare <span class="lmc-bench-meta">(industry median)</span></h4>' +
            '<div class="lmc-bench-track">' +
              rows.map(function (r) {
                var w = ((r.bucket_hi - r.bucket_lo) / span) * 100;
                var h = (r.bucket_count / hMax) * 100;
                return '<div class="lmc-bench-bar" style="width:' + Math.max(2, w).toFixed(2) + '%;height:' + h.toFixed(0) + '%"></div>';
              }).join('') +
              '<div class="lmc-bench-median" style="left:' + medianPct.toFixed(1) + '%" title="Median: ' + fmt(primary.format, Number(rows[0].median)) + '"></div>' +
              '<div class="lmc-bench-you" style="left:' + youPct.toFixed(1) + '%">You</div>' +
            '</div>' +
            '<p class="lmc-bench-note">Median: ' + fmt(primary.format, Number(rows[0].median)) + ' &middot; You: ' + fmt(primary.format, mainVal) + '</p>';
        });
      }
      return { ctx: ctx, results: results, matched_recs: matched.map(function (m) { return m.tag; }), fix_on: fixOn };
    }
    // Attach
    (data.inputs || []).forEach(function (inp) {
      var el = document.getElementById("lmc-in-" + inp.id);
      if (el) el.addEventListener("input", compute);
    });
    var fixOnEl = $("#lmc-fix-on");
    if (fixOnEl) fixOnEl.addEventListener("change", function () {
      compute();
      beacon("cta_click", { answers: { target: "fixes_scenario_toggle", on: !!fixOnEl.checked } });
    });
    compute();

    // Copy result
    var copyBtn = $("#lmc-copy");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var snap = compute();
        var lines = [data.title || "Calculator"];
        (data.inputs || []).forEach(function (inp) { lines.push("- " + (inp.label || inp.id) + ": " + snap.ctx[inp.id] + (inp.suffix || "")); });
        lines.push("");
        (data.outputs || []).forEach(function (out) { lines.push(" → " + (out.label || out.id) + ": " + fmt(out.format, snap.results[out.id])); });
        lines.push("\nFrom: " + location.href);
        var text = lines.join("\n");
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard"); });
          beacon("share", { answers: { format: "text" } });
        } else { toast("Copy not supported"); }
      });
    }

    // WhatsApp share
    var shareWa = $("#lmc-share-wa");
    if (shareWa) shareWa.addEventListener("click", function () { beacon("share", { answers: { target: "whatsapp" } }); });

    // Reset
    var resetBtn = $("#lmc-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        (data.inputs || []).forEach(function (inp) {
          var el = document.getElementById("lmc-in-" + inp.id);
          if (el) el.value = inp.default != null ? inp.default : "";
        });
        compute();
      });
    }

    // View beacon
    beacon("view", {});
  }

  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-calculator-src]");
    if (!root) return;
    var defaultSrc = root.getAttribute("data-lm-calculator-src") || "./data.json";
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
      root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading calculator:</strong> ' + escapeHtml(e.message) + '</div>';
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
