/* Template engine — renders the Template LM format: hero + intro + stack-fit check
 * + static content + personalized-download block. Reads data.json which has a
 * `stack_questions` array and a `variants` map keyed on answer combos, plus
 * the usual title/subtitle/sections. */
(function () {
  "use strict";
  if (!window.LM) { console.error("shared.js not loaded"); return; }
  var L = window.LM;

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "template";  // required so edit mode can mount (shared.js waits for __lm_format + __lm_data)
    var slug = data.slug;
    var persisted = L.readKV("template", slug, "answers", {}) || {};
    var selected = Object.assign({}, persisted);
    var captured = !!L.readKV("template", slug, "email", null);

    root.className = "lmc-root lmt-root";
    root.innerHTML = "";
    root.appendChild(L.buildHero(data, {
      badge: (data.brand && data.brand.hero_badge) || "Template",
      metaChips: [
        (data.stack_questions || []).length + " stack inputs",
        (data.estimated_minutes || 5) + " min",
        "Personalized export"
      ]
    }));
    var heroH1 = root.querySelector(".lmc-h1");
    var heroSub = root.querySelector(".lmc-sub");
    var heroBadge = root.querySelector(".lmc-badge");
    if (L.editMode) {
      if (heroH1) L.editMode.registerField(heroH1, "title");
      if (heroSub) L.editMode.registerField(heroSub, "subtitle");
      // brand.hero_badge is a writable path even when data didn't supply it
      // (the rendered text is just the fallback "Template" in that case) —
      // register unconditionally, matching the other engines.
      if (heroBadge) L.editMode.registerField(heroBadge, "brand.hero_badge");
    }
    root.appendChild(L.buildIntro(data, ".lmt-stack", {
      tool_type: "template",
      defaultValueBullet: "Walk through 4 stack questions → get a personalized artifact export",
      defaultNextBullet: "Download gated by email; artifact generated client-side from your answers",
      startLabel: "Start the fit check",
      defaultNote: "Your answers auto-save in this browser."
    }));

    var main = L.make("main", { class: "lmc-container" });

    // Stack-fit questions
    var stackSection = L.make("section", { class: "lmt-stack", id: "lmt-stack" });
    var stackHeadline = data.stack_headline || "Match the template to your stack";
    stackSection.innerHTML = '<h2>' + L.esc(stackHeadline) + '</h2>' +
      '<p>' + L.esc(data.stack_subtitle || "Answer these so we tailor the downloadable artifact to your tools.") + '</p>';
    if (L.editMode) {
      // Both fall back to a literal default when absent from data — only
      // register when the data field actually drove the visible text.
      if (data.stack_headline) L.editMode.registerField(stackSection.querySelector("h2"), "stack_headline");
      if (data.stack_subtitle) L.editMode.registerField(stackSection.querySelector("p"), "stack_subtitle", { multiline: true });
    }
    (data.stack_questions || []).forEach(function (q, qIdx) {
      var block = L.make("div", { class: "lmt-question", "data-qid": q.id });
      var labelEl = L.make("span", { class: "lmt-q-label" }, L.esc(q.label || q.text || q.id));
      block.appendChild(labelEl);
      if (L.editMode) {
        // Register against whichever field actually supplied the visible
        // text. When it fell all the way back to q.id, skip — id is a
        // discriminator, not display copy.
        if (q.label) L.editMode.registerField(labelEl, "stack_questions[" + qIdx + "].label");
        else if (q.text) L.editMode.registerField(labelEl, "stack_questions[" + qIdx + "].text");
      }
      var opts = L.make("div", { class: "lmt-q-options", role: "radiogroup", "aria-label": q.label || q.id });
      (q.options || []).forEach(function (opt, oIdx) {
        var btn = L.make("button", {
          type: "button",
          class: "lmt-q-opt" + (selected[q.id] === opt.value ? " selected" : ""),
          role: "radio",
          "aria-checked": selected[q.id] === opt.value ? "true" : "false",
          "data-value": opt.value
        }, L.esc(opt.label || opt.value));
        // Only register when opt.label actually drove the text — when it
        // fell back to opt.value, that's the answer-discriminator, not copy.
        if (L.editMode && opt.label) L.editMode.registerField(btn, "stack_questions[" + qIdx + "].options[" + oIdx + "].label");
        opts.appendChild(btn);
      });
      if (L.editMode) L.editMode.registerArray(opts, "stack_questions[" + qIdx + "].options", {
        itemLabel: "option",
        template: { value: "new-option", label: "New option" }
      });
      block.appendChild(opts);
      stackSection.appendChild(block);
    });
    // NOTE: no registerArray for stack_questions itself — the question <div>s
    // are appended as siblings of the <h2>/<p> already inside stackSection
    // (no dedicated wrapper). Wrapping them would add a new container element
    // to every render (not gated by edit mode), which breaks the "rendered
    // DOM stays byte-identical outside edit mode" rule. Per-item fields above
    // still give full text coverage; only add/remove/reorder is unavailable
    // for this array without a markup change (flagged in the report).
    main.appendChild(stackSection);

    // Result (download) panel
    var result = L.make("section", { class: "lmt-result", id: "lmt-result", "aria-live": "polite" });
    result.innerHTML = '<h3>Your personalized template is <em>ready</em></h3>' +
      '<p id="lmt-result-note">Click to download. We\'ll swap the nodes/types to match your stack.</p>' +
      '<div class="lmt-download-wrap">' +
        '<button type="button" class="lmt-download" id="lmt-download">Download personalized artifact</button>' +
        '<span class="lmt-download-meta" id="lmt-download-meta"></span>' +
      '</div>';
    main.appendChild(result);

    // Email gate (shared CSS)
    var gate = L.make("section", { class: "lmc-capture", id: "lmt-capture" });
    gate.innerHTML = '<h2>Send the artifact <em>to your inbox</em></h2>' +
      '<p>We\'ll also include the 3 gotchas most teams hit when deploying this.</p>' +
      '<form class="lmc-form" id="lmt-form">' +
        '<label class="sr-only" for="lmt-email">Email</label>' +
        '<input class="lmc-input" type="email" id="lmt-email" autocomplete="email" required placeholder="you@company.com" />' +
        '<button class="lmc-btn" type="submit">Email me the artifact</button>' +
      '</form>' +
      '<p class="lmc-note">One email. Unsubscribe any time.</p>';
    main.appendChild(gate);

    // Static content (sections)
    if ((data.sections || []).length) {
      var body = L.make("section", { class: "lmt-content" });
      (data.sections || []).forEach(function (s, sIdx) {
        if (s.title) {
          var sh2 = L.make("h2", null, L.esc(s.title));
          body.appendChild(sh2);
          if (L.editMode) L.editMode.registerField(sh2, "sections[" + sIdx + "].title");
        }
        if (s.html) {
          var h = L.make("div");
          h.innerHTML = s.html;
          body.appendChild(h);
          if (L.editMode) L.editMode.registerField(h, "sections[" + sIdx + "].html", { contenteditable: true });
        } else if (s.text) {
          var sp = L.make("p", null, L.esc(s.text));
          body.appendChild(sp);
          if (L.editMode) L.editMode.registerField(sp, "sections[" + sIdx + "].text", { multiline: true });
        }
      });
      // NOTE: no registerArray for sections — a single item can emit up to
      // two sibling nodes (h2 + div/p) with no shared per-item wrapper, so
      // there's no 1:1 element-to-array-item mapping to hang add/remove/
      // reorder off without introducing new wrapper markup (see stack_questions
      // note above for why that's out of scope here).
      main.appendChild(body);
    }

    // Closing CTA — call-first finale (2026-06-09). The artifact email gate
    // above stays (it delivers a real attachment); this is the funnel exit.
    main.appendChild(L.buildClosingCta("template", data, { toolType: "template" }));

    root.appendChild(main);

    // State + wiring
    function allAnswered() {
      return (data.stack_questions || []).every(function (q) { return selected[q.id] != null; });
    }
    function refreshResult() {
      L.writeKV("template", slug, "answers", selected);
      root.classList.toggle("ready", allAnswered());
      var meta = document.getElementById("lmt-download-meta");
      if (meta) {
        var fragments = (data.stack_questions || []).map(function (q) {
          var opt = (q.options || []).find(function (o) { return o.value === selected[q.id]; });
          return opt ? (opt.short || opt.value) : null;
        }).filter(Boolean);
        meta.textContent = fragments.length ? fragments.join(" · ") : "";
      }
    }
    refreshResult();

    // Tri-option click
    stackSection.querySelectorAll(".lmt-q-opt").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var qid = btn.closest(".lmt-question").getAttribute("data-qid");
        var val = btn.getAttribute("data-value");
        selected[qid] = val;
        // Re-sync all options in this question
        btn.closest(".lmt-q-options").querySelectorAll(".lmt-q-opt").forEach(function (b) {
          var isMe = b === btn;
          b.classList.toggle("selected", isMe);
          b.setAttribute("aria-checked", isMe ? "true" : "false");
        });
        refreshResult();
        L.beacon("template", "stack_answer", { answers: { qid: qid, value: val } });
      });
    });

    // Download
    function buildArtifact() {
      // Produce a personalized artifact by substituting selected answers into the base template.
      var base = (data.artifact && data.artifact.base) || {};
      var variants = (data.artifact && data.artifact.variants) || {};
      // Start with a deep clone of the base
      var artifact = JSON.parse(JSON.stringify(base));
      // Apply each selected answer's variant patch in order
      Object.keys(selected).forEach(function (qid) {
        var key = qid + "." + selected[qid];
        var patch = variants[key];
        if (!patch) return;
        // Shallow-merge — for nested patches, caller passes full subtree
        Object.keys(patch).forEach(function (k) { artifact[k] = patch[k]; });
      });
      // Attribution footer
      artifact.__source = "Ivan Manfredi · " + (data.title || "Template") + " · " + location.href;
      artifact.__personalized_for = selected;
      return artifact;
    }
    function downloadArtifact() {
      if (!allAnswered()) { L.toast("Answer all stack questions first"); return; }
      if (!captured) { L.toast("Enter your email to unlock"); document.getElementById("lmt-email").focus(); return; }
      var artifact = buildArtifact();
      var blob = new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var fname = (slug || "template") + "--" + Object.values(selected).join("-") + ".json";
      var a = document.createElement("a");
      a.href = url; a.download = fname; a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      L.beacon("template", "download", { answers: { file: fname, stack: selected } });
      L.toast("Downloaded. Setup steps on their way to your inbox.");
    }
    var downloadBtn = document.getElementById("lmt-download");
    if (downloadBtn) downloadBtn.addEventListener("click", downloadArtifact);

    // Email gate
    var form = document.getElementById("lmt-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var em = (document.getElementById("lmt-email") || {}).value || "";
        if (!L.emailIsValid(em)) { L.toast("Enter a valid email"); return; }
        L.writeKV("template", slug, "email", em);
        L.updateReader({ email: em });
        captured = true;
        L.beacon("template", "capture", { email: em, answers: { stack: selected } });
        form.innerHTML = '<p style="font-weight:700;color:var(--accent-light)">&#10003; Sent. Downloading your artifact now.</p>';
        setTimeout(downloadArtifact, 400);
      });
    }

    L.beacon("template", "view");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-lm-template-src]") || document.querySelector("#lmc-root");
    if (!root) return;
    var src = root.getAttribute("data-lm-template-src") || "./data.json";
    fetch(src, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); })
      .then(function (data) { render(data, root); window.__lm_rerender = function(){ render(window.__lm_data, root); }; })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading template:</strong> ' + L.esc(e.message) + '</div>';
      });
  });
})();
