/* LM Stack Picker Engine — vanilla JS, branching decision tree, hash-routed for shareability.
 * Inherits LM.* primitives from shared.js (must load first).
 * Schema: docs/superpowers/specs/stack-picker-schema.json
 */
(function () {
  "use strict";

  var TOOL = "stack-picker";
  var BEACON_URL = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";

  // ── Pure hash helpers (also re-exported via window.LM_SP_HASH for tests) ─
  function encode(path) {
    if (!Array.isArray(path) || !path.length) return "";
    return "path=" + path.map(function (p) { return p.node + ":" + p.branch; }).join(",");
  }
  function decode(hash) {
    if (!hash) return [];
    var s = String(hash).replace(/^#/, "");
    if (s.indexOf("path=") !== 0) return [];
    var body = s.slice(5);
    if (!body) return [];
    return body.split(",").filter(Boolean).map(function (pair) {
      var i = pair.indexOf(":");
      if (i < 0) return null;
      return { node: pair.slice(0, i), branch: pair.slice(i + 1) };
    }).filter(Boolean);
  }
  window.LM_SP_HASH = { encode: encode, decode: decode };

  // ── DOM helpers — prefer LM.* but defensively fall back ──────────────────
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function make(tag, attrs, html) {
    if (window.LM && window.LM.make) return window.LM.make(tag, attrs, html);
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    if (window.LM && window.LM.esc) return window.LM.esc(s);
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    });
  }
  function toast(msg) {
    if (window.LM && window.LM.toast) return window.LM.toast(msg);
    var t = $("#lmc-toast");
    if (!t) { t = make("div", { id: "lmc-toast", class: "lmc-toast" }); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2500);
  }
  function beacon(event, extra) {
    if (window.LM && window.LM.beacon) return window.LM.beacon(TOOL, event, extra || {});
    try {
      var body = Object.assign({
        event_type: event, tool_type: TOOL,
        lm_slug: window.__lm_slug || "",
      }, extra || {});
      if (navigator.sendBeacon) {
        navigator.sendBeacon(BEACON_URL, new Blob([JSON.stringify(body)], { type: "application/json" }));
      } else {
        fetch(BEACON_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(function () {});
      }
    } catch (_) {}
  }
  function emailIsValid(e) {
    if (window.LM && window.LM.emailIsValid) return window.LM.emailIsValid(e);
    return !!e && /[^@\s]+@[^@\s]+\.[^@\s]+/.test(e);
  }
  function readKV(slug, suf, fb) { return (window.LM && window.LM.readKV) ? window.LM.readKV(TOOL, slug, suf, fb) : fb; }
  function writeKV(slug, suf, v) { if (window.LM && window.LM.writeKV) window.LM.writeKV(TOOL, slug, suf, v); }

  // ── CTA selection (allow-listed safe eval over ctaCtx) ──────────────────
  // Whitelist: tokens like result_id == 'x', path includes 'y', branch_count >= n
  function evalWhen(expr, ctx) {
    if (!expr || typeof expr !== "string") return true;
    var safe = String(expr).trim();
    // Only allow a strict subset of comparison ops with quoted strings and numbers
    if (!/^[a-zA-Z0-9_'"\.\s=!<>&|\(\)\[\],-]+$/.test(safe)) return false;
    try {
      var result_id = ctx.result_id;
      var path = ctx.path || [];
      var branch_count = ctx.branch_count || 0;
      var leaf_cta_id = ctx.leaf_cta_id || "";
      // Provide a small includes helper bound to path for natural feel
      var has = function (needle) { return path.indexOf(needle) !== -1; };
      // eslint-disable-next-line no-new-func
      var fn = new Function("result_id", "path", "branch_count", "leaf_cta_id", "has", "return (" + safe + ");");
      return !!fn(result_id, path, branch_count, leaf_cta_id, has);
    } catch (_) { return false; }
  }
  function pickCta(data, ctx) {
    var list = (data.ctas || []);
    // Leaf-pinned CTA wins
    if (ctx.leaf_cta_id) {
      for (var i = 0; i < list.length; i++) if (list[i].id === ctx.leaf_cta_id) return list[i];
    }
    // First with truthy `when`
    for (var j = 0; j < list.length; j++) {
      var c = list[j];
      if (c.when && evalWhen(c.when, ctx)) return c;
    }
    // Default = first entry without a `when` clause
    for (var k = 0; k < list.length; k++) if (!list[k].when) return list[k];
    return list[0] || null;
  }

  // ── Leaf -> Resend template key ─────────────────────────────────────────
  function leafTemplateKey(resultId) {
    if (resultId === "result_n8n") return "stack_picker_n8n_dfy";
    if (resultId === "result_zapier") return "stack_picker_zapier_starter";
    if (resultId === "result_make") return "stack_picker_make_bridge";
    return "stack_picker_default";
  }

  // ── Path persistence (URL hash + KV mirror for resume) ──────────────────
  function loadPath() {
    var h = location.hash || "";
    var p = decode(h);
    return p;
  }
  function savePath(slug, path) {
    var enc = encode(path);
    var url = location.pathname + location.search + (enc ? "#" + enc : "");
    try { history.replaceState(null, "", url); } catch (_) {}
    writeKV(slug, "path", path);
  }

  // ── Tree walking ─────────────────────────────────────────────────────────
  function resolveNode(data, path) {
    var nodes = (data.tree && data.tree.nodes) || {};
    var startId = data.tree && data.tree.start;
    var cur = startId;
    var valid = [];
    for (var i = 0; i < path.length; i++) {
      var step = path[i];
      var n = nodes[cur];
      if (!n || !n.branches) break;
      var matched = null;
      for (var b = 0; b < n.branches.length; b++) {
        var br = n.branches[b];
        var v = br.value || slugify(br.label);
        if (v === step.branch) { matched = br; break; }
      }
      if (!matched) break;
      if (!nodes[matched.next]) break;
      valid.push({ node: cur, branch: step.branch });
      cur = matched.next;
    }
    return { currentNodeId: cur, validPath: valid };
  }
  function slugify(s) {
    return String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }

  // ── Render -----------------------------------------------------------------
  function render(data, root) {
    var slug = data.slug;
    window.__lm_slug = slug;
    window.__lm_data = data;
    window.__lm_format = TOOL;

    var rawPath = loadPath();
    var resolved = resolveNode(data, rawPath);
    // If the URL had a stale segment, trim and save the valid prefix back
    if (resolved.validPath.length < rawPath.length) {
      savePath(slug, resolved.validPath);
    }
    var path = resolved.validPath;
    var currentNodeId = resolved.currentNodeId;
    var node = (data.tree.nodes || {})[currentNodeId];

    root.innerHTML = "";

    // Hero + Intro (only on the start node — once user starts answering we hide it)
    if (path.length === 0) {
      var hero = window.LM && window.LM.buildHero
        ? window.LM.buildHero(data, {
            badge: (data.brand && data.brand.hero_badge) || "Decision Tree",
            metaChips: [
              (data.estimated_minutes || 2) + " min",
              "5 questions",
              "Shareable result"
            ]
          })
        : (function () {
            var s = make("section", { class: "lmc-hero" });
            var i = make("div", { class: "lmc-hero-inner" });
            var spH1 = make("h1", { class: "lmc-h1" });
            spH1.innerHTML = (window.LM && window.LM.italicizePivot) ? window.LM.italicizePivot(data.title || "") : esc(data.title || "");
            i.appendChild(spH1);
            s.appendChild(i);
            return s;
          })();
      // Register hero edit fields
      if (window.LM && window.LM.editMode) {
        var h1El = hero.querySelector(".lmc-h1");
        if (h1El) window.LM.editMode.registerField(h1El, "title");
        var subEl = hero.querySelector(".lmc-sub");
        if (subEl) window.LM.editMode.registerField(subEl, "subtitle");
        var badgeEl = hero.querySelector(".lmc-badge");
        if (badgeEl) window.LM.editMode.registerField(badgeEl, "brand.hero_badge");
      }
      root.appendChild(hero);

      var intro = window.LM && window.LM.buildIntro
        ? window.LM.buildIntro(data, ".lmc-sp-stage", {
            tool_type: TOOL,
            startLabel: "Start the decision tree",
            defaultValueBullet: "Built to give you one opinionated answer in 90 seconds",
            defaultNextBullet: "Result URL is shareable — send it to a teammate to decide together"
          })
        : null;
      if (intro) root.appendChild(intro);
    }

    // Stage
    var stage = make("section", { class: "lmc-sp-stage" });

    // Breadcrumbs
    var crumbs = make("nav", { class: "lmc-sp-crumbs", "aria-label": "Decision path" });
    if (path.length > 0) {
      var startCrumb = make("button", { class: "lmc-sp-crumb lmc-sp-crumb-start", type: "button" }, "Start");
      startCrumb.addEventListener("click", function () { flipAndRender(data, root, []); });
      crumbs.appendChild(startCrumb);
      path.forEach(function (entry, idx) {
        var sep = make("span", { class: "lmc-sp-crumb-sep", "aria-hidden": "true" }, "&rsaquo;");
        crumbs.appendChild(sep);
        var srcNode = (data.tree.nodes || {})[entry.node];
        var label = entry.branch;
        if (srcNode && srcNode.branches) {
          for (var b = 0; b < srcNode.branches.length; b++) {
            var br = srcNode.branches[b];
            var v = br.value || slugify(br.label);
            if (v === entry.branch) { label = br.label; break; }
          }
        }
        var btn = make("button", { class: "lmc-sp-crumb", type: "button" }, esc(label));
        btn.addEventListener("click", function () {
          flipAndRender(data, root, path.slice(0, idx + 1).slice(0, idx));
        });
        crumbs.appendChild(btn);
      });
      stage.appendChild(crumbs);
    }

    // Card
    var card = make("div", { class: "lmc-sp-card", id: "lmc-sp-card" });
    stage.appendChild(card);

    if (!node) {
      card.appendChild(make("p", null, "This decision tree is missing the requested node. Resetting to the start."));
      // Auto-recover
      savePath(slug, []);
      setTimeout(function () { render(data, root); }, 600);
      root.appendChild(stage);
      return;
    }

    if (node.type === "result") {
      renderResult(data, root, stage, card, node, currentNodeId, path);
    } else {
      renderQuestion(data, root, stage, card, node, currentNodeId, path);
    }

    // Back button (rendered below card so it isn't part of the flip)
    if (path.length > 0) {
      var back = make("button", { class: "lmc-sp-back", type: "button" }, "&larr; Back");
      back.addEventListener("click", function () {
        var newPath = path.slice(0, -1);
        flipAndRender(data, root, newPath);
      });
      stage.appendChild(back);
    }

    root.appendChild(stage);

    // Fire view beacon only on the very first render
    if (!window.__lm_sp_view_fired) {
      beacon("view", { lm_slug: slug });
      window.__lm_sp_view_fired = true;
    }
  }

  function renderQuestion(data, root, stage, card, node, nodeId, path) {
    var qH = make("h2", { class: "lmc-sp-q" }, esc(node.question));
    if (window.LM && window.LM.editMode) {
      window.LM.editMode.registerField(qH, "tree.nodes." + nodeId + ".question", { multiline: true });
    }
    card.appendChild(qH);
    var btnList = make("div", { class: "lmc-sp-branches" });
    node.branches.forEach(function (br, i) {
      var b = make("button", {
        class: "lmc-sp-branch",
        type: "button",
        "data-branch": br.value || slugify(br.label)
      }, esc(br.label));
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(b, "tree.nodes." + nodeId + ".branches[" + i + "].label");
      }
      b.addEventListener("click", function () {
        var chosen = br.value || slugify(br.label);
        beacon("branch_pick", { node: nodeId, branch: chosen, depth: path.length + 1 });
        var newPath = path.concat([{ node: nodeId, branch: chosen }]);
        flipAndRender(data, root, newPath);
      });
      btnList.appendChild(b);
    });
    if (window.LM && window.LM.editMode) {
      window.LM.editMode.registerArray(btnList, "tree.nodes." + nodeId + ".branches", {
        itemLabel: "branch",
        template: { label: "New branch", next: "" }
      });
    }
    card.appendChild(btnList);
  }

  function renderResult(data, root, stage, card, node, nodeId, path) {
    var slug = data.slug;
    card.classList.add("lmc-sp-card-result");

    // Headline
    var h = make("h1", { class: "lmc-sp-result-h" }, esc(node.headline));
    if (window.LM && window.LM.editMode) {
      window.LM.editMode.registerField(h, "tree.nodes." + nodeId + ".headline");
    }
    card.appendChild(h);

    // Stack chips
    if (node.stack && node.stack.length) {
      var chipWrap = make("div", { class: "lmc-sp-stack" });
      node.stack.forEach(function (s, i) {
        var chipEl = make("span", { class: "lmc-sp-chip" }, esc(s));
        if (window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(chipEl, "tree.nodes." + nodeId + ".stack[" + i + "]");
        }
        chipWrap.appendChild(chipEl);
      });
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerArray(chipWrap, "tree.nodes." + nodeId + ".stack", {
          itemLabel: "tool",
          template: "New tool"
        });
      }
      card.appendChild(chipWrap);
    }

    // Body (trusted HTML, authored by Ivan via the editor)
    if (node.body_html) {
      var body = make("div", { class: "lmc-sp-body" }, node.body_html);
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerField(body, "tree.nodes." + nodeId + ".body_html", { multiline: true, richtext: true });
      }
      card.appendChild(body);
    }

    // Alternatives
    if (node.alternatives && node.alternatives.length) {
      var altWrap = make("div", { class: "lmc-sp-alt" });
      altWrap.appendChild(make("div", { class: "lmc-sp-alt-label" }, "Consider an alternative if&hellip;"));
      node.alternatives.forEach(function (alt, i) {
        var d = make("details", { class: "lmc-sp-alt-item" });
        d.appendChild(make("summary", null, esc(alt.name)));
        var altBody = make("p", null, esc(alt.when_to_consider));
        d.appendChild(altBody);
        altWrap.appendChild(d);
        if (window.LM && window.LM.editMode) {
          window.LM.editMode.registerField(d.querySelector("summary"), "tree.nodes." + nodeId + ".alternatives[" + i + "].name");
          window.LM.editMode.registerField(altBody, "tree.nodes." + nodeId + ".alternatives[" + i + "].when_to_consider", { multiline: true });
        }
      });
      if (window.LM && window.LM.editMode) {
        window.LM.editMode.registerArray(altWrap, "tree.nodes." + nodeId + ".alternatives", {
          itemLabel: "alternative",
          template: { name: "Alternative", when_to_consider: "When to consider it" }
        });
      }
      card.appendChild(altWrap);
    }

    // CTA
    var ctaCtx = {
      result_id: nodeId,
      path: path.map(function (p) { return p.node + ":" + p.branch; }),
      branch_count: path.length,
      leaf_cta_id: node.cta_id
    };
    var cta = pickCta(data, ctaCtx);
    if (cta) {
      var ctaCard = make("div", { class: "lmc-sp-cta" });
      ctaCard.appendChild(make("h3", { class: "lmc-sp-cta-h" }, esc(cta.headline)));
      if (cta.description) ctaCard.appendChild(make("p", { class: "lmc-sp-cta-d" }, esc(cta.description)));
      var ctaLink = make("a", {
        class: "lmc-btn lmc-sp-cta-btn",
        href: (window.LM && window.LM.normalizeCtaUrl) ? window.LM.normalizeCtaUrl(cta.url, "closing-cta") : cta.url,
        target: "_blank",
        rel: "noopener"
      }, esc(cta.button || "Continue"));
      ctaLink.addEventListener("click", function () {
        beacon("cta_click", { cta_id: cta.id, result_id: nodeId, path: ctaCtx.path });
      });
      ctaCard.appendChild(ctaLink);
      card.appendChild(ctaCard);
    }

    // Share row
    var shareRow = make("div", { class: "lmc-sp-share-row" });
    var shareBtn = make("button", { class: "lmc-btn lmc-btn-secondary lmc-sp-share", type: "button" }, "Share my result");
    shareBtn.addEventListener("click", function () {
      var url = location.origin + location.pathname + (encode(path) ? "#" + encode(path) : "");
      var channel = "auto";
      try {
        if (navigator.share) {
          channel = "native";
          navigator.share({ url: url, title: data.title, text: node.headline }).catch(function () {});
        } else if (window.LM && window.LM.share && window.LM.share.copy) {
          channel = "clipboard";
          window.LM.share.copy(url).then(function (ok) {
            if (ok) toast("Link copied. Share your result.");
          });
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
          channel = "clipboard";
          navigator.clipboard.writeText(url).then(function () { toast("Link copied. Share your result."); });
        }
      } catch (_) {}
      beacon("share", { result_id: nodeId, channel: channel });
    });
    shareRow.appendChild(shareBtn);

    if (window.LM && window.LM.share) {
      var liUrl = window.LM.share.linkedIn(data.title + ". I got: " + node.headline);
      var waUrl = window.LM.share.whatsapp(data.title + ". I got: " + node.headline);
      var li = make("a", { class: "lmc-btn lmc-btn-secondary", href: liUrl, target: "_blank", rel: "noopener" }, "Share on LinkedIn");
      li.addEventListener("click", function () { beacon("share", { result_id: nodeId, channel: "linkedin" }); });
      shareRow.appendChild(li);
      var wa = make("a", { class: "lmc-btn lmc-btn-secondary", href: waUrl, target: "_blank", rel: "noopener" }, "Share on WhatsApp");
      wa.addEventListener("click", function () { beacon("share", { result_id: nodeId, channel: "whatsapp" }); });
      shareRow.appendChild(wa);
    }
    card.appendChild(shareRow);

    // Closing CTA — call-first finale (replaces the PDF email gate 2026-06-09)
    if (window.LM && window.LM.buildClosingCta) {
      card.appendChild(window.LM.buildClosingCta("stack_picker", data, {
        toolType: "stack-picker",
        captureExtra: function () {
          return {
            result_id: nodeId,
            path: ctaCtx.path,
            leaf_template_key: leafTemplateKey(nodeId),
            answers: { result_id: nodeId, path: ctaCtx.path, leaf_template_key: leafTemplateKey(nodeId) },
          };
        },
        onCaptured: function (email) { writeKV(slug, "email", email); },
      }));
    }

    // Result beacon — guard against duplicate fires on hash replay
    var lastResult = readKV(slug, "last_result", null);
    if (lastResult !== nodeId) {
      beacon("result", { result_id: nodeId, path: ctaCtx.path, branch_count: path.length });
      writeKV(slug, "last_result", nodeId);
    }
  }

  function flipAndRender(data, root, newPath) {
    var card = $("#lmc-sp-card");
    var slug = data.slug;
    savePath(slug, newPath);
    var reduced = false;
    try { reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) {}
    if (!card || reduced) {
      render(data, root);
      return;
    }
    card.classList.add("is-flipping");
    setTimeout(function () { render(data, root); }, 280);
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  function init() {
    var root = document.getElementById("lmc-root") || document.querySelector("[data-lm-stack-picker-src]");
    if (!root) return;
    var src = root.getAttribute("data-lm-stack-picker-src") || "./data.json";
    var params = new URLSearchParams(location.search);
    if (params.get("preview") === "draft") src = "./data.draft.json";

    fetch(src, { credentials: "same-origin" }).then(function (r) {
      if (!r.ok) throw new Error("data.json " + r.status);
      return r.json();
    }).then(function (data) {
      render(data, root);
      window.__lm_rerender = function(){ render(window.__lm_data, root); };
      // Listen for hash changes (back/forward button)
      window.addEventListener("hashchange", function () { render(data, root); });
    }).catch(function (e) {
      root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading stack picker:</strong> ' + esc(e.message) + '</div>';
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
