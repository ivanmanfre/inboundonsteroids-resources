/* LM Architecture Engine — vanilla SVG renderer.
 * Renders an interactive system diagram from data.json with click-to-drawer,
 * inline brand-logo nodes, orthogonal edge routing, and a single flow pulse.
 * No Cytoscape, no canvas, no data-URI hacks — every SVG element is real DOM.
 */
(function () {
  "use strict";

  var TOOL = "architecture";
  var SVG_NS = "http://www.w3.org/2000/svg";

  // ── Brand registry ────────────────────────────────────────────────────
  // Authoritative simpleicons.org 24×24 viewBox paths. Inline → no clipping.
  var LOGOS = {
    clickup:  { color: "#131210", path: "M2 18.439l3.69-2.828c1.961 2.56 4.044 3.739 6.363 3.739 2.307 0 4.33-1.166 6.203-3.704L22 18.405C19.298 22.065 15.941 24 12.053 24 8.178 24 4.788 22.078 2 18.439zM12.04 6.15l-6.568 5.66-3.036-3.52L12.055 0l9.543 8.296-3.05 3.509z" },
    anthropic:{ color: "#6B675E", path: "M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" },
    claude:   { color: "#6B675E", path: "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" },
    supabase: { color: "#131210", path: "M11.9 1.036c-.015-.986-1.26-1.41-1.874-.637L.764 12.05C-.33 13.427.65 15.455 2.409 15.455h9.579l.113 7.51c.014.985 1.259 1.408 1.873.636l9.262-11.653c1.093-1.375.113-3.403-1.645-3.403h-9.642z" },
    n8n:      { color: "#C8361B", path: "M21.4737 5.6842c-1.1772 0-2.1663.8051-2.4468 1.8947h-2.8955c-1.235 0-2.289.893-2.492 2.111l-.1038.623a1.263 1.263 0 0 1-1.246 1.0555H11.289c-.2805-1.0896-1.2696-1.8947-2.4468-1.8947s-2.1663.8051-2.4467 1.8947H4.973c-.2805-1.0896-1.2696-1.8947-2.4468-1.8947C1.1311 9.4737 0 10.6047 0 12s1.131 2.5263 2.5263 2.5263c1.1772 0 2.1663-.8051 2.4468-1.8947h1.4223c.2804 1.0896 1.2696 1.8947 2.4467 1.8947 1.1772 0 2.1663-.8051 2.4468-1.8947h1.0008a1.263 1.263 0 0 1 1.2459 1.0555l.1038.623c.203 1.218 1.257 2.111 2.492 2.111h.3692c.2804 1.0895 1.2696 1.8947 2.4468 1.8947 1.3952 0 2.5263-1.131 2.5263-2.5263s-1.131-2.5263-2.5263-2.5263c-1.1772 0-2.1664.805-2.4468 1.8947h-.3692a1.263 1.263 0 0 1-1.246-1.0555l-.1037-.623A2.52 2.52 0 0 0 13.9607 12a2.52 2.52 0 0 0 .821-1.4794l.1038-.623a1.263 1.263 0 0 1 1.2459-1.0555h2.8955c.2805 1.0896 1.2696 1.8947 2.4468 1.8947 1.3952 0 2.5263-1.131 2.5263-2.5263s-1.131-2.5263-2.5263-2.5263m0 1.2632a1.263 1.263 0 0 1 1.2631 1.2631 1.263 1.263 0 0 1-1.2631 1.2632 1.263 1.263 0 0 1-1.2632-1.2632 1.263 1.263 0 0 1 1.2632-1.2631M2.5263 10.7368A1.263 1.263 0 0 1 3.7895 12a1.263 1.263 0 0 1-1.2632 1.2632A1.263 1.263 0 0 1 1.2632 12a1.263 1.263 0 0 1 1.2631-1.2632m6.3158 0A1.263 1.263 0 0 1 10.1053 12a1.263 1.263 0 0 1-1.2632 1.2632A1.263 1.263 0 0 1 7.579 12a1.263 1.263 0 0 1 1.2632-1.2632m10.1053 3.7895a1.263 1.263 0 0 1 1.2631 1.2632 1.263 1.263 0 0 1-1.2631 1.2631 1.263 1.263 0 0 1-1.2632-1.2631 1.263 1.263 0 0 1 1.2632-1.2632" },
    resend:   { color: "#131210", path: "M14.679 0c4.648 0 7.413 2.765 7.413 6.434s-2.765 6.434-7.413 6.434H12.33L24 24h-8.245l-8.88-8.44c-.636-.588-.93-1.273-.93-1.86 0-.831.587-1.565 1.713-1.883l4.574-1.224c1.737-.465 2.936-1.81 2.936-3.572 0-2.153-1.761-3.4-3.939-3.4H0V0z" },
    linkedin: { color: "#131210", path: "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" },
    // Custom (no simpleicons coverage)
    firecrawl:{ color: "#C8361B", path: "M13 1.5c-.2 2.4-1.4 4.4-3 6-2 2-3.5 4-3.5 7 0 4.4 3 7.5 6.5 7.5s6.5-3.1 6.5-7.5c0-3-1.5-5.3-3.4-7.5C14.6 5.5 13.4 3.7 13 1.5zm-1 7c.7 1.2 2 2.5 2 4.5 0 1.7-1.3 3-3 3s-3-1.3-3-3c0-1.2.6-2 1.4-2.7.6-.5 1.2-1.1 1.6-1.8z" },
    unipile:  { color: "#131210", path: "M2 21l21-9L2 3l3 9-3 9zm4-7.5L19 12 6 10.5l1 1.5-1 1.5z" }
  };

  // Match by label first, then by panel.stack[0].
  // Order matters — specific names first.
  var LOGO_MATCH = [
    { keys: ["clickup"],                              brand: "clickup" },
    { keys: ["claude", "anthropic"],                  brand: "claude" },
    { keys: ["linkedin"],                             brand: "linkedin" },
    { keys: ["supabase"],                             brand: "supabase" },
    { keys: ["resend", "nurture"],                    brand: "resend" },
    { keys: ["whatsapp", "whapi"],                    brand: "anthropic" }, // unused fallback
    { keys: ["firecrawl", "crawl", "scrape", "research"], brand: "firecrawl" },
    { keys: ["unipile", "dm send", "comment gate"],   brand: "unipile" },
    { keys: ["n8n", "compile", "schedule", "cadence"], brand: "n8n" }
  ];

  function findBrand(node) {
    var lc = String((node && node.label) || "").toLowerCase();
    var i, j, m;
    for (i = 0; i < LOGO_MATCH.length; i++) {
      m = LOGO_MATCH[i];
      for (j = 0; j < m.keys.length; j++) {
        if (lc.indexOf(m.keys[j]) !== -1) return LOGOS[m.brand];
      }
    }
    var stack0 = node && node.panel && node.panel.stack && node.panel.stack[0];
    if (stack0) {
      var sc = String(stack0).toLowerCase();
      for (i = 0; i < LOGO_MATCH.length; i++) {
        m = LOGO_MATCH[i];
        for (j = 0; j < m.keys.length; j++) {
          if (sc.indexOf(m.keys[j]) !== -1) return LOGOS[m.brand];
        }
      }
    }
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function SLUG() { return window.__lm_slug || (window.__lm_data && window.__lm_data.slug) || ""; }
  function $(s, c) { return (c || document).querySelector(s); }
  function make(tag, attrs, html) { return window.LM.make(tag, attrs, html); }
  function esc(s) { return window.LM.esc(s); }
  function svgEl(tag, attrs) {
    var e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function beacon(event, extra) { window.LM.beacon(TOOL, event, extra || {}); }

  // ── State ─────────────────────────────────────────────────────────────
  var state = {
    data: null, root: null, drawer: null, activeNodeId: null,
    viewedNodes: {}, viewStartedAt: Date.now(),
    svg: null, nodeEls: {}, edgeEls: [], flowPulseTimer: null
  };

  function getViewedKV() { return window.LM.readKV(TOOL, SLUG(), "viewed", {}) || {}; }
  function persistViewedKV() { window.LM.writeKV(TOOL, SLUG(), "viewed", state.viewedNodes); }
  function uniqueViewedCount() { return Object.keys(state.viewedNodes).length; }
  function totalViewedCount() {
    var n = 0;
    for (var k in state.viewedNodes) n += (state.viewedNodes[k] || 0);
    return n;
  }

  // ── CTA gating ────────────────────────────────────────────────────────
  function ctaCtx() {
    return {
      viewed_node_count: totalViewedCount(),
      unique_node_count: uniqueViewedCount(),
      time_on_page: Math.round((Date.now() - state.viewStartedAt) / 1000)
    };
  }
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
      if (c && c.when && evalWhen(c.when, ctx)) return c;
    }
    for (var j = data.ctas.length - 1; j >= 0; j--) {
      if (!data.ctas[j].when) return data.ctas[j];
    }
    return data.ctas[data.ctas.length - 1] || null;
  }

  // ── Hero ──────────────────────────────────────────────────────────────
  function renderHero(data) {
    var hero = make("section", { class: "lma-hero" });
    hero.appendChild(make("span", { class: "lma-badge" }, "System diagram"));
    var h1 = make("h1", { class: "lma-h1" });
    h1.textContent = data.title || "Architecture";
    hero.appendChild(h1);
    var sub = null;
    if (data.subtitle) {
      sub = make("p", { class: "lma-sub" });
      sub.textContent = data.subtitle;
      hero.appendChild(sub);
    }
    var meta = make("div", { class: "lma-meta" });
    var nc = (data.diagram && data.diagram.nodes || []).length;
    var ec = (data.diagram && data.diagram.edges || []).length;
    meta.appendChild(make("div", { class: "lma-meta-chip" }, nc + " nodes"));
    meta.appendChild(make("div", { class: "lma-meta-chip" }, ec + " connections"));
    meta.appendChild(make("div", { class: "lma-meta-chip" }, "Click any node"));
    hero.appendChild(meta);
    // Always call registerField — shared.js buffers until edit mode mounts.
    // Gating on enabled() loses registrations because enabled flips async.
    if (window.LM && window.LM.editMode) {
      window.LM.editMode.registerField(h1, "title");
      if (sub) window.LM.editMode.registerField(sub, "subtitle");
    }
    return hero;
  }

  // ── SVG diagram ───────────────────────────────────────────────────────
  // Layout constants. Hand-tuned x/y from data.json are scaled to give
  // breathing room — original 200×90 nodes had 60px x-stride, my 240×88
  // nodes need ~78px stride, so x*1.30.
  var NODE_W = 240;
  var NODE_H = 88;
  var TILE_SIZE = 56;
  var TILE_RX = 12;
  var TILE_MARGIN = 14;
  var ICON_PAD = 7;
  var ICON_SCALE = (TILE_SIZE - ICON_PAD * 2) / 24;  // 24-unit viewBox → fits tile
  var SCALE_X = 1.30;
  var SCALE_Y = 1.10;
  var VB_PAD = 36;
  var EDGE_R = 10;        // corner radius on orthogonal turns

  function nodeBox(n) {
    var cx = (n.x || 0) * SCALE_X;
    var cy = (n.y || 0) * SCALE_Y;
    return {
      cx: cx, cy: cy,
      x: cx - NODE_W / 2, y: cy - NODE_H / 2,
      w: NODE_W, h: NODE_H,
      left: cx - NODE_W / 2, right: cx + NODE_W / 2,
      top: cy - NODE_H / 2, bottom: cy + NODE_H / 2
    };
  }

  function computeViewBox(nodes) {
    if (!nodes.length) return { x: 0, y: 0, w: 1000, h: 600 };
    var boxes = nodes.map(nodeBox);
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    boxes.forEach(function (b) {
      if (b.left < minX) minX = b.left;
      if (b.right > maxX) maxX = b.right;
      if (b.top < minY) minY = b.top;
      if (b.bottom > maxY) maxY = b.bottom;
    });
    return {
      x: minX - VB_PAD, y: minY - VB_PAD,
      w: (maxX - minX) + VB_PAD * 2,
      h: (maxY - minY) + VB_PAD * 2
    };
  }

  // Orthogonal L-path. Picks source/target sides based on dominant delta,
  // routes through a single elbow with rounded corners.
  // `perpOffset` shifts the endpoints perpendicular to the dominant axis —
  // used to separate bidirectional edge pairs so they don't render on top
  // of each other.
  function edgePath(s, t, perpOffset) {
    perpOffset = perpOffset || 0;
    var dx = t.cx - s.cx, dy = t.cy - s.cy;
    var horizontal = Math.abs(dx) >= Math.abs(dy);
    var sx, sy, tx, ty, lx, ly, d;

    if (horizontal) {
      sx = dx > 0 ? s.right : s.left;
      tx = dx > 0 ? t.left  : t.right;
      // perpOffset on horizontal edges = vertical shift
      sy = s.cy + perpOffset; ty = t.cy + perpOffset;
      // Stop short of the target by 4px so the arrowhead sits just outside the card edge
      var endTx = tx + (dx > 0 ? -2 : 2);
      if (Math.abs(sy - ty) < 1) {
        d = "M" + sx + " " + sy + " L" + endTx + " " + ty;
        lx = (sx + endTx) / 2; ly = sy - 10;
      } else {
        var midX = (sx + endTx) / 2;
        var hDir = Math.sign(endTx - sx);
        var vDir = Math.sign(ty - sy);
        d = "M" + sx + " " + sy +
            " L" + (midX - EDGE_R * hDir) + " " + sy +
            " Q" + midX + " " + sy + " " + midX + " " + (sy + EDGE_R * vDir) +
            " L" + midX + " " + (ty - EDGE_R * vDir) +
            " Q" + midX + " " + ty + " " + (midX + EDGE_R * hDir) + " " + ty +
            " L" + endTx + " " + ty;
        lx = midX; ly = (sy + ty) / 2;
      }
    } else {
      // perpOffset on vertical edges = horizontal shift
      sx = s.cx + perpOffset; tx = t.cx + perpOffset;
      sy = dy > 0 ? s.bottom : s.top;
      ty = dy > 0 ? t.top    : t.bottom;
      var endTy = ty + (dy > 0 ? -2 : 2);
      if (Math.abs(sx - tx) < 1) {
        d = "M" + sx + " " + sy + " L" + tx + " " + endTy;
        lx = sx + 10; ly = (sy + endTy) / 2;
      } else {
        var midY = (sy + endTy) / 2;
        var vDir2 = Math.sign(endTy - sy);
        var hDir2 = Math.sign(tx - sx);
        d = "M" + sx + " " + sy +
            " L" + sx + " " + (midY - EDGE_R * vDir2) +
            " Q" + sx + " " + midY + " " + (sx + EDGE_R * hDir2) + " " + midY +
            " L" + (tx - EDGE_R * hDir2) + " " + midY +
            " Q" + tx + " " + midY + " " + tx + " " + (midY + EDGE_R * vDir2) +
            " L" + tx + " " + endTy;
        lx = (sx + tx) / 2; ly = midY;
      }
    }
    return { d: d, lx: lx, ly: ly };
  }

  function buildLogoTile(brand) {
    var g = svgEl("g", { class: "lma-node-tile" });
    var fill = (brand && brand.color) || "#6B675E";
    g.appendChild(svgEl("rect", {
      width: TILE_SIZE, height: TILE_SIZE,
      rx: TILE_RX, ry: TILE_RX,
      fill: fill
    }));
    if (brand && brand.path) {
      var iconG = svgEl("g", {
        transform: "translate(" + ICON_PAD + "," + ICON_PAD + ") scale(" + ICON_SCALE + ")",
        fill: "#FFFFFF"
      });
      iconG.appendChild(svgEl("path", { d: brand.path }));
      g.appendChild(iconG);
    } else {
      var dot = svgEl("circle", {
        cx: TILE_SIZE / 2, cy: TILE_SIZE / 2, r: 8,
        fill: "#FFFFFF"
      });
      g.appendChild(dot);
    }
    return g;
  }

  function renderSvg(data) {
    var stage = make("section", { class: "lma-stage" });
    var holder = make("div", { class: "lma-svg-holder" });
    stage.appendChild(holder);

    var nodes = (data.diagram && data.diagram.nodes) || [];
    var edges = (data.diagram && data.diagram.edges) || [];
    var vb = computeViewBox(nodes);

    var svg = svgEl("svg", {
      viewBox: vb.x + " " + vb.y + " " + vb.w + " " + vb.h,
      preserveAspectRatio: "xMidYMid meet",
      class: "lma-diagram",
      role: "img",
      "aria-label": data.title || "System diagram"
    });

    // Defs: two arrowhead markers (default + green for pulse).
    var defs = svgEl("defs");
    [{ id: "lma-arrow", fill: "rgba(19, 18, 16,0.7)" },
     { id: "lma-arrow-green", fill: "#131210" }].forEach(function (def) {
      var m = svgEl("marker", {
        id: def.id, viewBox: "0 0 10 10",
        refX: "9", refY: "5",
        markerWidth: "7", markerHeight: "7",
        orient: "auto", markerUnits: "userSpaceOnUse"
      });
      m.appendChild(svgEl("path", { d: "M0 0 L10 5 L0 10 Z", fill: def.fill }));
      defs.appendChild(m);
    });
    svg.appendChild(defs);

    // ── Region groupings (below everything else, soft tinted backgrounds)
    var regionsLayer = svgEl("g", { class: "lma-regions" });
    function regionBounds(nodeGroup, pad) {
      if (!nodeGroup.length) return null;
      var boxes = nodeGroup.map(nodeBox);
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      boxes.forEach(function (b) {
        if (b.left < minX) minX = b.left;
        if (b.right > maxX) maxX = b.right;
        if (b.top < minY) minY = b.top;
        if (b.bottom > maxY) maxY = b.bottom;
      });
      return { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
    }
    // Split nodes by their y-coordinate: only the very bottom row (y >= 620)
    // is the re-engagement loop; everything above (including LinkedIn publish
    // at y=540) belongs to the main generation pipeline.
    var mainNodes = nodes.filter(function (n) { return (n.y || 0) < 620; });
    var loopNodes = nodes.filter(function (n) { return (n.y || 0) >= 620; });
    [
      { nodes: mainNodes, label: "Generation pipeline", cls: "is-main" },
      { nodes: loopNodes, label: "Re-engagement loop", cls: "is-loop" }
    ].forEach(function (region) {
      var b = regionBounds(region.nodes, 28);
      if (!b) return;
      regionsLayer.appendChild(svgEl("rect", {
        x: b.x, y: b.y, width: b.w, height: b.h,
        rx: 20, ry: 20,
        class: "lma-region " + region.cls
      }));
      var label = svgEl("text", {
        x: b.x + 20, y: b.y + 24,
        class: "lma-region-label " + region.cls
      });
      label.textContent = region.label;
      regionsLayer.appendChild(label);
    });
    svg.appendChild(regionsLayer);

    // ── Edges (below nodes)
    var edgeLayer = svgEl("g", { class: "lma-edges" });
    var boxesById = {};
    nodes.forEach(function (n) { boxesById[n.id] = nodeBox(n); });
    state.edgeEls = [];

    // Detect bidirectional pairs so paths + labels can be offset apart.
    var edgeKeys = {};
    edges.forEach(function (e) { edgeKeys[e.from + ">" + e.to] = true; });

    var edgeLabelData = [];
    edges.forEach(function (e, i) {
      var s = boxesById[e.from], t = boxesById[e.to];
      if (!s || !t) return;
      var hasReverse = !!edgeKeys[e.to + ">" + e.from];
      // For bidirectional pairs, offset perpendicular to the edge so they
      // don't render on top of each other. Forward (alphabetically smaller
      // from) goes -, reverse goes +.
      var perpOffset = 0;
      if (hasReverse) {
        var forward = e.from < e.to;
        perpOffset = forward ? -16 : 16;
      }
      var p = edgePath(s, t, perpOffset);
      var edgeEl = svgEl("path", {
        class: "lma-edge",
        d: p.d, fill: "none",
        "marker-end": "url(#lma-arrow)",
        "data-edge-idx": String(i),
        "data-from": e.from, "data-to": e.to
      });
      edgeLayer.appendChild(edgeEl);
      state.edgeEls.push(edgeEl);
      if (e.label) edgeLabelData.push({ x: p.lx, y: p.ly, text: e.label });
    });
    svg.appendChild(edgeLayer);

    // ── Nodes
    var nodeLayer = svgEl("g", { class: "lma-nodes" });
    state.nodeEls = {};
    nodes.forEach(function (n) {
      var bx = nodeBox(n);
      var brand = findBrand(n);
      var type = n.type || "transform";
      var visited = !!state.viewedNodes[n.id];

      var g = svgEl("g", {
        class: "lma-node t-" + type + (visited ? " is-visited" : ""),
        transform: "translate(" + bx.x + "," + bx.y + ")",
        role: "button", tabindex: "0",
        "data-node-id": n.id,
        "aria-label": n.label || n.id
      });

      g.appendChild(svgEl("rect", {
        class: "lma-node-card",
        width: NODE_W, height: NODE_H, rx: 14, ry: 14
      }));

      var tileG = buildLogoTile(brand);
      tileG.setAttribute("transform", "translate(" + TILE_MARGIN + "," + ((NODE_H - TILE_SIZE) / 2) + ")");
      g.appendChild(tileG);

      var labelX = TILE_MARGIN + TILE_SIZE + 14;
      var labelText = svgEl("text", {
        class: "lma-node-label",
        x: labelX, y: NODE_H / 2 + 1,
        "dominant-baseline": "middle"
      });
      labelText.textContent = n.label || n.id;
      g.appendChild(labelText);

      g.addEventListener("click", function () { openDrawerForNode(n); });
      g.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openDrawerForNode(n); }
      });
      g.addEventListener("mouseenter", function () {
        g.classList.add("is-hover");
        state.edgeEls.forEach(function (eEl) {
          if (eEl.getAttribute("data-from") === n.id || eEl.getAttribute("data-to") === n.id) {
            eEl.classList.add("is-flow-hover");
          }
        });
      });
      g.addEventListener("mouseleave", function () {
        g.classList.remove("is-hover");
        state.edgeEls.forEach(function (eEl) { eEl.classList.remove("is-flow-hover"); });
      });

      nodeLayer.appendChild(g);
      state.nodeEls[n.id] = g;
    });
    svg.appendChild(nodeLayer);

    // ── Edge labels (rendered last so they sit on top of edges + nodes)
    var labelLayer = svgEl("g", { class: "lma-edge-labels" });
    edgeLabelData.forEach(function (lbl) {
      var t = svgEl("text", {
        class: "lma-edge-label",
        x: lbl.x, y: lbl.y,
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      });
      t.textContent = lbl.text;
      labelLayer.appendChild(t);
    });
    svg.appendChild(labelLayer);

    holder.appendChild(svg);
    state.svg = svg;

    setupFlowPulse(nodes, edges);
    return stage;
  }

  // ── Flow pulse animation ──────────────────────────────────────────────
  function setupFlowPulse(nodes, edges) {
    var outAdj = {};
    edges.forEach(function (e) {
      if (!outAdj[e.from]) outAdj[e.from] = [];
      outAdj[e.from].push(e.to);
    });
    var inCount = {};
    nodes.forEach(function (n) { inCount[n.id] = 0; });
    edges.forEach(function (e) {
      if (typeof inCount[e.to] === "number") inCount[e.to]++;
    });
    var sources = nodes.filter(function (n) { return inCount[n.id] === 0; });

    var longest = [];
    sources.forEach(function (src) {
      var stack = [[src.id, [src.id]]];
      while (stack.length) {
        var top = stack.pop();
        var nid = top[0], path = top[1];
        var outs = outAdj[nid] || [];
        if (!outs.length) {
          if (path.length > longest.length) longest = path;
          continue;
        }
        outs.forEach(function (oid) {
          if (path.indexOf(oid) === -1) stack.push([oid, path.concat([oid])]);
        });
      }
    });
    if (longest.length < 2) return;

    var edgeMap = {};
    state.edgeEls.forEach(function (eEl) {
      edgeMap[eEl.getAttribute("data-from") + ">" + eEl.getAttribute("data-to")] = eEl;
    });

    function pulse() {
      for (var i = 0; i < longest.length - 1; i++) {
        (function (idx) {
          setTimeout(function () {
            var eEl = edgeMap[longest[idx] + ">" + longest[idx + 1]];
            if (!eEl) return;
            eEl.setAttribute("marker-end", "url(#lma-arrow-green)");
            eEl.classList.add("is-pulsing");
            setTimeout(function () {
              eEl.classList.remove("is-pulsing");
              eEl.setAttribute("marker-end", "url(#lma-arrow)");
            }, 580);
          }, idx * 220);
        })(i);
      }
    }

    if (state.flowPulseTimer) clearTimeout(state.flowPulseTimer);
    function loop() {
      pulse();
      state.flowPulseTimer = setTimeout(loop, 5400);
    }
    state.flowPulseTimer = setTimeout(loop, 1200);
  }

  // ── Type legend ───────────────────────────────────────────────────────
  // Tells visitors what each node-type tint means. Renders below the
  // diagram on desktop, hidden on mobile (where the type chip is in the
  // mobile card eyebrow already).
  function renderLegend() {
    var items = [
      { type: "trigger",   label: "Trigger" },
      { type: "transform", label: "Process" },
      { type: "decision",  label: "Decision" },
      { type: "storage",   label: "Storage" },
      { type: "output",    label: "Output"  }
    ];
    var wrap = make("div", { class: "lma-legend", "aria-label": "Node type legend" });
    items.forEach(function (it) {
      var el = make("div", { class: "lma-legend-item t-" + it.type });
      el.appendChild(make("span", { class: "lma-legend-swatch" }));
      el.appendChild(make("span", { class: "lma-legend-text" }, esc(it.label)));
      wrap.appendChild(el);
    });
    return wrap;
  }

  // ── Mobile node list ──────────────────────────────────────────────────
  function renderMobileList(data) {
    var nodes = (data.diagram && data.diagram.nodes) || [];
    var wrap = make("section", { class: "lma-mobile-list", "aria-label": "Node list (mobile)" });
    var ol = make("ol");
    nodes.forEach(function (n, nIdx) {
      var card = make("button", {
        class: "lma-mobile-card" + (state.viewedNodes[n.id] ? " is-visited" : ""),
        type: "button",
        "data-node-id": n.id
      });
      card.innerHTML =
        '<span class="m-type">' + esc((n.type || "transform").toUpperCase()) + '</span>' +
        '<span class="m-label">' + esc(n.label || n.id) + '</span>' +
        (n.panel && n.panel.headline ? '<span class="m-hint">' + esc(n.panel.headline) + '</span>' : '');
      // HTML twin of the SVG node label/headline (architecture.js:411/622) — the SVG
      // versions can't host an inline-edit <input>, so register these instead.
      if (window.LM && window.LM.editMode) {
        if (n.label) {
          window.LM.editMode.registerField(card.querySelector(".m-label"), "diagram.nodes[" + nIdx + "].label");
        }
        if (n.panel && n.panel.headline) {
          // Same path as the drawer's headline field (openDrawerForNode) — intentional
          // dual registration, two DOM twins of one field.
          window.LM.editMode.registerField(card.querySelector(".m-hint"), "diagram.nodes[" + nIdx + "].panel.headline");
        }
      }
      var li = make("li");
      li.appendChild(card);
      ol.appendChild(li);
    });
    wrap.appendChild(ol);
    return wrap;
  }

  // ── Drawer ────────────────────────────────────────────────────────────
  function ensureDrawer() {
    if (state.drawer) return state.drawer;
    var d = make("aside", {
      class: "lma-drawer",
      role: "dialog",
      "aria-hidden": "true",
      "aria-label": "Node detail"
    });
    document.body.appendChild(d);
    state.drawer = d;
    return d;
  }
  function clearActiveMarker() {
    if (!state.activeNodeId) return;
    var sel = '[data-node-id="' + state.activeNodeId + '"]';
    var prev = state.root && state.root.querySelector(sel);
    if (prev) prev.classList.remove("is-active");
    var svgNode = state.nodeEls[state.activeNodeId];
    if (svgNode) svgNode.classList.remove("is-active");
  }
  function closeDrawer() {
    if (!state.drawer) return;
    state.drawer.classList.remove("open");
    state.drawer.setAttribute("aria-hidden", "true");
    clearActiveMarker();
    state.activeNodeId = null;
  }
  function openDrawerForNode(node) {
    var drawer = ensureDrawer();
    if (state.activeNodeId && state.activeNodeId !== node.id) clearActiveMarker();
    var sel = '[data-node-id="' + node.id + '"]';
    if (state.root) state.root.querySelectorAll(sel).forEach(function (el) {
      el.classList.add("is-active", "is-visited");
    });
    var svgNode = state.nodeEls[node.id];
    if (svgNode) svgNode.classList.add("is-active", "is-visited");
    state.activeNodeId = node.id;

    var panel = node.panel || {};
    drawer.innerHTML = "";

    var close = make("button", {
      class: "lma-drawer-close", type: "button", "aria-label": "Close"
    }, "&times;");
    close.addEventListener("click", closeDrawer);
    drawer.appendChild(close);

    var eyebrow = make("p", { class: "lma-drawer-eyebrow" });
    eyebrow.textContent = (node.type || "transform").toUpperCase() + " · " + (node.label || node.id);
    drawer.appendChild(eyebrow);

    var h = make("h2", { class: "lma-drawer-headline" });
    h.textContent = panel.headline || node.label || "Detail";
    drawer.appendChild(h);

    var body = make("div", { class: "lma-drawer-body" });
    body.innerHTML = panel.body_html || "";
    drawer.appendChild(body);

    if (Array.isArray(panel.stack) && panel.stack.length) {
      drawer.appendChild(make("p", { class: "lma-drawer-section-h" }, "Stack"));
      var row = make("div", { class: "lma-chip-row" });
      panel.stack.forEach(function (s) {
        var chip = make("span", { class: "lma-chip" });
        chip.textContent = s;
        row.appendChild(chip);
      });
      drawer.appendChild(row);
    }
    if (Array.isArray(panel.common_mistakes) && panel.common_mistakes.length) {
      drawer.appendChild(make("p", { class: "lma-drawer-section-h" }, "Common mistakes"));
      var ul = make("ul", { class: "lma-list" });
      panel.common_mistakes.forEach(function (m) {
        var li = make("li");
        li.textContent = m;
        ul.appendChild(li);
      });
      drawer.appendChild(ul);
    }
    if (Array.isArray(panel.alternatives) && panel.alternatives.length) {
      drawer.appendChild(make("p", { class: "lma-drawer-section-h" }, "Alternatives"));
      var altRow = make("div", { class: "lma-chip-row" });
      panel.alternatives.forEach(function (a) {
        var chip = make("span", { class: "lma-chip alt" });
        chip.textContent = typeof a === "string" ? a : (a.name || "alt");
        altRow.appendChild(chip);
      });
      drawer.appendChild(altRow);
    }
    if (panel.cta_id) {
      var ctaDef = (state.data.ctas || []).find(function (c) { return c.id === panel.cta_id; });
      if (ctaDef && ctaDef.url) {
        var cta = make("a", {
          class: "lma-drawer-cta",
          href: (window.LM && window.LM.normalizeCtaUrl) ? window.LM.normalizeCtaUrl(ctaDef.url, "closing-cta") : ctaDef.url, target: "_blank", rel: "noopener"
        });
        cta.textContent = ctaDef.button || ctaDef.headline || "Talk it through";
        cta.addEventListener("click", function () {
          beacon("cta_click", { answers: { cta_id: ctaDef.id, source: "drawer", node_id: node.id } });
        });
        drawer.appendChild(cta);
      }
    }

    if (window.LM && window.LM.editMode) {
      var nodeIdx = (state.data.diagram.nodes || []).findIndex(function (x) { return x.id === node.id; });
      if (nodeIdx >= 0) {
        window.LM.editMode.registerField(h, "diagram.nodes[" + nodeIdx + "].panel.headline");
        window.LM.editMode.registerField(body, "diagram.nodes[" + nodeIdx + "].panel.body_html", { multiline: true });
      }
    }

    drawer.classList.add("open");
    drawer.classList.remove("is-fresh");
    void drawer.offsetWidth;
    drawer.classList.add("is-fresh");
    drawer.setAttribute("aria-hidden", "false");

    state.viewedNodes[node.id] = (state.viewedNodes[node.id] || 0) + 1;
    persistViewedKV();
    beacon("node_click", {
      answers: {
        node_id: node.id, node_type: node.type,
        viewed_node_count: totalViewedCount(),
        unique_node_count: uniqueViewedCount()
      }
    });
    beacon("panel_view", { answers: { node_id: node.id, headline: panel.headline || null } });
    refreshFloatingCta();
  }

  function wireGlobalHandlers() {
    var nodes = (state.data.diagram && state.data.diagram.nodes) || [];
    var idMap = {};
    nodes.forEach(function (n) { idMap[n.id] = n; });

    state.root.querySelectorAll(".lma-mobile-card").forEach(function (c) {
      c.addEventListener("click", function () {
        var n = idMap[c.getAttribute("data-node-id")];
        if (n) openDrawerForNode(n);
      });
    });

    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeDrawer();
    });
    document.addEventListener("click", function (ev) {
      if (!state.drawer || !state.drawer.classList.contains("open")) return;
      if (state.drawer.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest(".lma-svg-holder")) return;
      if (ev.target.closest && ev.target.closest(".lma-mobile-card")) return;
      closeDrawer();
    });
  }

  function refreshFloatingCta() {
    var cw = $("#lma-floating-cta");
    if (!cw) return;
    var picked = pickCta(state.data, ctaCtx());
    if (!picked) { cw.innerHTML = ""; return; }
    cw.innerHTML =
      '<section class="lma-cta-card" data-cta-id="' + esc(picked.id || "fallback") + '">' +
        '<h3>' + esc(picked.headline || "Want help with this?") + '</h3>' +
        '<a class="lma-btn" href="' + esc((window.LM && window.LM.normalizeCtaUrl) ? window.LM.normalizeCtaUrl(picked.url, "closing-cta") : picked.url) + '" target="_blank" rel="noopener">' +
          esc(picked.button || "Learn more") +
        '</a>' +
      '</section>';
    var a = cw.querySelector("a.lma-btn");
    if (a && !a.__bound) {
      a.__bound = true;
      a.addEventListener("click", function () {
        beacon("cta_click", { answers: { cta_id: picked.id, source: "floating" } });
      });
    }
  }

  // ── PNG download (serialize SVG → canvas → PNG) ───────────────────────
  function pngFilename(slug) {
    var safe = String(slug || "diagram").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
    var d = new Date();
    var ymd = d.getFullYear() + "-" +
              String(d.getMonth() + 1).padStart(2, "0") + "-" +
              String(d.getDate()).padStart(2, "0");
    return (safe || "diagram") + "-" + ymd + ".png";
  }
  function downloadDiagramAsPng() {
    var btn = $("#lma-download");
    var orig = btn ? btn.textContent : null;
    if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }
    var done = function () { if (btn) { btn.disabled = false; btn.textContent = orig || "Download as PNG"; } };

    if (!state.svg) { done(); return; }
    try {
      var clone = state.svg.cloneNode(true);
      var vb = state.svg.viewBox.baseVal;
      clone.setAttribute("width", vb.width);
      clone.setAttribute("height", vb.height);
      // CRITICAL: when an SVG is rendered via <img>, the page's external CSS
      // does NOT apply — the browser treats the SVG as a standalone document.
      // Embed a print stylesheet inline so cards/edges/labels render correctly.
      var printCss =
        '.lma-node-card{fill:#fff;stroke:rgba(19, 18, 16,.18);stroke-width:1}' +
        '.t-trigger .lma-node-card{fill:#FFFFFF}' +
        '.t-transform .lma-node-card{fill:#F4F2EC}' +
        '.t-decision .lma-node-card{fill:#F4F2EC}' +
        '.t-storage .lma-node-card{fill:#FFFFFF}' +
        '.t-output .lma-node-card{fill:#F4F2EC}' +
        '.lma-region{fill:rgba(19, 18, 16,.04);stroke:rgba(19, 18, 16,.16);stroke-width:1;stroke-dasharray:4 4}' +
        '.lma-region.is-loop{fill:rgba(123,104,238,.05);stroke:rgba(123,104,238,.20)}' +
        '.lma-region-label{font-family:"Source Serif 4",Georgia,serif;font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;fill:rgba(19, 18, 16,.75)}' +
        '.lma-region-label.is-loop{fill:rgba(123,104,238,.75)}' +
        '.lma-edge{fill:none;stroke:rgba(19, 18, 16,.5);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}' +
        '.lma-edge-label{font-family:"Source Serif 4",Georgia,serif;font-size:11px;font-weight:600;fill:#131210;paint-order:stroke fill;stroke:#FFFFFF;stroke-width:4px;stroke-linejoin:round}' +
        '.lma-node-label{fill:#131210;font-family:"Schibsted Grotesk",Georgia,serif;font-size:18px;font-weight:400}';
      var styleEl = document.createElementNS(SVG_NS, "style");
      styleEl.setAttribute("type", "text/css");
      styleEl.textContent = printCss;
      // Insert as first child (inside <defs> would also work)
      clone.insertBefore(styleEl, clone.firstChild);
      var serialized = new XMLSerializer().serializeToString(clone);
      var blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + serialized], { type: "image/svg+xml;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var scale = 2;
        var canvas = document.createElement("canvas");
        canvas.width = vb.width * scale;
        canvas.height = vb.height * scale;
        var ctx = canvas.getContext("2d");
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        var pngUrl = canvas.toDataURL("image/png");
        var a = document.createElement("a");
        a.download = pngFilename(SLUG());
        a.href = pngUrl;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        beacon("share", { answers: { format: "png" } });
        done();
      };
      img.onerror = function () {
        if (window.LM.toast) window.LM.toast("Download failed");
        URL.revokeObjectURL(url);
        done();
      };
      img.src = url;
    } catch (e) {
      if (window.LM.toast) window.LM.toast("Download failed: " + e.message);
      done();
    }
  }

  // ── Render orchestration ──────────────────────────────────────────────
  function render(data, root) {
    window.__lm_slug = data.slug || window.__lm_slug;
    window.__lm_data = data;
    window.__lm_format = "architecture";
    state.data = data;
    state.root = root;
    state.viewedNodes = getViewedKV();
    state.viewStartedAt = Date.now();
    root.innerHTML = "";
    root.appendChild(renderHero(data));
    root.appendChild(renderSvg(data));
    root.appendChild(renderLegend());
    root.appendChild(renderMobileList(data));

    var actions = make("div", { class: "lma-actions", id: "lma-actions" });
    var dl = make("button", {
      class: "lma-btn lma-btn-secondary",
      type: "button", id: "lma-download"
    }, "Download as PNG");
    dl.addEventListener("click", downloadDiagramAsPng);
    actions.appendChild(dl);
    root.appendChild(actions);

    var ctaWrap = make("div", { id: "lma-floating-cta" });
    root.appendChild(ctaWrap);

    wireGlobalHandlers();
    refreshFloatingCta();
    beacon("view", {
      answers: { node_count: (data.diagram && data.diagram.nodes || []).length }
    });
  }

  function init() {
    var root = document.getElementById("lma-root") || document.querySelector("[data-lm-architecture-src]");
    if (!root) return;
    var src = root.getAttribute("data-lm-architecture-src") || "./data.json";
    fetch(src, { credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("data.json " + r.status); return r.json(); })
      .then(function (data) { render(data, root); window.__lm_rerender = function(){ render(window.__lm_data, root); }; })
      .catch(function (e) {
        root.innerHTML = '<div style="padding:2rem;color:#a00"><strong>Error loading architecture:</strong> ' + esc(e.message) + '</div>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.__lm_architecture = {
    state: state, render: render, beacon: beacon,
    ctaCtx: ctaCtx, pickCta: pickCta, pngFilename: pngFilename,
    openDrawerForNode: openDrawerForNode, closeDrawer: closeDrawer
  };
})();
