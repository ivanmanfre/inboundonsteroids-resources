/* LM AI Walkthrough Engine — vanilla JS IIFE.
 * Reads data.json, renders textarea + Run button, streams Claude via the
 * Supabase Edge proxy (lm-walkthrough-proxy), parses incremental JSON, and
 * paints verdict pills as each step boundary closes.
 *
 * Contract: mounts into the first element matching [data-lm-walkthrough-src]
 * or falls back to #lmw-root. Reads runtime knobs from `window.__lm_*` globals
 * (see demo/ai-walkthrough/index.html for required ones).
 */
(function () {
  "use strict";

  var TOOL_TYPE = "ai-walkthrough";
  var PROXY_URL = window.__lm_walkthrough_proxy_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-walkthrough-proxy";

  var LM = window.LM || {};
  function make(t, a, h) {
    if (LM.make) return LM.make(t, a, h);
    var e = document.createElement(t);
    if (a) for (var k in a) {
      if (k === "class") e.className = a[k];
      else e.setAttribute(k, a[k]);
    }
    if (h !== undefined) e.innerHTML = h;
    return e;
  }
  function esc(s) {
    if (LM.esc) return LM.esc(s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function beacon(event, extra) {
    if (LM.beacon) LM.beacon(TOOL_TYPE, event, extra || {});
  }
  function readKV(suf, fallback) {
    if (LM.readKV) return LM.readKV(TOOL_TYPE, window.__lm_slug, suf, fallback);
    try {
      var v = localStorage.getItem("lmw:" + window.__lm_slug + ":" + suf);
      return v == null ? fallback : (function () { try { return JSON.parse(v); } catch (_) { return v; } })();
    } catch (_) { return fallback; }
  }
  function writeKV(suf, val) {
    if (LM.writeKV) LM.writeKV(TOOL_TYPE, window.__lm_slug, suf, val);
    else { try { localStorage.setItem("lmw:" + window.__lm_slug + ":" + suf, typeof val === "string" ? val : JSON.stringify(val)); } catch (_) {} }
  }
  function emailIsValid(v) {
    if (LM.emailIsValid) return LM.emailIsValid(v);
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || "").trim());
  }

  // ── CTA gating (same eval pattern as checklist/calculator engines) ────────
  function evalWhen(expr, ctx) {
    try {
      var allowed = /^[\s0-9a-zA-Z_\.\+\-\*\/\%\(\)\?\:\,\<\>\=\!\&\|\"\']+$/;
      if (!allowed.test(expr)) return false;
      var fn = new Function("ctx", "Math", "with (ctx) { return (" + expr + "); }");
      return !!fn(ctx, Math);
    } catch (_) { return false; }
  }
  function pickCta(data, ctx) {
    if (!Array.isArray(data.ctas) || !data.ctas.length) return null;
    for (var i = 0; i < data.ctas.length; i++) {
      var c = data.ctas[i];
      if (c && c.when) { if (evalWhen(c.when, ctx)) return c; }
    }
    return data.ctas[data.ctas.length - 1] || null;
  }
  function countSteps(text) {
    return (text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 1; }).length;
  }

  // ── Initial render ───────────────────────────────────────────────────────
  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "ai-walkthrough";
    root.innerHTML = "";

    var hero = make("section", { class: "lmw-hero" });
    var badgeEl = make("div", { class: "lmw-badge" }, esc((data.brand && data.brand.hero_badge) || "Live AI Analysis"));
    if (window.LM && window.LM.editMode && window.LM.editMode.registerField) {
      window.LM.editMode.registerField(badgeEl, "brand.hero_badge");
    }
    hero.appendChild(badgeEl);
    var titleEl = make("h1", { class: "lmw-h1" });
    titleEl.innerHTML = (window.LM && window.LM.italicizePivot) ? window.LM.italicizePivot(data.title || "") : esc(data.title || "");
    if (LM.editMode && LM.editMode.registerField) LM.editMode.registerField(titleEl, "title", { type: "text" });
    hero.appendChild(titleEl);
    if (data.subtitle) {
      var subEl = make("p", { class: "lmw-sub" }, esc(data.subtitle));
      if (LM.editMode && LM.editMode.registerField) LM.editMode.registerField(subEl, "subtitle", { type: "text" });
      hero.appendChild(subEl);
    }
    root.appendChild(hero);

    var inputWrap = make("section", { class: "lmw-input-wrap" });
    var ta = make("textarea", {
      class: "lmw-textarea",
      id: "lmw-textarea",
      placeholder: (data.input && data.input.placeholder) || "",
    });
    inputWrap.appendChild(ta);
    // Editable placeholder — exposed via a sibling hidden span so the inline
    // editor can target the text without colliding with the textarea's input.
    if (window.LM && window.LM.editMode && window.LM.editMode.registerField) {
      var placeholderProxy = make("div", { class: "lmw-edit-only", style: "display:none" }, esc(ta.placeholder));
      window.LM.editMode.registerField(placeholderProxy, "input.placeholder", { multiline: true });
      inputWrap.appendChild(placeholderProxy);
    }
    var metaRow = make("div", { class: "lmw-meta-row" });
    var cnt = make("span", { class: "lmw-step-count", id: "lmw-step-count" }, "0 steps");
    var hint = make("span", null, "Min " + ((data.input && data.input.min_steps) || 3) + " · Max " + ((data.input && data.input.max_steps) || 20));
    metaRow.appendChild(cnt); metaRow.appendChild(hint);
    inputWrap.appendChild(metaRow);
    var runBtn = make("button", { class: "lmw-run-btn", id: "lmw-run-btn", type: "button", disabled: "disabled" }, "Run analysis");
    inputWrap.appendChild(runBtn);
    // Expose the ClickUp page id to the editor for editing the prompt source.
    if (LM.editMode && LM.editMode.registerField) {
      var hidden = make("div", { class: "lmw-clickup-ref", style: "display:none" }, esc(data.system_prompt_clickup_page_id || ""));
      LM.editMode.registerField(hidden, "system_prompt_clickup_page_id", { type: "text", label: "ClickUp prompt page ID" });
      inputWrap.appendChild(hidden);
    }
    root.appendChild(inputWrap);

    var progLabel = make("div", { class: "lmw-progress-label", id: "lmw-progress-label", style: "display:none" });
    root.appendChild(progLabel);
    var summaryEl = make("div", { class: "lmw-summary", id: "lmw-summary", style: "display:none" });
    root.appendChild(summaryEl);
    var stepsEl = make("div", { class: "lmw-steps", id: "lmw-steps" });
    root.appendChild(stepsEl);
    var quickEl = make("div", { id: "lmw-quickwins-wrap" });
    root.appendChild(quickEl);
    var ctaEl = make("div", { id: "lmw-cta" });
    root.appendChild(ctaEl);
    var errEl = make("div", { id: "lmw-error" });
    root.appendChild(errEl);

    function refreshCount() {
      var n = countSteps(ta.value);
      var min = (data.input && data.input.min_steps) || 3;
      var max = (data.input && data.input.max_steps) || 20;
      cnt.textContent = n + " step" + (n === 1 ? "" : "s");
      cnt.classList.toggle("invalid", n > 0 && (n < min || n > max));
      runBtn.disabled = !(n >= min && n <= max);
    }
    ta.addEventListener("input", refreshCount);
    refreshCount();

    runBtn.addEventListener("click", function () { runAnalysis(data, ta.value); });

    beacon("view", {});
  }

  // ── Error / clear helpers ────────────────────────────────────────────────
  function setError(msg) {
    var e = document.getElementById("lmw-error");
    if (e) e.innerHTML = '<div class="lmw-error">' + esc(msg) + '</div>';
  }
  function clearError() { var e = document.getElementById("lmw-error"); if (e) e.innerHTML = ""; }

  // ── Email gate (1 free per session) ──────────────────────────────────────
  function gateRequiresEmail() {
    var runs = readKV("runs", 0) || 0;
    var email = readKV("email", "");
    return runs >= 1 && !email;
  }
  function bumpRunCount() { writeKV("runs", (readKV("runs", 0) || 0) + 1); }
  function promptForEmail() {
    return new Promise(function (resolve) {
      var modal = make("div", { class: "lmw-gate-modal" });
      var card = make("div", { class: "lmw-gate-card" });
      card.innerHTML =
        '<h3>One more run is on me</h3>' +
        '<p>Drop your email and I\'ll send the next analysis to your inbox too. You can rerun anytime in the next 24h.</p>' +
        '<input type="email" id="lmw-gate-email" placeholder="you@company.com" autocomplete="email" />';
      var btn = make("button", { class: "lmw-cta-btn", type: "button" }, "Run analysis");
      btn.style.cursor = "pointer";
      btn.style.border = "1px solid #131210";
      card.appendChild(btn);
      modal.appendChild(card);
      document.body.appendChild(modal);
      var input = card.querySelector("#lmw-gate-email");
      setTimeout(function () { if (input) input.focus(); }, 30);
      btn.addEventListener("click", function () {
        var v = (input && input.value) || "";
        if (!emailIsValid(v)) { if (input) input.style.borderColor = "#6B675E"; return; }
        writeKV("email", v.trim().toLowerCase());
        beacon("capture", { email: v.trim().toLowerCase() });
        document.body.removeChild(modal);
        resolve(v);
      });
      input && input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); btn.click(); } });
    });
  }

  // ── Incremental "JSON-ish" parser ────────────────────────────────────────
  // Scans the partial assistant text for completed `{...}` blocks inside the
  // "steps": [ ... ] array. Never requires the full document to be valid.
  function extractCompletedSteps(buffer) {
    var stepsIdx = buffer.indexOf('"steps"');
    if (stepsIdx < 0) return { steps: [], summary: extractSummary(buffer), done: false };
    var arrStart = buffer.indexOf("[", stepsIdx);
    if (arrStart < 0) return { steps: [], summary: extractSummary(buffer), done: false };
    var i = arrStart + 1, depth = 0, inStr = false, escNext = false, objStart = -1, completed = [];
    for (; i < buffer.length; i++) {
      var ch = buffer[i];
      if (escNext) { escNext = false; continue; }
      if (inStr) {
        if (ch === "\\") escNext = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === "{") { if (depth === 0) objStart = i; depth++; }
      else if (ch === "}") {
        depth--;
        if (depth === 0 && objStart >= 0) {
          try { completed.push(JSON.parse(buffer.slice(objStart, i + 1))); } catch (_) {}
          objStart = -1;
        }
      } else if (ch === "]" && depth === 0) {
        return { steps: completed, summary: extractSummary(buffer), done: true, after: buffer.slice(i + 1) };
      }
    }
    return { steps: completed, summary: extractSummary(buffer), done: false };
  }
  function extractSummary(buffer) {
    var m = buffer.match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    if (!m) return "";
    try { return JSON.parse('"' + m[1] + '"'); } catch (_) { return m[1]; }
  }
  function extractQuickWins(buffer) {
    var idx = buffer.indexOf('"top_3_quick_wins"');
    if (idx < 0) return [];
    var arrStart = buffer.indexOf("[", idx);
    if (arrStart < 0) return [];
    // Find matching closing bracket respecting string state
    var i = arrStart + 1, inStr = false, escNext = false;
    for (; i < buffer.length; i++) {
      var ch = buffer[i];
      if (escNext) { escNext = false; continue; }
      if (inStr) {
        if (ch === "\\") escNext = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === "]") {
        try { return JSON.parse(buffer.slice(arrStart, i + 1)); } catch (_) { return []; }
      }
    }
    return [];
  }

  // ── Painters ─────────────────────────────────────────────────────────────
  function renderStepRow(s, idx) {
    var data = window.__lm_data || {};
    var colors = (data.render && data.render.verdict_colors) || { automate_now: "green", automate_later: "amber", keep_human: "gray" };
    var labels = (data.render && data.render.verdict_labels) || { automate_now: "Automate now", automate_later: "Automate later", keep_human: "Keep human" };
    var row = make("div", { class: "lmw-step", "data-idx": String(idx) });
    var head = make("div", { class: "lmw-step-head" });
    head.appendChild(make("div", { class: "lmw-step-text" }, esc(s.step || "")));
    head.appendChild(make("span", { class: "lmw-pill " + (colors[s.verdict] || "gray") }, esc(labels[s.verdict] || s.verdict || "—")));
    row.appendChild(head);
    if (s.reasoning) row.appendChild(make("p", { class: "lmw-step-reason" }, esc(s.reasoning)));
    if (Array.isArray(s.tools) && s.tools.length) {
      var tw = make("div", { class: "lmw-step-tools" });
      s.tools.forEach(function (t) { tw.appendChild(make("span", { class: "lmw-tool-chip" }, esc(t))); });
      row.appendChild(tw);
    }
    return row;
  }
  function renderSkeleton(idx, originalStep) {
    var row = make("div", { class: "lmw-step skeleton", "data-idx": String(idx) });
    var head = make("div", { class: "lmw-step-head" });
    head.appendChild(make("div", { class: "lmw-step-text" }, esc(originalStep || "Step " + (idx + 1))));
    head.appendChild(make("span", { class: "lmw-pill gray" }, "Analyzing"));
    row.appendChild(head);
    row.appendChild(make("p", { class: "lmw-step-reason" }, "Thinking..."));
    return row;
  }
  function paintSteps(parsedSteps, totalExpected, userSteps) {
    var host = document.getElementById("lmw-steps");
    if (!host) return;
    if (!host.__skeletoned) {
      host.innerHTML = "";
      for (var i = 0; i < totalExpected; i++) host.appendChild(renderSkeleton(i, userSteps[i]));
      host.__skeletoned = true;
    }
    parsedSteps.forEach(function (s, idx) {
      var existing = host.querySelector('[data-idx="' + idx + '"]');
      if (!existing || !existing.classList.contains("skeleton")) return;
      var fresh = renderStepRow(s, idx);
      existing.replaceWith(fresh);
    });
  }
  function paintSummary(text) {
    var el = document.getElementById("lmw-summary");
    if (!el) return;
    el.style.display = "block";
    el.classList.add("typing");
    el.textContent = text;
  }
  function finalizeSummary() {
    var el = document.getElementById("lmw-summary");
    if (el) el.classList.remove("typing");
  }
  function paintQuickWins(wins) {
    var wrap = document.getElementById("lmw-quickwins-wrap");
    if (!wrap || !wins || !wins.length) return;
    wrap.innerHTML =
      '<div class="lmw-quickwins"><h3>Top <em>3 quick wins</em></h3><ol>' +
      wins.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") +
      "</ol></div>";
  }
  function paintCta(parsed) {
    var data = window.__lm_data || {};
    var counts = { automate_now: 0, automate_later: 0, keep_human: 0 };
    parsed.steps.forEach(function (s) { if (counts[s.verdict] != null) counts[s.verdict]++; });
    var ctx = {
      automate_now_count: counts.automate_now,
      automate_later_count: counts.automate_later,
      keep_human_count: counts.keep_human,
      total_steps: parsed.steps.length,
    };
    var picked = pickCta(data, ctx);
    var host = document.getElementById("lmw-cta");
    if (!host || !picked || !picked.url) return;
    host.innerHTML =
      '<section class="lmw-cta-card" data-cta-id="' + esc(picked.id || "fallback") + '">' +
        '<h3>' + esc(picked.headline || "") + '</h3>' +
        (picked.description ? '<p>' + esc(picked.description) + '</p>' : '') +
        '<a class="lmw-cta-btn" href="' + esc((window.LM && window.LM.normalizeCtaUrl) ? window.LM.normalizeCtaUrl(picked.url, "closing-cta") : picked.url) + '" target="_blank" rel="noopener">' + esc(picked.button || "Learn more") + '</a>' +
      '</section>';
    var a = host.querySelector("a.lmw-cta-btn");
    if (a && !a.__bound) {
      a.__bound = true;
      a.addEventListener("click", function () { beacon("cta_click", { cta_id: picked.id, ctx: ctx }); });
    }
  }

  // ── Run + stream ─────────────────────────────────────────────────────────
  function runAnalysis(data, userInput) {
    clearError();
    if (gateRequiresEmail()) {
      return promptForEmail().then(function () { runAnalysis(data, userInput); });
    }
    var btn = document.getElementById("lmw-run-btn");
    if (btn) { btn.disabled = true; btn.textContent = "Analyzing..."; }
    var label = document.getElementById("lmw-progress-label");
    if (label) { label.style.display = "inline-flex"; label.textContent = "Analyzing step 1…"; }

    var userSteps = userInput.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 1; });
    var host = document.getElementById("lmw-steps");
    if (host) host.__skeletoned = false;
    paintSteps([], userSteps.length, userSteps);

    var email = readKV("email", "");
    var payload = {
      slug: data.slug,
      user_input: userInput,
      system_prompt: data.system_prompt,
      model: data.model || "claude-sonnet-4-6",
      max_tokens: data.max_tokens || 2000,
      email: email || undefined,
    };

    beacon("analysis_run", { steps_in: userSteps.length });

    fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify(payload),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (j) { throw new Error(j.error || "request_failed"); }, function () { throw new Error("request_failed"); });
      }
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var buffer = "";
      var jsonText = "";
      var streamErrored = false;
      bumpRunCount();

      function pump() {
        return reader.read().then(function (chunk) {
          if (chunk.done) return finish();
          buffer += decoder.decode(chunk.value, { stream: true });
          var parts = buffer.split(/\n\n/);
          buffer = parts.pop();
          parts.forEach(function (evt) {
            evt.split(/\n/).forEach(function (line) {
              if (!line.startsWith("data: ")) return;
              var payloadStr = line.slice(6);
              if (payloadStr === "[DONE]") return;
              try {
                var msg = JSON.parse(payloadStr);
                if (msg.type === "content_block_delta" && msg.delta && msg.delta.type === "text_delta") {
                  jsonText += msg.delta.text;
                  onText(jsonText, userSteps);
                } else if (msg.type === "error") {
                  streamErrored = true;
                  setError("Upstream error: " + ((msg.error && msg.error.message) || "unknown") + ". Try again shortly.");
                  beacon("analysis_run", { error: msg.error && msg.error.message });
                }
              } catch (_) {}
            });
          });
          return pump();
        });
      }

      function finish() {
        finalizeSummary();
        if (label) label.style.display = "none";
        if (btn) { btn.disabled = false; btn.textContent = "Run again"; }
        if (streamErrored) return;
        var parsed = extractCompletedSteps(jsonText);
        if (!parsed.steps.length && !parsed.summary) {
          // Nothing parseable came back — surface error.
          setError("No analysis returned. Try again in a minute.");
          beacon("analysis_run", { error: "empty_response" });
          return;
        }
        paintSteps(parsed.steps, userSteps.length, userSteps);
        paintQuickWins(extractQuickWins(jsonText));
        paintCta(parsed);
        beacon("analysis_run", { complete: true, steps_out: parsed.steps.length });
      }

      return pump();
    }).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = "Run analysis"; }
      if (label) label.style.display = "none";
      var msg = (err && err.message) || "Something went wrong";
      if (msg === "quota_hit") { beacon("quota_hit", {}); setError("You've hit the free limit. Try again in 24h or book a call."); }
      else if (msg === "classifier_blocked") setError("That input couldn't be analyzed. Try paraphrasing as plain process steps.");
      else if (msg === "payload_too_large") setError("Input is too long. Trim to under 4KB.");
      else if (msg === "ip_rate_limit") setError("Too many requests from your network. Try again in an hour.");
      else setError("Analysis failed — please retry in a moment.");
    });
  }

  function onText(jsonText, userSteps) {
    var parsed = extractCompletedSteps(jsonText);
    if (parsed.summary) paintSummary(parsed.summary);
    paintSteps(parsed.steps, userSteps.length, userSteps);
    var label = document.getElementById("lmw-progress-label");
    if (label) label.textContent = "Analyzing step " + Math.min(parsed.steps.length + 1, userSteps.length) + " of " + userSteps.length + "…";
  }

  // ── Bootstrap ────────────────────────────────────────────────────────────
  function init() {
    var root = document.getElementById("lmw-root") || document.querySelector("[data-lm-walkthrough-src]");
    if (!root) return;
    var src = root.getAttribute("data-lm-walkthrough-src") || "./data.json";
    fetch(src, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); })
      .then(function (data) { render(data, root); window.__lm_rerender = function(){ render(window.__lm_data, root); }; })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading walkthrough:</strong> ' + esc(e.message) + '</div>';
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // For tests / introspection.
  window.__lmw_render = render;
})();
