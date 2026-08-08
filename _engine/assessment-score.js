/* LM Assessment scoring core — pure, DOM-free. Browser global (window.LMScore) + Node module. */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.LMScore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function fmt(spec, val) {
    if (val == null || isNaN(val)) return "—";
    var n = Number(val);
    if (spec === "currency") return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (spec === "currency_per_period") return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 }) + "/mo";
    if (spec === "hours_per_period") return n.toFixed(n < 10 ? 1 : 0) + " hrs/wk";
    if (spec === "percent") return n.toFixed(0) + "%";
    if (spec === "hours") return n.toFixed(n < 10 ? 1 : 0) + " hrs";
    if (spec === "integer") return Math.round(n).toLocaleString("en-US");
    if (spec === "decimal") return n.toFixed(2);
    return n.toLocaleString("en-US");
  }
  var UNSAFE_EXPR_RE = /\b(constructor|prototype|__proto__|__defineGetter__|__defineSetter__|__lookupGetter__|__lookupSetter__|eval|Function|function|import|require|process|globalThis|global|window|document|self|module|exports|arguments|this)\b/;
  function safeEval(expr, ctx) {
    try {
      if (!expr) return null;
      if (!/^[\s0-9a-zA-Z_\.\+\-\*\/\%\(\)\?\:\,\<\>\=\!\&\|\'"\$]+$/.test(expr)) return null;
      if (UNSAFE_EXPR_RE.test(expr)) return null;
      var fn = new Function("ctx", "Math", "has", "countSel", "with (ctx) { return (" + expr + "); }");
      var v = fn(ctx, Math,
        function has(arr, tag) { return Array.isArray(arr) && arr.indexOf(tag) !== -1; },
        function countSel(arr) { return Array.isArray(arr) ? arr.length : 0; }
      );
      if (typeof v === "number" && isFinite(v)) return v;
      if (typeof v === "boolean") return v;
      return null;
    } catch (_) { return null; }
  }
  function normalizeAnswer(q, raw) {
    if (raw == null || raw === "") return null;
    if (q.type === "likert") {
      // renderLikert stores the option INDEX (0-based), not a value. Map index -> score.
      var lidx = typeof raw === "number" ? raw : Number(raw);
      if (isNaN(lidx) || lidx < 0) return null;
      if (q.answers && q.answers[lidx] && typeof q.answers[lidx].score === "number") {
        var lmax = q.max_score;
        if (lmax == null) {
          var lopt = 0;
          for (var li = 0; li < q.answers.length; li++) {
            var lsc = q.answers[li] && q.answers[li].score;
            if (typeof lsc === "number" && lsc > lopt) lopt = lsc;
          }
          if (lopt > 0) lmax = lopt;
        }
        lmax = lmax || 5;
        return Math.max(0, Math.min(100, (q.answers[lidx].score / lmax) * 100));
      }
      // Default likert (no answers[]): options are 1..N at indices 0..N-1 -> value = index + 1
      var ldef = q.max_score || 5;
      return Math.max(0, Math.min(100, ((lidx + 1) / ldef) * 100));
    }
    if (q.type === "number") {
      if (q.normalize_formula) return safeEval(q.normalize_formula, { x: Number(raw) });
      var mn = q.min || 0, mx = q.max || 100;
      var pct = ((Number(raw) - mn) / (mx - mn)) * 100;
      if (q.invert) pct = 100 - pct;
      return Math.max(0, Math.min(100, pct));
    }
    if (q.type === "multi_select") {
      var selected = Array.isArray(raw) ? raw : [];
      var totalPossible = 0, got = 0;
      (q.answers || []).forEach(function (a) {
        var s = typeof a.score === "number" ? a.score : 0;
        if (s > 0) totalPossible += s;
        if (selected.indexOf(a.tag) !== -1) got += s;
      });
      if (totalPossible === 0) {
        var goodTags = q.good_tags || [];
        if (goodTags.length === 0) return selected.length > 0 ? 50 : 0;
        var hits = selected.filter(function (t) { return goodTags.indexOf(t) !== -1; }).length;
        return Math.min(100, (hits / goodTags.length) * 100);
      }
      return Math.max(0, Math.min(100, (got / totalPossible) * 100));
    }
    if (q.type === "short_text") {
      var text = String(raw || "").toLowerCase();
      var kw = q.score_keywords || {};
      var best = 0;
      if (kw.automated && kw.automated.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) best = Math.max(best, 95);
      else if (kw.semi && kw.semi.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) best = Math.max(best, 60);
      else if (kw.manual && kw.manual.some(function (k) { return text.indexOf(k.toLowerCase()) !== -1; })) best = Math.max(best, 20);
      return best || 50;
    }
    // Legacy fallback: untyped scored-choice question. `raw` is the option index
    // (v2's default renderLikert stores the index). Map option score to 0-100.
    var idx = typeof raw === "number" ? raw : Number(raw);
    if (!isNaN(idx) && q.answers && q.answers[idx] && typeof q.answers[idx].score === "number") {
      var maxScore = q.max_score;
      if (maxScore == null) {
        var optMax = 0;
        for (var oi = 0; oi < q.answers.length; oi++) {
          var osc = q.answers[oi] && q.answers[oi].score;
          if (typeof osc === "number" && osc > optMax) optMax = osc;
        }
        if (optMax > 0) maxScore = optMax;
      }
      maxScore = maxScore || 5;
      return Math.max(0, Math.min(100, (q.answers[idx].score / maxScore) * 100));
    }
    return null;
  }
  function computeResult(data, answers) {
    var ctx = {};
    (data.categories || []).forEach(function (cat) {
      (cat.questions || []).forEach(function (q) {
        ctx[q.id] = answers[q.id];
        ctx[q.id + "_score"] = normalizeAnswer(q, answers[q.id]);
      });
    });
    if (data.persona_selector) {
      var pAns = answers["__persona"];
      if (typeof pAns === "number" && data.persona_selector.answers && data.persona_selector.answers[pAns]) {
        ctx.persona = data.persona_selector.answers[pAns].tag || null;
      }
    }
    var perCategory = {};
    (data.categories || []).forEach(function (cat) {
      var key = cat.id || cat.name;
      if (cat.scoring_formula) {
        var v = safeEval(cat.scoring_formula, ctx);
        if (v != null) perCategory[key] = { name: cat.name || cat.id, score: Math.round(v), answered: (cat.questions || []).length, total: (cat.questions || []).length };
      } else {
        var total = 0, weight = 0;
        (cat.questions || []).forEach(function (q) {
          var s = ctx[q.id + "_score"];
          if (s == null) return;
          var w = q.weight || 1;
          total += s * w; weight += w;
        });
        if (weight > 0) perCategory[key] = { name: cat.name || cat.id, score: Math.round(total / weight), answered: (cat.questions || []).length, total: (cat.questions || []).length };
      }
    });
    var overall;
    if (data.overall_scoring_formula) {
      overall = Math.round(safeEval(data.overall_scoring_formula, Object.assign({}, ctx, Object.fromEntries(Object.entries(perCategory).map(function (e) { return [e[0] + "_score", e[1].score]; })))) || 0);
    } else {
      var scores = Object.values(perCategory).map(function (c) { return c.score; });
      overall = scores.length ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length) : 0;
    }
    var th = data.tier_thresholds || { low: 40, mid: 70 };
    var tier = overall <= th.low ? { name: th.low_label || "Critical", class: "low" }
             : overall <= th.mid ? { name: th.mid_label || "Growth Stage", class: "medium" }
             : { name: th.high_label || "Optimized", class: "" };
    var sorted = Object.entries(perCategory).sort(function (a, b) { return a[1].score - b[1].score; });
    var weakest = sorted.length ? { id: sorted[0][0], name: sorted[0][1].name, score: sorted[0][1].score } : null;
    var computed = {};
    (data.computed_outputs || []).forEach(function (co) {
      var v = safeEval(co.formula, Object.assign({}, ctx, { overall_score: overall, weakest_category: weakest && weakest.id }));
      computed[co.id] = { id: co.id, label: co.label, value: v, format: co.format, show: co.show_in_result !== false };
    });
    return { overall: overall, tier: tier, per_category: perCategory, weakest: weakest, persona: ctx.persona, ctx: ctx, computed: computed };
  }
  function shouldGate(data, captured, embedMode) {
    if (embedMode || captured) return false;
    if (data && (data.capture_gate === false || data.gate === false)) return false;
    return true;
  }
  return { fmt: fmt, safeEval: safeEval, normalizeAnswer: normalizeAnswer, computeResult: computeResult, shouldGate: shouldGate };
});
