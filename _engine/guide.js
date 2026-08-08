/* Guide engine — editorial long-form with per-section self-placement (tri-state
 * Not yet / Partial / Done). Data.json shape:
 * { slug, title, subtitle, estimated_minutes, brand, intro?, sections: [
 *    { id, title, html?, text?, self_prompt? } ] } */
(function () {
  "use strict";
  if (!window.LM) { console.error("shared.js not loaded"); return; }
  var L = window.LM;
  var STATE_LABEL = { not_yet: "Not yet", partial: "Partial", done: "Done" };
  var STATE_SCORE = { not_yet: 0, partial: 0.5, done: 1 };

  // Flatten block HTML that the generator sometimes emits INSIDE <pre><code>
  // (<p>/<ol>/<ul> render as rich text and destroy copy-paste fidelity of
  // paste-ready prompts). Reconstructs clean plain text with literal "1." /
  // "-" list markers. Returns the text, or null if the pre is already clean.
  function flattenPreBlock(pre) {
    if (!pre.querySelector("p, ol, ul, h1, h2, h3, h4")) return null;
    var out = [];
    function walk(node) {
      Array.prototype.forEach.call(node.childNodes, function (ch) {
        if (ch.nodeType === 3) { out.push(ch.nodeValue); return; }
        if (ch.nodeType !== 1) return;
        var tag = ch.tagName;
        if (tag === "BR") { out.push("\n"); return; }
        if (tag === "P") { out.push("\n\n"); walk(ch); return; }
        if (tag === "OL") {
          var i = 1;
          Array.prototype.forEach.call(ch.children, function (li) {
            if (li.tagName === "LI") out.push("\n" + (i++) + ". " + li.textContent.trim());
          });
          out.push("\n");
          return;
        }
        if (tag === "UL") {
          Array.prototype.forEach.call(ch.children, function (li) {
            if (li.tagName === "LI") out.push("\n- " + li.textContent.trim());
          });
          out.push("\n");
          return;
        }
        walk(ch);
      });
    }
    walk(pre);
    return out.join("").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Copy button on every code block — these guides ship paste-ready prompts.
  function enhancePreBlocks(container, slug) {
    container.querySelectorAll("pre").forEach(function (pre) {
      if (pre.dataset.lmgEnhanced === "1") return;
      pre.dataset.lmgEnhanced = "1";
      var flat = flattenPreBlock(pre);
      if (flat !== null) {
        pre.innerHTML = "";
        var code = document.createElement("code");
        code.textContent = flat;
        pre.appendChild(code);
      }
      var cleanText = flat !== null ? flat : (pre.querySelector("code") || pre).textContent;
      var btn = L.make("button", { class: "lmg-copy", type: "button", "aria-label": "Copy to clipboard" }, "Copy");
      btn.addEventListener("click", function () {
        var text = cleanText;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(function () {
            btn.textContent = "Copied";
            setTimeout(function () { btn.textContent = "Copy"; }, 1800);
          });
        }
        L.beacon("guide", "copy_block", { answers: { chars: text.length } });
      });
      pre.appendChild(btn);
    });
  }

  // D4.4: inline interactive element renderers — hoisted to module scope so sections forEach can use them
  function renderMiniChecklist(slug, sectionId, items) {
    var wrap = L.make("div", { class: "lmg-mini-checklist" });
    var state = L.readKV("guide", slug, "mini_check_" + sectionId, {}) || {};
    wrap.innerHTML = '<div class="lmg-mini-label">Quick checklist</div>' +
      items.map(function (it, i) {
        var checked = !!state[i];
        return '<label class="lmg-mini-item' + (checked ? " checked" : "") + '">' +
          '<input type="checkbox" data-idx="' + i + '"' + (checked ? " checked" : "") + ' />' +
          '<span>' + L.esc(it) + '</span></label>';
      }).join('');
    wrap.addEventListener("change", function (e) {
      var target = e.target;
      if (!target || !target.matches || !target.matches('input[type="checkbox"]')) return;
      var idx = target.getAttribute("data-idx");
      state[idx] = target.checked;
      L.writeKV("guide", slug, "mini_check_" + sectionId, state);
      var lbl = target.closest(".lmg-mini-item");
      if (lbl) lbl.classList.toggle("checked", target.checked);
      L.beacon("guide", "mini_check", { answers: { section_id: sectionId, idx: idx, checked: target.checked } });
    });
    return wrap;
  }

  function renderMiniCalculator(slug, sectionId, config) {
    var wrap = L.make("div", { class: "lmg-mini-calc" });
    var stored = L.readKV("guide", slug, "mini_calc_" + sectionId, {}) || {};
    var outId = "lmg-mini-calc-" + sectionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    wrap.innerHTML = '<div class="lmg-mini-label">Quick calculator</div>' +
      '<div class="lmg-mini-calc-inputs">' +
        (config.inputs || []).map(function (inp) {
          var v = (stored[inp.id] != null) ? stored[inp.id] : (inp.default != null ? inp.default : 0);
          return '<label>' + L.esc(inp.label || inp.id) +
            '<input type="number" data-input-id="' + L.esc(inp.id) + '" value="' + L.esc(v) + '"' +
              (inp.min != null ? ' min="' + L.esc(inp.min) + '"' : '') +
              (inp.max != null ? ' max="' + L.esc(inp.max) + '"' : '') +
              (inp.step != null ? ' step="' + L.esc(inp.step) + '"' : '') +
            ' />' +
          '</label>';
        }).join('') +
      '</div>' +
      '<div class="lmg-mini-calc-output">' + L.esc(config.output_label || "Result") + ': <strong id="' + outId + '">—</strong>' + (config.suffix ? ' <span class="lmg-mini-suf">' + L.esc(config.suffix) + '</span>' : '') + '</div>';

    function compute() {
      var ctx = {};
      wrap.querySelectorAll('input[type="number"]').forEach(function (i) {
        ctx[i.getAttribute("data-input-id")] = Number(i.value || 0);
      });
      // Persist
      L.writeKV("guide", slug, "mini_calc_" + sectionId, ctx);
      var allowed = /^[\s0-9a-zA-Z_\.\+\-\*\/\%\(\)\?\:\,\<\>\=\!\&\|]+$/;
      if (!allowed.test(config.formula)) { wrap.querySelector("#" + outId).textContent = "—"; return; }
      try {
        var fn = new Function("ctx", "Math", "with (ctx) { return (" + config.formula + "); }");
        var v = fn(ctx, Math);
        var out = wrap.querySelector("#" + outId);
        if (out) {
          if (typeof v === "number" && isFinite(v)) {
            var formatted = (config.format === "currency") ? "$" + Math.round(v).toLocaleString("en-US") :
                            (config.format === "percent") ? (v).toFixed(0) + "%" :
                            (config.format === "hours") ? v.toFixed(v < 10 ? 1 : 0) + " hrs" :
                            v.toLocaleString("en-US");
            out.textContent = formatted;
          } else { out.textContent = "—"; }
        }
      } catch (_) { wrap.querySelector("#" + outId).textContent = "—"; }
    }
    wrap.addEventListener("input", function (e) {
      if (e.target && e.target.matches && e.target.matches('input[type="number"]')) compute();
    });
    compute();
    return wrap;
  }

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "guide";
    if (window.LM && window.LM.tracker) window.LM.tracker.touch(data);
    var slug = data.slug;
    var states = L.readKV("guide", slug, "states", {}) || {};
    var captured = !!L.readKV("guide", slug, "email", null);

    root.className = "lmc-root lmg-root";
    root.innerHTML = "";
    // Meta chips adapt to whether self-placement feature is on
    var chips = [
      (data.sections || []).length + " sections",
      (data.estimated_minutes || 10) + " min",
    ];
    if (data.enable_self_placement === true) chips.push("Self-placement");
    root.appendChild(L.buildHero(data, {
      badge: (data.brand && data.brand.hero_badge) || "Guide",
      metaChips: chips,
    }));

    // Editor hooks: wrap hero title + subtitle for inline edit
    var heroH1 = root.querySelector(".lmc-h1");
    var heroSub = root.querySelector(".lmc-sub");
    var heroBadge = root.querySelector(".lmc-badge");
    if (heroH1 && window.LM && window.LM.editMode) window.LM.editMode.registerField(heroH1, "title");
    if (heroSub && window.LM && window.LM.editMode) window.LM.editMode.registerField(heroSub, "subtitle");
    if (heroBadge && window.LM && window.LM.editMode) window.LM.editMode.registerField(heroBadge, "brand.hero_badge");
    // Intro bullets also adapt to feature state
    var introBullets = data.enable_self_placement === true
      ? {
          defaultValueBullet: "Rate your team's current practice at the bottom of each section",
          defaultNextBullet: "End-of-guide summary shows which chapters to revisit. Emailed if you want",
          defaultNote: "",
        }
      : {
          defaultValueBullet: "Read at your pace",
          defaultNextBullet: "If you want this built for you, there's a free fit call at the end",
          defaultNote: "",
        };
    root.appendChild(L.buildIntro(data, ".lmg-progress-wrap", Object.assign({
      tool_type: "guide",
      startLabel: "Start reading",
    }, introBullets)));

    // Render bio_html (hoisted from a "Who Am I?" section) inside the welcome
    // block, after the bullets and before the Start button. We have to inject
    // post-buildIntro because the shared helper doesn't know about bio_html.
    if (data.intro && data.intro.bio_html) {
      var introBody = root.querySelector(".lmc-intro-body");
      var startBtn = root.querySelector(".lmc-intro-start");
      if (introBody && startBtn) {
        var bio = L.make("div", { class: "lmc-intro-bio" });
        bio.innerHTML = data.intro.bio_html;
        introBody.insertBefore(bio, startBtn);
        if (window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(bio, "intro.bio_html", { multiline: true, contenteditable: true });
        }
      }
    }

    // D4.5: optional audio narration player (opt-in via data.audio_url)
    if (data.audio_url) {
      var audioWrap = L.make("div", { class: "lmg-audio-wrap" });
      audioWrap.innerHTML =
        '<div class="lmg-audio-label">Listen instead</div>' +
        '<audio id="lmg-audio" controls preload="metadata" src="' + L.esc(data.audio_url) + '"></audio>';
      root.appendChild(audioWrap);
      try {
        var audioEl = audioWrap.querySelector("#lmg-audio");
        if (audioEl) {
          var fired = false;
          audioEl.addEventListener("play", function () { if (!fired) { fired = true; L.beacon("guide", "audio_play", { answers: { audio_url: data.audio_url } }); } });
          // Section sync — when data.audio_timestamps = [{section_id, t_start}], highlight active section
          if (Array.isArray(data.audio_timestamps) && data.audio_timestamps.length) {
            audioEl.addEventListener("timeupdate", function () {
              var t = audioEl.currentTime;
              var activeId = null;
              data.audio_timestamps.forEach(function (mark) { if (t >= (mark.t_start || 0)) activeId = mark.section_id; });
              root.querySelectorAll(".lmg-section").forEach(function (sec) {
                sec.classList.toggle("audio-active", sec.getAttribute("data-section-id") === activeId);
              });
            });
          }
        }
      } catch (_) {}
    }

    // Sections — wrapped in a container so registerArray has a handle for
    // add / drag-reorder / between-add affordances.
    var main = L.make("main", { class: "lmc-container lmg-prose" });
    var sectionsContainer = L.make("div", { class: "lmg-sections-container" });
    (data.sections || []).forEach(function (s, sIdx) {
      var sec = L.make("section", { class: "lmg-section", id: s.id ? ("section-" + s.id) : null });
      sec.setAttribute("data-section-id", s.id || s.title);
      // D4.2: data-state attribute reflects rating (only meaningful when self-placement enabled)
      if (data.enable_self_placement === true) {
        sec.setAttribute("data-state", states[s.id || s.title] || "unrated");
      }
      if (s.title) {
        var h2 = L.make("h2", null, L.esc(s.title));
        if (window.LM && window.LM.editMode) window.LM.editMode.registerField(h2, "sections[" + sIdx + "].title");
        sec.appendChild(h2);
      }
      if (s.html) {
        var body = L.make("div");
        body.innerHTML = s.html;
        // contenteditable:true is the rich-HTML path — edit-mode sanitizes via
        // DOMPurify on blur and writes back the sanitized innerHTML to s.html.
        if (window.LM && window.LM.editMode) window.LM.editMode.registerField(body, "sections[" + sIdx + "].html", { contenteditable: true });
        sec.appendChild(body);
      } else if (s.text) {
        var p = L.make("p", null, L.esc(s.text));
        if (window.LM && window.LM.editMode) window.LM.editMode.registerField(p, "sections[" + sIdx + "].text", { multiline: true });
        sec.appendChild(p);
      }
      // D4.4: inline interactive elements — type-dispatched per section
      if (s.type === "checklist" && s.config && Array.isArray(s.config.items)) {
        sec.appendChild(renderMiniChecklist(slug, s.id || ("sec-" + sIdx), s.config.items));
      } else if (s.type === "mini_calculator" && s.config && Array.isArray(s.config.inputs) && s.config.formula) {
        sec.appendChild(renderMiniCalculator(slug, s.id || ("sec-" + sIdx), s.config));
      } else if (s.type === "video" && s.config && s.config.url) {
        var vid = L.make("div", { class: "lmg-inline-video" });
        vid.innerHTML = '<video controls preload="metadata" src="' + L.esc(s.config.url) + '" style="max-width:100%;border-radius:6px;display:block;"></video>';
        sec.appendChild(vid);
      }
      // Self-placement block — opt-in only. Default OFF because reading guides
      // weren't written as per-section assessments and the buttons read as noise.
      if (data.enable_self_placement === true) {
        var prompt = s.self_prompt || "Is your team already doing this?";
        var cur = states[s.id || s.title] || "not_yet";
        var self = L.make("div", { class: "lmg-self" });
        self.innerHTML = '<div class="lmg-self-prompt"><span>Self-placement</span>' + L.esc(prompt) + '</div>' +
          '<div class="lmg-self-group" role="radiogroup" aria-label="Self-placement">' +
            ["not_yet", "partial", "done"].map(function (st) {
              return '<button class="lmg-self-btn state-' + st + (cur === st ? ' selected' : '') +
                '" type="button" role="radio" aria-checked="' + (cur === st ? "true" : "false") +
                '" data-state="' + st + '">' + STATE_LABEL[st] + '</button>';
            }).join('') +
          '</div>';
        sec.appendChild(self);
      }
      sectionsContainer.appendChild(sec);
    });
    if (window.LM && window.LM.editMode) window.LM.editMode.registerArray(sectionsContainer, "sections", {
      itemLabel: "section",
      template: { id: "", title: "New section", html: "<p>Write the section body here.</p>", self_prompt: "Is your team already doing this?" },
    });
    enhancePreBlocks(sectionsContainer, slug);
    main.appendChild(sectionsContainer);

    // D4.1: sticky mini-TOC on desktop right rail, collapsible per user request 2026-05-21
    if ((data.sections || []).length >= 2) {
      var tocCollapsedKey = "ivan.guide." + (data.slug || "lm") + ".toc_collapsed";
      var tocStartsCollapsed = false;
      try { tocStartsCollapsed = localStorage.getItem(tocCollapsedKey) === "1"; } catch (_) {}
      var toc = L.make("nav", { class: "lmg-toc" + (tocStartsCollapsed ? " collapsed" : ""), "aria-label": "Sections" });
      toc.innerHTML =
        '<button class="lmg-toc-toggle" type="button" aria-label="Toggle section navigation" aria-expanded="' + (tocStartsCollapsed ? "false" : "true") + '">' +
          '<span class="lmg-toc-toggle-icon" aria-hidden="true">' + (tocStartsCollapsed ? "&#9776;" : "&#10005;") + '</span>' +
        '</button>' +
        '<div class="lmg-toc-body">' +
          '<div class="lmg-toc-label">Sections</div><ol>' +
          (data.sections || []).map(function (s, i) {
            var sid = s.id || s.title || ("sec-" + i);
            var anchor = s.id ? ("#section-" + s.id) : ("#section-sec-" + i);
            return '<li><a href="' + L.esc(anchor) + '" data-section-id="' + L.esc(sid) + '">' +
              '<span class="lmg-toc-dot"></span>' +
              '<span class="lmg-toc-text">' + L.esc(s.title || ("Section " + (i + 1))) + '</span>' +
            '</a></li>';
          }).join('') +
          '</ol>' +
        '</div>';
      root.appendChild(toc);
      // TOC entry text is a second view of sections[i].title (same field as
      // the section h2) — only register when data-derived (s.title truthy),
      // guarding against the "Section N" fallback literal. Precedent: dual
      // registration of one field across two DOM surfaces (architecture.js
      // mobile-list twin, task A4).
      if (window.LM && window.LM.editMode) {
        var tocTextEls = toc.querySelectorAll(".lmg-toc-text");
        (data.sections || []).forEach(function (s, i) {
          if (s.title && tocTextEls[i]) {
            window.LM.editMode.registerField(tocTextEls[i], "sections[" + i + "].title");
          }
        });
      }
      var tocToggle = toc.querySelector(".lmg-toc-toggle");
      var tocIcon = toc.querySelector(".lmg-toc-toggle-icon");
      tocToggle.addEventListener("click", function () {
        var nowCollapsed = !toc.classList.contains("collapsed");
        toc.classList.toggle("collapsed", nowCollapsed);
        tocToggle.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
        if (tocIcon) tocIcon.innerHTML = nowCollapsed ? "&#9776;" : "&#10005;";
        try { localStorage.setItem(tocCollapsedKey, nowCollapsed ? "1" : "0"); } catch (_) {}
      });
    }

    // Summary panel only renders when self-placement is enabled (it shows
    // ratings-based personalized summary). Off by default.
    if (data.enable_self_placement === true) {
      var pending = L.make("p", { class: "lmg-summary-pending" }, "Rate a section above to start building your personalized summary.");
      main.appendChild(pending);
      var summary = L.make("section", { class: "lmg-summary", id: "lmg-summary", "aria-live": "polite" });
      main.appendChild(summary);
    }

    // Plugin install strip — guides that ship as manfredi-marketplace plugins
    // (e.g. strip-ai-tells, client-onboarding) offer the install path before
    // the closing CTA. No-op for unmapped guides.
    if (L.buildInstallStrip) {
      var installStrip = L.buildInstallStrip("guide", data);
      if (installStrip) main.appendChild(installStrip);
    }

    // Closing CTA — call-first finale (replaces the PDF email gate 2026-06-09)
    main.appendChild(L.buildClosingCta("guide", data, {
      toolType: "guide",
      captureExtra: function () {
        var r = compute();
        return {
          score: r.score, rated: r.rated, total: r.total,
          answers: { not_yet_sections: r.notYet.map(function (n) { return n.section.id || n.section.title; }) },
        };
      },
      onCaptured: function (em) {
        L.writeKV("guide", slug, "email", em);
        captured = true;
      },
    }));

    // Reading progress bar — sticky, sits at the top of the prose. Also the
    // scroll target of the intro "Start reading" button (which was a no-op
    // for weeks because this element was styled but never rendered).
    var progressWrap = L.make("div", { class: "lmg-progress-wrap" });
    progressWrap.innerHTML =
      '<div class="lmg-progress-inner">' +
        '<span>Reading</span>' +
        '<div class="lmg-progress-bar"><div class="lmg-progress-fill"></div></div>' +
        '<span class="lmg-progress-pct">0%</span>' +
      '</div>';
    root.appendChild(progressWrap);
    root.appendChild(main);
    var progFill = progressWrap.querySelector(".lmg-progress-fill");
    var progPct = progressWrap.querySelector(".lmg-progress-pct");
    var progTicking = false;
    function updateProgress() {
      progTicking = false;
      var rect = main.getBoundingClientRect();
      var total = rect.height - window.innerHeight;
      var pct = total > 0 ? Math.min(100, Math.max(0, Math.round((-rect.top / total) * 100))) : 0;
      progFill.style.width = pct + "%";
      progPct.textContent = pct + "%";
    }
    window.addEventListener("scroll", function () {
      if (!progTicking) { progTicking = true; requestAnimationFrame(updateProgress); }
    }, { passive: true });
    updateProgress();

    // State wiring
    function compute() {
      var sections = data.sections || [];
      var rated = 0;
      var bySection = sections.map(function (s) {
        var st = states[s.id || s.title] || null;
        if (st) rated++;
        return { section: s, state: st };
      });
      var scored = bySection.filter(function (b) { return b.state; });
      var score = scored.length
        ? Math.round(scored.reduce(function (acc, b) { return acc + STATE_SCORE[b.state]; }, 0) / scored.length * 100)
        : 0;
      var notYet = bySection.filter(function (b) { return b.state === "not_yet"; });
      return { total: sections.length, rated: rated, score: score, notYet: notYet };
    }
    function update() {
      var r = compute();
      root.classList.toggle("rated", r.rated > 0);

      // D4.1 + D4.2: recolor TOC dots + per-section data-state borders
      (data.sections || []).forEach(function (s, i) {
        var sid = s.id || s.title || ("sec-" + i);
        var st = states[sid];
        var dot = root.querySelector('.lmg-toc a[data-section-id="' + (window.CSS && CSS.escape ? CSS.escape(sid) : sid) + '"] .lmg-toc-dot');
        if (dot) dot.className = "lmg-toc-dot" + (st ? " lmg-toc-dot-" + st : "");
        // Per-section border state (only when self-placement is enabled)
        if (data.enable_self_placement === true) {
          var secEl = root.querySelector('.lmg-section[data-section-id="' + (window.CSS && CSS.escape ? CSS.escape(sid) : sid) + '"]');
          if (secEl) secEl.setAttribute("data-state", st || "unrated");
        }
      });

      var panel = document.getElementById("lmg-summary");
      if (!panel) return;
      if (r.rated === 0) { panel.innerHTML = ""; return; }

      var t = L.tierFor(r.score);
      var notYet = r.notYet;
      panel.innerHTML =
        '<div class="lmc-tier lmc-tier-' + t.key + '">' +
          '<div class="lmc-tier-head">' +
            '<span class="lmc-tier-label">Where you stand</span>' +
            '<span class="lmc-tier-score"><em>' + r.score + '</em><span>/100</span></span>' +
          '</div>' +
          '<p class="lmc-tier-note">Based on ' + r.rated + ' of ' + r.total + ' sections rated. ' + L.esc(t.note) + '</p>' +
        '</div>' +
        (notYet.length
          ? '<h3 class="lmc-results-h">Chapters to revisit <em>this week</em></h3>' +
            '<ol class="lmc-gap-list">' + notYet.slice(0, 3).map(function (n, i) {
              return '<li class="lmc-gap">' +
                '<div class="lmc-gap-rank">' + (i + 1) + '</div>' +
                '<div class="lmc-gap-body"><div class="lmc-gap-head"><span class="lmc-gap-text">' + L.esc(n.section.title || n.section.id) + '</span></div></div>' +
              '</li>';
            }).join('') + '</ol>' +
            '<p class="lmc-next-move"><span class="lmc-next-label">What to do Monday</span>Re-read "' + L.esc(notYet[0].section.title || "") + '" with your team. Pick the one step you can close by Friday.</p>'
          : '<p style="color:var(--ink-soft);font-size:1rem;line-height:1.55;">Every rated section came back Done or Partial. Re-rate in 60 days to verify it stuck.</p>'
        );
    }
    update();

    // Self-placement handlers
    main.querySelectorAll(".lmg-self-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var row = btn.closest(".lmg-section");
        if (!row) return;
        var sid = row.getAttribute("data-section-id");
        var newState = btn.getAttribute("data-state");
        states[sid] = newState;
        L.writeKV("guide", slug, "states", states);
        btn.closest(".lmg-self-group").querySelectorAll(".lmg-self-btn").forEach(function (b) {
          var isMe = b === btn;
          b.classList.toggle("selected", isMe);
          b.setAttribute("aria-checked", isMe ? "true" : "false");
        });
        update();
        L.beacon("guide", "self_placement", { answers: { section_id: sid, state: newState } });
        // D4.3: after exactly 3 ratings, promote the skipped-chapters CTA (only once per session)
        var ratedCount = Object.keys(states).length;
        if (ratedCount === 3 && !document.getElementById("lmg-skipped-prompt") && !sessionStorage.getItem("ivan.guide." + slug + ".skipped_promoted")) {
          showSkippedChaptersPrompt(data, states, slug);
        }
      });
    });

    function showSkippedChaptersPrompt(data, states, slug) {
      var skipped = (data.sections || []).filter(function (s) { return states[s.id || s.title] === "not_yet"; });
      if (skipped.length === 0) return;
      try { sessionStorage.setItem("ivan.guide." + slug + ".skipped_promoted", "1"); } catch (_) {}
      var prompt = L.make("div", { id: "lmg-skipped-prompt", class: "lmg-skipped-prompt", role: "dialog", "aria-label": "Skipped chapters offer" });
      var n = skipped.length;
      prompt.innerHTML =
        '<button class="lmg-skipped-close" type="button" aria-label="Dismiss">&times;</button>' +
        '<div class="lmg-skipped-body">' +
          '<strong>Want me to email you the ' + n + ' chapter' + (n === 1 ? "" : "s") + ' you skipped?</strong>' +
          '<p>One concise email with the standalone sections you rated <em>Not yet</em>.</p>' +
          '<form><input type="email" placeholder="you@company.com" required autocomplete="email" /><button type="submit">Send</button></form>' +
        '</div>';
      document.body.appendChild(prompt);
      prompt.querySelector(".lmg-skipped-close").addEventListener("click", function () { try { prompt.remove(); } catch (_) {} });
      prompt.querySelector("form").addEventListener("submit", function (e) {
        e.preventDefault();
        var emInput = prompt.querySelector("input");
        var em = emInput ? emInput.value : "";
        if (!L.emailIsValid(em)) { L.toast("Enter a valid email"); return; }
        L.beacon("guide", "capture", {
          email: em,
          answers: {
            source: "skipped_chapters_prompt",
            skipped_section_ids: skipped.map(function (s) { return s.id || s.title; }),
          },
        });
        prompt.innerHTML = '<div class="lmg-skipped-body"><strong>Sent.</strong><p>Look for it in the next few minutes.</p></div>';
        setTimeout(function () { try { prompt.remove(); } catch (_) {} }, 3000);
      });
    }

    // Scroll reveal
    L.observeReveal(root, ".lmg-section");

    L.beacon("guide", "view");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-lm-guide-src]") || document.querySelector("#lmc-root");
    if (!root) return;
    var defaultSrc = root.getAttribute("data-lm-guide-src") || "./data.json";
    var params = new URLSearchParams(location.search);
    var src = params.get("preview") === "draft" ? "./data.draft.json" : defaultSrc;
    fetch(src, { credentials: "same-origin" })
      .then(function (r) {
        if (params.get("preview") === "draft" && !r.ok) {
          return fetch(defaultSrc, { credentials: "same-origin" }).then(function (r2) {
            if (!r2.ok) throw new Error("data.json " + r2.status);
            return r2.json();
          });
        }
        if (!r.ok) throw new Error("data.json " + r.status);
        return r.json();
      })
      .then(function (data) { render(data, root); window.__lm_rerender = function(){ render(window.__lm_data, root); }; })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading guide:</strong> ' + L.esc(e.message) + '</div>';
      });
  });
})();
