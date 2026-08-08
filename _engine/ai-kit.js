/* AI Kit engine — file-kit browser for downloadable Claude systems (AI Kit +
 * Skill Pack formats). Data.json shape:
 * { slug, title, subtitle, format_label?, kit_name, estimated_minutes?,
 *   intro?, closing_cta?, files: [
 *     { path, folder, name, description, user_editable, content } ] } */
(function () {
  "use strict";
  if (!window.LM) { console.error("shared.js not loaded"); return; }
  var L = window.LM;

  var GROUP_ORDER = ["", "context", "system"];
  var GROUP_LABEL = { "": "Kit root", context: "context/ · you fill these in", system: "system/ · the methodology" };

  function groupFiles(files) {
    var groups = {};
    (files || []).forEach(function (f) {
      var key = f.folder || "";
      if (!groups[key]) groups[key] = [];
      groups[key].push(f);
    });
    var keys = Object.keys(groups).sort(function (a, b) {
      var ia = GROUP_ORDER.indexOf(a), ib = GROUP_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return keys.map(function (k) { return { key: k, label: GROUP_LABEL[k] || (k + "/"), files: groups[k] }; });
  }

  // --- Quick start (3 steps, editorial numerals) ---
  function buildQuickStart(data) {
    var sec = L.make("section", { class: "lmk-quickstart lmk-reveal", "aria-label": "Quick start" });
    var steps = (data.quick_start && data.quick_start.length) ? data.quick_start.map(function (s, i) {
      return { n: String(i + 1), h: s.h, p: s.p };
    }) : [
      { n: "1", h: "Download the kit", p: "Grab the ZIP below. Unzip it into a folder. That folder is the system." },
      { n: "2", h: "Fill in your context", p: "Open the files in context/ and replace the [BRACKETS] with your business. Ten minutes, once." },
      { n: "3", h: "Run it with Claude", p: "Open the folder in Claude Code (or paste CLAUDE.md into a Claude Project) and follow the orchestrator." },
    ];
    var NUMWORD = ["zero", "one", "two", "three", "four", "five", "six", "seven"];
    var nWord = NUMWORD[steps.length] || String(steps.length);
    var qsTitle = data.quick_start_title || ('Up and running in <em>' + nWord + ' steps</em>');
    sec.innerHTML =
      '<h2 class="lmk-qs-h">' + qsTitle + '</h2>' +
      '<div class="lmk-qs-grid">' +
      steps.map(function (s) {
        return '<div class="lmk-qs-step">' +
          '<span class="lmk-qs-num">' + s.n + '</span>' +
          '<h3>' + L.esc(s.h) + '</h3>' +
          '<p>' + L.esc(s.p) + '</p>' +
        '</div>';
      }).join("") +
      '</div>';
    return sec;
  }

  // --- Download band ---
  function lazyJszip() {
    return new Promise(function (resolve, reject) {
      if (window.JSZip) return resolve(window.JSZip);
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";
      s.onload = function () { resolve(window.JSZip); };
      s.onerror = function () { reject(new Error("ZIP library failed to load")); };
      document.head.appendChild(s);
    });
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }

  function buildDownloadBand(data, onDone) {
    var files = data.files || [];
    var editable = files.filter(function (f) { return f.user_editable; }).length;
    var gated = !!(data.gate && data.gate.mode);
    var sec = L.make("section", { class: "lmk-download lmk-reveal", "aria-label": "Download the kit" });
    sec.innerHTML =
      '<div class="lmk-dl-inner">' +
        '<div class="lmk-dl-copy">' +
          '<div class="lmk-dl-label">' + L.esc(data.format_label || "AI Kit") + '</div>' +
          '<h2 class="lmk-dl-h">The whole system, <em>one folder</em></h2>' +
          '<p class="lmk-dl-p">' + files.length + " files" + ((data.client && editable === 0) ? ", every one of them working" : ". " + editable + " you customize, the rest works") + " out of the box. Browse every file below before you download. Nothing is hidden behind the ZIP.</p>" +
        '</div>' +
        '<div class="lmk-dl-action">' +
          '<button class="lmc-btn lmk-dl-btn" type="button">Download the kit <span aria-hidden="true">↓</span></button>' +
          '<span class="lmk-dl-note">.zip · markdown files' + (gated ? '' : ' · no email required') + '</span>' +
        '</div>' +
      '</div>';
    sec.querySelector(".lmk-dl-btn").addEventListener("click", function () {
      var btn = this;
      btn.disabled = true; btn.textContent = "Packing…";
      L.beacon("ai-kit", "download", { kit: data.kit_name, files: files.length });
      lazyJszip().then(function (JSZip) {
        var zip = new JSZip();
        var rootName = data.kit_name || data.slug || "ai-kit";
        files.forEach(function (f) { zip.file(rootName + "/" + (f.path || f.name), f.content || ""); });
        return zip.generateAsync({ type: "blob" });
      }).then(function (blob) {
        downloadBlob(blob, (data.kit_name || data.slug || "ai-kit") + ".zip");
        btn.disabled = false; btn.innerHTML = 'Download the kit <span aria-hidden="true">↓</span>';
        L.toast("Kit downloaded. Unzip and open in Claude Code.");
        if (typeof onDone === "function") { try { onDone(); } catch (_) {} }
      }).catch(function () {
        btn.disabled = false; btn.innerHTML = 'Download the kit <span aria-hidden="true">↓</span>';
        L.toast("ZIP failed to build — use the per-file download buttons below.");
      });
    });
    return sec;
  }

  /* ══════════════════════════════════════════════════════════════════════
   * Gated client funnel (opt-in). Activates only when data.gate.mode is set,
   * so every existing Ivan kit (no gate key) renders through the untouched
   * path below. White-labels to data.client: no Ivan portrait, greeting,
   * Calendly, or footer. Reuses the brand-neutral machinery (quickstart,
   * download band, file browser, ZIP). Three states: landing (hard gate) ->
   * resource -> thank-you. Reusable for any future client kit via data.json.
   * ══════════════════════════════════════════════════════════════════════ */
  function clientAccent(data) { return (data.client && data.client.accent) || "#ffc71d"; }
  function clientName(data) { return (data.client && data.client.name) || "the team"; }

  function buildClientHero(data) {
    var c = data.client || {};
    var hero = L.make("header", { class: "lmk-c-hero" });
    hero.innerHTML =
      '<div class="lmk-c-shapes" aria-hidden="true"><span class="lmk-c-blob a"></span><span class="lmk-c-blob b"></span><span class="lmk-c-ring"></span></div>' +
      '<div class="lmk-c-hero-inner">' +
        (c.logo ? '<a class="lmk-c-logo" href="' + L.esc(c.site || "#") + '"' + (c.site ? ' target="_blank" rel="noopener"' : "") + '><img src="' + L.esc(c.logo) + '" alt="' + L.esc(clientName(data)) + '"></a>' : "") +
        (data.format_label ? '<p class="lmk-c-eyebrow">' + L.esc(data.format_label) + '</p>' : "") +
        '<h1 class="lmk-c-h1">' + L.esc(data.title || "The Kit") + '</h1>' +
        (data.subtitle ? '<p class="lmk-c-sub">' + L.esc(data.subtitle) + '</p>' : "") +
        (data.proof && data.proof.stats && data.proof.stats.length ?
          '<ul class="lmk-c-proof" aria-label="Track record">' +
            data.proof.stats.map(function (s) { return '<li>' + L.esc(s) + '</li>'; }).join("") +
          '</ul>' : "") +
      '</div>';
    return hero;
  }

  // Closing band: the client's founder fronts the book-a-call CTA. Rendered on
  // both the gated landing and the unlocked kit so neither path dead-ends.
  function buildClientClosing(data, view) {
    var cl = data.closing || {};
    if (!cl.cta_url) return null;
    var sec = L.make("section", { class: "lmk-close lmk-reveal", "aria-label": "Work with " + clientName(data) });
    sec.innerHTML =
      '<div class="lmk-close-card">' +
        (cl.photo ?
          '<figure class="lmk-close-media">' +
            '<img src="' + L.esc(cl.photo) + '" alt="' + L.esc(cl.person || clientName(data)) + '" loading="lazy">' +
            (cl.person ? '<figcaption><strong>' + L.esc(cl.person) + '</strong><span>' + L.esc(cl.person_title || "") + '</span></figcaption>' : '') +
          '</figure>' : "") +
        '<div class="lmk-close-body">' +
          (cl.eyebrow ? '<p class="lmk-close-eyebrow">' + L.esc(cl.eyebrow) + '</p>' : "") +
          '<h2 class="lmk-close-h">' + (cl.headline_html || L.esc(cl.headline || "Want this run for you?")) + '</h2>' +
          (cl.body ? '<p class="lmk-close-p">' + L.esc(cl.body) + '</p>' : "") +
          '<a class="lmk-pill-btn lmk-close-cta" href="' + L.esc(cl.cta_url) + '" target="_blank" rel="noopener">' + L.esc(cl.cta_label || "Book a call") + ' <span class="lmk-pill-chip" aria-hidden="true">→</span></a>' +
          (cl.note ? '<p class="lmk-close-note">' + L.esc(cl.note) + '</p>' : "") +
        '</div>' +
      '</div>';
    var cta = sec.querySelector(".lmk-close-cta");
    if (cta) cta.addEventListener("click", function () {
      L.beacon("ai-kit", "cta_click", { answers: { target: "closing_book_" + (view || "page"), kit: data.kit_name || data.slug } });
    });
    return sec;
  }

  function buildClientFooter(data) {
    // Client surfaces only: ivan/legacy pages (no data.client, no data.footer) render no footer.
    if (!data.footer && !data.client) return null;
    var f = data.footer || {};
    var c = data.client || {};
    var site = f.site || c.site;
    var host = site ? String(site).replace(/^https?:\/\//, "").replace(/\/$/, "") : "";
    var foot = L.make("footer", { class: "lmk-c-footer" });
    foot.innerHTML =
      '<div class="lmk-c-footer-inner">' +
        (f.logo_white ? '<img src="' + L.esc(f.logo_white) + '" alt="' + L.esc(clientName(data)) + '">' : '<strong>' + L.esc(clientName(data)) + '</strong>') +
        (f.line ? '<p>' + L.esc(f.line) + '</p>' : "") +
        (site ? '<a href="' + L.esc(site) + '" target="_blank" rel="noopener">' + L.esc(host) + ' <span aria-hidden="true">→</span></a>' : "") +
      '</div>';
    return foot;
  }

  function buildWhatsInside(data) {
    var files = (data.files || []).filter(function (f) { return !/readme/i.test(f.name || ""); });
    var sec = L.make("aside", { class: "lmk-inside", "aria-label": "What's inside" });
    sec.innerHTML =
      '<p class="lmk-inside-eyebrow">What&rsquo;s inside</p>' +
      '<h2 class="lmk-inside-h">' + files.length + ' Claude skills, one per lever that moves your P&amp;L.</h2>' +
      '<ul class="lmk-inside-list">' +
        files.map(function (f) {
          var desc = f.description || "";
          var lever = "", rest = desc;
          var dot = desc.indexOf(". ");
          if (dot > 0 && dot < 24) { lever = desc.slice(0, dot); rest = desc.slice(dot + 2); }
          return '<li class="lmk-inside-item">' +
            '<span class="lmk-inside-name">' + L.esc(f.name || f.path) + '</span>' +
            (lever ? '<span class="lmk-inside-lever">' + L.esc(lever) + '</span>' : '') +
            '<span class="lmk-inside-desc">' + L.esc(rest) + '</span>' +
          '</li>';
        }).join("") +
      '</ul>' +
      '<p class="lmk-inside-note">Every skill runs on your own numbers, with the math shown. Nothing invented.</p>';
    return sec;
  }

  function buildGate(data, onPass) {
    var g = data.gate || {};
    var files = data.files || [];
    var skillCount = files.filter(function (f) { return !/readme/i.test(f.name || ""); }).length || files.length;
    var sec = L.make("section", { class: "lmk-gate", "aria-label": "Get the kit" });
    var metaBits = [skillCount + " skills", "Runs in Claude", "Free"];
    var askStore = g.ask_store !== false; // store is optional; on by default
    sec.innerHTML =
      '<div class="lmk-gate-card">' +
        '<h2 class="lmk-gate-h">' + L.esc(g.headline || "Get the kit") + '</h2>' +
        (g.sub ? '<p class="lmk-gate-sub">' + L.esc(g.sub) + '</p>' : "") +
        '<form class="lmk-gate-form" novalidate>' +
          '<label class="sr-only" for="lmk-g-name">Your name</label>' +
          '<input id="lmk-g-name" type="text" autocomplete="given-name" placeholder="' + L.esc(g.name_placeholder || "First name") + '" required>' +
          '<label class="sr-only" for="lmk-g-email">Email</label>' +
          '<input id="lmk-g-email" type="email" autocomplete="email" placeholder="' + L.esc(g.email_placeholder || "you@yourstore.com") + '" required>' +
          (askStore ?
            '<label class="sr-only" for="lmk-g-store">Store URL (optional)</label>' +
            '<input id="lmk-g-store" type="url" autocomplete="url" placeholder="' + L.esc(g.store_placeholder || "yourstore.com (optional)") + '">' : "") +
          '<button class="lmk-gate-btn" type="submit">' + L.esc(g.button || "Send me the kit") + '</button>' +
          '<p class="lmk-gate-err" id="lmk-gate-err" role="alert"></p>' +
        '</form>' +
        '<div class="lmk-gate-meta">' + metaBits.map(function (m) { return '<span>' + L.esc(m) + '</span>'; }).join('<i aria-hidden="true">·</i>') + '</div>' +
        (g.note ? '<p class="lmk-gate-note">' + L.esc(g.note) + '</p>' : "") +
      '</div>';
    var form = sec.querySelector(".lmk-gate-form");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = (sec.querySelector("#lmk-g-name").value || "").trim();
      var email = (sec.querySelector("#lmk-g-email").value || "").trim();
      var storeEl = sec.querySelector("#lmk-g-store");
      var store = storeEl ? (storeEl.value || "").trim() : "";
      var err = sec.querySelector("#lmk-gate-err");
      if (!name) { err.textContent = "Add your name so we know who to send it to."; sec.querySelector("#lmk-g-name").focus(); return; }
      if (!L.emailIsValid(email)) { err.textContent = "Enter a valid email so we can send you the kit."; sec.querySelector("#lmk-g-email").focus(); return; }
      err.textContent = "";
      L.updateReader({ email: email, name: name });
      // leaf_template_key routes the capture to a client-specific nurture sequence
      // in lm-beacon (pickSequenceByLeafTemplate). Only sent when the kit sets one,
      // so it never touches Ivan's own format-routed sequences. Inert until an
      // ACTIVE sequence with this key exists.
      var seqKey = (data.gate && data.gate.sequence_key) || "";
      L.beacon("ai-kit", "capture", { email: email, answers: { name: name, store_url: store, kit: data.kit_name || data.slug, skills: files.length, leaf_template_key: seqKey || undefined } });
      onPass({ email: email, name: name, store: store });
    });
    return sec;
  }

  function buildThankYou(data, name) {
    var t = data.thank_you || {};
    var c = data.client || {};
    var first = (name || "").trim().split(/\s+/)[0] || "";
    var namePart = first ? (", " + first) : "";
    var fill = function (s) { return String(s || "").split("{name}").join(namePart); };
    var sec = L.make("section", { class: "lmk-ty lmk-reveal", "aria-label": "Thank you" });
    var videoBlock = t.video_embed
      ? (/\.mp4(\?|$)/i.test(String(t.video_embed))
          ? '<div class="lmk-ty-video"><video src="' + L.esc(t.video_embed) + '" title="Walkthrough" controls playsinline preload="metadata"></video></div>'
          : '<div class="lmk-ty-video"><iframe src="' + L.esc(t.video_embed) + '" title="Walkthrough" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></div>')
      : t.video_url
      ? '<div class="lmk-ty-video"><video controls preload="none"' + (t.video_poster ? ' poster="' + L.esc(t.video_poster) + '"' : "") + ' src="' + L.esc(t.video_url) + '"></video></div>'
      : '<div class="lmk-ty-video lmk-ty-video-soon" aria-hidden="true"><span class="lmk-ty-play">▶</span><span class="lmk-ty-soon">A short walkthrough from ' + L.esc(clientName(data)) + ' lands here soon.</span></div>';
    var bullets = Array.isArray(t.bullets) ? t.bullets : [];
    // Default video lead-in for client kit/report LMs that ship a walkthrough but no per-LM
    // video_lead. Only shown when a video is actually present, never on the "coming soon" state.
    var vlead = t.video_lead || ((t.video_embed || t.video_url) ? "Here's a good way to spend that time 👇" : "");
    var kitBtn = t.kit_open === false ? "" :
      '<div class="lmk-ty-actions"><a class="lmk-ty-open" href="?unlocked=1">' + L.esc(t.kit_label || "Open the kit") + ' <span aria-hidden="true">→</span></a></div>';
    sec.innerHTML =
      '<div class="lmk-ty-inner">' +
        (c.logo ? '<img class="lmk-ty-logo" src="' + L.esc(c.logo) + '" alt="' + L.esc(clientName(data)) + '">' : "") +
        '<p class="lmk-ty-eyebrow">' + L.esc(fill(t.eyebrow || "You're in")) + '</p>' +
        '<h2 class="lmk-ty-h">' + L.esc(fill(t.headline || "Your kit is ready{name}.")) + '</h2>' +
        '<p class="lmk-ty-body">' + L.esc(fill(t.body || "Your resource is on its way. Should be with you in 5–10 minutes.")) + '</p>' +
        (vlead ? '<p class="lmk-ty-vlead" style="font-size:1.45rem;font-weight:800;line-height:1.2;margin:26px 0 12px">' + L.esc(fill(vlead)) + '</p>' : "") +
        videoBlock +
        kitBtn +
        (bullets.length ? '<ul class="lmk-ty-points">' + bullets.map(function (b) { return '<li>' + L.esc(b) + '</li>'; }).join("") + '</ul>' : "") +
        (t.cta_url ? '<a class="lmk-ty-cta" href="' + L.esc(t.cta_url) + '" target="_blank" rel="noopener">' + L.esc(t.cta_label || "Book a call") + ' <span aria-hidden="true">→</span></a>' : "") +
        (t.cta_note ? '<p class="lmk-ty-note">' + L.esc(t.cta_note) + '</p>' : "") +
      '</div>';
    var open = sec.querySelector(".lmk-ty-open");
    if (open) open.addEventListener("click", function () { L.beacon("ai-kit", "cta_click", { answers: { target: "thankyou_open_kit", kit: data.kit_name || data.slug } }); });
    var cta = sec.querySelector(".lmk-ty-cta");
    if (cta) cta.addEventListener("click", function () { L.beacon("ai-kit", "cta_click", { answers: { target: "thankyou_book", kit: data.kit_name || data.slug } }); });
    return sec;
  }

  // The kit is delivered by email; the email links here with an unlock param.
  // Opening the page with ?unlocked=1 (or ?kit / #kit) renders the resource
  // directly, bypassing the gate. Soft by design — a free LM, capture is the point.
  function isUnlocked() {
    try {
      var p = new URLSearchParams(location.search || "");
      if (p.get("unlocked") === "1" || p.has("kit")) return true;
    } catch (_) {}
    return /(^|[#&])kit\b/.test(location.hash || "");
  }

  // STATE — resource: the branded kit itself (email destination).
  function buildResourceView(data) {
    var wrap = L.make("div", { class: "lmk-resource" });
    wrap.appendChild(buildClientHero(data)); // branded hero so the kit page carries the client's brand
    var head = L.make("section", { class: "lmk-res-head lmk-reveal" });
    head.innerHTML =
      '<p class="lmk-res-eyebrow">Your kit</p>' +
      '<h2 class="lmk-res-h">' + L.esc(data.resource_headline || "Here's everything inside.") + '</h2>' +
      '<p class="lmk-res-sub">Download the pack, or copy any single skill straight into Claude and run it now.</p>';
    wrap.appendChild(head);
    var container = L.make("div", { class: "lmc-container lmk-root" });
    container.appendChild(buildQuickStart(data));
    container.appendChild(buildDownloadBand(data));
    container.appendChild(buildBrowser(data));
    wrap.appendChild(container);
    return wrap;
  }

  // Safety: force-reveal any .lmk-reveal that is at/above the fold shortly after
  // load, so a missed IntersectionObserver tick can never strand a section
  // invisible. Below-fold sections still animate in on scroll as normal.
  function revealSafety(root) {
    setTimeout(function () {
      var vh = window.innerHeight || 800;
      root.querySelectorAll(".lmk-reveal:not(.in-view)").forEach(function (el) {
        if (el.getBoundingClientRect().top < vh * 0.92) el.classList.add("in-view");
      });
    }, 1400);
  }

  function renderGatedClientKit(data, root) {
    root.innerHTML = "";
    root.classList.add("lmk-page", "lmk-client");
    root.style.setProperty("--lmk-accent", clientAccent(data));
    if (data.client && data.client.ink) root.style.setProperty("--lmk-ink", data.client.ink);

    // Arrived via the email link → show the kit directly, no gate.
    if (isUnlocked()) {
      root.appendChild(buildResourceView(data));
      var closeU = buildClientClosing(data, "unlocked");
      if (closeU) root.appendChild(closeU);
      var footU = buildClientFooter(data);
      if (footU) root.appendChild(footU);
      L.observeReveal(root, ".lmk-reveal");
      revealSafety(root);
      L.beacon("ai-kit", "view", { answers: { via: "unlock" } });
      L.beacon("ai-kit", "unlock", { kit: data.kit_name || data.slug });
      return;
    }

    // Landing (hard gate): hero, then split of "what's inside" + gate, then
    // the founder-fronted closing band and footer (both persist on thank-you).
    var landing = L.make("div", { class: "lmk-landing" });
    landing.appendChild(buildClientHero(data));
    var grid = L.make("div", { class: "lmk-landing-grid" });
    grid.appendChild(buildWhatsInside(data));
    // Returning visitor on the thank-you URL (?thanks=1) who already captured:
    // render the thank-you view directly instead of the gate. Unknown visitors
    // on that URL fall through to the normal landing (param stripped).
    var params = new URLSearchParams(location.search || "");
    if (params.get("thanks") === "1") {
      var known = (L.readerIdentity && L.readerIdentity().email) || null;
      if (known) {
        var tyDirect = buildThankYou(data, null);
        root.appendChild(tyDirect);
        var closeT = buildClientClosing(data, "thankyou");
        if (closeT) root.appendChild(closeT);
        var footT = buildClientFooter(data);
        if (footT) root.appendChild(footT);
        L.observeReveal(root, ".lmk-reveal");
        revealSafety(root);
        L.beacon("ai-kit", "view", { answers: { via: "thanks_url" } });
        return;
      }
      try { history.replaceState(null, "", location.pathname); } catch (_) {}
    }

    grid.appendChild(buildGate(data, function (sub) {
      // Submit → thank-you view (kit goes out by email); closing + footer stay.
      // The thank-you gets its own URL so it is trackable and survives reload.
      try { history.pushState(null, "", "?thanks=1"); } catch (_) {}
      var ty = buildThankYou(data, sub && sub.name);
      root.insertBefore(ty, landing.nextSibling);
      landing.remove();
      window.scrollTo(0, 0);
      L.observeReveal(root, ".lmk-reveal");
      revealSafety(root);
      L.beacon("ai-kit", "complete", { kit: data.kit_name || data.slug });
    }));
    landing.appendChild(grid);
    root.appendChild(landing);
    var closeL = buildClientClosing(data, "landing");
    if (closeL) root.appendChild(closeL);
    var footL = buildClientFooter(data);
    if (footL) root.appendChild(footL);

    L.observeReveal(root, ".lmk-reveal");
    revealSafety(root);
    L.beacon("ai-kit", "view");
  }

  // --- File browser ---
  function buildBrowser(data) {
    var files = data.files || [];
    var sec = L.make("section", { class: "lmk-files lmk-reveal", id: "lmk-files", "aria-label": "Kit files" });
    sec.appendChild(L.make("h2", { class: "lmk-files-h" }, "What's inside"));

    var wrap = L.make("div", { class: "lmk-browser" });
    var tree = L.make("nav", { class: "lmk-tree", "aria-label": "Kit file list" });
    var viewer = L.make("div", { class: "lmk-viewer" });

    var active = null;
    function show(f, btn) {
      if (active) active.classList.remove("is-active");
      active = btn; btn.classList.add("is-active");
      viewer.innerHTML =
        '<div class="lmk-view-head">' +
          '<div class="lmk-view-meta">' +
            '<span class="lmk-view-path">' + L.esc(f.path || f.name) + '</span>' +
            (f.user_editable ? '<span class="lmk-pill lmk-pill-edit">you edit this</span>' : '<span class="lmk-pill">pre-built</span>') +
          '</div>' +
          '<div class="lmk-view-actions">' +
            '<button class="lmk-mini-btn" type="button" data-act="copy">Copy</button>' +
            '<button class="lmk-mini-btn" type="button" data-act="file">Download</button>' +
          '</div>' +
        '</div>' +
        (f.description ? '<p class="lmk-view-desc">' + L.esc(f.description) + '</p>' : '') +
        '<pre class="lmk-code"><code></code></pre>';
      viewer.querySelector("code").textContent = f.content || "";
      viewer.querySelector('[data-act="copy"]').addEventListener("click", function () {
        navigator.clipboard.writeText(f.content || "").then(function () {
          L.toast("Copied " + (f.name || "file"));
          L.beacon("ai-kit", "copy", { file: f.path });
        });
      });
      viewer.querySelector('[data-act="file"]').addEventListener("click", function () {
        downloadBlob(new Blob([f.content || ""], { type: "text/markdown" }), f.name || "file.md");
        L.beacon("ai-kit", "download", { file: f.path });
      });
      L.beacon("ai-kit", "file_view", { file: f.path });
    }

    groupFiles(files).forEach(function (g) {
      tree.appendChild(L.make("div", { class: "lmk-tree-label" }, g.label));
      g.files.forEach(function (f) {
        var btn = L.make("button", { class: "lmk-tree-file", type: "button" });
        btn.innerHTML = '<span class="lmk-tree-name">' + L.esc(f.name || f.path) + '</span>' +
          (f.user_editable ? '<span class="lmk-dot" title="You fill this in" aria-label="You fill this in"></span>' : '');
        btn.addEventListener("click", function () { show(f, btn); });
        tree.appendChild(btn);
      });
    });

    wrap.appendChild(tree);
    wrap.appendChild(viewer);
    sec.appendChild(wrap);

    // Open CLAUDE.md (or first file) by default
    var first = files.filter(function (f) { return /^claude\.md$/i.test(f.name || ""); })[0] || files[0];
    if (first) {
      var idx = files.indexOf(first);
      var btns = tree.querySelectorAll(".lmk-tree-file");
      if (btns[idx]) show(first, btns[idx]);
    }
    return sec;
  }

  function render(data, root) {
    // R2: expose page data to shared.js canonicalBeaconEvent (client_id stamping on
    // client pages - guide.js/assessment-v2.js already do this; ai-kit never did,
    // which let kit-page captures fall into Ivan's format nurture. Ivan pages:
    // client.id is null, so stamping stays off and payloads are unchanged.
    window.__lm_data = data;
    if (data.gate && data.gate.mode) { return renderGatedClientKit(data, root); }
    root.innerHTML = "";
    root.classList.add("lmk-page");
    var files = data.files || [];
    var editable = files.filter(function (f) { return f.user_editable; }).length;

    root.appendChild(L.buildHero(data, {
      badge: data.format_label || "AI Kit",
      metaChips: [
        files.length + " files",
        editable + " you customize",
        "Claude Code ready",
        "Free resource",
      ],
    }));

    root.appendChild(L.buildIntro(data, "#lmk-files", {
      tool_type: "ai-kit",
      startLabel: "See what's inside",
      defaultValueBullet: "A working Claude system, not a PDF about one",
      defaultNextBullet: "Browse every file first — download only if it earns it",
    }));

    var container = L.make("div", { class: "lmc-container lmk-root" });
    container.appendChild(buildQuickStart(data));
    // Plugin install strip (primary path); the ZIP band below stays as the
    // no-install secondary affordance. Renders only for kits mapped to a
    // manfredi-marketplace plugin.
    if (L.buildInstallStrip) {
      var installStrip = L.buildInstallStrip("ai-kit", data);
      if (installStrip) container.appendChild(installStrip);
    }
    container.appendChild(buildDownloadBand(data));
    container.appendChild(buildBrowser(data));
    root.appendChild(container);

    // Model-currency line (Spec 3): "Tested against <current models> (as of
    // <confirmed date>)." Rendered at view time from /frontier.json so it can
    // never go stale with the page; absent entirely when no confirmed data.
    if (L.frontier) {
      L.frontier.load().then(function () {
        var line = L.frontier.testedLine();
        if (!line) return;
        var el = L.make("div", { class: "lmk-currency-line", style: "max-width:860px;margin:0 auto;padding:0 1.5rem 2rem;font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:.75rem;letter-spacing:.05em;color:rgba(19, 18, 16,.55)" }, line);
        container.appendChild(el);
      });
    }

    root.appendChild(L.buildClosingCta("ai-kit", data, { toolType: "ai-kit" }));

    L.observeReveal(root, ".lmk-reveal");
    L.beacon("ai-kit", "view");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-lm-ai-kit-src]") || document.querySelector("#lmc-root");
    if (!root) return;
    var defaultSrc = root.getAttribute("data-lm-ai-kit-src") || "./data.json";
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
      .then(function (data) { render(data, root); })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading kit:</strong> ' + L.esc(e.message) + "</div>";
      });
  });
})();
