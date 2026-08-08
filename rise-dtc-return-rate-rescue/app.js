/* Return Rate Rescue - Rise DTC lead magnet
   Vanilla JS, no framework, no build step. Deterministic math sizes the
   dollar leak (free, no gate). Claude writes the rescue plan behind an
   email + store gate. Mechanical plumbing (beacon, reader identity, SSE
   parsing, anti-tell filter) follows the sibling True Profit X-Ray tool;
   layout, copy, and reveal order are original to this tool. */
(function () {
  "use strict";

  /* ─────────────────────────── Config ─────────────────────────── */
  var SLUG = (typeof window !== "undefined" && window.__lm_slug) || "rise-dtc-return-rate-rescue";
  var BEACON_URL = (typeof window !== "undefined" && window.__lm_beacon_url) || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";
  var PROXY_URL = "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-walkthrough-proxy";
  var PROXY_MODEL = "claude-sonnet-4-6";
  var P_RATE = 0.029;   // hardcoded card rate, published Shopify Payments / Stripe standard
  var F_FIXED = 0.30;   // hardcoded per-transaction card fee
  var BENCHMARK = 0.169; // NRF + Happy Returns 2024 all-channel average

  /* ─────────────────────────── Field schema ─────────────────────────── */
  var FIELDS = [
    { key: "monthlyOrders", label: "Monthly orders", type: "int", min: 1, max: 100000,
      hint: "Shopify, Analytics, Orders, last 30 days.", placeholder: "e.g. 900" },
    { key: "aov", label: "Average order value", type: "money", min: 5, max: 1000,
      hint: "Total sales divided by orders. Your Shopify overview shows it.", placeholder: "e.g. 68" },
    { key: "returnRate", label: "Return rate", type: "pct", min: 0, max: 70,
      hint: "Returns divided by orders, last 90 days. Shopify, Analytics, Returns.", placeholder: "e.g. 24" },
    { key: "category", label: "Category", type: "select",
      options: [["", "Choose one"], ["apparel", "Apparel"], ["footwear", "Footwear"], ["skincare_beauty", "Skincare and beauty"], ["other_dtc", "Other DTC"]],
      hint: "Sets how the plan is written. Apparel and skincare lead the list." },
    { key: "topReturnReason", label: "Top return reason", type: "select",
      options: [["", "Choose one"], ["sizing_fit", "Sizing or fit"], ["quality_defect", "Quality or defect"], ["not_as_described", "Not as described"], ["changed_mind", "Changed their mind"], ["arrived_damaged", "Arrived damaged"], ["other", "Other"]],
      hint: "The reason tagged most often on your return requests." },
    { key: "exchangeShare", label: "Returns that become exchanges", type: "pct", min: 0, max: 100,
      hint: "Of every 10 returns, how many swap for another item instead of a cash refund. Rough is fine.", placeholder: "e.g. 30" },
    { key: "outboundShipping", label: "Outbound shipping per order", type: "money", min: 0, max: 40,
      hint: "What you pay to ship one order out. A returned order already spent this and does not give it back.", placeholder: "e.g. 7" },
    { key: "returnHandling", label: "Cost to process one return", type: "money", min: 0, max: 80,
      hint: "Your cost to take one return back: the return label if you pay it, warehouse time, inspection, restock. Estimate from your own ops. No public number is reliable enough to fill this for you.", placeholder: "e.g. 12" }
  ];

  var EXAMPLE_VECTOR = {
    monthlyOrders: 900, aov: 68, returnRate: 24, category: "apparel",
    topReturnReason: "sizing_fit", exchangeShare: 30, outboundShipping: 7, returnHandling: 12
  };

  /* ─────────────────────────── Beacon (X-Ray plumbing, reused) ─────────────────────────── */
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
  var SUPABASE_ANON_KEY = (typeof window !== "undefined" && window.__supabase_anon_key) || "sb_publishable_Q-kfisfhqxXV5xiIhCduMQ_QSIflf4h";

  function beacon(event, extra) {
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({
        event_type: event,
        tool_type: "diagnostic",
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
    var abs = Math.abs(v);
    var fixed = abs.toFixed(2);
    var parts = fixed.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return sign + "$" + parts[0] + "." + parts[1];
  }
  function pct2(fraction) { return (fraction * 100).toFixed(2) + "%"; }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  /* ─────────────────────────── Deterministic leak math (pure) ─────────────────────────── */
  // Matches 01-model.md section 2 exactly. inputs: monthlyOrders, aov, returnRate (%),
  // exchangeShare (%), outboundShipping, returnHandling, category, topReturnReason.
  function compute(inputs) {
    var N = inputs.monthlyOrders;
    var A = inputs.aov;
    var r = inputs.returnRate / 100;
    var x = inputs.exchangeShare / 100;
    var s = inputs.outboundShipping;
    var h = inputs.returnHandling;

    var procPerOrder = P_RATE * A + F_FIXED;      // p*A + f
    var R = N * r;
    var R_ref = R * (1 - x);
    var R_exc = R * x;

    var L_per_return = (1 - x) * A + s + (1 - x) * procPerOrder + h;

    var revRefAnnual = 12 * N * r * (1 - x) * A;
    var shipSunkAnnual = 12 * N * r * s;
    var procSunkAnnual = 12 * N * r * (1 - x) * procPerOrder;
    var handleAnnual = 12 * N * r * h;

    var annualLeak = revRefAnnual + shipSunkAnnual + procSunkAnnual + handleAnnual;
    var annualRevenue = 12 * N * A;
    var leakPct = annualRevenue > 0 ? annualLeak / annualRevenue : 0;

    var exchangeOffsetAnnual = 12 * R_exc * A;

    var rTarget = Math.min(r, BENCHMARK);
    var recoverableAnnual = 12 * N * (r - rTarget) * L_per_return;
    var residualLeakAnnual = 12 * N * rTarget * L_per_return;

    var components = [
      { key: "refunded_revenue", name: "Refunded revenue", annual: revRefAnnual, lever: "cut the return rate and convert refunds into exchanges" },
      { key: "return_handling", name: "Return handling", annual: handleAnnual, lever: "lower the cost of each return" },
      { key: "sunk_shipping", name: "Sunk outbound shipping", annual: shipSunkAnnual, lever: "fewer returns means fewer orders shipped out and back" },
      { key: "lost_processing", name: "Lost processing fees", annual: procSunkAnnual, lever: "fewer refunds keeps the card fee earned" }
    ];
    components.sort(function (a, b) { return b.annual - a.annual; });

    var tierKey, tierName;
    if (leakPct < 0.08) { tierKey = "slow_leak"; tierName = "SLOW LEAK"; }
    else if (leakPct < 0.16) { tierKey = "steady_drain"; tierName = "STEADY DRAIN"; }
    else { tierKey = "open_drain"; tierName = "OPEN DRAIN"; }

    return {
      N: N, A: A, r: r, x: x, s: s, h: h,
      procPerOrder: procPerOrder, R: R, R_ref: R_ref, R_exc: R_exc,
      L_per_return: L_per_return,
      revRefAnnual: revRefAnnual, shipSunkAnnual: shipSunkAnnual, procSunkAnnual: procSunkAnnual, handleAnnual: handleAnnual,
      monthlyLeak: annualLeak / 12,
      annualLeak: annualLeak,
      annualRevenue: annualRevenue,
      leakPct: leakPct,
      exchangeOffsetAnnual: exchangeOffsetAnnual,
      rTarget: rTarget,
      recoverableAnnual: recoverableAnnual,
      residualLeakAnnual: residualLeakAnnual,
      components: components,
      dominantDriver: components[0].name,
      tierKey: tierKey,
      tierName: tierName
    };
  }

  // Expose the pure math function for node-based golden-vector testing (no DOM required).
  if (typeof window !== "undefined") { window.__rescue_compute = compute; }
  if (typeof module !== "undefined" && module.exports) { module.exports = { compute: compute, money: money, round2: round2, pct2: pct2, groundPlanNumbers: groundPlanNumbers }; }

  // Stop here in non-browser (node require) contexts; everything below touches document/window.
  if (typeof document === "undefined") { return; }

  /* ─────────────────────────── Tier copy ─────────────────────────── */
  function tierSentence(c) {
    if (c.tierKey === "slow_leak") {
      return "Returns are taking under 8% of your revenue, so the plan tightens a small leak instead of stopping a flood.";
    }
    if (c.tierKey === "steady_drain") {
      return "Returns pull " + pct2(c.leakPct) + " of your revenue every month, a steady cost that compounds for as long as you leave it.";
    }
    return "Returns are draining " + pct2(c.leakPct) + " of your revenue, and more ad spend just pushes more of it back out the door.";
  }
  function tierChipClass(tierKey) {
    return "tier-chip tier-" + tierKey.replace(/_/g, "-");
  }

  /* ─────────────────────────── Plan copy helpers ─────────────────────────── */
  function categoryLabel(category) {
    var map = { apparel: "apparel", footwear: "footwear", skincare_beauty: "skincare and beauty", other_dtc: "DTC" };
    return map[category] || "DTC";
  }
  function reasonLabel(topReturnReason) {
    var map = {
      sizing_fit: "sizing or fit", quality_defect: "quality or a defect",
      not_as_described: "not matching the listing", changed_mind: "a change of mind",
      arrived_damaged: "damage in transit", other: "a reason you have not pinned down yet"
    };
    return map[topReturnReason] || map.other;
  }
  function actionRootCause(topReturnReason) {
    var map = {
      sizing_fit: "add a fit guide and per-product size chart to your three highest-return SKUs",
      quality_defect: "pull the return notes on your top 3 returned SKUs and open a supplier ticket",
      not_as_described: "rewrite the product copy and photos on your top 3 returned SKUs so what ships matches what is shown",
      changed_mind: "add a pre-purchase fit quiz or sizing finder on your top 3 returned SKUs so the wrong item ships less often",
      arrived_damaged: "photograph one week of damaged returns and switch the worst SKU to protective mailers",
      other: "tag the next 20 returns with a real reason so next month's number tells you what to fix"
    };
    return map[topReturnReason] || map.other;
  }
  function actionFor(component, topReturnReason) {
    switch (component.key) {
      case "refunded_revenue":
        return actionRootCause(topReturnReason);
      case "return_handling":
        return topReturnReason === "arrived_damaged"
          ? "add a damage check at intake before anything gets restocked"
          : "time your next 10 returns from drop off to restock and cut the slowest step";
      case "sunk_shipping":
        return "audit packaging on your top 3 returned SKUs so outbound cost drops without slowing delivery";
      case "lost_processing":
        return "make exchange the default resolution on your return form so fewer refunds trigger a lost card fee";
      default:
        return actionRootCause(topReturnReason);
    }
  }
  function leverSentence(component, category, topReturnReason) {
    var lead = component.lever.charAt(0).toUpperCase() + component.lever.slice(1) + ".";
    return lead + " Your top reason is " + reasonLabel(topReturnReason) + " on " + categoryLabel(category) + " orders, and that is where this line starts.";
  }
  function fallbackPlanText(c, inputs) {
    var comps = c.components;
    var lines = [];
    lines.push("Your biggest leak is " + comps[0].name + " at " + money(comps[0].annual) + " a year.");
    lines.push("");
    for (var i = 0; i < 3; i++) {
      var comp = comps[i];
      lines.push((i + 1) + ". " + comp.name + ", " + money(comp.annual) + " a year. " + leverSentence(comp, inputs.category, inputs.topReturnReason) + " This week: " + actionFor(comp, inputs.topReturnReason) + ".");
    }
    lines.push("");
    lines.push("If this lands you recover " + money(c.recoverableAnnual) + " a year and the leak drops to " + money(c.residualLeakAnnual) + ".");
    return lines.join("\n");
  }

  /* ─────────────────────────── DOM helpers ─────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function mk(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  /* ─────────────────────────── Build intake fields ─────────────────────────── */
  function buildFields() {
    var host = $("intake-fields");
    FIELDS.forEach(function (f) {
      var wrap = document.createElement("div");
      wrap.className = "field";
      wrap.id = "field-" + f.key;

      var lab = document.createElement("label");
      lab.setAttribute("for", "in-" + f.key);
      lab.textContent = f.label;
      wrap.appendChild(lab);

      var input;
      if (f.type === "select") {
        input = document.createElement("select");
        f.options.forEach(function (o) {
          var opt = document.createElement("option");
          opt.value = o[0]; opt.textContent = o[1];
          if (o[0] === "") opt.disabled = true;
          input.appendChild(opt);
        });
        input.value = "";
      } else {
        input = document.createElement("input");
        input.type = "number";
        input.min = f.min; input.max = f.max;
        input.step = f.type === "int" ? "1" : "any";
        input.placeholder = f.placeholder || "";
        input.autocomplete = "off";
      }
      input.id = "in-" + f.key;
      input.setAttribute("aria-describedby", "hint-" + f.key);
      wrap.appendChild(input);

      var hint = document.createElement("p");
      hint.className = "field-hint";
      hint.id = "hint-" + f.key;
      hint.textContent = f.hint;
      wrap.appendChild(hint);

      var err = document.createElement("p");
      err.className = "field-err";
      err.id = "err-" + f.key;
      wrap.appendChild(err);

      host.appendChild(wrap);
    });
  }

  function setFieldValues(values) {
    FIELDS.forEach(function (f) {
      var input = $("in-" + f.key);
      if (input && values[f.key] !== undefined) input.value = values[f.key];
    });
  }

  function readFieldsRaw() {
    var raw = {};
    FIELDS.forEach(function (f) {
      var input = $("in-" + f.key);
      raw[f.key] = f.type === "select" ? input.value : input.value.trim();
    });
    return raw;
  }

  function clearErrors() {
    FIELDS.forEach(function (f) {
      var e = $("err-" + f.key);
      if (e) e.textContent = "";
      var w = $("field-" + f.key);
      if (w) w.classList.remove("has-err");
    });
  }

  function validateAndParse() {
    var raw = readFieldsRaw();
    var parsed = {};
    var firstInvalid = null;
    clearErrors();

    FIELDS.forEach(function (f) {
      var v = raw[f.key];
      var errNode = $("err-" + f.key);
      var fieldNode = $("field-" + f.key);
      var fail = function (msg) {
        errNode.textContent = msg;
        fieldNode.classList.add("has-err");
        if (!firstInvalid) firstInvalid = "in-" + f.key;
      };
      if (f.type === "select") {
        if (!v) { fail("Choose one."); return; }
        parsed[f.key] = v;
        return;
      }
      if (v === "") { fail("Enter a number between " + f.min + " and " + f.max + "."); return; }
      var num = Number(v);
      if (isNaN(num)) { fail("Enter a valid number."); return; }
      if (f.type === "int" && !Number.isInteger(num)) { fail("Whole numbers only."); return; }
      if (num < f.min || num > f.max) { fail("Enter a number between " + f.min + " and " + f.max + "."); return; }
      parsed[f.key] = num;
    });

    if (firstInvalid) {
      var el = $(firstInvalid);
      if (el) el.focus();
      return null;
    }
    return parsed;
  }

  /* ─────────────────────────── Reveal render ─────────────────────────── */
  function renderReveal(c, inputs) {
    $("leak-num").textContent = money(c.annualLeak);
    $("leak-num").style.color = "var(--gold)";
    var chip = $("tier-chip");
    chip.className = tierChipClass(c.tierKey);
    chip.textContent = c.tierName;
    $("leak-pct-num").textContent = pct2(c.leakPct);
    $("tier-sentence").textContent = tierSentence(c);

    var ledger = $("ledger");
    ledger.innerHTML = "";
    var maxAnnual = c.components[0].annual || 1;
    c.components.forEach(function (comp) {
      var row = document.createElement("div");
      row.className = "ledger-row";
      var top = document.createElement("div");
      top.className = "ledger-top";
      top.innerHTML = '<span class="ledger-name">' + esc(comp.name) + '</span><span class="ledger-val">' + esc(money(comp.annual)) + '</span>';
      var track = document.createElement("div");
      track.className = "ledger-track";
      var bar = document.createElement("div");
      bar.className = "ledger-bar";
      var widthPct = maxAnnual > 0 ? Math.max(2, Math.min(100, (comp.annual / maxAnnual) * 100)) : 2;
      bar.style.width = widthPct + "%";
      track.appendChild(bar);
      row.appendChild(top);
      row.appendChild(track);
      ledger.appendChild(row);
    });

    $("exchange-line").textContent = "Your exchange rate keeps " + money(c.exchangeOffsetAnnual) + " a year that a refund-only policy would lose.";

    var recEl = $("recoverable-line");
    if (c.recoverableAnnual > 0) {
      recEl.textContent = "Cutting your return rate to 16.9%, the average US retailer's rate, recovers " + money(c.recoverableAnnual) + " a year. That average covers all of retail, store and online together, so treat the recovery as a ceiling for an online store in your category.";
    } else {
      recEl.textContent = "Your return rate is already at or below the 16.9% average US retailer rate, so the recovery in your plan comes from the exchange mix and the handling cost.";
    }

    $("receipt-body").innerHTML = buildReceiptHtml(c, inputs);
  }

  function buildReceiptHtml(c, inputs) {
    var lines = [
      "p*A + f = " + c.procPerOrder.toFixed(3) + "  (payment processing per order: 2.9% + 30 cents, the published Shopify Payments / Stripe standard card rate)",
      "R = N * r = " + c.N + " * " + c.r.toFixed(2) + " = " + round2(c.R) + " returns a month",
      "R_ref = R * (1 - x) = " + round2(c.R).toFixed(2) + " * " + (1 - c.x).toFixed(2) + " = " + round2(c.R_ref) + " refunds a month",
      "R_exc = R * x = " + round2(c.R).toFixed(2) + " * " + c.x.toFixed(2) + " = " + round2(c.R_exc) + " exchanges a month",
      "L_per_return = (1-x)*A + s + (1-x)*(p*A+f) + h = " + c.L_per_return.toFixed(4) + " leaked per returned order",
      "",
      "Refunded revenue, annual = 12 * N * r * (1-x) * A = " + money(c.revRefAnnual),
      "Sunk outbound shipping, annual = 12 * N * r * s = " + money(c.shipSunkAnnual),
      "Lost processing fees, annual = 12 * N * r * (1-x) * (p*A+f) = " + money(c.procSunkAnnual),
      "Return handling, annual = 12 * N * r * h = " + money(c.handleAnnual),
      "",
      "Annual leak = " + money(c.revRefAnnual) + " + " + money(c.shipSunkAnnual) + " + " + money(c.procSunkAnnual) + " + " + money(c.handleAnnual) + " = " + money(c.annualLeak),
      "Annual revenue = 12 * N * A = " + money(c.annualRevenue),
      "Leak, % of revenue = Annual leak / Annual revenue = " + pct2(c.leakPct),
      "",
      "Exchange offset, annual = 12 * R_exc * A = " + money(c.exchangeOffsetAnnual),
      "Target return rate = min(r, 16.9%) = " + pct2(c.rTarget),
      "Recoverable, annual = 12 * N * (r - target) * L_per_return = " + money(c.recoverableAnnual),
      "Residual leak, annual = 12 * N * target * L_per_return = " + money(c.residualLeakAnnual),
      "",
      "Check: annual leak = recoverable + residual = " + money(c.recoverableAnnual) + " + " + money(c.residualLeakAnnual) + " = " + money(c.recoverableAnnual + c.residualLeakAnnual)
    ];
    var html = '<p>Every line below is your own numbers run through the stated formulas. The single outside figure is the cited 16.9% benchmark.</p>';
    html += '<code>' + esc(lines.join("\n")) + '</code>';
    html += '<p><strong>How costs are assigned:</strong></p><ul>';
    html += '<li>Refunded revenue is lost on refunds only. An exchange keeps the sale, so it keeps the revenue.</li>';
    html += '<li>Outbound shipping is sunk on every returned order. You already paid to ship it, the return does not refund your label.</li>';
    html += '<li>Payment processing is lost on refunds only. The card fee is not returned and there is no retained sale to earn it.</li>';
    html += '<li>Return handling is spent on every return. You physically process each one, exchange or refund.</li>';
    html += '</ul>';
    return html;
  }

  /* ─────────────────────────── Gate ─────────────────────────── */
  function emailValid(e) { return /[^@\s]+@[^@\s]+\.[^@\s]+/.test(e || ""); }
  function storeValid(u) { return /^[a-z0-9.-]+\.[a-z]{2,}/i.test((u || "").replace(/^https?:\/\//i, "").replace(/^www\./i, "")); }
  function domainFromUrl(u) {
    try {
      var withProto = /^https?:\/\//i.test(u) ? u : "https://" + u;
      return new URL(withProto).hostname.replace(/^www\./, "");
    } catch (_) { return u; }
  }

  function wireGate(state) {
    $("gate-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var email = $("g-email").value.trim();
      var store = $("g-store").value.trim();
      var emailErr = $("g-email-err"), storeErr = $("g-store-err");
      emailErr.textContent = ""; storeErr.textContent = "";
      var ok = true;
      if (!emailValid(email)) { emailErr.textContent = "Enter a valid email to get your plan."; ok = false; }
      if (!storeValid(store)) { storeErr.textContent = "Add your store URL, e.g. yourbrand.com."; ok = false; }
      if (!ok) return;

      updateReader({ email: email });
      var c = state.lastCompute, inputs = state.lastInputs;

      beacon("capture", {
        email: email,
        answers: {
          inputs: {
            monthly_orders: inputs.monthlyOrders, aov: inputs.aov, return_rate_pct: inputs.returnRate,
            category: inputs.category, top_return_reason: inputs.topReturnReason,
            exchange_share_pct: inputs.exchangeShare, outbound_shipping: inputs.outboundShipping,
            return_handling: inputs.returnHandling
          },
          outputs: {
            annual_leak: round2(c.annualLeak), annual_revenue: round2(c.annualRevenue),
            leak_pct: Number((c.leakPct * 100).toFixed(2)), recoverable_annual: round2(c.recoverableAnnual),
            residual_leak_annual: round2(c.residualLeakAnnual), exchange_offset_annual: round2(c.exchangeOffsetAnnual),
            dominant_driver: c.dominantDriver
          },
          tier: c.tierName,
          store_url: store
        }
      });

      state.email = email;
      state.storeUrl = store;
      $("gate").hidden = true;
      $("plan").hidden = false;
      $("plan-title").textContent = "Rescue plan, written for " + domainFromUrl(store);
      $("plan").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
      runPlan(state);
    });
  }

  /* ─────────────────────────── Claude plan (streamed) ─────────────────────────── */
  function reduceMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function buildSystemPrompt() {
    return "You write a returns rescue plan for a RISE DTC founder. You receive one JSON payload with their store's computed return economics. Write the plan and nothing else.\n\n" +
      "Structure, exactly:\n" +
      "- One opening line that diagnoses the dominant leak driver by name, using the value dominant_driver and its annual dollar figure from the payload.\n" +
      "- Exactly 3 numbered moves. Order them by expected recovery, largest first, matching the ranked components in the payload. Each move: name the annual dollars it targets (copied from the payload, never computed by you), then one concrete action the founder can start this week, tied to their category and top_return_reason.\n" +
      "- One closing line stating what the numbers look like if the plan lands, using recoverable_annual and residual_leak_annual from the payload.\n\n" +
      "Hard rules:\n" +
      "- Never state a number that is not in the payload. Do not add, round, or invent figures.\n" +
      "- No em dashes.\n" +
      "- No \"not just X\". No \"isn't X, it's Y\" or any corrective-contrast form.\n" +
      "- Never use: leverage, seamless, robust, elevate, unlock, delve, streamline, empower, game-changer, transformative.\n" +
      "- No preamble, no sign-off, no headers. Start at the diagnosis line.\n" +
      "- No sentence that ends with a comma followed by an ing word restating the result, like reducing X or cutting Y. End the sentence at the action.\n" +
      "- Active voice, concrete nouns, plain operator tone.\n" +
      "- Under 220 words total.";
  }

  function buildUserInput(c, inputs) {
    var payload = {
      category: categoryLabel(inputs.category),
      top_return_reason: reasonLabel(inputs.topReturnReason),
      monthly_orders: c.N,
      aov: c.A,
      return_rate_pct: inputs.returnRate,
      exchange_share_pct: inputs.exchangeShare,
      outbound_shipping: c.s,
      return_handling: c.h,
      annual_revenue: round2(c.annualRevenue),
      annual_leak: round2(c.annualLeak),
      leak_pct: Number((c.leakPct * 100).toFixed(2)),
      tier: c.tierName,
      exchange_offset_annual: round2(c.exchangeOffsetAnnual),
      benchmark_target_pct: 16.9,
      recoverable_annual: round2(c.recoverableAnnual),
      residual_leak_annual: round2(c.residualLeakAnnual),
      dominant_driver: c.dominantDriver,
      ranked_components: c.components.map(function (comp) {
        return { name: comp.name, annual: round2(comp.annual), lever: comp.lever };
      })
    };
    return "Computed returns economics for one DTC store, as JSON. Write the 3-move rescue plan from these numbers only:\n" + JSON.stringify(payload);
  }

  // Client-side post-filter per copy rules (same discipline as the sibling X-Ray tool).
  function filterStream(text) {
    var t = text.replace(/—|–|--/g, ", ");
    var parts = t.split(/(?<=[.!?])\s+/);
    parts = parts.filter(function (s) {
      if (/\bnot (just|only)\b/i.test(s)) return false;
      if (/\bisn'?t\b[\s\S]*\bit'?s\b/i.test(s)) return false;
      return true;
    });
    // Trim result-gloss participle tags ("..., reducing X." / "..., cutting Y.")
    // without touching content-bearing -ing clauses like "starting with".
    var GLOSS = /,\s+(?:reducing|cutting|lowering|creating|highlighting|boosting|improving|increasing|driving|saving|freeing|keeping|preventing|stopping|shrinking|closing|recovering|eliminating|minimizing|maximizing)\b[^.!?]*([.!?])\s*$/i;
    parts = parts.map(function (s) { return s.replace(GLOSS, "$1"); });
    return parts.join(" ");
  }


  // Deterministic figure gate for the live plan: every dollar and percent Claude
  // renders must match a payload value. Cent-level drift snaps to the exact
  // payload figure; an unknown figure rejects the whole live plan to the
  // computed fallback, so an invented number can never reach the founder.
  function groundPlanNumbers(text, c, inputs) {
    var dollars = [
      c.revRefAnnual, c.handleAnnual, c.shipSunkAnnual, c.procSunkAnnual,
      c.annualLeak, c.annualRevenue, c.exchangeOffsetAnnual,
      c.recoverableAnnual, c.residualLeakAnnual,
      inputs.aov, inputs.outboundShipping, inputs.returnHandling,
      c.procPerOrder, F_FIXED
    ].map(round2);
    var percents = [
      inputs.returnRate, inputs.exchangeShare,
      Math.round(c.leakPct * 10000) / 100, 16.9, 2.9
    ];
    var violations = 0;
    var out = text.replace(/\$\s?([\d,]+(?:\.\d{1,2})?)/g, function (m, num) {
      var v = parseFloat(num.replace(/,/g, ""));
      if (isNaN(v)) { violations++; return m; }
      for (var i = 0; i < dollars.length; i++) {
        if (Math.abs(v - dollars[i]) <= 0.02) return money(dollars[i]);
      }
      violations++;
      return m;
    });
    out.replace(/([\d.]+)\s?%/g, function (m, num) {
      var v = parseFloat(num);
      if (isNaN(v)) { violations++; return m; }
      var okPct = false;
      for (var i = 0; i < percents.length; i++) {
        if (Math.abs(v - percents[i]) <= 0.02) { okPct = true; break; }
      }
      if (!okPct) violations++;
      return m;
    });
    return { text: out, violations: violations };
  }

  function setPlanText(txt, tag) {
    $("plan-tag").textContent = tag;
    $("plan-body").textContent = txt;
  }

  function runPlan(state) {
    var c = state.lastCompute, inputs = state.lastInputs;
    setPlanText("Claude is reading your numbers.", "Written live by Claude");

    var firstToken = false, done = false, acc = "";
    // The rail buffers: measured TTFB on this proxy is 34-78s with the whole
    // completion arriving in one burst. First-token window must sit well above
    // that or every healthy read dies into the fallback.
    var waitTimer = setTimeout(function () {
      if (done || firstToken) return;
      setPlanText("Still writing. This can take a minute or two.", "Written live by Claude");
    }, 15000);
    var firstTokenTimer = setTimeout(function () {
      if (done || firstToken) return;
      try { controller.abort(); } catch (_) {}
      finishFallback();
    }, 120000);
    var hardTimer = setTimeout(function () {
      if (done) return;
      try { controller.abort(); } catch (_) {}
      if (acc && filterStream(acc).trim().length > 200) { finishLive(acc); } else { finishFallback(); }
    }, 150000);

    function finishFallback() {
      if (done) { clearTimeout(hardTimer); return; }
      done = true;
      clearTimeout(hardTimer);
      var text = filterStream(fallbackPlanText(c, inputs));
      setPlanText(text, "Computed plan (offline)");
      revealCta();
      beacon("complete", { tier: c.tierName, answers: { plan_source: "fallback" } });
    }
    function finishLive(text) {
      if (done) return;
      var clean = filterStream(text).trim();
      if (!clean) { finishFallback(); return; }
      var grounded = groundPlanNumbers(clean, c, inputs);
      if (grounded.violations > 0) { finishFallback(); return; }
      done = true;
      clearTimeout(hardTimer);
      setPlanText(grounded.text, "Live plan from Claude");
      revealCta();
      beacon("complete", { tier: c.tierName, answers: { plan_source: "claude" } });
    }

    var controller = new AbortController();
    var payload = {
      slug: SLUG,
      model: PROXY_MODEL,
      max_tokens: 700,
      email: state.email || undefined,
      system_prompt: buildSystemPrompt(),
      user_input: buildUserInput(c, inputs)
    };

    fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).then(function (res) {
      if (res.status === 402) { return finishFallback(); }
      if (!res.ok || !res.body) { return finishFallback(); }

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";

      function pump() {
        return reader.read().then(function (r) {
          if (r.done) { finishLive(acc); return; }
          buffer += decoder.decode(r.value, { stream: true });
          var chunks = buffer.split("\n\n");
          buffer = chunks.pop();
          chunks.forEach(function (block) {
            var lines = block.split("\n");
            var data = "";
            lines.forEach(function (ln) {
              if (ln.indexOf("data:") === 0) data += ln.slice(5).trim();
            });
            if (!data) return;
            if (data === "[DONE]") { finishLive(acc); return; }
            var j;
            try { j = JSON.parse(data); } catch (_) { return; }
            if (j.type === "content_block_delta" && j.delta && j.delta.text) {
              firstToken = true;
              acc += j.delta.text;
              $("plan-tag").textContent = "Written live by Claude";
              $("plan-body").textContent = filterStream(acc);
            } else if (j.type === "error" || (j.error && j.error.message)) {
              finishFallback();
            }
          });
          if (done) { try { controller.abort(); } catch (_) {} return; }
          return pump();
        }).catch(function () { finishFallback(); });
      }
      return pump();
    }).catch(function () { finishFallback(); });
  }

  function revealCta() {
    $("cta").hidden = false;
  }

  /* ─────────────────────────── Intake submit ─────────────────────────── */
  function wireIntake(state) {
    function handleSubmit(source) {
      var inputs = validateAndParse();
      if (!inputs) return;
      var c = compute(inputs);
      state.lastCompute = c;
      state.lastInputs = inputs;

      $("reveal").hidden = false;
      $("gate").hidden = false;
      renderReveal(c, inputs);
      $("reveal").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });

      beacon("cta_click", { answers: { target: source } });
    }

    $("intake-form").addEventListener("submit", function (e) {
      e.preventDefault();
      handleSubmit("size_my_leak");
    });

    $("example-link").addEventListener("click", function () {
      setFieldValues(EXAMPLE_VECTOR);
      handleSubmit("example_store");
    });
  }

  function wireCta() {
    $("btn-book").addEventListener("click", function () {
      beacon("cta_click", { answers: { target: "book_call" } });
    });
  }

  /* ─────────────────────────── Init ─────────────────────────── */
  function init() {
    var state = { lastCompute: null, lastInputs: null, email: "", storeUrl: "" };
    buildFields();
    wireIntake(state);
    wireGate(state);
    wireCta();
    beacon("view");
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
