/* LM Checklist Engine — vanilla JS, reads data.json, persists to localStorage, email-gated capture, beacon-integrated */
(function () {
  "use strict";
  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function make(tag, attrs, html) { var e = document.createElement(tag); if (attrs) for (var k in attrs) { if (k === "class") e.className = attrs[k]; else e.setAttribute(k, attrs[k]); } if (html !== undefined) e.innerHTML = html; return e; }
  function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]; }); }

  function toast(msg) {
    var t = $("#lmc-toast");
    if (!t) { t = make("div", { id: "lmc-toast", class: "lmc-toast" }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2500);
  }

  function beacon(event_type, payload) {
    // Edit mode active → no-op (mitigation #6)
    // Sync URL check catches the race where async token validation hasn't resolved yet
    try {
      if (new URLSearchParams(location.search).get("edit")) return;
      if (window.LM && window.LM.editMode && window.LM.editMode.enabled && window.LM.editMode.enabled()) return;
    } catch (_) {}
    try {
      var q = new URLSearchParams(location.search);
      var body = Object.assign({
        event_type: event_type,
        lm_slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || "",
        src: q.get("src") || "direct",
        utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign"), term: q.get("utm_term"), content: q.get("utm_content") },
        prospect_id: q.get("pid") || null,
        referrer: document.referrer || ""
      }, payload || {});
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON, new Blob([JSON.stringify(body)], { type: "application/json" }));
      } else {
        fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
      }
    } catch (_) {}
  }

  function loadState(slug) { try { return JSON.parse(localStorage.getItem("ivan.checklist." + slug) || "{}"); } catch (_) { return {}; } }
  function saveState(slug, state) { try { localStorage.setItem("ivan.checklist." + slug + ".checked", JSON.stringify(state.checked || {})); localStorage.setItem("ivan.checklist." + slug + ".email", state.email || ""); } catch (_) {} }
  function readState(slug) {
    var checked = {}; var email = "";
    try { checked = JSON.parse(localStorage.getItem("ivan.checklist." + slug + ".checked") || "{}"); } catch (_) {}
    try { email = localStorage.getItem("ivan.checklist." + slug + ".email") || ""; } catch (_) {}
    return { checked: checked, email: email };
  }

  // D1.1: Section progress ring SVG. Sage stroke arcs around a hairline circle.
  // pct = 0..100. Used both for initial render and update().
  function ringSvg(pct) {
    var circ = 2 * Math.PI * 9;
    var offset = circ - (Math.max(0, Math.min(100, pct)) / 100) * circ;
    return '<svg class="lmc-section-ring-svg" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9" fill="none" stroke="rgba(19, 18, 16,0.15)" stroke-width="2.5" />' +
      '<circle cx="12" cy="12" r="9" fill="none" stroke="#131210" stroke-width="2.5" stroke-linecap="round" ' +
        'stroke-dasharray="' + circ.toFixed(2) + '" stroke-dashoffset="' + offset.toFixed(2) + '" ' +
        'transform="rotate(-90 12 12)" />' +
      '</svg>';
  }

  // E4 (2026-05-20): split a section title on em/en/hyphen-dash.
  // Returns { label, question }. Used to render section heads as
  // mono-uppercase label + DM Serif italic-pivot question.
  function splitTitle(t) {
    var s = String(t || "");
    // Match " — ", " – ", " - " (with spaces around the dash)
    var m = s.split(/\s+[—–\-]\s+/);
    if (m.length >= 2) {
      return { label: m[0].trim(), question: m.slice(1).join(" — ").trim() };
    }
    return { label: "", question: s.trim() };
  }

  // E4: auto-italicize the last meaningful word of a question.
  // E.g. "Can an agent actually read your intake?" → "Can an agent actually read your <em>intake</em>?"
  // Stays out of the way if the title already contains <em>.
  function buildItalicizedTitle(text) {
    var t = String(text || "");
    if (/<em\b|<i\b/i.test(t)) return t; // respect existing markup
    var esc = escapeHtml(t);
    // Match the last word (optionally followed by ? . ! :) at end of string
    var pivot = esc.match(/([A-Za-z][\w'\-]*)([?.!:]*)$/);
    if (!pivot) return esc;
    var word = pivot[1];
    var trailing = pivot[2] || "";
    // Skip if the last word is a short filler (e.g. "the", "a", "of", "is")
    var fillers = ["the","a","an","of","is","it","to","in","on","at","or","and","but"];
    if (fillers.indexOf(word.toLowerCase()) !== -1) return esc;
    return esc.slice(0, -1 * (word.length + trailing.length)) + "<em>" + word + "</em>" + trailing;
  }

  // D1.3: Lazy-load canvas-confetti from CDN on first 100% trigger.
  // Resolves to null on network failure so the celebration panel still appears.
  var _confettiLoading = null;
  function loadConfetti() {
    if (window.confetti) return Promise.resolve(window.confetti);
    if (_confettiLoading) return _confettiLoading;
    _confettiLoading = new Promise(function (resolve) {
      var s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js";
      s.onload = function () { resolve(window.confetti || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return _confettiLoading;
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
    var introPara = make("p", { class: "lmc-intro-p" }, escapeHtml(welcomeLine));
    if (window.LM && window.LM.editMode) window.LM.editMode.registerField(introPara, "intro.paragraph", { multiline: true });
    body.appendChild(introPara);
    var ul = make("ul", { class: "lmc-intro-points" });
    var introPointPaths = ["intro.point_time", "intro.point_value", "intro.point_next"];
    [["a", "\u23F1", pointA], ["b", "\u2192", pointB], ["c", "\u2713", pointC]].forEach(function (p, ix) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0], "aria-hidden": "true" }, p[1]));
      var pointSpan = make("span", null, escapeHtml(p[2]));
      if (window.LM && window.LM.editMode) window.LM.editMode.registerField(pointSpan, introPointPaths[ix], { multiline: true });
      li.appendChild(pointSpan);
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
    if (note) {
      var noteEl = make("p", { class: "lmc-intro-note" }, escapeHtml(note));
      if (window.LM && window.LM.editMode) window.LM.editMode.registerField(noteEl, "intro.note", { multiline: true });
      body.appendChild(noteEl);
    }
    inner.appendChild(img);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "checklist";
    if (window.LM && window.LM.tracker) window.LM.tracker.touch(data);
    var state = readState(data.slug);
    root.innerHTML = "";

    // Hero
    var hero = make("section", { class: "lmc-hero" });
    var heroInner = make("div", { class: "lmc-container" });
    var badgeEl = make("div", { class: "lmc-badge" }, escapeHtml(data.brand && data.brand.hero_badge || "Action Checklist"));
    if (window.LM && window.LM.editMode) window.LM.editMode.registerField(badgeEl, "brand.hero_badge");
    heroInner.appendChild(badgeEl);
    var h1 = make("h1", { class: "lmc-h1" });
    h1.innerHTML = buildItalicizedTitle(data.title || "Checklist");
    if (window.LM && window.LM.editMode) window.LM.editMode.registerField(h1, "title");
    heroInner.appendChild(h1);
    if (data.subtitle) {
      var sub = make("p", { class: "lmc-sub" }, escapeHtml(data.subtitle));
      if (window.LM && window.LM.editMode) window.LM.editMode.registerField(sub, "subtitle");
      heroInner.appendChild(sub);
    }
    var meta = make("div", { class: "lmc-meta" });
    var total = 0; (data.sections || []).forEach(function (s) { total += (s.items || []).length; });
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, total + " items"));
    if (data.estimated_minutes) meta.appendChild(make("div", { class: "lmc-meta-chip" }, data.estimated_minutes + " min"));
    meta.appendChild(make("div", { class: "lmc-meta-chip" }, "Auto-saves"));
    heroInner.appendChild(meta);
    hero.appendChild(heroInner);
    root.appendChild(hero);

    var introSection = buildIntro(data, ".lmc-progress-wrap", {
      defaultValueBullet: "Built to find the 3 highest-impact gaps in about 30 min",
      defaultNextBullet: "Email only if you want a tailored follow-up with the gaps you didn't check",
      startLabel: "Start the checklist",
      defaultNote: "No signup to use it. Check items off; progress auto-saves in this browser."
    });
    root.appendChild(introSection);

    var sections = data.sections || [];

    // Sections — always open, editorial layout (no accordion)
    var content = make("main", { class: "lmc-container" });
    sections.forEach(function (s, sIdx) {
      var sid = s.id || ("section-" + sIdx);
      var sec = make("section", { class: "lmc-section", id: "sec-" + sid, "data-section-id": sid });

      var head = make("div", { class: "lmc-section-head" });
      head.appendChild(make("span", { class: "lmc-section-num", "aria-hidden": "true" }, (sIdx + 1 < 10 ? "0" : "") + (sIdx + 1)));

      var stack = make("div", { class: "lmc-section-title-stack" });
      var split = splitTitle(s.title || "");
      if (split.label) {
        stack.appendChild(make("span", { class: "lmc-section-title-line label" }, escapeHtml(split.label)));
      }
      var secTitle = make("h2", { class: "lmc-section-title" });
      secTitle.innerHTML = buildItalicizedTitle(split.question || s.title || "");
      if (window.LM && window.LM.editMode) window.LM.editMode.registerField(secTitle, "sections[" + sIdx + "].title");
      stack.appendChild(secTitle);
      if (s.description) {
        var secDesc = make("p", { class: "lmc-section-desc" }, escapeHtml(s.description));
        if (window.LM && window.LM.editMode) window.LM.editMode.registerField(secDesc, "sections[" + sIdx + "].description");
        stack.appendChild(secDesc);
      }
      head.appendChild(stack);
      sec.appendChild(head);

      var sectionBody = make("div", { class: "lmc-section-body" });
      var itemsContainer = make("div", { class: "lmc-items-container" });
      (s.items || []).forEach(function (it, iIdx) {
        var row = make("div", { class: "lmc-item" + (state.checked[it.id] ? " checked" : "") });
        row.setAttribute("data-item-id", it.id);
        var box = make("button", { class: "lmc-checkbox" + (state.checked[it.id] ? " checked" : ""), type: "button", role: "checkbox", "aria-checked": state.checked[it.id] ? "true" : "false", "aria-label": "Toggle: " + (it.text || "item") });
        box.innerHTML = state.checked[it.id] ? "&#10003;" : "";
        var txt = make("div", { class: "lmc-text" });
        var textSpan = make("span", null, escapeHtml(it.text || ""));
        if (window.LM && window.LM.editMode) window.LM.editMode.registerField(textSpan, "sections[" + sIdx + "].items[" + iIdx + "].text", { multiline: true });
        txt.appendChild(textSpan);
        if (it.tip) {
          var tipSpan = make("span", { class: "lmc-tip" }, escapeHtml(it.tip));
          if (window.LM && window.LM.editMode) window.LM.editMode.registerField(tipSpan, "sections[" + sIdx + "].items[" + iIdx + "].tip");
          txt.appendChild(tipSpan);
        }
        if (it.impact) {
          var imp = make("span", { class: "lmc-impact lmc-impact-" + it.impact }, (it.impact || "").toUpperCase() + " IMPACT");
          if (window.LM && window.LM.editMode) window.LM.editMode.registerField(imp, "sections[" + sIdx + "].items[" + iIdx + "].impact", { locked: true });
          txt.appendChild(imp);
        }
        row.appendChild(box); row.appendChild(txt);
        itemsContainer.appendChild(row);
      });
      if (window.LM && window.LM.editMode) window.LM.editMode.registerArray(itemsContainer, "sections[" + sIdx + "].items", {
        itemLabel: "checklist item",
        template: { id: "", text: "New item" },
      });
      sectionBody.appendChild(itemsContainer);
      sec.appendChild(sectionBody);
      content.appendChild(sec);

      // E3: mid-scroll CTA injected after first section (~25-30% scroll for 4-section page)
      if (sIdx === 0 && sections.length >= 3) {
        // Mid-flow CTA copy. Avoid the AI "X, not Y" contrast tell — direct invitation only.
        var midCtaCopy = (data.completion_cta && data.completion_cta.mid_headline) ||
          "I build AI ops systems for service businesses. <em>Yours</em> next?";
        var midCta = make("aside", { class: "lmc-mid-cta", role: "complementary" });
        midCta.innerHTML =
          '<p class="lmc-mid-cta-text">' + midCtaCopy + '</p>' +
          '<a class="lmc-btn lmc-mid-cta-btn" href="' + (window.LM && window.LM.callUrl ? window.LM.callUrl("mid-cta") : "https://calendly.com/im-ivanmanfredi/30min") + '" target="_blank" rel="noopener" data-mid-cta>Book a strategy call</a>';
        midCta.querySelector("[data-mid-cta]").addEventListener("click", function () {
          beacon("cta_click", { answers: { target: "mid_scroll_cta" } });
        });
        content.appendChild(midCta);
      }
    });

    // Black Box dispensed-record artifact (brand; Courier Prime inside THE BOX).
    // Presentational only — computed from the same counts shown in the hero meta.
    var secCount = (data.sections || []).length;
    var disp = make("section", { class: "lmc-dispense", "aria-hidden": "true" });
    disp.innerHTML =
      '<div class="lmc-disp-box"><pre class="lmc-disp lm-disp">' +
      '<span class="dtitle">INBOUNDONSTEROIDS · DISPENSING RECORD</span>\n' +
      '<span class="dhr">-----------------------------------------</span>\n' +
      'DISPENSED TO ...... <b>your browser + inbox</b>\n' +
      'CONTENTS .......... <b>' + total + ' ITEMS / ' + secCount + ' SECTIONS</b>\n' +
      'DOSE .............. work through once\n' +
      'FORM .............. browser-saved checklist\n' +
      'REFILLS ........... <b>weekly via the follow-up</b>\n' +
      '<span class="dhr">-----------------------------------------</span>\n' +
      'Rx  I. MANFREDI</pre></div>';
    content.appendChild(disp);

    // Closing CTA — call-first finale (replaces the email-plan gate 2026-06-09)
    var closing = window.LM.buildClosingCta("checklist", data, {
      toolType: "checklist",
      captureExtra: function () {
        var st = readState(data.slug);
        var unchecked = [];
        var totalItems = 0;
        (data.sections || []).forEach(function (s) {
          (s.items || []).forEach(function (it) {
            totalItems++;
            if (!st.checked[it.id]) unchecked.push({ section: s.id, item_id: it.id, impact: it.impact || null, text: (it.text || "").slice(0, 200) });
          });
        });
        var done = Object.keys(st.checked).filter(function (k) { return st.checked[k]; }).length;
        return { answers: { unchecked: unchecked, completion_pct: Math.round((done / (totalItems || 1)) * 100) } };
      },
      onCaptured: function (email) {
        var st = readState(data.slug); st.email = email; saveState(data.slug, st);
      },
    });
    content.appendChild(closing);

    // Footer actions
    var actions = make("div", { class: "lmc-footer-actions" });
    var shareTextChecklist = "Working through " + (data.title || "this checklist") + " by Ivan Manfredi.";
    actions.innerHTML =
      '<button class="lmc-btn lmc-btn-secondary" id="lmc-copy-md" type="button">Copy as Markdown</button>' +
      '<a class="lmc-btn lm-share-whatsapp" id="lmc-share-wa" target="_blank" rel="noopener" href="' +
        (window.LM && window.LM.share ? window.LM.share.whatsapp(shareTextChecklist) : "#") +
      '">Share on WhatsApp</a>' +
      '<button class="lmc-btn lmc-btn-secondary" id="lmc-reset" type="button">Reset progress</button>';
    content.appendChild(actions);
    root.appendChild(content);

    // Wire up
    function update() {
      var current = readState(data.slug);
      var done = 0, highGaps = 0, totalItems = 0;
      (data.sections || []).forEach(function (s, sIdx) {
        var sectionItems = s.items || [];
        var sectionDone = 0;
        sectionItems.forEach(function (it) {
          totalItems++;
          if (current.checked[it.id]) { done++; sectionDone++; }
          else if (it.impact === "high") highGaps++;
        });
      });
      // D1.3: detect transition to 100% complete (only once per session)
      try {
        var celebratedKey = "ivan.checklist." + data.slug + ".celebrated";
        var alreadyCelebrated = sessionStorage.getItem(celebratedKey) === "1";
        if (done > 0 && done === totalItems && !alreadyCelebrated) {
          sessionStorage.setItem(celebratedKey, "1");
          fireCelebration(data, totalItems);
        }
      } catch (_) {}
    }
    update();

    // D1.3: 100% completion celebration — confetti + LinkedIn badge generator
    function fireCelebration(data, totalItems) {
      loadConfetti().then(function (confetti) {
        if (confetti) {
          try {
            confetti({
              particleCount: 120,
              spread: 80,
              origin: { y: 0.4 },
              colors: ["#131210", "#131210", "#131210", "#FFFFFF"],
            });
            // Second burst from sides
            setTimeout(function () {
              try {
                confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0, y: 0.6 }, colors: ["#131210", "#131210"] });
                confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1, y: 0.6 }, colors: ["#131210", "#131210"] });
              } catch (_) {}
            }, 180);
          } catch (_) {}
        }
        showCelebrationPanel(data, totalItems);
        beacon("complete_celebrate", { answers: { total_items: totalItems } });
      });
    }

    function showCelebrationPanel(data, totalItems) {
      if (document.getElementById("lmc-celebration")) return;
      var panel = make("div", { id: "lmc-celebration", class: "lmc-celebration", role: "dialog", "aria-modal": "true", "aria-labelledby": "lmc-celebration-h" });
      panel.innerHTML =
        '<div class="lmc-celebration-card">' +
          '<div class="lmc-celebration-badge">Complete</div>' +
          '<h3 id="lmc-celebration-h">You finished ' + escapeHtml(data.title || "the checklist") + '.</h3>' +
          '<p>Save the win — generate a shareable Markdown badge for LinkedIn.</p>' +
          '<div class="lmc-celebration-actions">' +
            '<button class="lmc-btn" id="lmc-celebrate-share" type="button">Generate LinkedIn badge</button>' +
            '<button class="lmc-btn lmc-btn-secondary" id="lmc-celebrate-close" type="button">Close</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(panel);
      var close = function () { try { panel.remove(); } catch (_) {} };
      document.getElementById("lmc-celebrate-close").addEventListener("click", close);
      panel.addEventListener("click", function (e) { if (e.target === panel) close(); });
      document.addEventListener("keydown", function escHandler(e) {
        if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); }
      });
      document.getElementById("lmc-celebrate-share").addEventListener("click", function () {
        var md = "Shipped all " + totalItems + " items from " + (data.title || "Ivan Manfredi's checklist") + ".\n\n" + location.href.split("?")[0];
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(md).then(function () { toast("Badge copied — paste into LinkedIn"); });
        } else {
          toast("Copy not supported in this browser");
        }
        beacon("share", { answers: { target: "celebration_badge" } });
      });
    }

    // Checkbox toggles
    root.querySelectorAll(".lmc-item").forEach(function (row) {
      row.addEventListener("click", function (e) {
        if (e.target.closest("a")) return;
        var id = row.getAttribute("data-item-id");
        var st = readState(data.slug);
        st.checked = st.checked || {};
        st.checked[id] = !st.checked[id];
        saveState(data.slug, st);
        row.classList.toggle("checked", !!st.checked[id]);
        var box = row.querySelector(".lmc-checkbox");
        if (box) { box.classList.toggle("checked", !!st.checked[id]); box.setAttribute("aria-checked", st.checked[id] ? "true" : "false"); box.innerHTML = st.checked[id] ? "&#10003;" : ""; }
        update();
        beacon("cta_click", { answers: { item_id: id, checked: !!st.checked[id] } });
      });
    });

    // Copy-as-markdown
    var copyBtn = $("#lmc-copy-md");
    if (copyBtn) {
      copyBtn.addEventListener("click", function () {
        var md = "# " + (data.title || "Checklist") + "\n\n";
        var st = readState(data.slug);
        (data.sections || []).forEach(function (s) {
          md += "\n## " + (s.title || "") + "\n\n";
          (s.items || []).forEach(function (it) {
            md += "- [" + (st.checked[it.id] ? "x" : " ") + "] " + (it.text || "") + (it.impact ? "  *(" + it.impact + " impact)*" : "") + "\n";
          });
        });
        md += "\n---\nFrom Ivan Manfredi: " + location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(md).then(function () { toast("Copied Markdown to clipboard"); });
        } else {
          toast("Copy not supported in this browser");
        }
        beacon("share", { answers: { format: "markdown" } });
      });
    }

    // WhatsApp share
    var shareWa = $("#lmc-share-wa");
    if (shareWa) shareWa.addEventListener("click", function () { beacon("share", { answers: { target: "whatsapp" } }); });

    // Reset
    var resetBtn = $("#lmc-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        if (!confirm("Clear all checkmarks for this checklist?")) return;
        try { localStorage.removeItem("ivan.checklist." + data.slug + ".checked"); } catch (_) {}
        location.reload();
      });
    }

    // D1.2: observe high-impact items so the pulse animation fires when they enter viewport
    try {
      if (window.IntersectionObserver) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) { entry.target.classList.add("in-view"); io.unobserve(entry.target); }
          });
        }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
        root.querySelectorAll(".lmc-item").forEach(function (el) { io.observe(el); });
      } else {
        root.querySelectorAll(".lmc-item").forEach(function (el) { el.classList.add("in-view"); });
      }
    } catch (_) {}

    // Fire view
    beacon("view", {});
  }

  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-checklist-src]");
    if (!root) return;
    var defaultSrc = root.getAttribute("data-lm-checklist-src") || "./data.json";
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
    }).then(function (data) {
      render(data, root);
      window.__lm_rerender = function(){ render(window.__lm_data, root); };
    }).catch(function (e) {
      root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading checklist:</strong> ' + escapeHtml(e.message) + '</div>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
