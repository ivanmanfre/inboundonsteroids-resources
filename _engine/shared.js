/* Shared primitives for every LM engine.
 * Exposes `window.LM` with: make, esc, toast, beacon, readerIdentity,
 * readKV/writeKV, observeReveal, buildIntro, buildHero, emailIsValid,
 * canonicalBeaconEvent, tierFor. */
(function () {
  "use strict";

  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  function make(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }

  function toast(msg) {
    var t = document.getElementById("lmc-toast");
    if (!t) { t = make("div", { id: "lmc-toast", class: "lmc-toast" }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2500);
  }

  function emailIsValid(e) { e = String(e || "").trim(); return !!e && /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(e); }

  function canonicalBeaconEvent(tool_type, event, extra) {
    var q = new URLSearchParams(location.search);
    var out = Object.assign({
      event_type: event,
      tool_type: tool_type,
      lm_slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || "",
      src: q.get("src") || "direct",
      utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign"), term: q.get("utm_term"), content: q.get("utm_content") },
      prospect_id: q.get("pid") || null,
      referrer: document.referrer || "",
      session_id: readerIdentity().session_id
    }, extra || {});
    // R1B: client-tenant pages stamp client_id on every event, and captures carry the
    // page slug as leaf_template_key so lm-beacon routes to the per-LM client sequence
    // (and, with the beacon-side guard, never falls back into Ivan's format sequences).
    try {
      var _bc2 = (window.__lm_data && window.__lm_data.client && window.__lm_data.client.id) ? window.__lm_data.client : null;
      if (_bc2) {
        out.client_id = _bc2.id;
        if (event === "capture" && !out.leaf_template_key) out.leaf_template_key = out.lm_slug;
      }
    } catch (_) {}
    return out;
  }

  function beacon(tool_type, event, extra) {
    try {
      var body = canonicalBeaconEvent(tool_type, event, extra);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON, new Blob([JSON.stringify(body)], { type: "application/json" }));
      } else {
        fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
      }
    } catch (_) {}
  }

  // ── Reader identity (universal across all tools) ──────────────────────
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

  // ── Per-tool KV persistence ───────────────────────────────────────────
  function kvKey(tool_type, slug, suf) { return "ivan." + tool_type + "." + slug + "." + suf; }
  function readKV(tool_type, slug, suf, fallback) {
    try { return JSON.parse(localStorage.getItem(kvKey(tool_type, slug, suf)) || "null") || fallback; }
    catch (_) { return fallback; }
  }
  function writeKV(tool_type, slug, suf, value) {
    try { localStorage.setItem(kvKey(tool_type, slug, suf), JSON.stringify(value)); } catch (_) {}
  }
  function removeKV(tool_type, slug, suf) {
    try { localStorage.removeItem(kvKey(tool_type, slug, suf)); } catch (_) {}
  }

  // ── Scroll-triggered entrance ─────────────────────────────────────────
  function observeReveal(rootEl, selector) {
    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { entry.target.classList.add("in-view"); io.unobserve(entry.target); }
        });
      }, { root: null, rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
      rootEl.querySelectorAll(selector).forEach(function (el, i) {
        el.style.transitionDelay = Math.min(i, 8) * 40 + "ms";
        io.observe(el);
      });
    } catch (_) {
      rootEl.querySelectorAll(selector).forEach(function (el) { el.classList.add("in-view"); });
    }
  }

  // Auto-italicize the last meaningful word of a title for sage emphasis,
  // unless the title already contains <em>/<i> markup (data-driven override).
  // Returns HTML safe to assign via innerHTML.
  function italicizePivot(text) {
    var t = String(text || "");
    if (/<em\b|<i\b/i.test(t)) return t;
    // Tokenize the ORIGINAL text (apostrophes intact), escape only the slices at the end.
    // Walk tokens from the end, find the last meaningful word (letter-starting, non-filler/contraction)
    // and italicize together with the immediately-preceding word when it's also content-bearing —
    // e.g. "Survives Day 30" -> "<em>Survives Day</em> 30" not "<em>Day</em> 30".
    var fillers = ["the","a","an","of","is","it","to","in","on","at","or","and","but","yet","that","this","with","you","your","my","i","we","our","be","are","was","were","not","no","yes","if","as","by"];
    var contractions = ["im","its","youre","were","theyre","hes","shes","weve","youve","ive","dont","wont","cant","isnt","arent","wasnt","werent","didnt","doesnt"];
    var tokenRe = /[A-Za-z][A-Za-z\u2019'\-]*/g;
    var matches = [];
    var m;
    while ((m = tokenRe.exec(t)) !== null) {
      matches.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    }
    if (matches.length === 0) return esc(t);
    function isStopword(w) {
      var lc = w.toLowerCase().replace(/[\u2019']/g, "");
      return fillers.indexOf(lc) !== -1 || contractions.indexOf(lc) !== -1;
    }
    var lastIdx = -1;
    for (var i = matches.length - 1; i >= 0; i--) {
      if (!isStopword(matches[i].word)) { lastIdx = i; break; }
    }
    if (lastIdx === -1) return esc(t);
    var startTok = lastIdx;
    if (lastIdx > 0) {
      var prev = matches[lastIdx - 1];
      var between = t.slice(prev.end, matches[lastIdx].start);
      if (
        /^[\s ]+$/.test(between) &&
        !isStopword(prev.word) &&
        prev.word.length <= 8 &&
        matches[lastIdx].word.length <= 8
      ) {
        startTok = lastIdx - 1;
      }
    }
    var pivotStart = matches[startTok].start;
    var pivotEnd = matches[lastIdx].end;
    return esc(t.slice(0, pivotStart)) + "<em>" + esc(t.slice(pivotStart, pivotEnd)) + "</em>" + esc(t.slice(pivotEnd));
  }

  // ── R1B client tenant (2026-07-22) ────────────────────────────────────
  // data.json may carry a client{} brand object (the generator writes one for
  // every tenant). A page renders CLIENT-branded ONLY when client.id is set —
  // the ivan lane writes id:null, so every Ivan page (and every legacy page
  // with no client object) keeps the exact literal path below, byte-for-byte.
  function clientOf(data) {
    var c = data && data.client;
    if (!c && window.__lm_data) c = window.__lm_data.client;
    return (c && c.id) ? c : null;
  }

  // ── Phase 5 host-brand opt-out (2026-08-07) ────────────────────────────
  // A lead-shell wrapper that wants engine-injected copy suppressed but has
  // no client{} tenant object (e.g. a synthesis/preview shell, or a page that
  // only wants the CSS-var re-skin without the full R1B tenant machinery) can
  // set data-lm-brand="host" on #lmc-root or <html>. Opt-out only: absent on
  // every page today, so this is inert for the whole Ivan + client{} catalog.
  function hostBranded() {
    try {
      var root = document.querySelector("#lmc-root");
      if (root && root.getAttribute("data-lm-brand") === "host") return true;
      return document.documentElement.getAttribute("data-lm-brand") === "host";
    } catch (_) { return false; }
  }

  function applyClientTheme() {
    var wc = clientOf(null);
    if (!wc) return;
    try {
      var rs = document.documentElement.style;
      if (wc.accent) {
        rs.setProperty("--accent", wc.accent);
        rs.setProperty("--accent-light", wc.accent);
        rs.setProperty("--accent-ink", wc.ink || wc.accent);
      }
      // Font/ink bridge (2026-08-07) — optional client{} fields feeding the
      // --font-sans/--font-drama/--ink/--paper tokens shared.css + assessment.css
      // now read in every component rule. All optional; a client{} object that
      // only sets accent (every one shipped before today) is unaffected.
      if (wc.font_sans) rs.setProperty("--font-sans", wc.font_sans);
      if (wc.font_drama) rs.setProperty("--font-drama", wc.font_drama);
      if (wc.ink) rs.setProperty("--ink", wc.ink);
      if (wc.paper) rs.setProperty("--paper", wc.paper);
      var tm = document.querySelector('meta[name="theme-color"]');
      if (tm && wc.accent) tm.setAttribute("content", wc.accent);
    } catch (_) {}
  }

  // ── Hero section ──────────────────────────────────────────────────────
  function buildHero(data, opts) {
    opts = opts || {};
    var hero = make("section", { class: "lmc-hero" });
    var inner = make("div", { class: "lmc-hero-inner" });
    if (opts.badge) inner.appendChild(make("div", { class: "lmc-badge" }, esc(opts.badge)));
    var h1 = make("h1", { class: "lmc-h1" });
    h1.innerHTML = italicizePivot(data.title || "Resource");
    inner.appendChild(h1);
    if (data.subtitle) inner.appendChild(make("p", { class: "lmc-sub" }, esc(data.subtitle)));
    var meta = make("div", { class: "lmc-meta" });
    (opts.metaChips || []).forEach(function (c) { meta.appendChild(make("div", { class: "lmc-meta-chip" }, esc(c))); });
    if (meta.children.length) inner.appendChild(meta);
    hero.appendChild(inner);
    return hero;
  }

  // ── Intro block ───────────────────────────────────────────────────────
  function buildIntro(data, startTargetSelector, opts) {
    opts = opts || {};
    var intro = data.intro || {};
    var welcomeLine = intro.paragraph ||
      (data.subtitle ? "You just grabbed " + (data.title || "this resource") + ". " + String(data.subtitle).replace(/\.$/, "") + "." :
                       "You just grabbed " + (data.title || "this resource") + ". Here's the quickest way to use it.");
    // The h2 already greets ("Hey, I'm Ivan.") — strip any leading "Hey," / "Hey there," / "Hi," etc.
    // from the intro paragraph so we don't double-greet.
    welcomeLine = welcomeLine.replace(/^\s*(hey(\s+there)?|hi(\s+there)?|hello)[,\s]*/i, "").replace(/^./, function (c) { return c.toUpperCase(); });
    var pointA = intro.point_time || (data.estimated_minutes ? data.estimated_minutes + " min, at your pace" : "At your own pace");
    var pointB = intro.point_value || opts.defaultValueBullet || "Built to give you the sharpest observation on your team's gaps";
    var pointC = intro.point_next  || opts.defaultNextBullet  || "Your progress auto-saves to this browser. Email only if you want the full report.";
    var startLabel = (opts.startLabel || "Start");
    // Default note removed — was over-disclaimering ("No signup required. Scroll back up anytime to reread.")
    var note = intro.note || opts.defaultNote || "";

    var sec = make("section", { class: "lmc-intro", "aria-labelledby": "lmc-intro-h" });
    var inner = make("div", { class: "lmc-intro-inner" });
    var _wc = clientOf(data);
    var _hostOnly = !_wc && hostBranded(); // host-only opt-out, no client{} object
    var img = _wc
      ? (_wc.portrait ? make("img", { class: "lmc-intro-avatar", src: _wc.portrait, alt: _wc.name || "" }) : null)
      : (_hostOnly ? null : make("img", { class: "lmc-intro-avatar", src: "https://ivanmanfredi.com/ivan-portrait.jpg", alt: "Ivan Manfredi" }));
    var body = make("div", { class: "lmc-intro-body" });
    body.appendChild(make("div", { class: "lmc-intro-badge" }, "Welcome"));
    body.appendChild(make("h2", { class: "lmc-intro-h", id: "lmc-intro-h" },
      _wc ? esc("Hey, I'm " + (_wc.short_name || _wc.name) + ".") :
      (_hostOnly ? "Here&rsquo;s how this works." : "Hey, I&rsquo;m Ivan.")));
    var introPara = make("p", { class: "lmc-intro-p" }, esc(welcomeLine));
    editModeRegisterField(introPara, "intro.paragraph", { multiline: true });
    body.appendChild(introPara);
    var ul = make("ul", { class: "lmc-intro-points" });
    var introPointPaths = ["intro.point_time", "intro.point_value", "intro.point_next"];
    [["a", "\u23F1", pointA], ["b", "\u2192", pointB], ["c", "\u2713", pointC]].forEach(function (p, ix) {
      var li = make("li");
      li.appendChild(make("span", { class: "lmc-intro-icon " + p[0], "aria-hidden": "true" }, p[1]));
      var pointSpan = make("span", null, esc(p[2]));
      editModeRegisterField(pointSpan, introPointPaths[ix], { multiline: true });
      li.appendChild(pointSpan);
      ul.appendChild(li);
    });
    body.appendChild(ul);
    var startBtn = make("button", { class: "lmc-intro-start", type: "button", "aria-label": startLabel },
                        esc(startLabel) + " <span aria-hidden=\"true\">\u2193</span>");
    startBtn.addEventListener("click", function () {
      var target = document.querySelector(startTargetSelector);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      beacon(opts.tool_type || "lm", "intro_start");
    });
    body.appendChild(startBtn);
    if (note) {
      var noteEl = make("p", { class: "lmc-intro-note" }, esc(note));
      editModeRegisterField(noteEl, "intro.note", { multiline: true });
      body.appendChild(noteEl);
    }
    if (img) inner.appendChild(img);
    inner.appendChild(body);
    sec.appendChild(inner);
    return sec;
  }

  // ── Fit-call URL (single canonical call destination, 2026-06-09) ──────
  // Every call CTA on every LM points here, tagged by placement + slug.
  // utm_content carries the reader session_id (same key lm-beacon stamps on
  // cta_click) — lm_attribution joins bookings back to sessions on it.
  var CALL_BASE = "https://calendly.com/im-ivanmanfredi/30min";
  function callUrl(medium) {
    try {
      var _bc = clientOf(null);
      var u = new URL((_bc && _bc.booking_url) || CALL_BASE);
      u.searchParams.set("utm_source", "lm-resource");
      u.searchParams.set("utm_medium", medium || "cta");
      u.searchParams.set("utm_campaign", window.__lm_slug || "lm");
      u.searchParams.set("utm_content", readerIdentity().session_id);
      return u.toString();
    } catch (_) {
      // never fall back to Ivan's booking link on a client page
      var _bf = clientOf(null);
      return (_bf && _bf.booking_url) || CALL_BASE;
    }
  }

  // Rewrite data-supplied CTA URLs that point at the retired ivan-intelligents
  // Calendly account (30 published data.json files carry it) to the canonical
  // callUrl(). Never touches other URLs — prospect-owned embed CTAs pass through.
  function normalizeCtaUrl(url, medium) {
    if (url && /calendly\.com\/ivan-intelligents/i.test(url)) return callUrl(medium || "closing-cta");
    return url;
  }

  // ── Claude Code plugin install strip (Spec 2 "Living Kit", 2026-07-10) ──
  // Kits/guides that ship as plugins in the manfredi marketplace render an
  // install one-liner + live version badge. Mapping: data.plugin (new payloads,
  // set by the generator) falls back to this slug map (published pages, so no
  // page edits needed). Version badge reads VERSION_MAP.json from the repo raw
  // URL and hides itself on any failure (e.g. repo momentarily private).
  var PLUGIN_MAP = {
    "the-agency-operating-system-for-claude-code": "agency-starter",
    "find-out-why-you-don-t-close-the-claude-system-that-reads-your-sales-calls": "drop-point-read",
    "content-engine-starter-kit": "content-engine-starter",
    "anti-ai-patterns-guide-the-tells-that-make-ai-written-content-obvious-and-how-to": "strip-ai-tells",
    "the-claude-client-onboarding-pack-skills-agents-prompts-to-run-intake-without-th": "client-onboarding",
  };
  var VERSION_MAP_URL = "https://raw.githubusercontent.com/ivanmanfre/manfredi/main/VERSION_MAP.json";
  var installStripCss = false;
  function pluginFor(data) {
    if (data && data.plugin) return data.plugin;
    var slug = (data && data.slug) || window.__lm_slug || "";
    if (PLUGIN_MAP[slug]) return PLUGIN_MAP[slug];
    var seg = (location.pathname.split("/").filter(Boolean)[0] || "");
    return PLUGIN_MAP[seg] || null;
  }
  function buildInstallStrip(toolType, data) {
    var plugin = pluginFor(data);
    if (!plugin) return null;
    if (!installStripCss) {
      installStripCss = true;
      var st = document.createElement("style");
      st.textContent =
        ".lm-install{background:#131210;color:#FFFFFF;padding:2.2rem 1.6rem;margin:2.5rem 0;border-radius:2px}" +
        ".lm-install-inner{max-width:860px;margin:0 auto}" +
        ".lm-install-label{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:rgba(255, 255, 255,.55);display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}" +
        ".lm-install-badge{display:none;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.72rem;padding:.1rem .5rem;border:1px solid rgba(255, 255, 255,.3);border-radius:99px;color:#FFFFFF}" +
        ".lm-install h2{font-size:1.35rem;margin:.7rem 0 .4rem;font-weight:700}" +
        ".lm-install p{color:rgba(255, 255, 255,.75);margin:0 0 1rem;font-size:.95rem}" +
        ".lm-install pre{background:#131210;border:1px solid rgba(255, 255, 255,.15);padding:1rem 1.1rem;overflow-x:auto;margin:0;position:relative;border-radius:2px}" +
        ".lm-install code{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.86rem;color:#FFFFFF;line-height:1.7}" +
        ".lm-install-copy{position:absolute;top:.55rem;right:.55rem;background:#131210;color:#FFFFFF;border:0;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;padding:.35rem .7rem;cursor:pointer;border-radius:2px}" +
        ".lm-install-note{margin-top:.7rem;font-size:.82rem;color:rgba(255, 255, 255,.5)}";
      document.head.appendChild(st);
    }
    var cmd = "/plugin marketplace add ivanmanfre/manfredi\n/plugin install " + plugin + "@manfredi";
    var sec = make("section", { class: "lm-install", "aria-label": "Install as a Claude Code plugin" });
    sec.innerHTML =
      '<div class="lm-install-inner">' +
        '<div class="lm-install-label"><span>Claude Code plugin</span><span class="lm-install-badge" data-badge></span></div>' +
        '<h2>Install it straight into Claude Code</h2>' +
        '<p>Two commands and the whole kit is live in your session, versioned. When the model era shifts, the kit gets updated and your install picks it up on the next refresh.</p>' +
        '<pre><code>' + esc(cmd) + '</code><button class="lm-install-copy" type="button">Copy</button></pre>' +
        (toolType === "ai-kit" ? '<div class="lm-install-note">Prefer the raw files? The ZIP download below has every file, no install needed.</div>' : '') +
      '</div>';
    sec.querySelector(".lm-install-copy").addEventListener("click", function () {
      var btn = this;
      navigator.clipboard.writeText(cmd).then(function () {
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = "Copy"; }, 1600);
        beacon(toolType, "install_copy", { plugin: plugin });
      });
    });
    try {
      fetch(VERSION_MAP_URL).then(function (r) { return r.ok ? r.json() : null; }).then(function (vm) {
        if (!vm || !vm[plugin] || !vm[plugin].version) return;
        var b = sec.querySelector("[data-badge]");
        b.textContent = "v" + vm[plugin].version + (vm[plugin].last_bump ? " · " + vm[plugin].last_bump : "");
        b.style.display = "inline-block";
      }).catch(function () {});
    } catch (_) {}
    return sec;
  }

  // ── Frontier currency layer (Spec 3, 2026-07-10) ──────────────────────
  // Single source of model/pricing truth: /frontier.json, built from the
  // curated + human-confirmed frontier_models table. Fail-safe by design:
  // fetch failure, stale flag, or unknown schema_version => null cache =>
  // const() returns the baked fallback and stamp() returns "" (no stamp is
  // always better than a wrong one). as_of/stamp reflect the human confirm
  // date, never machine regen time.
  var frontierCache = null, frontierTried = false, frontierPromise = null;
  function frontierLoad() {
    if (frontierTried) return frontierPromise || Promise.resolve(frontierCache);
    frontierTried = true;
    frontierPromise = fetch("/frontier.json", { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        if (j && j.schema_version === 1 && !j.stale) frontierCache = j;
        return frontierCache;
      })
      .catch(function () { frontierCache = null; return null; });
    return frontierPromise;
  }
  var frontier = {
    load: frontierLoad,
    const: function (key, fallback) {
      return (frontierCache && frontierCache.constants && frontierCache.constants[key] != null)
        ? frontierCache.constants[key] : fallback;
    },
    stamp: function () {
      return (frontierCache && frontierCache.model_currency && frontierCache.model_currency.stamp) || "";
    },
    testedLine: function () {
      var mc = frontierCache && frontierCache.model_currency;
      if (!mc || !mc.current_models_line || !mc.as_of) return "";
      return "Tested against " + mc.current_models_line + " (as of " + mc.as_of + ").";
    },
  };

  // ── Closing CTA (call-first, replaces the PDF email gates 2026-06-09) ──
  // One component for every engine. Kyle-pattern skeleton in Ivan's voice:
  // name the playbook/implementation gap, list what help means for THIS
  // format, one primary action (fit call), honest email secondary.
  var CLOSING_COPY = {
    "ai-kit": {
      headline: 'The kit is yours. <em>Wiring it in</em> is a different job.',
      bullets: [
        "Filling the context files so the outputs sound like you",
        "Connecting it to your call recorder, CRM, or inbox",
        "Extending it from a kit into an always-on system",
      ],
      emailLead: "Prefer email? I'll send the companion series for this kit: six short emails on putting it to work, spread over two weeks.",
    },
    guide: {
      headline: 'The playbook is above. <em>Making it stick</em> is a different job.',
      bullets: [
        "Adapting the prompts to your voice and your stack",
        "Picking which workflow to wire this into first",
        "Making it survive past the pilot week",
      ],
      emailLead: "Prefer email? I'll send the companion series for this guide: six short emails on putting it to work, spread over two weeks.",
    },
    checklist: {
      headline: 'The checklist is above. <em>Closing the gaps</em> is a different job.',
      bullets: [
        "Turning your highest-impact unchecked items into the first build",
        "Sequencing the fixes so each one pays for the next",
        "Deciding what stays manual on purpose",
      ],
      emailLead: "Prefer email? I'll send the companion series for this checklist: six short emails on closing the gaps, spread over two weeks.",
    },
    calculator: {
      headline: 'Your numbers are above. <em>Recovering them</em> is a different job.',
      body: "Those numbers came from your own inputs, so treat them as a floor. After 40+ of these builds, I can tell you where the savings usually stall: the three or four decisions that are specific to your stack, your team, and your clients.",
      bullets: [
        "Pressure-testing the inputs against how you actually operate",
        "Turning the leak number into a build plan",
        "Ordering the builds by payback, fastest first",
      ],
      emailLead: "Prefer email? I'll send your numbers back with the build plan I'd start with.",
    },
    assessment: {
      headline: 'Your score is above. <em>Moving it</em> is a different job.',
      body: "Your score is the map. After 40+ of these builds, I can tell you where teams at your stage usually stall: the three or four decisions that are specific to your stack, your team, and your clients.",
      bullets: [
        "Reading your results against the systems I've built at your stage",
        "Turning your weakest category into the first build",
        "Making the fix survive past the pilot week",
      ],
      emailLead: "Prefer email? I'll send this report to your inbox with what I'd fix first.",
    },
    n8n_workflow: {
      headline: 'The workflow is above. <em>Running it in production</em> is a different job.',
      bullets: [
        "Adapting the nodes to your stack and credentials",
        "Handling the edge cases your clients will find for you",
        "Hardening it with retries, alerts, and fallbacks",
      ],
      emailLead: "Prefer email? I'll send setup notes plus the gotchas most teams hit deploying this.",
    },
    template: {
      headline: 'The template is above. <em>Making it stick</em> is a different job.',
      bullets: [
        "Adapting the artifact to your stack",
        "Wiring it into the tools you already run",
        "Making it survive past the pilot week",
      ],
      emailLead: "Prefer email? I'll send the artifact plus the gotchas most teams hit deploying it.",
    },
    stack_picker: {
      headline: 'Your stack is above. <em>Standing it up</em> is a different job.',
      bullets: [
        "Sanity-checking the pick against your team and budget",
        "Wiring the pieces together in the right order",
        "Hardening it for daily production use",
      ],
      emailLead: "Prefer email? I'll send this stack with the reasoning and the templates I use for it.",
    },
    swipe: {
      headline: 'The examples are above. <em>Making them yours</em> is a different job.',
      bullets: [
        "Adapting the picks to your offer and your audience",
        "Picking which one to ship first",
        "Making the habit survive past the pilot week",
      ],
      emailLead: "Prefer email? I'll send ten more examples tuned to the ones you picked.",
    },
  };
  var CLOSING_DEFAULT_BODY = "Everything on this page works as written. After 40+ of these builds, I can tell you where teams stall: the three or four decisions that are specific to your stack, your team, and your clients.";

  // buildClosingCta(format, data, opts)
  //   format: key into CLOSING_COPY
  //   opts.toolType     — beacon tool_type (defaults to format)
  //   opts.captureExtra — fn returning extra beacon fields for the capture event
  //   opts.onCaptured   — fn(email) engine hook (persist to engine state)
  // Per-LM overrides come from data.closing_cta { headline_html, body, bullets, email_lead }.
  function buildClosingCta(format, data, opts) {
    opts = opts || {};
    var copy = CLOSING_COPY[format] || CLOSING_COPY.guide;
    var over = (data && data.closing_cta) || {};
    var toolType = opts.toolType || format;
    var _wc = clientOf(data);
    // Client pages: per-LM overrides (generator, client voice) win; the embedded
    // Ivan-voiced defaults never render under a client identity.
    var headline = over.headline_html || (_wc ? "Want help putting this in place?" : copy.headline);
    var body = over.body || (_wc ? "Everything on this page works as written. If you want a hand applying it to your own setup, that is what we do all day." : (copy.body || CLOSING_DEFAULT_BODY));
    var bullets = (Array.isArray(over.bullets) && over.bullets.length) ? over.bullets : (_wc ? [] : copy.bullets);
    var emailLead = over.email_lead || (_wc ? "Prefer email? Drop yours and the resource lands in your inbox." : copy.emailLead);
    var href = callUrl("closing-cta");

    var sec = make("section", { class: "lmc-closing", "aria-label": "Work with " + (_wc ? (_wc.name || "the team") : "Ivan") });
    sec.innerHTML =
      '<div class="lmc-closing-label">Want help implementing this?</div>' +
      '<h2 class="lmc-closing-h">' + headline + '</h2>' +
      '<p class="lmc-closing-p">' + esc(body) + '</p>' +
      (bullets.length ? '<p class="lmc-closing-lead">If you want help with:</p>' +
      '<ul class="lmc-closing-points">' +
        bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') +
      '</ul>' : '') +
      (_wc
        ? '<p class="lmc-closing-p">' + esc("Book a call with " + (_wc.name || "the team") + " and walk through how this applies to your own numbers.") + '</p>' +
          '<a class="lmc-btn lmc-closing-call" href="' + esc(href) + '" target="_blank" rel="noopener">' + esc(_wc.cta_label || "Book a call") + ' <span aria-hidden="true">→</span></a>'
        : '<p class="lmc-closing-p">Book a free 30-minute fit call. I’ll tell you exactly how I’d build this for you. If you can run it yourself, I’ll tell you that too, and you keep the plan.</p>' +
          '<a class="lmc-btn lmc-closing-call" href="' + esc(href) + '" target="_blank" rel="noopener">Book the free fit call <span aria-hidden="true">→</span></a>') +
      '<div class="lmc-closing-divider" role="presentation"></div>' +
      '<p class="lmc-closing-email-p">' + esc(emailLead) + '</p>' +
      '<form class="lmc-closing-form">' +
        '<label class="sr-only">Email</label>' +
        '<input type="email" autocomplete="email" required placeholder="you@company.com" />' +
        '<button type="submit">Send it</button>' +
      '</form>' +
      '<p class="lmc-note">One series. Unsubscribe any time.</p>' +
      (_wc ? '' : '<p class="lmc-closing-sign">Either way, the full system is on this page. <em>Go build it.</em></p>') +
      '<div class="lmc-closing-byline">' +
        (_wc
          ? (_wc.portrait ? '<img src="' + esc(_wc.portrait) + '" alt="" loading="lazy" />' : '') +
            '<span><strong>' + esc(_wc.name || "") + '</strong>' + esc(_wc.site_label || "") + '</span>'
          : '<img src="https://ivanmanfredi.com/ivan-portrait.jpg" alt="" loading="lazy" />' +
            (location.hostname.indexOf('inboundonsteroids.com') !== -1
              ? '<span><strong>InboundOnSteroids</strong>AI systems for service businesses</span>'
              : '<span><strong>Ivan Manfredi</strong>AI systems for service businesses</span>')) +
      '</div>';

    editModeRegisterField(sec.querySelector(".lmc-closing-h"), "closing_cta.headline_html", { contenteditable: true });
    editModeRegisterField(sec.querySelector(".lmc-closing-p"), "closing_cta.body", { multiline: true });
    var closingList = sec.querySelector(".lmc-closing-points");
    if (closingList) {
      editModeRegisterArray(closingList, "closing_cta.bullets", { itemLabel: "point" });
      var closingItems = closingList.querySelectorAll("li");
      for (var ci = 0; ci < closingItems.length; ci++) {
        editModeRegisterField(closingItems[ci], "closing_cta.bullets[" + ci + "]");
      }
    }
    editModeRegisterField(sec.querySelector(".lmc-closing-email-p"), "closing_cta.email_lead", { multiline: true });

    var callBtn = sec.querySelector(".lmc-closing-call");
    callBtn.addEventListener("click", function () {
      beacon(toolType, "cta_click", { answers: { target: "closing_cta_call", format: format } });
    });

    var form = sec.querySelector(".lmc-closing-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var em = (form.querySelector("input") || {}).value || "";
      if (!emailIsValid(em)) { toast("Enter a valid email"); return; }
      updateReader({ email: em });
      var extra = {};
      try { extra = (typeof opts.captureExtra === "function" && opts.captureExtra()) || {}; } catch (_) {}
      beacon(toolType, "capture", Object.assign({ email: em }, extra));
      try { if (typeof opts.onCaptured === "function") opts.onCaptured(em); } catch (_) {}
      form.innerHTML = '<p class="lmc-closing-ok">✓ Sent. First email lands in a few minutes. Promotions tab if Gmail.</p>';
    });
    return sec;
  }

  // ── Tier helper ───────────────────────────────────────────────────────
  function tierFor(pct) {
    if (pct < 50) return { key: "critical", label: "Critical", note: "Close the high-impact gaps before you scale anything else." };
    if (pct < 80) return { key: "growth",   label: "Growth stage", note: "You're on the curve. Close these gaps to compound." };
    return          { key: "optimized",label: "Optimized", note: "Maintain the streak and re-audit in 60 days." };
  }

  // ── Edit mode ─────────────────────────────────────────────────────────
  // Activation paths:
  //   1. ?edit=<token> URL param — validates + caches + auto-activates (legacy)
  //   2. Floating "✎ Edit" button — appears whenever localStorage has a valid
  //      cached token. Click to activate without leaving the page.
  //   3. Cmd+Shift+E / Ctrl+Shift+E shortcut — same as #2; falls back to
  //      a token-paste modal when nothing is cached.
  var editModeState = {
    enabled: false,
    token: null,
    cacheKey: "ivan.lm.edit_token",  // localStorage (persists across tabs)
    sessionFlag: "ivan.lm.edit_session", // legacy sessionStorage key (kept for back-compat reads)
    fields: [],         // [{el, path, opts}]
    arrays: [],         // [{el, arrayPath, opts}]
  };

  function editModeIsLoaded() { return !!window.__LM_EDIT_MODE_LOADED; }

  function editModeRegisterField(el, path, opts) {
    if (!el) return el;
    // Always buffer — flush on mount even if token check is still in flight
    editModeState.fields.push({ el: el, path: path, opts: opts || {} });
    if (editModeState.enabled && editModeIsLoaded() && window.__LM_EDIT_MODE_API) {
      window.__LM_EDIT_MODE_API.attachField(el, path, opts || {});
    }
    return el;
  }

  function editModeRegisterArray(el, arrayPath, opts) {
    if (!el) return el;
    editModeState.arrays.push({ el: el, arrayPath: arrayPath, opts: opts || {} });
    if (editModeState.enabled && editModeIsLoaded() && window.__LM_EDIT_MODE_API) {
      window.__LM_EDIT_MODE_API.attachArray(el, arrayPath, opts || {});
    }
    return el;
  }

  function loadEditModeAssets() {
    if (editModeIsLoaded()) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://resources.inboundonsteroids.com/_engine/edit-mode.css";
      document.head.appendChild(link);
      var script = document.createElement("script");
      script.src = "https://resources.inboundonsteroids.com/_engine/edit-mode.js";
      script.onload = function () {
        // edit-mode.js sets window.__LM_EDIT_MODE_LOADED = true
        // and window.__LM_EDIT_MODE_API = { attachField, attachArray, mount }
        if (!window.__LM_EDIT_MODE_API) {
          reject(new Error("edit-mode.js loaded but API not exposed"));
          return;
        }
        // Wait for the engine's render() to set window.__lm_format + window.__lm_data
        // before mounting. Without this, mount fires with format=null on fast cache hits.
        var attempts = 0;
        function tryMount() {
          if (window.__lm_format && window.__lm_data) {
            // Flush any registered fields/arrays buffered before edit-mode.js loaded
            editModeState.fields.forEach(function (f) {
              window.__LM_EDIT_MODE_API.attachField(f.el, f.path, f.opts);
            });
            editModeState.arrays.forEach(function (a) {
              window.__LM_EDIT_MODE_API.attachArray(a.el, a.arrayPath, a.opts);
            });
            window.__LM_EDIT_MODE_API.mount({
              token: editModeState.token,
              slug: window.__lm_slug || (window.__lm_data && window.__lm_data.slug),
              format: window.__lm_format,
              data: window.__lm_data,
            });
            resolve();
          } else if (++attempts < 60) {  // ~6s total wait at 100ms intervals
            setTimeout(tryMount, 100);
          } else {
            reject(new Error("Timed out waiting for engine to set __lm_format / __lm_data"));
          }
        }
        tryMount();
      };
      script.onerror = function () { reject(new Error("edit-mode.js failed to load")); };
      document.head.appendChild(script);
    });
  }

  function readCachedEditToken() {
    var cached = null;
    try { cached = JSON.parse(localStorage.getItem(editModeState.cacheKey) || "null"); } catch (_) {}
    // Fallback: legacy sessionStorage cache from before 2026-05-26.
    if (!cached) {
      try { cached = JSON.parse(sessionStorage.getItem(editModeState.sessionFlag) || "null"); } catch (_) {}
    }
    if (cached && cached.token && cached.expires_at && cached.expires_at > Date.now()) return cached;
    return null;
  }

  function writeCachedEditToken(token, expires_at) {
    try {
      localStorage.setItem(editModeState.cacheKey, JSON.stringify({ token: token, expires_at: expires_at }));
    } catch (_) {}
  }

  function clearCachedEditToken() {
    try { localStorage.removeItem(editModeState.cacheKey); } catch (_) {}
    try { sessionStorage.removeItem(editModeState.sessionFlag); } catch (_) {}
  }

  // Mount edit mode using a validated token. Used by all activation paths.
  function activateEditMode(token) {
    editModeState.enabled = true;
    editModeState.token = token;
    // Replace LM.beacon with no-op so edits don't pollute analytics.
    window.LM.beacon = function () {};
    var pill = document.getElementById("lm-edit-launcher");
    if (pill) pill.remove();
    return loadEditModeAssets();
  }

  // Validate a token against the edge function. Resolves to `{ ok, expires_at }`
  // on success, or `{ ok: false, error }` on failure.
  function validateEditToken(token) {
    return fetch(BEACON.replace(/\/lm-beacon$/, "/lm-edit-token-check"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: token }),
    })
      .then(function (r) { return r.json(); })
      .catch(function () { return { ok: false, error: "network" }; });
  }

  // Activate from cache without re-validating against the edge function.
  // Safe because the cache only stores tokens that *were* validated and
  // includes the server-reported expires_at.
  function activateEditModeFromCache() {
    var cached = readCachedEditToken();
    if (!cached) return false;
    activateEditMode(cached.token);
    return true;
  }

  function editModeMaybeEnable() {
    try {
      var params = new URLSearchParams(location.search);
      var urlToken = params.get("edit");
      if (urlToken) {
        // URL token path: validate (or trust cache match), then activate.
        var cached = readCachedEditToken();
        if (cached && cached.token === urlToken) {
          return activateEditMode(urlToken).then(function () { return true; });
        }
        return validateEditToken(urlToken).then(function (j) {
          if (!j || !j.ok) return false;
          writeCachedEditToken(urlToken, j.expires_at);
          return activateEditMode(urlToken).then(function () { return true; });
        });
      }
      // No URL param. If we have a cached valid token, render the launcher
      // so the admin can activate edit mode without going to the dashboard.
      if (readCachedEditToken()) {
        renderEditLauncher();
      }
      return Promise.resolve(false);
    } catch (_) { return Promise.resolve(false); }
  }

  // Floating "✎ Edit" button — only present when a valid token is cached.
  // Invisible to public visitors (their localStorage has no token).
  function renderEditLauncher() {
    if (document.getElementById("lm-edit-launcher")) return;
    if (editModeState.enabled) return;
    var btn = document.createElement("button");
    btn.id = "lm-edit-launcher";
    btn.type = "button";
    btn.setAttribute("aria-label", "Edit this page inline (admin)");
    btn.title = "Edit this page (⇧⌘E)";
    btn.innerHTML = '<span aria-hidden="true" style="font-size:14px;line-height:1">✎</span><span>Edit</span>';
    btn.style.cssText =
      "position:fixed;bottom:18px;right:18px;z-index:99998;" +
      "display:inline-flex;align-items:center;gap:8px;" +
      "padding:9px 14px;border-radius:999px;" +
      "background:#131210;color:#FFFFFF;" +
      "font-family:'Source Serif 4',Georgia,serif;font-size:13px;font-weight:600;" +
      "letter-spacing:.04em;border:none;cursor:pointer;" +
      "box-shadow:0 6px 18px rgba(19, 18, 16,.18),0 2px 6px rgba(19, 18, 16,.10);" +
      "transition:transform 120ms,background 120ms;";
    btn.addEventListener("mouseenter", function () { btn.style.transform = "translateY(-2px)"; btn.style.background = "#131210"; });
    btn.addEventListener("mouseleave", function () { btn.style.transform = ""; btn.style.background = "#131210"; });
    btn.addEventListener("click", function () {
      if (!activateEditModeFromCache()) showEditTokenModal();
    });
    document.body.appendChild(btn);
  }

  // Modal: paste a token to activate edit mode. Used when no cache exists
  // or the cached token has expired.
  function showEditTokenModal(prefill) {
    if (document.getElementById("lm-edit-modal")) return;
    var backdrop = document.createElement("div");
    backdrop.id = "lm-edit-modal";
    backdrop.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(19, 18, 16,0.45);" +
      "display:flex;align-items:center;justify-content:center;padding:1rem;" +
      "font-family:'Source Serif 4',Georgia,serif;";
    var card = document.createElement("div");
    card.style.cssText =
      "background:#FFFFFF;color:#131210;max-width:440px;width:100%;" +
      "padding:1.75rem;border-radius:6px;box-shadow:0 24px 48px rgba(0,0,0,.25);" +
      "border-left:4px solid #131210;";
    card.innerHTML =
      '<p style="font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#131210;margin:0 0 .35rem;">Inline editor</p>' +
      '<h3 style="font-family:\'Schibsted Grotesk\',Georgia,serif;font-size:1.6rem;font-weight:400;letter-spacing:-.01em;margin:0 0 .65rem;">Enter the <em style="font-style:italic;color:#131210;">admin password</em>.</h3>' +
      '<p style="font-size:.95rem;line-height:1.5;color:#4A463E;margin:0 0 1.25rem;">Unlocks inline editing on every LM page. Cached locally for 24h after entry — re-enter when it expires.</p>' +
      '<input type="password" id="lm-edit-modal-input" autocomplete="current-password" spellcheck="false" placeholder="Password" style="width:100%;box-sizing:border-box;padding:.85rem 1rem;border:1px solid rgba(19, 18, 16,.22);background:#fff;font-family:inherit;font-size:.95rem;color:#131210;border-radius:0;letter-spacing:.05em;" />' +
      '<p id="lm-edit-modal-err" style="font-size:.8rem;color:#A33;margin:.5rem 0 0;min-height:1em;"></p>' +
      '<div style="display:flex;justify-content:flex-end;gap:.5rem;margin-top:1rem;">' +
        '<button type="button" id="lm-edit-modal-cancel" style="padding:10px 18px;background:transparent;border:1px solid rgba(19, 18, 16,.22);color:#131210;font-family:inherit;font-size:.92rem;font-weight:600;cursor:pointer;">Cancel</button>' +
        '<button type="button" id="lm-edit-modal-ok" style="padding:10px 18px;background:#131210;border:none;color:#FFFFFF;font-family:inherit;font-size:.92rem;font-weight:600;cursor:pointer;">Unlock</button>' +
      '</div>';
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    var input = card.querySelector("#lm-edit-modal-input");
    var err = card.querySelector("#lm-edit-modal-err");
    var okBtn = card.querySelector("#lm-edit-modal-ok");
    var cancelBtn = card.querySelector("#lm-edit-modal-cancel");
    if (prefill) input.value = prefill;
    setTimeout(function () { input.focus(); input.select(); }, 30);

    function close() { backdrop.remove(); }
    cancelBtn.addEventListener("click", close);
    backdrop.addEventListener("click", function (e) { if (e.target === backdrop) close(); });
    document.addEventListener("keydown", function escHandler(e) {
      if (e.key === "Escape") { close(); document.removeEventListener("keydown", escHandler); }
    });

    function submit() {
      var token = (input.value || "").trim();
      if (!token) { err.textContent = "Password required."; return; }
      okBtn.disabled = true; okBtn.textContent = "Checking…"; err.textContent = "";
      validateEditToken(token).then(function (j) {
        if (!j || !j.ok) {
          err.textContent = (j && j.error) || "Incorrect password.";
          okBtn.disabled = false; okBtn.textContent = "Unlock";
          input.select();
          return;
        }
        writeCachedEditToken(token, j.expires_at);
        close();
        activateEditMode(token);
      });
    }
    okBtn.addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submit(); } });
  }

  // Keyboard shortcut: ⌘⇧E (Mac) / Ctrl+Shift+E (other) toggles the editor.
  function bindEditModeShortcut() {
    document.addEventListener("keydown", function (e) {
      var mod = (navigator.platform || "").toLowerCase().indexOf("mac") >= 0 ? e.metaKey : e.ctrlKey;
      if (!mod || !e.shiftKey) return;
      if (e.key !== "E" && e.key !== "e") return;
      e.preventDefault();
      if (editModeState.enabled) return; // already active
      if (!activateEditModeFromCache()) showEditTokenModal();
    });
  }

  // ── Share helpers ──────────────────────────────────────────────────────
  function shareUrlWithUtm(base, source) {
    var u = new URL(base, location.origin);
    u.searchParams.set("utm_source", source);
    u.searchParams.set("utm_medium", "referral");
    u.searchParams.set("utm_campaign", window.__lm_slug || "lm");
    return u.toString();
  }

  function shareLinkedIn(text, url) {
    var u = shareUrlWithUtm(url || location.href, "linkedin-share");
    return "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(u) + "&summary=" + encodeURIComponent(text || "");
  }

  function shareWhatsApp(text, url) {
    var u = shareUrlWithUtm(url || location.href, "whatsapp-share");
    return "https://wa.me/?text=" + encodeURIComponent((text ? text + "\n\n" : "") + u);
  }

  function shareCopy(url) {
    var u = shareUrlWithUtm(url || location.href, "copy-link");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(u).then(function () { return true; });
    }
    return Promise.resolve(false);
  }

  // ── Sticky progress header removed — engines have their own native progress UI.
  // Kept as no-ops so any lingering engine calls don't throw.
  function progressMount() {}
  function progressUpdate() {}

  // ── Footer rebrand (2026-05-21) ─────────────────────────────────────────
  // Per-LM HTML wrapper ships a generic .im-footer-cta block. Replace its
  // inner copy with editorial brand markup (mono label / italic DM Serif h2 /
  // Source Serif p / paper-on-ink CTA). Restyling is in shared.css.
  // Copy lives here because it's the same call-to-build for every LM.
  //
  // Some engines (guide, ai-walkthrough, etc.) have a minimal per-LM HTML
  // wrapper that doesn't include .im-footer at all. For those we INJECT the
  // full footer at the end of <body>.
  function rebrandFooter() {
    // White-label client LMs (window.__lm_client) carry their own footer/CTA
    // and must never show Ivan's Calendly footer. Opt-out only; no existing
    // page sets the flag, so this is inert for the whole Ivan catalog.
    // hostBranded() (2026-08-07) is the lighter-weight sibling opt-out for
    // shells that want the same suppression without a full client{} object —
    // also inert unless data-lm-brand="host" is explicitly set.
    if (window.__lm_client || hostBranded()) return;
    // Embed mode (assessment shown inside a prospect's scan): the sample is framed as the
    // PROSPECT's own asset — never inject Ivan's "Work with me" footer into it. assessment-v2
    // strips the shell .im-footer on embed load; without this guard the injection below
    // re-creates it and Ivan's Calendly CTA leaks into the simulated client artifact.
    try {
      var __fq = new URLSearchParams(location.search);
      if (__fq.get("src") === "scan_embed" || __fq.get("embed") === "1") return;
    } catch (_) {}
    var footer = document.querySelector(".im-footer");
    if (!footer) {
      // Inject a fresh editorial footer. Reuses .im-footer styles defined in
      // shared.css so the look matches the per-LM-wrapped engines.
      footer = document.createElement("footer");
      footer.className = "im-footer";
      footer.innerHTML =
        '<div class="im-footer-inner">' +
          '<div class="im-footer-cta"></div>' +
          '<div class="im-footer-meta"></div>' +
        '</div>';
      document.body.appendChild(footer);
    }
    // Per-LM override: window.__lm_data.footer. Each field falls back to the
    // exact literal below when absent, so the assembled innerHTML is
    // byte-identical to the pre-refactor markup for a no-override page.
    var f = (window.__lm_data && window.__lm_data.footer) || {};
    // R1B: on a client-tenant page (client.id set) the FALLBACKS are client-neutral —
    // Ivan's footer copy never renders under a client identity. data.footer still wins.
    var _fc = clientOf(null);
    var fLabel   = f.label        || (_fc ? ("Work with " + (_fc.short_name || _fc.name)) : "Work with me");
    var fHeading = f.heading_html || (_fc ? "Want help putting this to work?" : 'Ready to turn your feed into pipeline you <em>own</em>?');
    var fBody    = f.body         || (_fc ? ("Book a call with " + (_fc.name || "the team") + ".") : 'I build and run LinkedIn inbound engines for agency owners: content, lead magnets, and nurture. Book a free fit call.');
    var fBtn     = f.cta_label    || (_fc ? (_fc.cta_label || "Book a call") : 'Book the free fit call');

    var cta = footer.querySelector(".im-footer-cta");
    if (cta) {
      // Footer pattern lifted from Lemonade-style demand-gen agency CTAs:
      // mono label / outcome question h2 / invitation body / button.
      // Voice anchors: inbound-engine positioning — "pipeline you own" +
      // "the feed is the demo" are Ivan's signature pivots. Italicize "own".
      cta.innerHTML =
        '<span class="im-footer-label">' + esc(fLabel) + '</span>' +
        '<h2 class="im-footer-h">' + fHeading + '</h2>' +
        '<p class="im-footer-p">' + esc(fBody) + '</p>' +
        '<a class="im-footer-btn" href="' + callUrl("footer") + '" target="_blank" rel="noopener" data-footer-cta>' + esc(fBtn) + '</a>';
      var btn = cta.querySelector("[data-footer-cta]");
      if (btn) btn.addEventListener("click", function () { beacon("footer", "cta_click", { answers: { target: "footer_calendly" } }); });
      editModeRegisterField(cta.querySelector(".im-footer-label"), "footer.label");
      editModeRegisterField(cta.querySelector(".im-footer-h"), "footer.heading_html", { contenteditable: true });
      editModeRegisterField(cta.querySelector(".im-footer-p"), "footer.body", { multiline: true });
      editModeRegisterField(cta.querySelector(".im-footer-btn"), "footer.cta_label");
    }
    // Replace footer meta line with cleaner brand-correct version. Left as
    // hardcoded literals (not sourced from data.footer) — the year is always
    // computed live and the ivanmanfredi.com link is a fixed brand fact, so
    // there's no per-LM customization value here. Not registered.
    var meta = footer.querySelector(".im-footer-meta");
    if (meta) {
      var year = new Date().getFullYear();
      meta.innerHTML = _fc
        ? '<span>© ' + year + ' ' + esc(_fc.name || "") + '</span>' +
          '<span><a href="' + esc(_fc.site || "#") + '">' + esc(_fc.site_label || _fc.site || "") + '</a></span>'
        : (location.hostname.indexOf('inboundonsteroids.com') !== -1
          ? '<span>© ' + year + ' InboundOnSteroids</span>' +
            '<span><a href="https://inboundonsteroids.com">inboundonsteroids.com</a></span>'
          : '<span>© ' + year + ' Iván Manfredi</span>' +
            '<span><a href="https://ivanmanfredi.com">ivanmanfredi.com</a></span>');
    }
  }

  // ── Resource tracker removed — was a "could be cool" Netflix-style widget,
  // but Ivan's audience arrives via DM/comment-gate for ONE specific LM, not browsing.
  // Kept as no-op so existing engine calls to LM.tracker.touch() don't throw.
  function trackerTouch() {}

  // ── Click-to-edit field/array helpers (Task A1) ───────────────────────
  // Thin wrappers around make() + editModeRegisterField/Array so engines can
  // build an editable element in one call instead of make() + registerField().
  function makeField(tag, attrs, text, path, opts) {
    var e = make(tag, attrs, (opts && opts.html) ? text : undefined);
    if (!(opts && opts.html) && text !== undefined) e.textContent = text;
    editModeRegisterField(e, path, opts || {});
    return e;
  }
  function makeFieldArray(containerEl, arrayPath, opts) {
    editModeRegisterArray(containerEl, arrayPath, opts || {});
    return containerEl;
  }
  function editModeResetBuffers() {
    editModeState.fields.length = 0;
    editModeState.arrays.length = 0;
  }

  window.LM = {
    make: make, esc: esc, toast: toast, emailIsValid: emailIsValid,
    beacon: beacon, canonicalBeaconEvent: canonicalBeaconEvent,
    readerIdentity: readerIdentity, updateReader: updateReader,
    readKV: readKV, writeKV: writeKV, removeKV: removeKV,
    observeReveal: observeReveal,
    buildHero: buildHero, buildIntro: buildIntro,
    buildClosingCta: buildClosingCta, callUrl: callUrl, normalizeCtaUrl: normalizeCtaUrl,
    buildInstallStrip: buildInstallStrip,
    frontier: frontier,
    tierFor: tierFor,
    clientOf: clientOf, hostBranded: hostBranded,
    makeField: makeField, makeFieldArray: makeFieldArray,
    editMode: {
      enabled: function () { return editModeState.enabled; },
      registerField: editModeRegisterField,
      registerArray: editModeRegisterArray,
      maybeEnable: editModeMaybeEnable,
      activateFromCache: activateEditModeFromCache,
      showTokenModal: showEditTokenModal,
      clearCache: clearCachedEditToken,
      makeField: makeField, makeFieldArray: makeFieldArray,
      resetBuffers: editModeResetBuffers,
    },
    tracker: { touch: trackerTouch },  // no-op stub, see comment above
    progress: {
      mount: progressMount,
      update: progressUpdate,
    },
    share: {
      linkedIn: shareLinkedIn,
      whatsapp: shareWhatsApp,
      copy: shareCopy,
    },
  };

  // ── Capture enhancer (2026-05-21) ─────────────────────────────────────
  // Each engine renders its own .lmc-capture (PDF/email gate) — but the
  // calendly footer is way below the fold and most readers stop at the
  // capture form. Append a small secondary "Or book a call directly →"
  // link inside every capture card so high-intent readers don't have to
  // scroll past the email gate to find the calendly CTA.
  // Uses MutationObserver because engines render asynchronously after the
  // data.json fetch completes (post-DOMContentLoaded).
  function enhanceCapture(captureEl) {
    if (!captureEl || captureEl.dataset.lmEnhanced === "1") return;
    // Embed mode (assessment shown inside a prospect's scan): no Ivan fit-call CTA — this
    // is framed as the prospect's own lead magnet; the scan page drives to Ivan separately.
    try {
      var __q = new URLSearchParams(location.search);
      if (__q.get("src") === "scan_embed" || __q.get("embed") === "1") return;
    } catch (_) {}
    captureEl.dataset.lmEnhanced = "1";
    var alt = document.createElement("a");
    alt.className = "lmc-capture-alt";
    alt.href = callUrl("capture-alt");
    alt.target = "_blank";
    alt.rel = "noopener";
    alt.innerHTML = "Prefer to talk it through? <strong>Book a free 30-minute fit call</strong> →";
    alt.addEventListener("click", function () { beacon("capture", "cta_click", { answers: { target: "capture_calendly_alt" } }); });
    var note = captureEl.querySelector(".lmc-note");
    if (note && note.parentNode === captureEl) {
      captureEl.insertBefore(alt, note);
    } else {
      captureEl.appendChild(alt);
    }
  }
  function scanCaptures() {
    document.querySelectorAll(".lmc-capture").forEach(enhanceCapture);
  }

  // ── Legacy in-content link rewrite (2026-06-09) ───────────────────────
  // Every LM generated before the call-first funnel ends its last section
  // with "Get in Touch" → ivanmanfredi.com/contact (mandated by the old
  // generation prompt). Rewrite those anchors to the fit call at render
  // time so all live pages get the new funnel without regeneration.
  function rewriteLegacyContactLinks() {
    document.querySelectorAll('a[href*="ivanmanfredi.com/contact"]').forEach(function (a) {
      if (a.dataset.lmCallRewritten === "1") return;
      a.dataset.lmCallRewritten = "1";
      a.href = callUrl("in-content");
      a.target = "_blank";
      a.rel = "noopener";
      if (/get in touch/i.test(a.textContent || "")) a.textContent = "book a free 30-minute fit call";
      a.addEventListener("click", function () {
        beacon("content", "cta_click", { answers: { target: "in_content_call", rewritten: true } });
      });
    });
  }

  // Expose for engines / debugging
  window.LM.rebrandFooter = rebrandFooter;
  window.LM.italicizePivot = italicizePivot;
  window.LM.enhanceCapture = enhanceCapture;

  // Auto-trigger edit-mode check + footer rebrand on DOMContentLoaded.
  // Each engine also checks LM.editMode.enabled() before assuming non-edit context.
  function bootstrapShared() {
    // Some engine stylesheets @import shared.css (guide/template/swipe) and
    // some wrappers link it directly (calculator) — but checklist, assessment,
    // n8n-workflow and stack-picker pages load NEITHER, so brand-base rules
    // (.lmc-closing, .im-nav hide, capture unification) silently never applied
    // there. Self-heal: inject the link when absent. Double-loading alongside
    // an @import is harmless (idempotent rules, cached fetch).
    if (!document.querySelector('link[href*="shared.css"], link[href*="shared.min.css"]')) {
      var sharedLink = document.createElement("link");
      sharedLink.rel = "stylesheet";
      sharedLink.href = "/_engine/shared.css";
      document.head.appendChild(sharedLink);
    }
    editModeMaybeEnable();
    bindEditModeShortcut();
    applyClientTheme();
    rebrandFooter();
    // Engines set window.__lm_data asynchronously (inside their data.json fetch),
    // which happens AFTER this synchronous call — so any data.footer override
    // isn't visible yet. Poll briefly and re-run once the data lands so the
    // override renders for real visitors and edit-mode shows the true text.
    var _fTries = 0;
    var _fPoll = setInterval(function () {
      _fTries++;
      if (window.__lm_data) { applyClientTheme(); rebrandFooter(); clearInterval(_fPoll); }
      else if (_fTries > 60) clearInterval(_fPoll); // ~3s cap
    }, 50);
    scanCaptures();
    rewriteLegacyContactLinks();
    // Engines render asynchronously after data.json fetch — watch the LM
    // root for late-arriving .lmc-capture nodes and legacy contact links.
    try {
      var root = document.getElementById("lmc-root") || document.querySelector("[id$='-root']") || document.body;
      var mo = new MutationObserver(function () { scanCaptures(); rewriteLegacyContactLinks(); });
      mo.observe(root, { childList: true, subtree: true });
      // Stop observing after 30s to avoid leaks on long-lived pages.
      setTimeout(function () { try { mo.disconnect(); } catch (_) {} }, 30000);
    } catch (_) {}
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrapShared);
  } else {
    bootstrapShared();
  }
})();
