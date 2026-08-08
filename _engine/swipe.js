/* Swipe File engine — filterable list with "take" mechanic and filtered
 * Markdown export. Data.json shape:
 * { slug, title, subtitle, brand, estimated_minutes,
 *   tags: ["Cold DM","Follow-up",...],
 *   examples: [{ id, title, body, why, tags:["..."] }] }
 */
(function () {
  "use strict";
  if (!window.LM) { console.error("shared.js not loaded"); return; }
  var L = window.LM;

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "swipe";  // required so edit mode can mount (shared.js waits for __lm_format + __lm_data)
    var slug = data.slug;
    var taken = L.readKV("swipe", slug, "taken", []) || [];
    var takenSet = new Set(taken);
    var captured = !!L.readKV("swipe", slug, "email", null);
    var activeFilter = L.readKV("swipe", slug, "filter", "all") || "all";

    root.className = "lmc-root lms-root";
    root.innerHTML = "";
    root.appendChild(L.buildHero(data, {
      badge: (data.brand && data.brand.hero_badge) || "Swipe File",
      metaChips: [
        (data.examples || []).length + " examples",
        "Filterable",
        "Take what you need"
      ]
    }));
    var heroH1 = root.querySelector(".lmc-h1");
    var heroSub = root.querySelector(".lmc-sub");
    var heroBadge = root.querySelector(".lmc-badge");
    if (L.editMode) {
      if (heroH1) L.editMode.registerField(heroH1, "title");
      if (heroSub) L.editMode.registerField(heroSub, "subtitle");
      // brand.hero_badge is a writable path even when data didn't supply it
      // (the rendered text is just the fallback "Swipe File" in that case) —
      // register unconditionally, matching the other engines.
      if (heroBadge) L.editMode.registerField(heroBadge, "brand.hero_badge");
    }
    root.appendChild(L.buildIntro(data, ".lms-filters", {
      tool_type: "swipe",
      defaultValueBullet: "Filter by use case, take only the examples that fit you",
      defaultNextBullet: "Export your selected subset as markdown. Your URL stays in the file",
      startLabel: "Browse examples",
      defaultNote: "No signup to browse. Take 3 or more examples to unlock a markdown export."
    }));

    // Tag filter bar
    var tags = Array.from(new Set(
      ["All"].concat(
        (data.tags && data.tags.length) ? data.tags :
        (data.examples || []).reduce(function (acc, ex) { return acc.concat(ex.tags || []); }, [])
      )
    ));
    var filters = L.make("div", { class: "lms-filters" });
    var inner = L.make("div", { class: "lms-filters-inner" });
    inner.appendChild(L.make("span", { class: "lms-filter-label" }, "Filter"));
    tags.forEach(function (t) {
      var key = t.toLowerCase();
      var btn = L.make("button", {
        type: "button",
        class: "lms-filter" + (activeFilter === key ? " active" : ""),
        "data-tag": key
      }, L.esc(t));
      inner.appendChild(btn);
    });
    var takenCount = L.make("span", { class: "lms-taken-count", id: "lms-taken-count" });
    takenCount.innerHTML = '<strong>' + taken.length + '</strong> / ' + (data.examples || []).length + ' taken';
    inner.appendChild(takenCount);
    filters.appendChild(inner);
    root.appendChild(filters);

    // Example list
    var main = L.make("main", { class: "lmc-container" });
    var list = L.make("div", { class: "lms-list" });
    (data.examples || []).forEach(function (ex, exIdx) {
      var art = L.make("article", {
        class: "lms-example" + (takenSet.has(ex.id) ? " taken" : ""),
        "data-ex-id": ex.id,
        "data-tags": (ex.tags || []).map(function (t) { return t.toLowerCase(); }).join("|")
      });
      var tagsHtml = (ex.tags || []).map(function (t) { return '<span class="lms-ex-tag">' + L.esc(t) + '</span>'; }).join("");
      art.innerHTML =
        '<div class="lms-ex-head">' +
          '<h3 class="lms-ex-title">' + L.esc(ex.title || "") + '</h3>' +
          (tagsHtml ? '<div class="lms-ex-tags">' + tagsHtml + '</div>' : '') +
        '</div>' +
        '<pre class="lms-ex-body">' + L.esc(ex.body || "") + '</pre>' +
        (ex.why ? '<p class="lms-ex-why">' + L.esc(ex.why) + '</p>' : '') +
        '<div class="lms-ex-actions">' +
          '<button type="button" class="lms-take-btn">' + (takenSet.has(ex.id) ? "Taken" : "Take this example") + '</button>' +
        '</div>';
      // Registration — capture nodes AFTER the innerHTML build above, don't
      // rewrite the render. "Take this example"/"Taken" button text and the
      // "taken" class are runtime UI state, not stored copy — not registered.
      if (L.editMode) {
        var exTitleEl = art.querySelector(".lms-ex-title");
        if (exTitleEl) L.editMode.registerField(exTitleEl, "examples[" + exIdx + "].title");
        var exBodyEl = art.querySelector(".lms-ex-body");
        if (exBodyEl) L.editMode.registerField(exBodyEl, "examples[" + exIdx + "].body", { multiline: true });
        var exWhyEl = art.querySelector(".lms-ex-why");
        if (exWhyEl) L.editMode.registerField(exWhyEl, "examples[" + exIdx + "].why", { multiline: true });
        Array.prototype.forEach.call(art.querySelectorAll(".lms-ex-tag"), function (tagEl, tIdx) {
          L.editMode.registerField(tagEl, "examples[" + exIdx + "].tags[" + tIdx + "]");
        });
      }
      list.appendChild(art);
    });
    if (L.editMode) L.editMode.registerArray(list, "examples", {
      itemLabel: "example",
      template: { id: "example-" + Date.now(), title: "New example", body: "", why: "", tags: [] }
    });
    main.appendChild(list);

    // Email gate (shown after 3+ takes)
    var gate = L.make("section", { class: "lmc-capture", id: "lms-capture", style: "display: none;" });
    gate.innerHTML = '<h2>Want <em>10 more</em> like the ones you picked?</h2>' +
      '<p>One email per month, all examples tuned to the tags you gravitated toward. Unsubscribe anytime.</p>' +
      '<form class="lmc-form" id="lms-form">' +
        '<label class="sr-only" for="lms-email">Email</label>' +
        '<input class="lmc-input" type="email" id="lms-email" autocomplete="email" required placeholder="you@company.com" />' +
        '<button class="lmc-btn" type="submit">Send me 10 more</button>' +
      '</form>' +
      '<p class="lmc-note">No spam. One send a month, one click to unsubscribe.</p>';
    main.appendChild(gate);

    // Closing CTA — call-first finale (2026-06-09)
    main.appendChild(L.buildClosingCta("swipe", data, { toolType: "swipe" }));

    // Sticky export bar
    var exportBar = L.make("div", { class: "lms-export-bar", id: "lms-export-bar" });
    exportBar.innerHTML = '<span class="lms-export-text"><strong id="lms-export-count">0</strong> examples taken</span>' +
      '<button type="button" class="lms-export-btn" id="lms-export-btn">Copy as Markdown</button>';
    main.appendChild(exportBar);

    root.appendChild(main);

    // Wiring
    function applyFilter() {
      list.querySelectorAll(".lms-example").forEach(function (art) {
        if (activeFilter === "all") { art.classList.remove("dimmed"); return; }
        var tags = (art.getAttribute("data-tags") || "").split("|");
        art.classList.toggle("dimmed", !tags.includes(activeFilter));
      });
    }
    applyFilter();

    function updateTakenUI() {
      document.getElementById("lms-taken-count").innerHTML = '<strong>' + takenSet.size + '</strong> / ' + (data.examples || []).length + ' taken';
      var exportCountEl = document.getElementById("lms-export-count");
      if (exportCountEl) exportCountEl.textContent = takenSet.size;
      root.classList.toggle("has-taken", takenSet.size > 0);
      // Email gate appears at 3+ takes
      var gate = document.getElementById("lms-capture");
      if (gate) gate.style.display = takenSet.size >= 3 && !captured ? "block" : "none";
    }
    updateTakenUI();

    // Filter clicks
    inner.querySelectorAll(".lms-filter").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var tag = btn.getAttribute("data-tag");
        activeFilter = tag;
        L.writeKV("swipe", slug, "filter", tag);
        inner.querySelectorAll(".lms-filter").forEach(function (b) { b.classList.toggle("active", b === btn); });
        applyFilter();
        L.beacon("swipe", "filter", { answers: { filter: tag } });
      });
    });

    // Take clicks
    list.querySelectorAll(".lms-take-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var art = btn.closest(".lms-example");
        if (!art) return;
        var id = art.getAttribute("data-ex-id");
        var ex = (data.examples || []).find(function (e) { return e.id === id; });
        if (!ex) return;
        // Toggle taken
        if (takenSet.has(id)) {
          takenSet.delete(id);
          art.classList.remove("taken");
          btn.textContent = "Take this example";
        } else {
          takenSet.add(id);
          art.classList.add("taken");
          btn.textContent = "Taken";
          // Copy body to clipboard
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(ex.body || "").then(function () { L.toast("Copied: " + (ex.title || "example")); });
          } else {
            L.toast("Taken");
          }
        }
        L.writeKV("swipe", slug, "taken", Array.from(takenSet));
        updateTakenUI();
        L.beacon("swipe", "take", { answers: { example_id: id, taken: takenSet.has(id) } });
      });
    });

    // Export all taken as Markdown
    function exportTaken() {
      var md = "# Subset of \"" + (data.title || "Swipe File") + "\"\n\n";
      var takenExamples = (data.examples || []).filter(function (ex) { return takenSet.has(ex.id); });
      takenExamples.forEach(function (ex) {
        md += "## " + (ex.title || "") + "\n\n";
        if (ex.tags && ex.tags.length) md += "_" + ex.tags.join(" · ") + "_\n\n";
        md += "```\n" + (ex.body || "") + "\n```\n\n";
        if (ex.why) md += "> **Why it works:** " + ex.why + "\n\n";
      });
      md += "---\n" + takenExamples.length + " of " + (data.examples || []).length + " from [" + (data.title || "") + "](" + location.href + ") · by Ivan Manfredi\n";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(md).then(function () { L.toast("Subset copied as Markdown"); });
      } else {
        L.toast("Copy not supported");
      }
      L.beacon("swipe", "export", { answers: { count: takenExamples.length, ids: Array.from(takenSet) } });
    }
    document.getElementById("lms-export-btn").addEventListener("click", exportTaken);

    // Email capture
    var form = document.getElementById("lms-form");
    if (form) {
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var em = (document.getElementById("lms-email") || {}).value || "";
        if (!L.emailIsValid(em)) { L.toast("Enter a valid email"); return; }
        L.writeKV("swipe", slug, "email", em);
        L.updateReader({ email: em });
        captured = true;
        L.beacon("swipe", "capture", { email: em, answers: { taken_ids: Array.from(takenSet), taken_count: takenSet.size } });
        form.innerHTML = '<p style="font-weight:700;color:var(--accent-light)">&#10003; You\'re on the list. First send arrives in a couple weeks.</p>';
      });
    }

    // Reveal
    L.observeReveal(root, ".lms-example");

    L.beacon("swipe", "view");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-lm-swipe-src]") || document.querySelector("#lmc-root");
    if (!root) return;
    var src = root.getAttribute("data-lm-swipe-src") || "./data.json";
    fetch(src, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); })
      .then(function (data) { render(data, root); window.__lm_rerender = function(){ render(window.__lm_data, root); }; })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading swipe file:</strong> ' + L.esc(e.message) + '</div>';
      });
  });
})();
