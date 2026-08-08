/* True Profit Per Order X-Ray - Rise DTC white-label client funnel.
   Vanilla JS, no framework, no build step. All math is deterministic and
   runs client-side; the only network calls are the analytics beacon and the
   optional "Read my shape" live-Claude proxy.

   State machine (mirrors the AI Kit client-funnel contract on its own engine):
     landing  -> hard gate (name, email, store optional). No calculator shown.
     thankyou -> first-name headline, "Open the X-Ray" (?unlocked=1), booking CTA.
     resource -> the full calculator, results ungated (email already captured).
   isUnlocked() mirrors ai-kit.js: ?unlocked=1 / ?kit / #kit, plus a returning
   reader who already captured (localStorage flag). */
(function () {
  "use strict";

  /* ─────────────────────────── Config ─────────────────────────── */
  var SLUG = window.__lm_slug || "rise-dtc-true-profit-x-ray";
  var LEAF_KEY = SLUG;                  // nurture routing key (inert until a sequence exists)
  var BOOKING_URL = "https://meetings.hubspot.com/mattan5/rise-intro-call--li";
  var BEACON_URL = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";
  var PROXY_URL = "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-walkthrough-proxy";
  var PROXY_MODEL = "claude-sonnet-4-6"; // proxy passes model straight to Railway; sonnet-class is the sibling ai-walkthrough engine's proven default and the verdict is the showpiece
  var PROC_FIXED = 0.30;                // published Stripe/Shopify fixed card fee

  /* Field definitions. `def` is the loaded apparel example. */
  var FIELDS = [
    { key: "aov",        label: "Average order value",        unit: "$", min: 10,  max: 300, step: 1,   def: 68,   caption: "Editable example. Yours is on your Shopify overview." },
    { key: "cogs",       label: "COGS, % of price",           unit: "%", min: 10,  max: 70,  step: 1,   def: 35,   band: [25, 45], caption: "Typical apparel range marked. Estimate is fine." },
    { key: "shipping",   label: "Outbound shipping per order",unit: "$", min: 0,   max: 30,  step: 0.5, def: 7.5,  caption: "Editable example. What you pay to ship one order." },
    { key: "returnRate", label: "Return rate",                unit: "%", min: 0,   max: 60,  step: 1,   def: 22,   band: [15, 35], caption: "Typical apparel range marked." },
    { key: "cac",        label: "Blended CAC",                unit: "$", min: 0,   max: 150, step: 1,   def: 28,   caption: "Last month's ad spend ÷ new customers. Rough is fine." },
    { key: "procPct",    label: "Payment processing",         unit: "%", min: 1.5, max: 4.5, step: 0.1, def: 2.9,  fixedNote: "+ 30¢ per order", caption: "2.9% + 30¢ is the published Shopify Payments / Stripe standard card rate." },
    { key: "repeat",     label: "Repeat purchase rate",       unit: "%", min: 0,   max: 80,  step: 1,   def: 0,    optional: true, caption: "Leave off and the verdict reads order one only. It will say so." }
  ];

  var state = {};
  FIELDS.forEach(function (f) { state[f.key] = f.def; });
  var repeatOn = false; // optional toggle starts off

  /* ─────────────────────────── Beacon ─────────────────────────── */
  // Minimal reimplementation of the shared.js beacon payload shape.
  function readerIdentity() {
    var id = {};
    try { id = JSON.parse(localStorage.getItem("ivan.reader") || "{}") || {}; } catch (_) {}
    if (!id.session_id) {
      id.session_id = "s_" + Math.random().toString(36).slice(2, 10) + "_" + Date.now().toString(36);
      try { localStorage.setItem("ivan.reader", JSON.stringify(id)); } catch (_) {}
    }
    return id;
  }
  function updateReader(patch) {
    var id = readerIdentity();
    Object.assign(id, patch, { last_active: Date.now() });
    try { localStorage.setItem("ivan.reader", JSON.stringify(id)); } catch (_) {}
    return id;
  }
  // Publishable anon key, safe for browser use. lm-beacon requires it on the
  // gateway (JWT verification) — sendBeacon cannot set custom headers, so it
  // silently 401s. Firing an authenticated fetch alongside it is what actually
  // lands the event; sendBeacon stays as a best-effort unload-safe backup.
  var SUPABASE_ANON_KEY = window.__supabase_anon_key || "sb_publishable_Q-kfisfhqxXV5xiIhCduMQ_QSIflf4h";

  function beacon(event, extra) {
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({
        event_type: event,
        tool_type: "calculator",
        lm_slug: SLUG,
        src: q.get("src") || "direct",
        utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") },
        prospect_id: q.get("pid") || null,
        referrer: document.referrer || "",
        session_id: readerIdentity().session_id
      }, extra || {});
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON_URL, new Blob([JSON.stringify(body)], { type: "application/json" }));
      }
      fetch(BEACON_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY },
        body: JSON.stringify(body),
        keepalive: true
      }).catch(function () {});
    } catch (_) {}
  }

  /* ─────────────────────────── Helpers ─────────────────────────── */
  function round2(n) { return Math.round(n * 100) / 100; }
  function money(n) {
    var v = round2(n);
    var sign = v < 0 ? "-" : "";
    return sign + "$" + Math.abs(v).toFixed(2);
  }
  function moneySigned(n) { return money(n); }
  function pct(n) { return (Math.round(n * 10) / 10) + "%"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  /* ─────────────────────────── Math model ─────────────────────────── */
  // contribution_before_CAC = (1-r)*AOV*(1-cogs) - shipping - (proc%*AOV + 0.30)
  // profit_per_order         = contribution_before_CAC - CAC
  function contributionFor(s) {
    var r = s.returnRate / 100;
    var cogs = s.cogs / 100;
    var procFrac = s.procPct / 100;
    return (1 - r) * s.aov * (1 - cogs) - s.shipping - (procFrac * s.aov + PROC_FIXED);
  }

  function compute(s) {
    var aov = s.aov;
    var r = s.returnRate / 100;
    var cogs = s.cogs / 100;
    var procFrac = s.procPct / 100;

    var contribution = round2(contributionFor(s));
    var profit = round2(contribution - s.cac);

    var breakEven = contribution > 0 ? Math.ceil(s.cac / contribution) : null;

    // Waterfall components (each subtracts from AOV; they reconcile to profit).
    var returnsLoss = round2(r * aov);                 // revenue refunded on returned orders
    var cogsKept = round2((1 - r) * aov * cogs);       // COGS on kept units
    var processing = round2(procFrac * aov + PROC_FIXED);
    var waterfall = [
      { name: "Order value", val: round2(aov), type: "aov" },
      { name: "Returns (revenue refunded)", val: -returnsLoss, type: "cost" },
      { name: "COGS (kept units)", val: -cogsKept, type: "cost" },
      { name: "Outbound shipping", val: -round2(s.shipping), type: "cost" },
      { name: "Payment processing", val: -processing, type: "cost" },
      { name: "Acquisition (CAC)", val: -round2(s.cac), type: "cost" },
      { name: "Profit per order", val: profit, type: "final" }
    ];

    // Binding constraint: single cost line with the largest share of AOV.
    var constraints = [
      { key: "cogs",       label: "COGS",               share: round2(cogs * aov) },
      { key: "shipping",   label: "Outbound shipping",  share: round2(s.shipping) },
      { key: "returns",    label: "Returns drag",       share: round2(r * (aov * (1 - cogs))) },
      { key: "processing", label: "Payment processing", share: processing },
      { key: "cac",        label: "CAC",                share: round2(s.cac) }
    ];
    var binding = constraints.reduce(function (a, b) { return b.share > a.share ? b : a; });
    binding.pctOfAov = aov > 0 ? Math.round((binding.share / aov) * 100) : 0;

    // Repeat economics (optional).
    var expectedOrders = null, customerProfit = null;
    if (repeatOn && s.repeat > 0 && s.repeat < 100) {
      var R = s.repeat / 100;
      expectedOrders = 1 / (1 - R);
      customerProfit = round2(expectedOrders * contribution - s.cac);
    }

    // Fix levers: recompute profit with each single realistic lever.
    var levers = [
      { key: "returnRate", label: "return rate", from: pct(s.returnRate), to: "15%",
        profit: round2(contributionFor(Object.assign({}, s, { returnRate: 15 })) - s.cac) },
      { key: "cac", label: "CAC", from: money(s.cac), to: money(0.8 * s.cac),
        profit: round2(contributionFor(s) - 0.8 * s.cac) },
      { key: "cogs", label: "COGS", from: pct(s.cogs), to: "25%",
        profit: round2(contributionFor(Object.assign({}, s, { cogs: 25 })) - s.cac) }
    ];
    levers.forEach(function (l) { l.gain = round2(l.profit - profit); l.flips = profit <= 0 && l.profit > 0; });

    // Pick fix lever: prefer a sign-flipping lever with the largest gain; if
    // profit is already positive, pick the largest-gain lever overall.
    var flippers = levers.filter(function (l) { return l.flips; });
    var pickFrom = flippers.length ? flippers : levers;
    var fixLever = pickFrom.reduce(function (a, b) { return b.gain > a.gain ? b : a; });

    // Tier.
    var safeThreshold = 0.05 * aov;
    var tier, tierKey;
    if (profit > safeThreshold) {
      tier = "SAFE TO SCALE"; tierKey = "safe";
    } else if (flippers.length > 0 || (profit > 0 && profit <= safeThreshold)) {
      tier = "FIX FIRST"; tierKey = "fix";
    } else if (customerProfit != null && customerProfit > 0) {
      tier = "FIX FIRST"; tierKey = "fix"; // profitable on repeat only
    } else {
      tier = "NOT YET"; tierKey = "notyet";
    }

    var fixLine = "Cut " + fixLever.label + " from " + fixLever.from + " to " + fixLever.to +
      " and profit per order goes from " + money(profit) + " to " + money(fixLever.profit) + ".";

    return {
      contribution: contribution, profit: profit, breakEven: breakEven,
      waterfall: waterfall, binding: binding, tier: tier, tierKey: tierKey,
      fixLever: fixLever, fixLine: fixLine, safeThreshold: round2(safeThreshold),
      expectedOrders: expectedOrders, customerProfit: customerProfit,
      profitableOnRepeatOnly: (tierKey === "fix" && profit <= 0 && customerProfit != null && customerProfit > 0)
    };
  }

  /* ─────────────────────────── Verdict copy ─────────────────────────── */
  function heroVerdict(c) {
    if (c.tierKey === "safe") {
      return "On the numbers you entered, each order clears " + money(c.profit) + " after all costs. More volume adds profit.";
    }
    if (c.tierKey === "fix") {
      var mk = c.profit >= 0 ? "you make " + money(c.profit) : "you lose " + money(Math.abs(c.profit));
      return "On the numbers you entered, " + mk + " per order. " + c.binding.label + " is what binds. " + c.fixLine;
    }
    return "On the numbers you entered, each order loses " + money(Math.abs(c.profit)) + " and no single lever flips it. Scaling multiplies the loss.";
  }
  function badgeClass(tierKey) {
    return tierKey === "safe" ? "badge badge-safe" : tierKey === "fix" ? "badge badge-fix" : "badge badge-notyet";
  }

  /* ─────────────────────────── Build inputs ─────────────────────────── */
  var el = {};
  function $(id) { return document.getElementById(id); }

  function buildFields() {
    var host = $("fields");
    if (!host) return;
    FIELDS.forEach(function (f) {
      var wide = f.optional;
      var wrap = document.createElement("div");
      wrap.className = "field" + (wide ? " field-wide" : "") + (f.optional ? " is-off" : "");
      wrap.id = "field-" + f.key;

      var top = document.createElement("div");
      top.className = "field-top";

      var labelWrap = document.createElement("div");
      var lab = document.createElement("label");
      lab.setAttribute("for", "num-" + f.key);
      lab.textContent = f.label;
      labelWrap.appendChild(lab);
      if (f.optional) {
        var opt = document.createElement("div");
        opt.className = "toggle-row";
        opt.style.marginTop = "8px";
        opt.innerHTML =
          '<span class="switch"><input type="checkbox" id="tog-' + f.key + '" aria-label="Include repeat purchase rate">' +
          '<span class="track"></span><span class="knob"></span></span>' +
          '<span class="field-optional">Off &middot; reads order one only</span>';
        labelWrap.appendChild(opt);
      }
      top.appendChild(labelWrap);

      var valBox = document.createElement("div");
      valBox.className = "val-box";
      if (f.unit === "$") valBox.appendChild(mk("span", "unit", "$"));
      var num = document.createElement("input");
      num.type = "number"; num.id = "num-" + f.key;
      num.min = f.min; num.max = f.max; num.step = f.step; num.value = f.def;
      num.setAttribute("aria-label", f.label);
      valBox.appendChild(num);
      if (f.unit === "%") valBox.appendChild(mk("span", "unit", "%"));
      top.appendChild(valBox);
      wrap.appendChild(top);

      var rangeWrap = document.createElement("div");
      rangeWrap.className = "range-wrap";
      var range = document.createElement("input");
      range.type = "range"; range.id = "rng-" + f.key;
      range.min = f.min; range.max = f.max; range.step = f.step; range.value = f.def;
      range.setAttribute("aria-label", f.label + " slider");
      rangeWrap.appendChild(range);

      if (f.band) {
        var bm = document.createElement("div");
        bm.className = "band-mark";
        var span = document.createElement("span");
        span.className = "band";
        var lo = (f.band[0] - f.min) / (f.max - f.min) * 100;
        var hi = (f.band[1] - f.min) / (f.max - f.min) * 100;
        span.style.left = lo + "%"; span.style.width = (hi - lo) + "%";
        bm.appendChild(span);
        rangeWrap.appendChild(bm);
      }
      wrap.appendChild(rangeWrap);

      var cap = document.createElement("p");
      cap.className = "field-caption";
      cap.innerHTML = f.fixedNote
        ? esc(f.caption)
        : esc(f.caption);
      if (f.fixedNote) {
        var fx = document.createElement("span");
        fx.className = "fixed-note";
        fx.textContent = " " + f.fixedNote;
      }
      wrap.appendChild(cap);

      host.appendChild(wrap);

      // wiring
      function sync(v, fromRange) {
        v = clampField(f, v);
        state[f.key] = v;
        if (fromRange) num.value = v; else range.value = v;
        recompute();
      }
      range.addEventListener("input", function () { sync(parseFloat(range.value), true); });
      num.addEventListener("input", function () {
        var v = parseFloat(num.value);
        if (isNaN(v)) return;
        sync(v, false);
      });
      num.addEventListener("blur", function () {
        var v = parseFloat(num.value);
        if (isNaN(v)) { num.value = state[f.key]; return; }
        num.value = clampField(f, v);
      });

      if (f.optional) {
        var tog = $("tog-" + f.key);
        tog.addEventListener("change", function () {
          repeatOn = tog.checked;
          wrap.classList.toggle("is-off", !repeatOn);
          tog.closest(".toggle-row").querySelector(".field-optional").innerHTML =
            repeatOn ? "On &middot; counts repeat orders" : "Off &middot; reads order one only";
          recompute();
        });
      }
    });
  }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function clampField(f, v) {
    if (isNaN(v)) return f.def;
    v = Math.max(f.min, Math.min(f.max, v));
    // snap to step precision for clean display
    return Math.round(v / f.step) * f.step === v ? v : round2(v);
  }

  /* ─────────────────────────── Waterfall render ─────────────────────────── */
  var lastCompute = null;
  function renderWaterfall(c) {
    var host = $("waterfall");
    if (!host) return;
    var aov = state.aov || 1;
    host.innerHTML = "";
    // running total to drive a descending staircase
    var running = 0;
    c.waterfall.forEach(function (row, i) {
      var isFinal = row.type === "final";
      var isAov = row.type === "aov";
      if (isAov) running = row.val; else if (!isFinal) running += row.val; // row.val negative
      var barVal = isFinal ? row.val : running;
      var widthPct = Math.max(2, Math.min(100, Math.abs(barVal) / aov * 100));

      var rowEl = document.createElement("div");
      rowEl.className = "wf-row" + (isFinal ? " is-final" : "");
      var head = document.createElement("div");
      head.className = "wf-head";
      head.innerHTML = '<span class="wf-name">' + esc(row.name) + '</span>' +
        '<span class="wf-val">' + (row.type === "cost" ? money(row.val) : money(row.val)) + '</span>';
      var track = document.createElement("div");
      track.className = "wf-track";
      var bar = document.createElement("div");
      var cls = isAov ? "b-aov" : isFinal ? (row.val >= 0 ? "b-final-pos" : "b-final-neg") : "b-cost";
      bar.className = "wf-bar " + cls;
      bar.dataset.w = widthPct;
      track.appendChild(bar);
      rowEl.appendChild(head);
      rowEl.appendChild(track);
      host.appendChild(rowEl);
    });
  }
  function animateWaterfall() {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var bars = document.querySelectorAll("#waterfall .wf-bar");
    bars.forEach(function (b, i) {
      var w = b.dataset.w + "%";
      if (reduce) { b.style.width = w; return; }
      b.style.transitionDelay = Math.min(i, 8) * 90 + "ms";
      requestAnimationFrame(function () { requestAnimationFrame(function () { b.style.width = w; }); });
    });
  }

  /* ─────────────────────────── Recompute + paint ─────────────────────────── */
  var unlocked = false;
  function recompute() {
    var c = compute(state);
    lastCompute = c;

    // Compact result bar (mobile) + headline
    setNum($("hero-num"), c.profit);
    setBadge($("hero-badge"), c);
    var hv = $("hero-verdict"); if (hv) hv.textContent = heroVerdict(c);

    // Result card
    setNum($("result-num"), c.profit);
    setBadge($("result-badge"), c);
    var rv = $("result-verdict"); if (rv) rv.textContent = heroVerdict(c);

    // Waterfall + verdict block
    renderWaterfall(c);
    if (unlocked) animateWaterfall();
    paintVerdictBlock(c);
    routeCta(c);

    // formulas caption
    var ef = $("explain-formulas");
    if (ef) {
      ef.textContent =
        "contribution = (1 - " + (state.returnRate/100).toFixed(2) + ")*" + money(state.aov).replace("$","") +
        "*(1 - " + (state.cogs/100).toFixed(2) + ") - " + state.shipping + " - (" + (state.procPct/100).toFixed(3) + "*AOV + 0.30) = " + money(c.contribution) + "\n" +
        "profit per order = contribution - CAC = " + money(c.contribution) + " - " + money(state.cac) + " = " + money(c.profit) + "\n" +
        "break-even orders = CAC / contribution" + (c.breakEven != null ? " = " + c.breakEven : " = no break-even at these numbers");
    }
  }
  function setNum(node, v) {
    if (!node) return;
    node.innerHTML = esc(money(v)) + '<span class="per"> / order</span>';
    node.style.color = v >= 0 ? "var(--gold)" : "#ff8a8a";
  }
  function setBadge(node, c) {
    if (!node) return;
    node.className = badgeClass(c.tierKey);
    node.textContent = c.tier;
  }
  function paintVerdictBlock(c) {
    var b = $("binding-line");
    if (!b) return;
    b.innerHTML = "The binding constraint is <b>" + esc(c.binding.label) + "</b>, the biggest single line at " +
      money(c.binding.share) + " per order, about " + c.binding.pctOfAov + "% of order value.";
    var fl = $("fix-line");
    if (fl) fl.innerHTML = "<b>" + (c.tierKey === "notyet" ? "Best single lever:" : "Fix model:") + "</b> " + esc(c.fixLine);
    var be = $("breakeven-line");
    if (be) be.textContent = c.breakEven != null
      ? "Break-even: " + c.breakEven + " orders at this contribution before acquisition pays back."
      : "Break-even: no break-even at these numbers, contribution before CAC is not positive.";
    var rl = $("repeat-line");
    if (!rl) return;
    if (c.customerProfit != null) {
      rl.style.display = "";
      rl.textContent = "Repeat view: at " + pct(state.repeat) + " repeat rate, an average customer places about " +
        c.expectedOrders.toFixed(2) + " orders, for " + money(c.customerProfit) + " customer profit after one CAC." +
        (c.profitableOnRepeatOnly ? " Profitable on repeat only." : "");
    } else {
      rl.style.display = "none";
    }
  }

  /* ─────────────────────────── CTA routing ─────────────────────────── */
  function routeCta(c) {
    var host = $("cta-block");
    if (!host) return;
    host.innerHTML = "";
    if (c.tierKey === "safe") {
      var lead = mk("p", "cta-lead", "The unit economics hold. The next question is what more volume does to them.");
      var btn = mk("button", "btn-gold");
      btn.type = "button";
      btn.style.width = "auto";
      btn.style.padding = "13px 24px";
      btn.textContent = "See what 20% more revenue looks like on these numbers";
      btn.addEventListener("click", function () { openSlideOver(c); });
      host.appendChild(lead); host.appendChild(btn);
    } else if (c.tierKey === "fix") {
      var lead2 = mk("p", "cta-lead", "One line is doing the damage. Fix it before you scale, not after.");
      var btn2 = mk("button", "btn-gold");
      btn2.type = "button";
      btn2.style.width = "auto";
      btn2.style.padding = "13px 24px";
      btn2.textContent = "Book the fix-first diagnostic";
      btn2.addEventListener("click", function () { openSlideOver(c); });
      host.appendChild(lead2); host.appendChild(btn2);
    } else {
      var btn3 = mk("button", "btn-outline");
      btn3.type = "button";
      btn3.textContent = "Read the honest breakdown";
      var panel = mk("div", "honest-panel");
      panel.id = "honest-panel";
      btn3.addEventListener("click", function () {
        var open = panel.classList.toggle("show");
        if (open) beacon("cta_click", { tier: c.tier, answers: { target: "honest_breakdown" } });
      });
      panel.appendChild(buildHonest(c));
      host.appendChild(btn3); host.appendChild(panel);
    }
  }
  function buildHonest(c) {
    var frag = document.createDocumentFragment();
    frag.appendChild(mk("h4", null, "What has to change before scaling pays"));
    var ul = document.createElement("ul");
    var items = [];
    items.push("Each order loses " + money(Math.abs(c.profit)) + " today. Ad spend multiplies that loss, it does not fix it.");
    items.push(c.binding.label + " is the largest single cost at " + money(c.binding.share) + " per order (" + c.binding.pctOfAov + "% of order value). Start there.");
    items.push("Even the best single lever leaves you at " + money(c.fixLever.profit) + " per order, so one move is not enough. Stack two.");
    if (c.breakEven == null) items.push("There is no break-even order count at these numbers, contribution before CAC is not positive.");
    items.push("No call to push here. Get one order profitable on paper first, then talk scale.");
    items.forEach(function (t) { ul.appendChild(mk("li", null, t)); });
    frag.appendChild(ul);
    return frag;
  }

  /* ─────────────────────────── Slide-over ─────────────────────────── */
  function openSlideOver(c) {
    var so = $("slideover"), back = $("so-back");
    var fixMode = c.tierKey === "fix";
    $("so-eyebrow").textContent = fixMode ? "Fix-first diagnostic" : "Scale readiness";
    $("so-sub").textContent = fixMode
      ? "You are close. One line is dragging every order. Here is what Rise starts the diagnostic on."
      : "The economics hold. Here is the packet Rise uses to model what 20% more revenue does to them.";
    $("so-brief").innerHTML = briefHtml(c);
    back.classList.add("open");
    so.classList.add("open");
    so.setAttribute("aria-hidden", "false");
    beacon("cta_click", { tier: c.tier, answers: { target: fixMode ? "fix_first_diagnostic" : "scale_preview", store_url: capture.store_url, revenue_band: capture.revenue_band } });
  }
  function closeSlideOver() {
    $("slideover").classList.remove("open");
    $("slideover").setAttribute("aria-hidden", "true");
    $("so-back").classList.remove("open");
  }
  function briefHtml(c) {
    var rows = [
      ["AOV", money(state.aov)],
      ["COGS", pct(state.cogs)],
      ["Outbound shipping", money(state.shipping)],
      ["Return rate", pct(state.returnRate)],
      ["Blended CAC", money(state.cac)],
      ["Processing", pct(state.procPct) + " + 30¢"],
      ["Repeat rate", repeatOn ? pct(state.repeat) : "off"],
      ["Contribution / order", money(c.contribution)],
      ["Profit / order", money(c.profit)],
      ["Break-even", c.breakEven != null ? c.breakEven + " orders" : "none"],
      ["Binding constraint", c.binding.label],
      ["Store", capture.store_url || "not given"]
    ];
    var html = '<div class="brief-head"><img src="./assets/rise-logo-white.png" alt=""> What Rise receives when you book</div>';
    html += '<div class="brief-row brief-tier"><span class="brief-k">Verdict</span><span class="brief-v">' + esc(c.tier) + '</span></div>';
    rows.forEach(function (r) {
      html += '<div class="brief-row"><span class="brief-k">' + esc(r[0]) + '</span><span class="brief-v">' + esc(r[1]) + '</span></div>';
    });
    return html;
  }

  /* ─────────────────────────── Gate (landing) ─────────────────────────── */
  var capture = { email: "", store_url: "", revenue_band: "" };
  function emailValid(e) { return /[^@\s]+@[^@\s]+\.[^@\s]+/.test(e || ""); }

  function wireGate() {
    var form = $("gate-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("g-name").value.trim();
      var email = $("g-email").value.trim();
      var store = $("g-store").value.trim();
      var err = $("gate-err");
      if (!name) { err.textContent = "Add your name so we know who to send it to."; $("g-name").focus(); return; }
      if (!emailValid(email)) { err.textContent = "Enter a valid email so we can send the X-Ray."; $("g-email").focus(); return; }
      err.textContent = "";
      capture.email = email; capture.store_url = store; capture.revenue_band = "";
      updateReader({ email: email, name: name, xray_unlocked: true });

      // Capture keeps the calculator payload contract (default apparel example
      // at gate time, since the calculator opens after this) and adds the
      // leaf_template_key so lm-beacon can route a client nurture sequence.
      var c = lastCompute || compute(state);
      beacon("capture", {
        email: email,
        answers: {
          name: name,
          inputs: {
            aov: state.aov, cogs_pct: state.cogs, shipping: state.shipping,
            return_rate_pct: state.returnRate, cac: state.cac, processing_pct: state.procPct,
            processing_fixed: PROC_FIXED, repeat_rate_pct: repeatOn ? state.repeat : null
          },
          outputs: {
            contribution_before_cac: c.contribution, profit_per_order: c.profit,
            break_even_orders: c.breakEven, customer_profit: c.customerProfit
          },
          tier: c.tier,
          binding_constraint: c.binding.label,
          revenue_band: null,
          store_url: store,
          leaf_template_key: LEAF_KEY
        }
      });
      showThankYou(name);
    });
  }

  /* ─────────────────────── Thank-you ─────────────────────── */
  function showThankYou(name) {
    var first = String(name || "").trim().split(/\s+/)[0] || "";
    var namePart = first ? (", " + esc(first)) : "";
    var v = $("thankyou-view");
    v.innerHTML =
      '<div class="wrap ty-inner reveal">' +
        '<img class="ty-logo" src="./assets/rise-logo-white.png" alt="RISE DTC">' +
        '<p class="ty-eyebrow">You are in</p>' +
        '<h2 class="ty-h">Your X-Ray is ready' + namePart + '.</h2>' +
        '<p class="ty-body">Open it right here and swap in your numbers. A copy is on its way to your inbox too, so you can come back to it any time.</p>' +
        '<div class="ty-actions"><a class="ty-open" href="?unlocked=1">Open the X-Ray <span aria-hidden="true">&rarr;</span></a></div>' +
        '<a class="ty-cta" href="' + BOOKING_URL + '" target="_blank" rel="noopener">Book your Rise call <span aria-hidden="true">&rarr;</span></a>' +
        '<p class="ty-note">30 minutes with Rise. We tell you which cost line to fix first, and if you can do it yourself we say so.</p>' +
      '</div>';
    showView("thankyou-view");
    window.scrollTo(0, 0);
    var open = v.querySelector(".ty-open");
    if (open) open.addEventListener("click", function () { beacon("cta_click", { answers: { target: "thankyou_open_xray" } }); });
    var cta = v.querySelector(".ty-cta");
    if (cta) cta.addEventListener("click", function () { beacon("cta_click", { answers: { target: "thankyou_book" } }); });
    observeReveal(v); revealSafety(v);
    beacon("complete", { answers: { leaf_template_key: LEAF_KEY } });
  }

  /* ─────────────────────── Read my shape (live Claude) ─────────────────── */
  var shapeRan = false;
  function wireShape() {
    var btn = $("btn-shape");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (shapeRan) return;
      shapeRan = true;
      this.setAttribute("disabled", "true");
      readShape();
    });
  }

  function buildSystemPrompt() {
    return [
      "You are a DTC profit analyst for RISE DTC. You are handed the computed per-order economics for one apparel store as JSON.",
      "In under 120 words, blunt and numbers-first: name the binding constraint, explain why it binds on THESE specific numbers, then give one actionable sentence for the fix.",
      "Hard rules: never invent a number that is not in the payload. Do not use em dashes. Do not use 'it's not X, it's Y' or 'not just X' constructions.",
      "Never use the words leverage, seamless, robust, elevate, unlock, delve, streamline, empower, game-changer, or transformative.",
      "Lead with the numbers. No preamble, no sign-off."
    ].join(" ");
  }
  function buildUserInput(c) {
    // Plain-English framing sentence so the upstream safety classifier reads a
    // legitimate business-analysis request, not a bare JSON blob.
    return "Computed per-order profit economics for one apparel store, as JSON. Analyze these numbers and name the binding constraint: " + JSON.stringify({
      aov: state.aov, cogs_pct: state.cogs, shipping: state.shipping,
      return_rate_pct: state.returnRate, cac: state.cac,
      processing_pct: state.procPct, processing_fixed: PROC_FIXED,
      repeat_rate_pct: repeatOn ? state.repeat : null,
      contribution_before_cac: c.contribution,
      profit_per_order: c.profit,
      break_even_orders: c.breakEven,
      customer_profit: c.customerProfit,
      tier: c.tier,
      binding_constraint: c.binding.label,
      binding_constraint_per_order: c.binding.share,
      binding_pct_of_aov: c.binding.pctOfAov,
      fix_line: c.fixLine,
      waterfall: c.waterfall.map(function (w) { return { line: w.name, value: w.val }; })
    });
  }

  // Client-side post-filter per copy rules.
  function filterStream(text) {
    var t = text.replace(/—|–|--/g, ", ");           // strip em dashes
    // Drop sentences with "not just/only" or "isn't X. it's" constructions.
    var parts = t.split(/(?<=[.!?])\s+/);
    parts = parts.filter(function (s) {
      if (/\bnot (just|only)\b/i.test(s)) return false;
      if (/\bisn'?t\b[\s\S]*\bit'?s\b/i.test(s)) return false;
      return true;
    });
    return parts.join(" ");
  }

  function deterministicRead(c) {
    var mk2 = c.profit >= 0 ? "makes " + money(c.profit) : "loses " + money(Math.abs(c.profit));
    var lines = [
      "On these numbers each order " + mk2 + ".",
      c.binding.label + " is the biggest single line at " + money(c.binding.share) + " per order, about " + c.binding.pctOfAov + "% of order value, so it sets the ceiling.",
      c.fixLine,
      c.breakEven != null ? "Break-even sits at " + c.breakEven + " orders." : "There is no break-even at these numbers."
    ];
    return lines.join(" ");
  }

  function showShapeText(txt, tag) {
    $("shape-card").classList.add("show");
    $("shape-tag").textContent = tag || "Live read";
    var node = $("shape-text");
    node.classList.remove("shimmer");
    node.textContent = txt;
  }
  function showShimmer() {
    $("shape-card").classList.add("show");
    $("shape-tag").textContent = "Reading";
    var node = $("shape-text");
    node.classList.add("shimmer");
    node.textContent = "Claude is reading your waterfall";
  }

  function readShape() {
    var c = lastCompute || compute(state);
    showShimmer();

    var firstToken = false, done = false;
    var shimmerTimer = setTimeout(function () { if (!firstToken && !done) showShimmer(); }, 3000);
    var hardTimer = setTimeout(function () {
      if (done) return;
      done = true; try { controller.abort(); } catch (_) {}
      showShapeText(filterStream(deterministicRead(c)), "Computed read (offline)");
    }, 25000);

    function fallback() {
      if (done) return;
      done = true;
      clearTimeout(shimmerTimer); clearTimeout(hardTimer);
      showShapeText(filterStream(deterministicRead(c)), "Computed read (offline)");
    }
    function finish(text) {
      if (done) return;
      done = true;
      clearTimeout(shimmerTimer); clearTimeout(hardTimer);
      var clean = filterStream(text).trim();
      if (!clean) { showShapeText(filterStream(deterministicRead(c)), "Computed read (offline)"); return; }
      showShapeText(clean, "Live read from Claude");
      beacon("cta_click", { tier: c.tier, answers: { target: "read_my_shape" } });
    }

    var controller = new AbortController();
    var payload = {
      slug: SLUG,
      model: PROXY_MODEL,
      max_tokens: 400,
      email: capture.email || undefined,
      system_prompt: buildSystemPrompt(),
      user_input: buildUserInput(c)
    };

    fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).then(function (res) {
      if (res.status === 402) {
        // Quota gate: email should already satisfy it. If it still refuses,
        // fall back to the deterministic read (never a broken box).
        return fallback();
      }
      if (!res.ok || !res.body) { return fallback(); }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "", acc = "";

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { finish(acc); return; }
          buffer += decoder.decode(r.value, { stream: true });
          var chunks = buffer.split("\n\n");
          buffer = chunks.pop();
          chunks.forEach(function (block) {
            var lines = block.split("\n");
            var evt = "", data = "";
            lines.forEach(function (ln) {
              if (ln.indexOf("event:") === 0) evt = ln.slice(6).trim();
              else if (ln.indexOf("data:") === 0) data += ln.slice(5).trim();
            });
            if (!data) return;
            if (data === "[DONE]") { finish(acc); return; }
            var j;
            try { j = JSON.parse(data); } catch (_) { return; }
            if (j.type === "content_block_delta" && j.delta && j.delta.text) {
              firstToken = true;
              acc += j.delta.text;
              // live typewriter of the filtered stream
              var node = $("shape-text");
              node.classList.remove("shimmer");
              $("shape-tag").textContent = "Live read from Claude";
              node.textContent = filterStream(acc);
            } else if (j.type === "error" || (j.error && j.error.message)) {
              fallback();
            }
          });
          if (done) { try { controller.abort(); } catch (_) {} return; }
          return pump();
        }).catch(function () { fallback(); });
      }
      return pump();
    }).catch(function () { fallback(); });
  }

  /* ─────────────────────────── Reveal motion ─────────────────────────── */
  function observeReveal(root) {
    var els = (root || document).querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (e) { e.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (e) { io.observe(e); });
  }
  // Safety net: force-reveal any near/above-fold .reveal ~1.4s after load so a
  // missed observer tick can never strand a section invisible.
  function revealSafety(root) {
    setTimeout(function () {
      var vh = window.innerHeight || 800;
      (root || document).querySelectorAll(".reveal:not(.in)").forEach(function (el) {
        if (el.getBoundingClientRect().top < vh * 0.95) el.classList.add("in");
      });
    }, 1400);
  }

  /* ─────────────────────────── State router ─────────────────────────── */
  function showView(id) {
    ["landing-view", "thankyou-view", "resource-view"].forEach(function (v) {
      var n = $(v); if (n) n.hidden = (v !== id);
    });
  }
  // Mirrors ai-kit.js isUnlocked(): emailed-link params ?unlocked=1 / ?kit / #kit,
  // plus a returning reader who already captured on this device.
  function isUnlocked() {
    try {
      var p = new URLSearchParams(location.search || "");
      if (p.get("unlocked") === "1" || p.has("kit")) return true;
    } catch (_) {}
    if (/(^|[#&])kit\b/.test(location.hash || "")) return true;
    try { if (readerIdentity().xray_unlocked) return true; } catch (_) {}
    return false;
  }

  /* ─────────────────────────── Init ─────────────────────────── */
  function initResource() {
    showView("resource-view");
    // Hydrate the captured email from the shared reader identity so the
    // "read my shape" proxy quota is already satisfied on a returning visit.
    try { var id = readerIdentity(); if (id && id.email) capture.email = id.email; } catch (_) {}
    unlocked = true;
    buildFields();
    wireShape();
    $("so-close").addEventListener("click", closeSlideOver);
    $("so-back").addEventListener("click", closeSlideOver);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSlideOver(); });
    recompute();          // hero + result + waterfall computed on load, no typing
    animateWaterfall();
    observeReveal($("resource-view")); revealSafety($("resource-view"));
    beacon("view", { answers: { state: "resource", via: "unlock" } });
  }
  function initLanding() {
    showView("landing-view");
    wireGate();
    observeReveal($("landing-view")); revealSafety($("landing-view"));
    beacon("view", { answers: { state: "landing" } });
  }
  function init() {
    el = {};
    if (isUnlocked()) initResource();
    else initLanding();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
