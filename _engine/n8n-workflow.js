/* LM N8N Workflow Engine — editorial wrapper around a downloadable workflow JSON.
 * Data.json shape: { slug, title, subtitle, estimated_minutes, brand, workflow_file,
 *   node_count, credentials_required[], env_vars[], what_it_does, sections[],
 *   ctas[], data_version } */
(function () {
  "use strict";
  if (!window.LM) { console.error("shared.js not loaded"); return; }
  var L = window.LM;
  var MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";

  function render(data, root) {
    window.__lm_slug = data.slug;
    window.__lm_data = data;
    window.__lm_format = "n8n-workflow";

    root.className = "lmc-root lmw-root";
    root.innerHTML = "";

    // Hero
    var chips = [
      (data.node_count || 0) + " nodes",
      (data.credentials_required || []).length + " credentials",
      (data.estimated_minutes || 10) + " min setup",
    ];
    root.appendChild(L.buildHero(data, {
      badge: (data.brand && data.brand.hero_badge) || "n8n Workflow",
      metaChips: chips,
    }));

    var heroH1 = root.querySelector(".lmc-h1");
    var heroSub = root.querySelector(".lmc-sub");
    var heroBadge = root.querySelector(".lmc-badge");
    if (heroH1 && L.editMode) L.editMode.registerField(heroH1, "title");
    if (heroSub && L.editMode) L.editMode.registerField(heroSub, "subtitle");
    if (heroBadge && L.editMode) L.editMode.registerField(heroBadge, "brand.hero_badge");

    root.appendChild(L.buildIntro(data, ".lmw-download", {
      tool_type: "n8n-workflow",
      defaultValueBullet: "Drop the JSON into your n8n, plug in creds, run",
      defaultNextBullet: "Use the walkthrough below to understand each stage before customizing",
      startLabel: "Get the workflow",
      defaultNote: "",
    }));

    var main = L.make("main", { class: "lmc-container lmw-prose" });

    // Download + copy section (prominent, top of body)
    var dl = L.make("section", { class: "lmw-download" });
    dl.innerHTML =
      '<div class="lmw-download-row">' +
        '<a class="lmc-btn lmw-download-btn" id="lmw-download-btn" href="./' + L.esc(data.workflow_file || "workflow.json") + '" download>' +
          '↓ Download workflow JSON' +
        '</a>' +
        '<button class="lmc-btn lmc-btn-secondary lmw-copy-btn" id="lmw-copy-btn" type="button">' +
          'Copy to clipboard' +
        '</button>' +
      '</div>' +
      '<p class="lmw-download-note">' + (data.node_count || "?") + ' nodes · ' +
        L.esc((data.credentials_required || []).join(", ") || "No credentials required") +
      '</p>';
    main.appendChild(dl);

    // What it does
    if (data.what_it_does) {
      var wd = L.make("section", { class: "lmw-overview" });
      wd.innerHTML = '<h2>What it does</h2><div class="lmw-overview-body">' + data.what_it_does + '</div>';
      var wdBody = wd.querySelector(".lmw-overview-body");
      if (wdBody && L.editMode) L.editMode.registerField(wdBody, "what_it_does", { contenteditable: true });
      main.appendChild(wd);
    }

    // Mermaid diagram (lazy-loaded)
    var diagramSec = L.make("section", { class: "lmw-diagram" });
    diagramSec.innerHTML = '<h2>How it flows</h2><div class="mermaid" id="lmw-mermaid">Loading diagram…</div>';
    main.appendChild(diagramSec);
    loadMermaidAndRender(data);

    // Setup checklist
    var creds = data.credentials_required || [];
    var envs = data.env_vars || [];
    if (creds.length || envs.length) {
      var setup = L.make("section", { class: "lmw-setup" });
      var credsList = creds.map(function (c) { return '<li>' + L.esc(c) + '</li>'; }).join('');
      var envsList = envs.map(function (e) { return '<li><code>' + L.esc(e) + '</code></li>'; }).join('');
      setup.innerHTML = '<h2>Before you import</h2>' +
        (creds.length ? '<h3>Credentials</h3><ul>' + credsList + '</ul>' : '') +
        (envs.length ? '<h3>Env vars</h3><ul>' + envsList + '</ul>' : '');
      // Register each requirement li against its array index — position-based
      // lookup (h3 textContent -> next sibling ul) so no attrs/classes are added
      // to keep rendered DOM byte-identical outside edit mode.
      if (L.editMode) {
        Array.prototype.forEach.call(setup.querySelectorAll("h3"), function (h3) {
          var ul = h3.nextElementSibling;
          if (!ul || ul.tagName !== "UL") return;
          if (h3.textContent === "Credentials") {
            Array.prototype.forEach.call(ul.querySelectorAll("li"), function (li, i) {
              L.editMode.registerField(li, "credentials_required[" + i + "]");
            });
          } else if (h3.textContent === "Env vars") {
            Array.prototype.forEach.call(ul.querySelectorAll("li"), function (li, i) {
              var code = li.querySelector("code") || li;
              L.editMode.registerField(code, "env_vars[" + i + "]");
            });
          }
        });
      }
      main.appendChild(setup);
    }

    // Per-stage walkthrough sections
    var sectionsContainer = L.make("div", { class: "lmw-sections-container" });
    (data.sections || []).forEach(function (s, sIdx) {
      var attrs = { class: "lmw-section lmg-section" };
      if (s.id) attrs.id = "section-" + s.id;
      var sec = L.make("section", attrs);
      sec.setAttribute("data-section-id", s.id || s.title);
      if (s.title) {
        var h2 = L.make("h2", null, L.esc(s.title));
        if (L.editMode) L.editMode.registerField(h2, "sections[" + sIdx + "].title");
        sec.appendChild(h2);
      }
      if (s.html) {
        var body = L.make("div");
        body.innerHTML = s.html;
        if (L.editMode) L.editMode.registerField(body, "sections[" + sIdx + "].html", { contenteditable: true });
        sec.appendChild(body);
      }
      sectionsContainer.appendChild(sec);
    });
    if (L.editMode) L.editMode.registerArray(sectionsContainer, "sections", {
      itemLabel: "stage",
      template: { id: "", title: "New stage", html: "<p>Describe what happens here.</p>" },
    });
    main.appendChild(sectionsContainer);

    // Closing CTA — call-first finale (2026-06-09). Replaces the old bare
    // ctas[0] box; a per-LM data.ctas[0] with a custom URL still wins.
    if (Array.isArray(data.ctas) && data.ctas.length && data.ctas[0].url) {
      var cta = data.ctas[0];
      var ctaSec = L.make("section", { class: "lmw-cta" });
      ctaSec.innerHTML = '<h2>' + L.esc(cta.headline || "Want this customized?") + '</h2>' +
        '<a class="lmc-btn" href="' + L.esc(L.normalizeCtaUrl ? L.normalizeCtaUrl(cta.url, "closing-cta") : cta.url) + '" target="_blank" rel="noopener">' +
          L.esc(cta.button || "Talk to me") +
        '</a>';
      // Only register when the fallback literal wasn't used — textContent must
      // equal the raw stored value (ctas[0].url is a fixed, non-dynamic pick,
      // unlike architecture/ai-walkthrough's runtime pickCta selection).
      if (L.editMode) {
        if (cta.headline) L.editMode.registerField(ctaSec.querySelector("h2"), "ctas[0].headline");
        if (cta.button) L.editMode.registerField(ctaSec.querySelector("a"), "ctas[0].button");
      }
      main.appendChild(ctaSec);
    } else {
      main.appendChild(L.buildClosingCta("n8n_workflow", data, { toolType: "n8n-workflow" }));
    }

    // Share row
    var shareText = "Free n8n workflow: " + (data.title || "this one") + ", by Ivan Manfredi.";
    var shareRow = L.make("div", { class: "lmc-share lmw-share" });
    shareRow.innerHTML =
      '<a class="lmc-btn lm-share-whatsapp" target="_blank" rel="noopener" href="' +
        (L.share ? L.share.whatsapp(shareText) : "#") + '">Share on WhatsApp</a>' +
      '<a class="lmc-btn lmc-btn-secondary" target="_blank" rel="noopener" href="' +
        (L.share ? L.share.linkedIn(shareText) : "#") + '">Share on LinkedIn</a>';
    main.appendChild(shareRow);

    root.appendChild(main);

    // Wire interactions
    wireDownloadAndCopy(data);
    L.beacon("n8n-workflow", "view");
  }

  function wireDownloadAndCopy(data) {
    var dlBtn = document.getElementById("lmw-download-btn");
    if (dlBtn) {
      dlBtn.addEventListener("click", function () {
        L.beacon("n8n-workflow", "download", { workflow_file: data.workflow_file });
      });
    }
    var cpBtn = document.getElementById("lmw-copy-btn");
    if (cpBtn) {
      cpBtn.addEventListener("click", function () {
        fetch("./" + (data.workflow_file || "workflow.json"))
          .then(function (r) { return r.text(); })
          .then(function (txt) {
            if (navigator.clipboard) {
              navigator.clipboard.writeText(txt).then(function () {
                L.toast("Copied workflow JSON");
                L.beacon("n8n-workflow", "copy_json");
              });
            } else {
              L.toast("Copy not supported in this browser");
            }
          });
      });
    }
  }

  function loadMermaidAndRender(data) {
    if (document.querySelector('script[data-mermaid]')) {
      tryRender(data);
      return;
    }
    var s = document.createElement("script");
    s.src = MERMAID_CDN;
    s.setAttribute("data-mermaid", "true");
    s.onload = function () { tryRender(data); };
    s.onerror = function () {
      var el = document.getElementById("lmw-mermaid");
      if (el) el.innerHTML = '<p class="lmw-mermaid-fallback">Diagram unavailable. <a href="./' + L.esc(data.workflow_file || "workflow.json") + '" download>Download the JSON</a> to see the workflow structure.</p>';
    };
    document.head.appendChild(s);
  }

  function tryRender(data) {
    fetch("./" + (data.workflow_file || "workflow.json"))
      .then(function (r) { return r.json(); })
      .then(function (wf) {
        var mermaidSyntax = n8nToMermaidInline(wf);
        var el = document.getElementById("lmw-mermaid");
        if (!el) return;
        el.textContent = mermaidSyntax;
        el.removeAttribute("data-processed");
        if (window.mermaid && typeof window.mermaid.run === "function") {
          window.mermaid.initialize({ startOnLoad: false, theme: "neutral", themeVariables: { primaryColor: "#FFFFFF", primaryTextColor: "#131210", lineColor: "#131210" } });
          window.mermaid.run({ nodes: [el] }).then(function () {
            L.beacon("n8n-workflow", "mermaid_view");
          }).catch(function () {
            el.innerHTML = '<p class="lmw-mermaid-fallback">Diagram failed to render. JSON is still downloadable above.</p>';
          });
        }
      })
      .catch(function () {
        var el = document.getElementById("lmw-mermaid");
        if (el) el.innerHTML = '<p class="lmw-mermaid-fallback">Diagram unavailable.</p>';
      });
  }

  // Inline copy of n8nToMermaid so we don't have to fetch a separate script.
  function n8nToMermaidInline(workflow) {
    function nodeId(name) { return name.replace(/[^a-zA-Z0-9]/g, "_") || "N"; }
    var lines = ["flowchart TD"];
    (workflow.nodes || []).forEach(function (n) {
      lines.push("  " + nodeId(n.name) + '["' + n.name.replace(/"/g, '\\"') + '"]');
    });
    var conns = workflow.connections || {};
    Object.keys(conns).forEach(function (from) {
      ((conns[from] || {}).main || []).forEach(function (targets) {
        (targets || []).forEach(function (t) {
          if (t && t.node) lines.push("  " + nodeId(from) + " --> " + nodeId(t.node));
        });
      });
    });
    return lines.join("\n");
  }

  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-n8n-src]");
    if (!root) return;
    var src = root.getAttribute("data-lm-n8n-src") || "./data.json";
    fetch(src, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); })
      .then(function (data) { render(data, root); window.__lm_rerender = function(){ render(window.__lm_data, root); }; })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading workflow:</strong> ' + L.esc(e.message) + '</div>';
      });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
