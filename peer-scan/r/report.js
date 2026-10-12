/* LinkedIn Peer Scan: report page renderer.
   Reads ?t=<token>, fetches the report JSON (v1) from the peer-scan-report edge function and builds the page.
   Test modes: ?fixture=1 loads fixture.json, ?src=<url> loads that JSON (localhost only).
   ?print=1 renders the print layout (html.pr) and sets window.__REPORT_READY = true when fonts, images and charts are done.
   Every number comes straight from the JSON. All data strings go in through textContent, never innerHTML. */
(function () {
  "use strict";

  var BASE = "https://bjbvqvzbzczjbatgmccb.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYnZxdnpiemN6amJhdGdtY2NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMDUwODAsImV4cCI6MjA4Mzg4MTA4MH0.yqghcn-Rw5dIFadLhvUASIeUARPvu_CyPOGayI8KyTI";
  var Q = new URLSearchParams(location.search);
  var PRINT = Q.get("print") === "1";
  var LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|::1)$/.test(location.hostname);
  var FIXTURE = Q.get("fixture") === "1";
  var SRC = LOCAL ? Q.get("src") : null;
  var REDUCED = false;
  try { REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
  var ROOT = document.documentElement;
  var main = document.getElementById("report");
  var NS = "http://www.w3.org/2000/svg";

  window.__REPORT_READY = false;
  if (PRINT) ROOT.classList.add("pr");
  else if (!REDUCED) ROOT.classList.add("anim");

  /* The A4 layout is its own desktop-style layout (html.pr rules in report.css). A print engine lays out at the
     paper width (794px), which would switch on the phone rules, so in print mode those width rules are removed. */
  function dropViewportRules() {
    Array.prototype.forEach.call(document.styleSheets, function (sh) {
      if (!sh.href || sh.href.indexOf("report.css") < 0) return;
      var rules;
      try { rules = sh.cssRules; } catch (e) { return; }
      for (var i = rules.length - 1; i >= 0; i--) {
        var r = rules[i];
        var cond = r.media ? r.media.mediaText : "";
        if (r.type === 4 && /max-width|min-width/.test(cond)) { try { sh.deleteRule(i); } catch (e) {} }
      }
    });
  }
  if (PRINT) dropViewportRules();

  /* ── tiny helpers ─────────────────────────────────────────── */
  function T(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null && text !== "") e.textContent = String(text);
    return e;
  }
  function put(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      parent.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return parent;
  }
  function S(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) {
      if (k === "style") e.setAttribute("style", attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(e);
    return e;
  }
  function isObj(x) { return x !== null && typeof x === "object" && !Array.isArray(x); }
  function obj(x) { return isObj(x) ? x : {}; }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function str(x) { return typeof x === "string" ? x.trim() : ""; }
  function safeUrl(u) {
    u = str(u);
    if (!u) return "";
    try { var p = new URL(u, location.href); return (p.protocol === "https:" || p.protocol === "http:") ? p.href : ""; } catch (e) { return ""; }
  }
  function rv(e, delay) {
    e.classList.add("rv");
    if (delay) e.style.transitionDelay = delay + "ms";
    return e;
  }
  var NF = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  function fmt(n) { return isNum(n) ? NF.format(n) : ""; }
  function ord(n) {
    var v = Math.abs(Math.round(n)), m100 = v % 100, m10 = v % 10;
    if (m100 >= 11 && m100 <= 13) return "th";
    return m10 === 1 ? "st" : m10 === 2 ? "nd" : m10 === 3 ? "rd" : "th";
  }
  function toDate(s) {
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  function fmtDate(s, noYear) {
    var d = toDate(s);
    if (!d) return "";
    var o = { day: "numeric", month: "short", timeZone: "UTC" };
    if (!noYear) o.year = "numeric";
    return d.toLocaleDateString("en-GB", o);
  }
  function cnt(n, one, many) { return fmt(n) + " " + (n === 1 ? one : (many || one + "s")); }
  function fmtPct(n) { return isNum(n) ? (n > 0 ? "+" : "") + fmt(n) + "%" : ""; }
  function initials(name) {
    var p = str(name).split(/\s+/).filter(Boolean);
    if (!p.length) return "?";
    return (p[0].charAt(0) + (p.length > 1 ? p[p.length - 1].charAt(0) : "")).toUpperCase();
  }
  function clip(s, n) { s = String(s); return s.length > n ? s.slice(0, Math.max(1, n - 1)).replace(/\s+$/, "") + "…" : s; }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / p;
    var n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return n * p;
  }
  /* text with [placeholders] marked so the buyer sees what to fill in */
  function rich(parent, text) {
    String(text).split(/(\[[^\]\n]{1,140}\])/).forEach(function (p) {
      if (!p) return;
      if (p.charAt(0) === "[" && p.charAt(p.length - 1) === "]") parent.appendChild(T("span", "hl", p));
      else parent.appendChild(document.createTextNode(p));
    });
    return parent;
  }

  var PENDING = [];   /* promises for images created in script */
  function avatar(cls, name, url) {
    var a = T("div", cls, initials(name));
    var u = safeUrl(url);
    if (u) {
      PENDING.push(new Promise(function (resolve) {
        var img = new Image();
        img.alt = "";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.onload = function () { a.textContent = ""; a.appendChild(img); resolve(); };
        img.onerror = function () { resolve(); };
        img.src = u;
      }));
    }
    return a;
  }

  /* ── icons ────────────────────────────────────────────────── */
  function icon(kind, cls) {
    var s = S("svg", { viewBox: "0 0 22 18", "aria-hidden": "true", "class": cls || "fmt-ico", fill: "none" });
    var st = { stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" };
    function p(tag, a) { var o = {}; for (var k in st) o[k] = st[k]; for (var j in a) o[j] = a[j]; S(tag, o, s); }
    if (kind === "carousel") {
      p("rect", { x: "5", y: "2", width: "15", height: "14", rx: "2" });
      p("path", { d: "M2 5v8" });
    } else if (kind === "image") {
      p("rect", { x: "2", y: "2", width: "18", height: "14", rx: "2" });
      p("path", { d: "M2 13l5-5 4 4 3-3 6 5" });
      p("circle", { cx: "15.5", cy: "6.5", r: "1.2" });
    } else {
      p("path", { d: "M3 4h16M3 9h16M3 14h9" });
    }
    return s;
  }
  function mat(d) {
    var s = S("svg", { viewBox: "0 0 24 24", "aria-hidden": "true", fill: "currentColor" });
    S("path", { d: d }, s);
    return s;
  }
  var ICONS = {
    like: "M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z",
    comment: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z",
    repost: "M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z",
    send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
    copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
    download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"
  };
  var FMT_LABEL = { text: "Text post", image: "Image post", carousel: "Carousel post", video: "Video post" };

  /* ── tooltip ──────────────────────────────────────────────── */
  var tip = document.getElementById("tip");
  var tipOn = null;
  function showTip(target, x, y) {
    if (!tip || PRINT) return;
    if (tipOn !== target) {
      tip.textContent = "";
      String(target.getAttribute("data-tip")).split("\n").forEach(function (l, i) {
        if (l) tip.appendChild(T(i === 0 ? "b" : "span", null, l));
      });
      tipOn = target;
    }
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = x + 14, top = y + 16;
    if (left + w > window.innerWidth - 8) left = Math.max(8, x - w - 14);
    if (top + h > window.innerHeight - 8) top = Math.max(8, y - h - 14);
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTip() { if (tip) { tip.hidden = true; tipOn = null; } }
  document.addEventListener("pointermove", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
    if (t) showTip(t, e.clientX, e.clientY); else hideTip();
  });
  document.addEventListener("pointerdown", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("[data-tip]") : null;
    if (t) showTip(t, e.clientX, e.clientY); else hideTip();
  });
  window.addEventListener("scroll", hideTip, { passive: true });

  /* ── charts (inline SVG, drawn at the real pixel width) ───── */
  var DRAWS = [];
  function reg(box, fn) {
    DRAWS.push({ box: box, fn: fn, w: 0 });
  }
  function drawAll() {
    DRAWS.forEach(function (d) { if (d.box.isConnected) { d.w = d.box.clientWidth; d.fn(d.box); } });
  }
  var rzT = null;
  window.addEventListener("resize", function () {
    clearTimeout(rzT);
    rzT = setTimeout(function () {
      DRAWS.forEach(function (d) {
        if (!d.box.isConnected) return;
        var w = d.box.clientWidth;
        if (Math.abs(w - d.w) > 2) { d.w = w; d.fn(d.box); }
      });
    }, 150);
  });

  var C_BAR = "rgba(243,239,230,.38)";
  var C_GRID = "rgba(243,239,230,.14)";

  /* vertical bars, one per item, with optional reference lines */
  function drawBars(box, cfg) {
    box.textContent = "";
    var W = Math.max(240, Math.floor(box.clientWidth || 600));
    var H = cfg.h || (W < 520 ? 210 : 260);
    var ml = 34, mr = 6, mt = 30, mb = 6;
    var items = cfg.items, n = items.length;
    var maxV = 0;
    items.forEach(function (i) { if (i.v > maxV) maxV = i.v; });
    arr(cfg.refs).forEach(function (r) { if (r.v > maxV) maxV = r.v; });
    var top = niceMax(maxV), iw = W - ml - mr, ih = H - mt - mb;
    function y(v) { return mt + ih - (v / top) * ih; }
    var svg = S("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": cfg.label || "Chart" }, box);
    svg.style.maxWidth = "100%";
    [0, top].forEach(function (v) {
      S("line", { x1: ml, x2: W - mr, y1: y(v), y2: y(v), style: "stroke:" + C_GRID + ";stroke-width:1" }, svg);
      var t = S("text", { x: ml - 7, y: y(v) + 4, "text-anchor": "end", "class": "c-ax" }, svg);
      t.textContent = fmt(v);
    });
    var slot = iw / n, bw = Math.max(2, slot - (slot > 9 ? 3 : 1.5)), youLab = null;
    items.forEach(function (it, i) {
      var x = ml + i * slot + (slot - bw) / 2;
      var h = Math.max(1.5, y(0) - y(it.v));
      S("rect", { x: x, y: y(0) - h, width: bw, height: h, rx: bw > 6 ? 2 : 0.5, style: "fill:" + (it.hi ? "var(--redt)" : C_BAR) }, svg);
      if (it.hi && cfg.hiLabel) youLab = { x: x + bw / 2, y: y(0) - h - 8 };
    });
    var lx = ml;
    arr(cfg.refs).forEach(function (r) {
      var ry = y(r.v);
      S("line", { x1: ml, x2: W - mr, y1: ry, y2: ry, style: "stroke:rgba(243,239,230,.7);stroke-width:1.2;stroke-dasharray:4 4" }, svg);
      S("line", { x1: lx, x2: lx + 18, y1: 9, y2: 9, style: "stroke:rgba(243,239,230,.8);stroke-width:1.6;stroke-dasharray:4 3" }, svg);
      var t = S("text", { x: lx + 24, y: 13, "class": "c-ref" }, svg);
      t.textContent = r.label;
      lx += 24 + r.label.length * 7 + 18;
    });
    if (youLab) {
      var tx = Math.min(W - 30, Math.max(ml + 18, youLab.x));
      var yt = S("text", { x: tx, y: Math.max(26, youLab.y), "text-anchor": "middle", "class": "c-you" }, svg);
      yt.textContent = cfg.hiLabel;
    }
    items.forEach(function (it, i) {
      if (!it.tip) return;
      S("rect", { x: ml + i * slot, y: mt, width: slot, height: ih, fill: "transparent", "data-tip": it.tip }, svg);
    });
  }

  /* horizontal rows: name, bar, value, small line underneath */
  function drawRows(box, cfg) {
    box.textContent = "";
    var W = Math.max(240, Math.floor(box.clientWidth || 600));
    var rows = cfg.rows, maxV = 0;
    rows.forEach(function (r) { if (r.v > maxV) maxV = r.v; });
    if (!(maxV > 0)) maxV = 1;
    var barMax = W - 84;
    var heights = rows.map(function (r) { return r.sub ? 66 : 48; });
    var total = heights.reduce(function (a, b) { return a + b; }, 0);
    var svg = S("svg", { viewBox: "0 0 " + W + " " + total, width: W, height: total, role: "img", "aria-label": cfg.label || "Chart" }, box);
    svg.style.maxWidth = "100%";
    var y0 = 0;
    rows.forEach(function (r, i) {
      var rightW = r.right ? String(r.right).length * 7 + 14 : 0;
      var name = clip(r.name, Math.max(8, Math.floor((W - rightW) / 7.4)));
      var nt = S("text", { x: 0, y: y0 + 14, "class": r.hi ? "c-lab-b" : "c-lab" }, svg);
      nt.textContent = name;
      if (r.right) { var rt = S("text", { x: W, y: y0 + 14, "text-anchor": "end", "class": "c-ref" }, svg); rt.textContent = r.right; }
      S("rect", { x: 0, y: y0 + 22, width: barMax, height: 10, rx: 5, style: "fill:rgba(243,239,230,.07)" }, svg);
      var bwid = Math.max(3, (r.v / maxV) * barMax);
      S("rect", { x: 0, y: y0 + 22, width: bwid, height: 10, rx: 5, style: "fill:" + (r.hi ? "var(--redt)" : "rgba(243,239,230,.55)") }, svg);
      var vt = S("text", { x: bwid + 8, y: y0 + 32, "class": r.hi ? "c-you" : "c-val" }, svg);
      vt.textContent = r.val;
      if (r.sub) { var st = S("text", { x: 0, y: y0 + 52, "class": "c-ref" }, svg); st.textContent = clip(r.sub, Math.floor(W / 6.9)); }
      if (r.tip) S("rect", { x: 0, y: y0, width: W, height: heights[i], fill: "transparent", "data-tip": r.tip }, svg);
      y0 += heights[i];
    });
  }

  function donut(parts, centerNum, centerLab) {
    var size = 220, c = size / 2, r = 78, sw = 30, circ = 2 * Math.PI * r;
    var svg = S("svg", { viewBox: "0 0 " + size + " " + size, role: "img", "aria-label": "Who engaged with your posts" });
    svg.style.width = "100%"; svg.style.maxWidth = "240px"; svg.style.margin = "0 auto";
    S("circle", { cx: c, cy: c, r: r, fill: "none", style: "stroke:rgba(243,239,230,.07)", "stroke-width": sw }, svg);
    var total = parts.reduce(function (a, p) { return a + p.v; }, 0);
    if (total > 0) {
      var off = 0;
      parts.forEach(function (p) {
        if (!(p.v > 0)) return;
        var len = (p.v / total) * circ, gap = parts.length > 1 ? Math.min(3, len * 0.2) : 0;
        S("circle", { cx: c, cy: c, r: r, fill: "none", "stroke-width": sw, style: "stroke:" + p.color,
          "stroke-dasharray": Math.max(0.1, len - gap) + " " + circ, "stroke-dashoffset": -off,
          transform: "rotate(-90 " + c + " " + c + ")", "data-tip": p.tip }, svg);
        off += len;
      });
    }
    var t1 = S("text", { x: c, y: c + 8, "text-anchor": "middle", "class": "c-disp" }, svg); t1.textContent = centerNum;
    var t2 = S("text", { x: c, y: c + 30, "text-anchor": "middle", "class": "c-ax" }, svg); t2.textContent = centerLab;
    return svg;
  }

  /* ── copy button ──────────────────────────────────────────── */
  function copyBtn(getText) {
    var b = T("button", "copy ui-only");
    b.type = "button";
    b.appendChild(mat(ICONS.copy));
    var lab = T("span", null, "Copy");
    b.appendChild(lab);
    b.addEventListener("click", function () {
      var txt = getText();
      function done() {
        b.classList.add("done"); lab.textContent = "Copied";
        setTimeout(function () { b.classList.remove("done"); lab.textContent = "Copy"; }, 1800);
      }
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); done(); } catch (e) {}
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, fallback);
      else fallback();
    });
    return b;
  }

  /* LinkedIn-native post sheet */
  function liPost(buyer, text, opts) {
    opts = opts || {};
    var sheet = T("div", "sheet li");
    var hd = put(T("div", "li-hd"),
      avatar("li-av", buyer.name, buyer.avatar_url),
      put(T("div"), T("div", "li-name", buyer.name), T("div", "li-sub", buyer.headline)),
      copyBtn(function () { return text; }));
    sheet.appendChild(hd);
    var tx = rich(T("div", "li-text"), text);
    sheet.appendChild(tx);
    var long = text.length > 300;
    if (long && !PRINT) {
      sheet.classList.add("li-clip");
      var more = T("button", "more ui-only", "…more");
      more.type = "button";
      more.setAttribute("aria-expanded", "false");
      more.addEventListener("click", function () {
        var open = sheet.classList.toggle("li-clip");
        more.textContent = open ? "…more" : "show less";
        more.setAttribute("aria-expanded", open ? "false" : "true");
      });
      sheet.appendChild(more);
    }
    if (opts.media) sheet.appendChild(opts.media);
    var act = T("div", "li-act");
    act.setAttribute("aria-hidden", "true");
    [["like", "Like"], ["comment", "Comment"], ["repost", "Repost"], ["send", "Send"]].forEach(function (a) {
      put(act, put(T("span"), mat(ICONS[a[0]]), a[1]));
    });
    sheet.appendChild(act);
    return sheet;
  }

  /* ── section shell ────────────────────────────────────────── */
  var NAV = [];
  function shell(id, label, title, lede, cls) {
    var s = T("section", "sec" + (cls ? " " + cls : ""));
    s.id = id;
    s.setAttribute("aria-labelledby", id + "-h");
    var w = T("div", "wrap");
    s.appendChild(w);
    var hd = rv(T("div", "sec-hd"));
    var h2 = T("h2", "disp");
    h2.id = id + "-h";
    title.forEach(function (p) { if (typeof p === "string") h2.appendChild(document.createTextNode(p)); else h2.appendChild(T("span", "swipe", p.m)); });
    hd.appendChild(h2);
    if (lede) hd.appendChild(T("p", "lede", lede));
    w.appendChild(hd);
    NAV.push({ id: id, label: label });
    return { sec: s, wrap: w };
  }

  /* ═════════ sections ═════════ */

  function buildHero(d) {
    var b = obj(d.buyer), sm = obj(d.summary), rk = obj(d.rank), win = obj(d.window), files = obj(d.files);
    var s = T("section", "sec hero");
    s.id = "top";
    var w = T("div", "wrap");
    s.appendChild(w);
    var grid = T("div", "hero-grid");
    w.appendChild(grid);

    var left = rv(T("div", "hero-copy"));
    var gen = fmtDate(d.generated_at);
    var eyebrow = T("p", "mono", "LinkedIn Peer Scan" + (gen ? " · " + gen : ""));
    eyebrow.style.marginBottom = "22px";
    left.appendChild(eyebrow);
    var finding = str(sm.headline_finding);
    var h1 = T("h1", "disp hero-find", finding || (str(b.name) ? b.name + ": your LinkedIn Peer Scan" : "Your LinkedIn Peer Scan"));
    var L = h1.textContent.length;
    var sz = L <= 80 ? [76, 44, 56] : L <= 140 ? [60, 36, 44] : L <= 200 ? [50, 31, 36] : [42, 27, 30];
    h1.style.setProperty("--hfs", sz[0] + "px");
    h1.style.setProperty("--hfs-m", sz[1] + "px");
    h1.style.setProperty("--hfs-p", sz[2] + "px");
    left.appendChild(h1);

    var chips = [];
    if (win.from && win.to && fmtDate(win.from) && fmtDate(win.to)) chips.push(fmtDate(win.from, true) + " to " + fmtDate(win.to));
    if (isNum(win.posts_analyzed)) chips.push(fmt(win.posts_analyzed) + " posts analyzed");
    if (isNum(rk.peer_count)) chips.push(fmt(rk.peer_count) + " peers compared");
    if (str(b.niche_label)) chips.push(str(b.niche_label));
    if (chips.length) {
      var hd = T("div", "hero-data");
      chips.forEach(function (c) { hd.appendChild(T("span", null, c)); });
      left.appendChild(hd);
    }
    var act = T("div", "hero-act ui-only");
    var pdf = safeUrl(files.pdf_url);
    if (pdf) {
      var a = put(T("a", "btn btn-red"), mat(ICONS.download), "Download the PDF");
      a.href = pdf; a.setAttribute("download", ""); a.rel = "noopener";
      act.appendChild(a);
    }
    if (arr(sm.moves).length) {
      var g = T("a", "btn btn-ghost", "See your moves");
      g.href = "#moves";
      act.appendChild(g);
    }
    if (act.children.length) left.appendChild(act);
    grid.appendChild(left);

    if (str(b.name)) {
      var sheet = rv(T("div", "sheet idsheet"), 120);
      sheet.appendChild(T("div", "id-banner"));
      var body = T("div", "id-body");
      body.appendChild(avatar("av", b.name, b.avatar_url));
      body.appendChild(T("div", "id-name", b.name));
      if (str(b.headline)) body.appendChild(T("div", "id-head", b.headline));
      if (isNum(b.followers)) {
        var meta = T("div", "id-meta");
        put(meta, put(T("b"), fmt(b.followers)), " followers");
        body.appendChild(meta);
      }
      var you = obj(rk.you), peers = obj(rk.peers);
      var stats = [];
      if (isNum(you.median_likes)) stats.push({ me: true, n: fmt(you.median_likes), l: "Your typical likes per post" });
      if (isNum(peers.median_likes)) stats.push({ n: fmt(peers.median_likes), l: "Typical likes for your peers" });
      if (isNum(rk.percentile_likes)) stats.push({ n: fmt(rk.percentile_likes) + ord(rk.percentile_likes), l: "Your percentile for likes" });
      if (stats.length) {
        var foot = T("div", "id-foot");
        stats.forEach(function (st) {
          foot.appendChild(put(T("div", st.me ? "me" : ""), T("b", null, st.n), T("span", null, st.l)));
        });
        body.appendChild(foot);
      }
      sheet.appendChild(body);
      grid.appendChild(sheet);
    }

    var moves = arr(sm.moves).filter(function (m) { return isObj(m) && (str(m.title) || str(m.body)); });
    if (moves.length) {
      var wrap = T("div");
      wrap.id = "moves";
      wrap.style.marginTop = "64px";
      wrap.appendChild(rv(T("h2", "moves-hd", "Do these first")));
      var mv = rv(T("div", "moves"));
      var th = S("svg", { "class": "moves-thread", viewBox: "0 0 1000 40", preserveAspectRatio: "none", "aria-hidden": "true" }, mv);
      th.style.width = "100%";
      th.style.height = "40px";
      S("path", { "class": "thread-path", d: "M20 20 H780", fill: "none", pathLength: "1000", style: "stroke:var(--red);stroke-width:3;stroke-linecap:round;stroke-dasharray:1000;--len:1000" }, th);
      moves.forEach(function (m, i) {
        var card = rv(T("div", "move"), i * 120);
        card.appendChild(T("div", "move-node"));
        var p = T("div", "panel");
        if (str(m.title)) p.appendChild(T("h3", null, m.title));
        if (str(m.body)) p.appendChild(rich(T("p"), m.body));
        card.appendChild(p);
        mv.appendChild(card);
      });
      wrap.appendChild(mv);
      w.appendChild(wrap);
      NAV.unshift({ id: "moves", label: "Moves" });
    }
    return s;
  }

  /* ── 30-day re-scan: before and after, from data.rescan.result ── */
  function buildRescanResult(d) {
    var res = obj(obj(d.rescan).result);
    var rk = obj(res.rank), b = obj(rk.before), a = obj(rk.after), pe = obj(rk.peers), en = obj(res.engagers), eb = obj(en.before), ea = obj(en.after), fo = obj(res.followers), since = obj(res.since);
    var rows = [
      { l: "Percentile for likes", sub: isNum(rk.peer_count) ? "among " + fmt(rk.peer_count) + " peers" : "", b: b.percentile_likes, a: a.percentile_likes, f: function (n) { return fmt(n) + ord(n); }, dl: "points" },
      { l: "Percentile for comments", sub: isNum(rk.peer_count) ? "among " + fmt(rk.peer_count) + " peers" : "", b: b.percentile_comments, a: a.percentile_comments, f: function (n) { return fmt(n) + ord(n); }, dl: "points" },
      { l: "Typical likes per post", sub: isNum(pe.median_likes) ? "peer median " + fmt(pe.median_likes) : "", b: b.median_likes, a: a.median_likes, f: fmt },
      { l: "Typical comments per post", sub: isNum(pe.median_comments) ? "peer median " + fmt(pe.median_comments) : "", b: b.median_comments, a: a.median_comments, f: fmt },
      { l: "Likely buyers among the people who engage", sub: isNum(ea.unique) ? "out of " + fmt(ea.unique) + " people now" : "", b: eb.buyers_pct, a: ea.buyers_pct, f: function (n) { return fmt(n) + "%"; }, dl: "points" },
      { l: "Followers", sub: "", b: fo.before, a: fo.after, f: fmt }
    ].filter(function (r) { return isNum(r.b) && isNum(r.a); });
    var topics = arr(res.topics).filter(function (t) { return isObj(t) && str(t.name) && (isObj(t.before) || isObj(t.after)); });
    if (!rows.length && !str(res.headline)) return null;
    var sh = shell("rescan", "Re-scan", ["Before and ", { m: "after" }], str(res.headline));
    var when = fmtDate(res.scanned_at), first = fmtDate(res.first_report_at);
    if (when) {
      var cap = T("p", "mono ba-when", "Re-scan of " + when + (first ? " against your report of " + first : ""));
      cap.style.marginTop = "-28px"; cap.style.marginBottom = "28px";
      sh.wrap.appendChild(cap);
    }

    if (rows.length) {
      var tb = rv(T("div", "panel ba"));
      var head = T("div", "ba-row ba-head");
      put(head, T("span"), T("span", "mono", "Before"), T("span"), T("span", "mono", "Now"), T("span", "mono", "Change"));
      tb.appendChild(head);
      rows.forEach(function (r) {
        var row = T("div", "ba-row");
        var lab = T("div", "ba-l");
        lab.appendChild(T("h4", null, r.l));
        if (r.sub) lab.appendChild(T("span", "small", r.sub));
        var diff = Math.round((r.a - r.b) * 10) / 10;
        var dtxt = diff === 0 ? "same" : (diff > 0 ? "+" : "") + fmt(diff) + (r.dl ? " " + (Math.abs(diff) === 1 ? "point" : r.dl) : "");
        put(row, lab, T("b", "ba-v", r.f(r.b)), T("i", "ba-arrow", "→"), T("b", "ba-v ba-now", r.f(r.a)), T("span", "ba-d" + (diff > 0 ? " up" : diff < 0 ? " down" : ""), dtxt));
        row.querySelector(".ba-arrow").setAttribute("aria-hidden", "true");
        tb.appendChild(row);
      });
      sh.wrap.appendChild(tb);
    }

    var grid = T("div", "ba-grid");
    var tp = topics.filter(function (t) { return (isObj(t.before) && isNum(t.before.median_likes)) || (isObj(t.after) && isNum(t.after.median_likes)); });
    if (tp.length) {
      var tpan = rv(T("div", "panel ba-topics"));
      tpan.appendChild(T("h3", "h3", "Topic results"));
      tpan.appendChild(T("p", "small", "Typical likes per post, by topic. A topic with fewer than 3 posts on a side is too small to compare."));
      var mx = 0;
      tp.forEach(function (t) { ["before", "after"].forEach(function (k) { var g = obj(t[k]); if (isNum(g.median_likes) && g.median_likes > mx) mx = g.median_likes; }); });
      if (!(mx > 0)) mx = 1;
      tp.forEach(function (t) {
        var box = T("div", "ba-topic");
        box.appendChild(T("h4", null, t.name));
        [["before", "Before"], ["after", "Now"]].forEach(function (k) {
          var g = obj(t[k[0]]);
          var line = T("div", "ba-line" + (k[0] === "after" ? " now" : ""));
          line.appendChild(T("span", "mono", k[1]));
          var bar = T("span", "ba-bar"), fill = T("i");
          fill.style.width = isNum(g.median_likes) ? Math.max(2, (g.median_likes / mx) * 100) + "%" : "0%";
          bar.appendChild(fill);
          line.appendChild(bar);
          var txt = isNum(g.median_likes) ? cnt(g.median_likes, "like") + " · " + cnt(g.n, "post") : "no posts";
          if (isNum(g.n) && g.n < 3) txt += " (too few)";
          line.appendChild(T("b", null, txt));
          box.appendChild(line);
        });
        tpan.appendChild(box);
      });
      grid.appendChild(tpan);
    }

    if (isNum(since.posts)) {
      var sp = rv(T("div", "panel ba-since"), 100);
      sp.appendChild(T("h3", "h3", "Since your first report"));
      sp.appendChild(put(T("div", "stat-num"), fmt(since.posts), T("small", null, since.posts === 1 ? "new post" : "new posts")));
      var line1;
      if (since.settled_posts > 0 && isNum(since.median_likes)) {
        line1 = "Of those, " + fmt(since.settled_posts) + (since.settled_posts === 1 ? " is" : " are") + " old enough to count (a post counts after a week). A typical one got " + cnt(since.median_likes, "like") + " and " + cnt(since.median_comments || 0, "comment") + ".";
        if (isNum(b.median_likes)) line1 += " Your typical post in the first report got " + cnt(b.median_likes, "like") + " and " + cnt(b.median_comments || 0, "comment") + ".";
      } else line1 = since.posts ? "None of them is old enough to count yet. A post counts after a week." : "You have not posted since the first report, so there is nothing new to measure.";
      sp.appendChild(T("p", "stat-lab", line1));
      if (since.settled_posts > 0 && since.settled_posts < 5) sp.appendChild(T("p", "small", "With fewer than 5 counted posts, read this as a first look."));
      grid.appendChild(sp);
    }
    if (grid.children.length) sh.wrap.appendChild(grid);

    if (str(res.note)) sh.wrap.appendChild(rv(T("p", "lede ba-note", res.note)));
    sh.wrap.appendChild(rv(T("p", "note", "Same method as your first report. Your peers are the same creators with the numbers they had in your first report, so only your side moves. The figures come from public LinkedIn data.")));
    return sh.sec;
  }

  function buildRank(d) {
    var rk = obj(d.rank), you = obj(rk.you), peers = obj(rk.peers), b = obj(d.buyer);
    var dist = arr(rk.distribution).filter(function (x) { return isObj(x) && isNum(x.median_likes); });
    var hasStats = isNum(rk.percentile_likes) || isNum(rk.percentile_comments) || isNum(you.median_likes);
    if (!dist.length && !hasStats) return null;
    var sh = shell("rank", "Rank", ["Where you ", { m: "stand" }], str(rk.note));
    var grid = T("div", "rank-grid");
    sh.wrap.appendChild(grid);

    if (dist.length) {
      var panel = rv(T("div", "panel"));
      function block(title, cap, key, refs, hiLabel, unit) {
        var items = dist.filter(function (x) { return isNum(x[key]); }).slice().sort(function (a, c) { return a[key] - c[key]; }).map(function (x) {
          return { v: x[key], hi: !!x.is_you,
            tip: (x.is_you ? "You (" + x.name + ")" : x.name) + (isNum(x.followers) ? "\n" + fmt(x.followers) + " followers" : "") + "\n" + fmt(x[key]) + " " + unit };
        });
        if (!items.length) return;
        var blk = T("div", "chart-block");
        blk.appendChild(put(T("div", "chart-cap"), T("h3", "h3", title), T("span", "mono", cap)));
        var box = T("div", "chart");
        blk.appendChild(box);
        panel.appendChild(blk);
        reg(box, function (bx) { drawBars(bx, { items: items, refs: refs, hiLabel: hiLabel, label: title }); });
      }
      var refsL = [];
      if (isNum(peers.median_likes)) refsL.push({ v: peers.median_likes, label: "Peer median " + fmt(peers.median_likes) });
      if (isNum(peers.p90_likes)) refsL.push({ v: peers.p90_likes, label: "Top 10%: " + fmt(peers.p90_likes) });
      var refsC = [];
      if (isNum(peers.median_comments)) refsC.push({ v: peers.median_comments, label: "Peer median " + fmt(peers.median_comments) });
      block("Typical likes per post", "Each bar is one creator", "median_likes", refsL, "You", "typical likes");
      block("Typical comments per post", "Each bar is one creator", "median_comments", refsC, "You", "typical comments");
      grid.appendChild(panel);
    }

    var side = T("div", "rank-side");
    function pstat(p, what) {
      var st = rv(T("div", "panel stat"));
      st.appendChild(put(T("div", "stat-num"), fmt(p), T("small", null, ord(p))));
      st.appendChild(T("div", "stat-lab", "Your percentile for " + what + (isNum(rk.peer_count) ? ", among " + fmt(rk.peer_count) + " peers" : "")));
      var m = put(T("div", "meter"), put(T("i"), ""), T("b"));
      var pc = Math.max(0, Math.min(100, p));
      m.firstChild.style.width = pc + "%";
      m.lastChild.style.left = pc + "%";
      st.appendChild(m);
      st.appendChild(put(T("div", "meter-k"), T("span", null, "Lowest"), T("span", null, "Highest")));
      return st;
    }
    if (isNum(rk.percentile_likes)) side.appendChild(pstat(rk.percentile_likes, "likes"));
    if (isNum(rk.percentile_comments)) side.appendChild(pstat(rk.percentile_comments, "comments"));
    if (isNum(you.median_likes) && isNum(peers.median_likes)) {
      var st3 = rv(T("div", "panel stat"));
      st3.appendChild(put(T("div", "stat-num"), fmt(you.median_likes), T("small", null, "vs " + fmt(peers.median_likes))));
      var lab = "Typical likes per post: yours against your peers.";
      if (isNum(you.median_comments) && isNum(peers.median_comments)) lab += " Comments: " + fmt(you.median_comments) + " against " + fmt(peers.median_comments) + ".";
      st3.appendChild(T("div", "stat-lab", lab));
      side.appendChild(st3);
    }
    if (side.children.length) grid.appendChild(side);
    if (!grid.children.length) return null;
    return sh.sec;
  }

  var CONF = { clear: "Clear gap", lean: "Leaning", too_few: "Too few to call" };
  function buildPatterns(d) {
    var pats = arr(d.patterns).filter(function (p) { return isObj(p) && arr(p.groups).length; });
    if (!pats.length) return null;
    var sh = shell("patterns", "Patterns", ["What moves your ", { m: "numbers" }],
      "Each card compares groups of posts by their typical likes and comments. A solid dot marks a clear gap, a ring marks a lean, and a faded dot means there were too few posts to call it.");
    var grid = T("div", "pat-grid");
    pats.forEach(function (p, i) {
      var conf = (p.confidence === "clear" || p.confidence === "lean" || p.confidence === "too_few") ? p.confidence : "lean";
      var card = rv(T("article", "panel pat card " + conf), (i % 2) * 100);
      card.appendChild(put(T("div", "pat-top"), T("h3", null, str(p.label) || "Pattern"),
        put(T("span", "conf " + conf), T("i"), CONF[conf])));
      if (str(p.finding)) card.appendChild(T("p", "pat-find", p.finding));
      var groups = arr(p.groups).filter(function (g) { return isObj(g) && isNum(g.median_likes); });
      if (groups.length) {
        var best = -1, bv = -1;
        if (conf !== "too_few") groups.forEach(function (g, gi) { if (g.median_likes > bv) { bv = g.median_likes; best = gi; } });
        var box = T("div", "chart");
        card.appendChild(box);
        reg(box, function (bx) {
          drawRows(bx, { label: str(p.label), rows: groups.map(function (g, gi) {
            var parts = [];
            if (isNum(g.median_comments)) parts.push(cnt(g.median_comments, "comment"));
            if (isNum(g.vs_you_pct)) parts.push(g.vs_you_pct === 0 ? "same as your usual" : fmtPct(g.vs_you_pct) + " vs your usual");
            return { name: str(g.name) || "Group", right: isNum(g.n) ? cnt(g.n, "post") : "", v: g.median_likes, val: cnt(g.median_likes, "like"),
              sub: parts.join(" · "), hi: gi === best,
              tip: (str(g.name) || "Group") + (isNum(g.n) ? "\n" + cnt(g.n, "post") : "") + "\n" + cnt(g.median_likes, "typical like") + (isNum(g.median_comments) ? "\n" + cnt(g.median_comments, "typical comment") : "") };
          }) });
        });
      }
      if (str(p.niche_context)) card.appendChild(T("p", "pat-ctx", p.niche_context));
      grid.appendChild(card);
    });
    sh.wrap.appendChild(grid);
    return sh.sec;
  }

  var KIND = { buyer: "Likely buyer", peer: "Peer", other: "Other" };
  function buildEngagers(d) {
    var e = obj(d.engagers), sh_ = obj(e.shares);
    var top = arr(e.top).filter(function (x) { return isObj(x) && str(x.name); });
    var hasShares = isNum(sh_.buyers) || isNum(sh_.peers) || isNum(sh_.other);
    if (!top.length && !hasShares && !isNum(e.unique)) return null;
    var sh = shell("engagers", "Engagers", ["Who is ", { m: "watching" }],
      str(e.note) || "People who liked or commented on your recent posts, sorted by what their public headline says.");
    var grid = T("div", "eng-grid");
    if (hasShares || isNum(e.unique)) {
      var panel = rv(T("div", "panel"));
      var parts = [
        { k: "buyers", label: "Look like buyers", color: "var(--redt)" },
        { k: "peers", label: "Peers", color: "var(--tx)" },
        { k: "other", label: "Others", color: "var(--tx3)" }
      ].filter(function (p) { return isNum(sh_[p.k]); }).map(function (p) {
        return { v: sh_[p.k], color: p.color, label: p.label, tip: p.label + "\n" + fmt(sh_[p.k]) + "% of the people who engaged" };
      });
      if (parts.length) panel.appendChild(donut(parts, isNum(e.unique) ? fmt(e.unique) : "", "people"));
      else if (isNum(e.unique)) panel.appendChild(T("div", "stat-num", fmt(e.unique)));
      if (isNum(e.posts_covered)) {
        var cap = T("p", "small", "Across your last " + fmt(e.posts_covered) + " posts.");
        cap.style.textAlign = "center"; cap.style.marginTop = "12px";
        panel.appendChild(cap);
      }
      if (parts.length) {
        var lg = T("div", "legend");
        parts.forEach(function (p) {
          var sw = T("i"); sw.style.background = p.color;
          lg.appendChild(put(T("div"), sw, T("span", null, p.label), T("b", null, fmt(p.v) + "%")));
        });
        panel.appendChild(lg);
      }
      grid.appendChild(panel);
    }
    if (top.length) {
      var list = rv(T("div", "people"), 100);
      top.forEach(function (x) {
        var kind = KIND[x.kind] ? x.kind : "other";
        var pr = T("div", "person" + (kind === "buyer" ? " buyer" : ""));
        pr.appendChild(T("div", "pav", initials(x.name)));
        var url = safeUrl(x.profile_url);
        var nm = url ? T("a", "pname", x.name) : T("span", "pname", x.name);
        if (url) { nm.href = url; nm.target = "_blank"; nm.rel = "noopener noreferrer"; }
        var mid = put(T("div"), put(T("div"), nm, T("span", "kind " + kind, KIND[kind])));
        if (str(x.headline)) mid.appendChild(T("div", "phead", x.headline));
        if (str(x.why)) mid.appendChild(T("div", "pwhy", x.why));
        mid.style.minWidth = "0";
        pr.appendChild(mid);
        var right = T("div");
        if (isNum(x.times) && x.times > 0) {
          var pips = T("div", "pips");
          pips.setAttribute("aria-hidden", "true");
          for (var i = 0; i < Math.min(x.times, 12); i++) pips.appendChild(T("i"));
          right.appendChild(pips);
          right.appendChild(T("div", "pcount", fmt(x.times) + (x.times === 1 ? " time" : " times")));
        }
        pr.appendChild(right);
        list.appendChild(pr);
      });
      grid.appendChild(list);
    }
    if (!grid.children.length) return null;
    sh.wrap.appendChild(grid);
    return sh.sec;
  }

  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  function utcDay(d) { return (d.getUTCDay() + 6) % 7; }
  function isoDay(d) { return d.toISOString().slice(0, 10); }
  function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }

  function buildCalendar(d, carMap) {
    var cal = obj(d.calendar), buyer = obj(d.buyer);
    var weeks = arr(cal.weeks).filter(function (w) { return isObj(w) && arr(w.posts).length; });
    if (!weeks.length) return null;
    var lede = "Every post has a topic, a reason and a draft you can copy.";
    if (fmtDate(cal.start_date)) lede += " The plan starts on " + fmtDate(cal.start_date) + ".";
    var sh = shell("calendar", "Calendar", ["Your next weeks of ", { m: "posts" }], lede);
    var wrap = sh.wrap;

    var panel = rv(T("div", "panel cal"));
    var head = T("div", "cal-head");
    head.appendChild(T("span", "wk"));
    DAYS.forEach(function (n) { head.appendChild(T("span", null, n)); });
    panel.appendChild(head);

    var detail = [];
    weeks.forEach(function (wk, wi) {
      var posts = arr(wk.posts).filter(isObj);
      var first = null;
      posts.forEach(function (p) { var dt = toDate(p.date); if (dt && (!first || dt < first)) first = dt; });
      var mon = first ? addDays(first, -utcDay(first)) : (toDate(cal.start_date) ? addDays(toDate(cal.start_date), (wi) * 7 - utcDay(toDate(cal.start_date))) : null);
      var label = "Week " + (isNum(wk.n) ? wk.n : wi + 1);
      var row = T("div", "cal-row");
      row.setAttribute("data-wk", label);
      row.appendChild(T("div", "cal-wk", label));
      var slots = [null, null, null, null, null, null, null];
      var extra = [];
      posts.forEach(function (p, pi) {
        var idx = -1, dt = toDate(p.date);
        if (dt && mon) { var diff = Math.round((Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()) - Date.UTC(mon.getUTCFullYear(), mon.getUTCMonth(), mon.getUTCDate())) / 86400000); if (diff >= 0 && diff < 7) idx = diff; }
        if (idx < 0) idx = DAYS.indexOf(str(p.day).slice(0, 3));
        p._id = "post-w" + (isNum(wk.n) ? wk.n : wi + 1) + "-" + (pi + 1);
        if (idx >= 0 && !slots[idx]) slots[idx] = p; else extra.push(p);
      });
      extra.forEach(function (p) { for (var i = 0; i < 7; i++) if (!slots[i]) { slots[i] = p; break; } });
      for (var i = 0; i < 7; i++) {
        var p = slots[i], dayDate = mon ? addDays(mon, i) : null;
        var num = dayDate ? String(dayDate.getUTCDate()) : "";
        if (p) {
          var a = T("a", "cal-cell cal-post");
          a.href = "#" + p._id;
          a.setAttribute("aria-label", (str(p.day) || DAYS[i]) + (fmtDate(p.date, true) ? " " + fmtDate(p.date, true) : "") + ": " + (str(p.topic) || "post"));
          var fm = p.format === "carousel" || p.format === "image" ? p.format : "text";
          a.appendChild(put(T("div", "dn"), T("span", null, num), icon(fm)));
          a.appendChild(T("div", "cal-topic", p.topic));
          a.setAttribute("data-tip", (str(p.topic) || "Post") + "\n" + (FMT_LABEL[fm]));
          row.appendChild(a);
        } else {
          row.appendChild(put(T("div", "cal-cell"), T("div", "dn", num)));
        }
      }
      panel.appendChild(row);
      var rangeTxt = mon ? fmtDate(isoDay(mon), true) + " to " + fmtDate(isoDay(addDays(mon, 6))) : "";
      detail.push({ label: label, range: rangeTxt, posts: slots.filter(Boolean).concat([]) });
    });
    var key = T("div", "cal-key");
    [["text", "Text post"], ["image", "Image post"], ["carousel", "Carousel post"]].forEach(function (k) {
      key.appendChild(put(T("span"), icon(k[0], "fmt-ico"), k[1]));
    });
    panel.appendChild(key);
    wrap.appendChild(panel);

    detail.forEach(function (w) {
      var hd = T("div", "week-hd");
      hd.appendChild(T("h3", null, w.label));
      if (w.range) hd.appendChild(T("span", "mono", w.range));
      wrap.appendChild(rv(hd));
      var list = T("div", "posts");
      w.posts.forEach(function (p) {
        var fm = p.format === "carousel" || p.format === "image" ? p.format : "text";
        var row = rv(T("div", "post-row card"));
        row.id = p._id;
        var side = T("div", "post-side");
        var when = (str(p.day) || "") + (fmtDate(p.date, true) ? " " + fmtDate(p.date, true) : "");
        if (when.trim()) side.appendChild(T("div", "when", when.trim()));
        if (str(p.topic)) side.appendChild(T("h4", null, p.topic));
        if (str(p.why)) side.appendChild(T("p", null, p.why));
        side.appendChild(put(T("div", "fmt-line"), icon(fm, "fmt-ico"), FMT_LABEL[fm]));
        row.appendChild(side);
        var media = null;
        if (fm === "image") {
          media = put(T("div", "li-media"), put(T("div", "li-img"), put(T("div"), icon("image", ""), T("span", null, "Add an image here"))));
          media.querySelector("svg").setAttribute("class", "");
        } else if (fm === "carousel") {
          var car = p.carousel_id ? carMap[p.carousel_id] : null;
          var doc = car ? T("a", "li-doc") : T("div", "li-doc");
          if (car) { doc.href = "#" + car.anchor; }
          var mini = T("div", "mini");
          mini.appendChild(T("b", null, car ? car.title : str(p.topic)));
          doc.appendChild(mini);
          var tx = T("p");
          tx.appendChild(T("b", null, car ? car.title : "Carousel"));
          tx.appendChild(document.createTextNode(car && car.slides.length ? fmt(car.slides.length) + " slides. Open the carousel below." : "Carousel post"));
          doc.appendChild(tx);
          media = put(T("div", "li-media"), doc);
        }
        var text = str(p.text);
        row.appendChild(text ? liPost(buyer, text, { media: media }) : put(T("div", "sheet li"), media || T("div")));
        list.appendChild(row);
      });
      wrap.appendChild(list);
    });
    return sh.sec;
  }

  function buildCarousels(d, cars) {
    if (!cars.length) return null;
    var anyPdf = cars.some(function (c) { return !!safeUrl(c.pdf_url); });
    var sh = shell("carousels", "Carousels", ["Carousels ready to ", { m: "post" }],
      anyPdf ? "Each carousel is written out slide by slide. Download the PDF and upload it as a document post on LinkedIn."
             : "Each carousel is written out slide by slide, ready to build as a document post on LinkedIn.");
    var wrap = T("div", "caros");
    cars.forEach(function (c, ci) {
      var card = rv(T("article", "panel caro card"));
      card.id = c.anchor;
      var cover = T("div", "caro-cover");
      var img = safeUrl(c.cover_png_url);
      if (img) {
        var im = T("img"); im.alt = "Cover of the carousel: " + c.title; im.src = img; im.loading = PRINT ? "eager" : "lazy";
        im.referrerPolicy = "no-referrer";
        cover.appendChild(im);
      } else {
        var mini = T("div", "mini cover");
        var words = c.title.split(" ");
        var b = T("b");
        if (words.length > 1) { b.appendChild(document.createTextNode(words.slice(0, -1).join(" ") + " ")); b.appendChild(T("em", null, words[words.length - 1])); }
        else b.appendChild(T("em", null, c.title));
        mini.appendChild(b);
        if (c.slides[0] && str(c.slides[0].body)) mini.appendChild(T("span", null, c.slides[0].body));
        cover.appendChild(mini);
      }
      card.appendChild(cover);
      var meta = T("div", "caro-meta");
      meta.appendChild(T("h3", null, c.title));
      if (c.slides.length) meta.appendChild(T("p", "small", fmt(c.slides.length) + " slides"));
      if (c.slides.length) {
        var strip = T("div", "strip");
        c.slides.forEach(function (s, si) {
          var m = T("div", "mini");
          m.appendChild(T("i", null, String(si + 1)));
          m.appendChild(T("b", null, s.title));
          if (str(s.body)) m.appendChild(T("span", null, s.body));
          m.setAttribute("data-tip", "Slide " + (si + 1) + "\n" + (str(s.title)) + (str(s.body) ? "\n" + s.body : ""));
          strip.appendChild(m);
        });
        meta.appendChild(strip);
      }
      var pdf = safeUrl(c.pdf_url);
      if (pdf) {
        var a = put(T("a", "btn btn-red ui-only"), mat(ICONS.download), "Download the PDF");
        a.href = pdf; a.setAttribute("download", ""); a.rel = "noopener";
        meta.appendChild(a);
      }
      card.appendChild(meta);
      wrap.appendChild(card);
    });
    sh.wrap.appendChild(wrap);
    return sh.sec;
  }

  function arrowSvg() {
    var s = S("svg", { "class": "rw-arrow", viewBox: "0 0 70 40", "aria-hidden": "true", fill: "none" });
    S("path", { d: "M8 20 H58 M46 8 L60 20 L46 32", style: "stroke:var(--redt);stroke-width:3;stroke-linecap:round;stroke-linejoin:round" }, s);
    return s;
  }
  function buildRewrites(d) {
    var rws = arr(d.rewrites).filter(function (r) { return isObj(r) && str(r.opening) && str(r.new_opening); });
    if (!rws.length) return null;
    var rk = obj(d.rank), you = obj(rk.you), peers = obj(rk.peers);
    var sh = shell("rewrites", "Rewrites", ["Stronger ", { m: "openings" }, " for your posts"],
      "The first lines of your own posts, next to a rewrite of each one. Only the opening changes, so you can swap it in without touching the rest.");
    rws.forEach(function (r) {
      var row = rv(T("div", "rw"));
      var old = T("div", "sheet rw-card rw-old");
      var dt = fmtDate(r.posted_at);
      old.appendChild(put(T("div", "lab"), T("span", null, "Your opening"), T("span", null, dt)));
      old.appendChild(T("blockquote", null, r.opening));
      if (isNum(r.likes)) {
        var rows = [{ l: "This post", v: r.likes, u: false }];
        if (isNum(you.median_likes)) rows.push({ l: "Your median", v: you.median_likes, u: true });
        if (isNum(peers.median_likes)) rows.push({ l: "Peer median", v: peers.median_likes, u: true });
        var mx = 0; rows.forEach(function (x) { if (x.v > mx) mx = x.v; });
        var cap = T("div", "lab"); cap.style.marginTop = "16px"; cap.appendChild(T("span", null, "Likes"));
        if (isNum(r.comments)) cap.appendChild(T("span", null, fmt(r.comments) + (r.comments === 1 ? " comment" : " comments")));
        old.appendChild(cap);
        var meter = T("div", "rw-meter");
        meter.style.marginTop = "8px";
        rows.forEach(function (x) {
          var i = T("i"); i.style.width = (mx > 0 ? Math.max(2, (x.v / mx) * 100) : 2) + "%";
          meter.appendChild(put(T("div", x.u ? "u" : ""), T("span", null, x.l), i, T("b", null, fmt(x.v))));
        });
        old.appendChild(meter);
      }
      row.appendChild(old);
      row.appendChild(arrowSvg());
      var nw = T("div", "sheet rw-card rw-new");
      nw.appendChild(put(T("div", "lab"), T("span", null, "Suggested opening")));
      nw.appendChild(T("blockquote", null, r.new_opening));
      row.appendChild(nw);
      if (str(r.why)) row.appendChild(T("div", "rw-why", r.why));
      sh.wrap.appendChild(row);
    });
    return sh.sec;
  }

  function profileCard(b, data, now, clampAbout) {
    var col = T("div", "prof-col " + (now ? "now" : "new"));
    col.appendChild(T("span", "mono", now ? "Your profile today" : "Proposed profile"));
    var sheet = T("div", "sheet prof");
    sheet.appendChild(T("div", "prof-banner"));
    var inn = T("div", "prof-in");
    inn.appendChild(avatar("av", b.name, b.avatar_url));
    inn.appendChild(T("div", "prof-name", b.name));
    if (str(data.headline)) {
      var hl = T("div", "prof-headline");
      if (now) hl.textContent = data.headline; else hl.appendChild(rich(T("span", "hl"), data.headline));
      inn.appendChild(hl);
    }
    if (str(data.about)) {
      var sec = T("div", "prof-sec");
      sec.appendChild(T("h5", null, "About"));
      var p = rich(T("p"), data.about);
      sec.appendChild(p);
      if (clampAbout && data.about.length > 560 && !PRINT) {
        p.style.display = "-webkit-box"; p.style.webkitBoxOrient = "vertical"; p.style.webkitLineClamp = "7"; p.style.overflow = "hidden";
        var more = T("button", "more ui-only", "…more");
        more.type = "button";
        more.addEventListener("click", function () {
          var closed = p.style.webkitLineClamp === "7";
          p.style.webkitLineClamp = closed ? "unset" : "7";
          p.style.display = closed ? "block" : "-webkit-box";
          more.textContent = closed ? "show less" : "…more";
        });
        sec.appendChild(more);
      }
      inn.appendChild(sec);
    }
    var feats = arr(data.featured).filter(function (f) { return isObj(f) && str(f.title); });
    if (feats.length) {
      var fs = T("div", "prof-sec");
      fs.appendChild(T("h5", null, "Featured"));
      var fg = T("div", "feat");
      feats.slice(0, 6).forEach(function (f) {
        var sub = str(f.why) || str(f.subtitle);
        var box = T("div");
        box.appendChild(T("i"));
        box.appendChild(rich(T("b"), f.title));
        if (sub) box.appendChild(T("span", null, sub));
        fg.appendChild(box);
      });
      fs.appendChild(fg);
      inn.appendChild(fs);
    }
    sheet.appendChild(inn);
    col.appendChild(sheet);
    return col;
  }
  function buildProfile(d) {
    var pr = obj(d.profile), cur = obj(pr.current), prop = obj(pr.proposed), b = obj(d.buyer);
    var notes = arr(pr.notes).filter(function (n) { return str(n); });
    var hasCur = str(cur.headline) || str(cur.about), hasProp = str(prop.headline) || str(prop.about);
    if (!hasCur && !hasProp && !notes.length) return null;
    var sh = shell("profile", "Profile", ["A sharper ", { m: "profile" }],
      "Your headline and About as they are today, next to the text we propose. Anything in brackets is a gap for you to fill with your own detail.");
    var grid = T("div", "prof-grid");
    if (hasCur) grid.appendChild(rv(profileCard(b, cur, true, true)));
    if (hasProp) grid.appendChild(rv(profileCard(b, prop, false, true), 100));
    if (grid.children.length) sh.wrap.appendChild(grid);
    if (notes.length) {
      var ul = rv(T("ul", "notes"));
      notes.forEach(function (n) { ul.appendChild(T("li", null, n)); });
      sh.wrap.appendChild(ul);
    }
    return sh.sec;
  }

  function buildSwipe(d) {
    var rk = obj(d.rank), you = obj(rk.you);
    var items = arr(d.swipe).filter(function (s) { return isObj(s) && str(s.opening); });
    if (!items.length) return null;
    var sh = shell("swipe", "Swipe", ["Posts worth ", { m: "borrowing" }, " from"],
      "Recent posts in your niche that earned well above their author's usual likes. Take the opening and the reason it worked, then write it in your own words.");
    var withMult = items.filter(function (s) { return isNum(s.multiple); });
    if (withMult.length > 2) {
      var chartPanel = rv(T("div", "panel swipe-chart"));
      chartPanel.appendChild(put(T("div", "chart-cap"), T("h3", "h3", "How far each post beat its author's usual likes"), T("span", "mono", "Each bar is one post")));
      var box = T("div", "chart");
      chartPanel.appendChild(box);
      var sorted = withMult.slice().sort(function (a, c) { return a.multiple - c.multiple; });
      var mx = sorted[sorted.length - 1].multiple;
      reg(box, function (bx) {
        drawBars(bx, { label: "Swipe file posts by multiple of the author's usual likes", h: 200, items: sorted.map(function (s) {
          return { v: s.multiple, hi: s.multiple === mx, tip: s.author + "\n" + fmt(s.multiple) + "× their usual likes" + (isNum(s.likes) ? "\n" + fmt(s.likes) + " likes" : "") };
        }) });
      });
      sh.wrap.appendChild(chartPanel);
    }
    var grid = T("div", "sw-grid");
    var SHOW = 6;
    items.forEach(function (s, i) {
      var card = rv(T("article", "panel sw card"), (i % 2) * 100);
      if (i >= SHOW && !PRINT) card.style.display = "none";
      var top = T("div", "sw-top");
      top.appendChild(isNum(s.multiple) ? put(T("div", "sw-mult"), fmt(s.multiple) + "×", T("small", null, "their usual")) : T("div"));
      var who = T("div", "sw-who");
      who.appendChild(T("b", null, str(s.author) || "Creator"));
      if (isNum(s.followers)) who.appendChild(T("span", null, cnt(s.followers, "follower")));
      top.appendChild(who);
      card.appendChild(top);
      card.appendChild(put(T("div", "sheet sw-sheet"), T("p", null, s.opening)));
      if (isNum(s.likes)) {
        var rows = [{ l: "This post", v: s.likes, p: true }];
        if (isNum(s.author_median_likes)) rows.push({ l: "Their usual", v: s.author_median_likes });
        if (isNum(you.median_likes)) rows.push({ l: "Your usual", v: you.median_likes });
        var m = 0; rows.forEach(function (x) { if (x.v > m) m = x.v; });
        var bars = T("div", "sw-bars");
        rows.forEach(function (x) {
          var bi = T("i"); bi.style.width = (m > 0 ? Math.max(1.5, (x.v / m) * 100) : 1.5) + "%";
          var wrapI = T("span"); wrapI.style.display = "block"; wrapI.appendChild(bi);
          bars.appendChild(put(T("div", x.p ? "p" : ""), T("span", null, x.l), wrapI, T("b", null, fmt(x.v))));
        });
        card.appendChild(bars);
      }
      if (str(s.why)) card.appendChild(T("p", "sw-why", s.why));
      var foot = T("div", "sw-foot");
      var bits = [];
      if (fmtDate(s.posted_at)) bits.push(fmtDate(s.posted_at));
      if (isNum(s.comments)) bits.push(fmt(s.comments) + (s.comments === 1 ? " comment" : " comments"));
      if (str(s.kind)) bits.push(str(s.kind) + " post");
      foot.appendChild(T("span", null, bits.join(" · ")));
      var url = safeUrl(s.url);
      if (url) { var a = T("a", "ui-only", "Open the post"); a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; foot.appendChild(a); }
      card.appendChild(foot);
      grid.appendChild(card);
    });
    sh.wrap.appendChild(grid);
    if (items.length > SHOW && !PRINT) {
      var btn = T("button", "btn btn-ghost ui-only", "Show all " + items.length + " posts");
      btn.type = "button";
      btn.style.marginTop = "26px";
      var open = false;
      btn.addEventListener("click", function () {
        open = !open;
        Array.prototype.forEach.call(grid.children, function (c, i) { if (i >= SHOW) c.style.display = open ? "" : "none"; });
        btn.textContent = open ? "Show fewer posts" : "Show all " + items.length + " posts";
      });
      sh.wrap.appendChild(btn);
    }
    return sh.sec;
  }

  function buildLeadMagnet(d) {
    var lm = obj(d.lead_magnet), b = obj(d.buyer);
    if (!str(lm.title) && !str(lm.what)) return null;
    var sh = shell("leadmagnet", "Lead magnet", ["A free resource to ", { m: "offer" }], "");
    var grid = rv(T("div", "lm-grid"));
    var obj_ = T("div", "lm-obj");
    obj_.appendChild(T("div", "lm-page p3"));
    obj_.appendChild(T("div", "lm-page p2"));
    var cover = T("div", "lm-cover");
    if (str(b.name)) cover.appendChild(T("div", "mono", b.name));
    cover.appendChild(T("h3", null, str(lm.title)));
    cover.appendChild(put(T("div", "rows"), T("i"), T("i"), T("i")));
    obj_.appendChild(cover);
    grid.appendChild(obj_);
    var txt = T("div");
    if (str(lm.what)) txt.appendChild(T("p", "lm-what", lm.what));
    if (str(lm.why)) txt.appendChild(T("p", "lm-why", lm.why));
    grid.appendChild(txt);
    sh.wrap.appendChild(grid);
    if (str(lm.launch_post)) {
      var lp = rv(T("div", "lm-post"));
      lp.appendChild(put(T("div", "post-side"), T("div", "when", "Launch post"), T("h4", null, "Post it with this text"),
        T("p", null, "Copy it, fill in anything in brackets, and publish when your lead magnet is ready.")));
      lp.appendChild(liPost(b, lm.launch_post));
      sh.wrap.appendChild(lp);
    }
    return sh.sec;
  }

  function cleanLabel(l) { return str(l).replace(/\s*\(%\)\s*$/, ""); }
  function diffVal(v, pct) {
    if (isNum(v)) return { num: v, text: fmt(v) + (pct ? "%" : "") };
    var s = str(v);
    if (!s) return { num: null, text: "" };
    var m = /^(-?\d+(?:\.\d+)?)\s*%?$/.exec(s);
    return { num: m ? parseFloat(m[1]) : null, text: s };
  }
  function buildBandUp(d) {
    var bu = obj(d.band_up), rk = obj(d.rank), you = obj(rk.you), b = obj(d.buyer);
    var creators = arr(bu.creators).filter(function (c) { return isObj(c) && str(c.name); });
    var diffs = arr(bu.differences).filter(function (x) { return isObj(x) && str(x.label); });
    if (!creators.length && !diffs.length && !str(bu.summary)) return null;
    var band = obj(bu.band);
    var lede = isNum(band.min) && isNum(band.max) ? "How creators with " + fmt(band.min) + " to " + fmt(band.max) + " followers post, next to how you post." : "How creators one band up post, next to how you post.";
    var sh = shell("bandup", "Band up", ["How to move up a ", { m: "band" }], lede);
    if (creators.length) {
      var grid = T("div", "band-grid");
      var rows = creators.filter(function (c) { return isNum(c.median_likes); }).map(function (c) {
        return { name: c.name, right: isNum(c.followers) ? fmt(c.followers) + " followers" : "", v: c.median_likes, val: cnt(c.median_likes, "like"),
          tip: c.name + (isNum(c.followers) ? "\n" + fmt(c.followers) + " followers" : "") + "\n" + fmt(c.median_likes) + " typical likes" };
      }).sort(function (a, c) { return c.v - a.v; });
      if (isNum(you.median_likes) && rows.length) {
        rows.push({ name: (str(b.name) || "You") + " (you)", right: isNum(b.followers) ? fmt(b.followers) + " followers" : "", v: you.median_likes, val: cnt(you.median_likes, "like"), hi: true,
          tip: "You\n" + fmt(you.median_likes) + " typical likes" });
      }
      if (rows.length) {
        var cp = rv(T("div", "panel"));
        cp.appendChild(put(T("div", "chart-cap"), T("h3", "h3", "Typical likes per post"), T("span", "mono", "You and the band above")));
        var box = T("div", "chart");
        cp.appendChild(box);
        reg(box, function (bx) { drawRows(bx, { rows: rows, label: "Typical likes per post for you and creators one band up" }); });
        grid.appendChild(cp);
      }
      var lp = rv(T("div", "panel" + (rows.length ? " ui-only" : "")), 100);
      lp.appendChild(T("h3", "h3", "Creators one band up"));
      lp.lastChild.style.marginBottom = "8px";
      creators.forEach(function (c) {
        var url = safeUrl(c.url);
        var nm = url ? T("a", null, c.name) : T("span", null, c.name);
        if (url) { nm.href = url; nm.target = "_blank"; nm.rel = "noopener noreferrer"; }
        var left = put(T("div"), nm);
        if (isNum(c.followers)) left.appendChild(T("span", null, fmt(c.followers) + " followers"));
        var right = T("b");
        if (isNum(c.median_likes)) { right.textContent = fmt(c.median_likes); right.appendChild(T("small", null, "typical likes")); }
        lp.appendChild(put(T("div", "bcr"), left, right));
      });
      grid.appendChild(lp);
      sh.wrap.appendChild(grid);
    }
    if (diffs.length) {
      var dp = rv(T("div", "panel diffs"));
      diffs.forEach(function (x) {
        var pct = /\(%\)\s*$/.test(str(x.label));
        var a = diffVal(x.you, pct), c = diffVal(x.them, pct);
        var row = T("div", "diff");
        row.appendChild(T("h4", null, cleanLabel(x.label)));
        var dv = T("div", "dv");
        var numeric = a.num !== null && c.num !== null;
        var mx = numeric ? Math.max(a.num, c.num, 0) : 0;
        [["You", a, "you"], ["Them", c, ""]].forEach(function (r) {
          if (!r[1].text) return;
          if (numeric) {
            var bi = T("i"); bi.style.width = (mx > 0 ? Math.max(0, (r[1].num / mx) * 100) : 0) + "%";
            var cell = T("span"); cell.style.display = "block"; cell.appendChild(bi);
            dv.appendChild(put(T("div", r[2]), T("span", null, r[0]), cell, T("b", null, r[1].text)));
          } else {
            dv.appendChild(put(T("div", "txt " + r[2]), T("span", null, r[0]), T("b", null, r[1].text)));
          }
        });
        row.appendChild(dv);
        row.appendChild(str(x.note) ? T("p", null, x.note) : T("div"));
        dp.appendChild(row);
      });
      sh.wrap.appendChild(dp);
    }
    if (str(bu.summary)) sh.wrap.appendChild(rv(T("p", "band-sum", bu.summary)));
    return sh.sec;
  }

  function dots(n, cls) {
    var d = T("div", "dots " + cls);
    d.setAttribute("aria-hidden", "true");
    var frag = document.createDocumentFragment();
    for (var i = 0; i < Math.min(n, 500); i++) frag.appendChild(T("i"));
    d.appendChild(frag);
    return d;
  }
  function buildClose(d) {
    var rs = obj(d.rescan), of = obj(d.offer), me = obj(d.method), win = obj(d.window), rk = obj(d.rank), en = obj(d.engagers);
    var lines = arr(me.lines).filter(function (l) { return str(l); });
    var done = isObj(rs.result) && toDate(rs.result.scanned_at);
    var rdate = done || toDate(rs.date), offerOk = str(of.headline) || str(of.body);
    var counts = [];
    if (isNum(win.posts_analyzed)) counts.push({ n: win.posts_analyzed, l: "of your posts analyzed", cls: "" });
    if (isNum(rk.peer_count)) counts.push({ n: rk.peer_count, l: "peers compared", cls: "ppl" });
    if (isNum(en.unique)) counts.push({ n: en.unique, l: "people who engaged", cls: "eng" });
    if (!rdate && !offerOk && !lines.length && !counts.length) return null;
    var sh = shell("next", "Next", ["What happens ", { m: "next" }], "");
    var grid = T("div", "close-grid");
    if (rdate) {
      var rc = rv(T("div", "panel rescan"));
      var cal = T("div", "calpage");
      cal.appendChild(T("div", "m", rdate.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })));
      cal.appendChild(T("div", "d", String(rdate.getUTCDate())));
      cal.appendChild(T("div", "w", rdate.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" }) + " " + rdate.getUTCFullYear()));
      rc.appendChild(cal);
      var rt = T("div");
      rt.appendChild(T("h3", null, done ? "Your re-scan is done" : "Your free re-scan"));
      rt.appendChild(T("p", null, done ? "Scanned on " + fmtDate(rs.result.scanned_at) + ". Your before and after is near the top of this page." : (str(rs.note) || ("We scan again on " + fmtDate(rs.date) + " and show your numbers before and after."))));
      rc.appendChild(rt);
      grid.appendChild(rc);
    }
    if (offerOk) {
      var oc = rv(T("div", "panel offer"), 100);
      var im = T("img"); im.alt = "Ivan Manfredi"; im.src = "../assets/img/ivan-smile-g-640.webp"; im.width = 84; im.height = 84;
      oc.appendChild(im);
      var ot = T("div");
      if (str(of.headline)) ot.appendChild(T("h3", null, of.headline));
      if (str(of.body)) ot.appendChild(T("p", null, of.body));
      var cta = safeUrl(of.cta_url);
      if (cta && str(of.cta_label)) {
        var a = T("a", "btn btn-red btn-lg", of.cta_label);
        a.href = cta; a.rel = "noopener";
        ot.appendChild(a);
      }
      oc.appendChild(ot);
      grid.appendChild(oc);
    }
    if (grid.children.length) sh.wrap.appendChild(grid);
    if (lines.length || counts.length) {
      var mp = rv(T("div", "panel method"));
      if (counts.length) {
        var cs = T("div", "counts");
        counts.forEach(function (c) {
          cs.appendChild(put(T("div", "count"), put(T("div"), T("b", null, fmt(c.n)), T("span", null, c.l)), dots(c.n, c.cls)));
        });
        mp.appendChild(cs);
      }
      if (lines.length) {
        var right = T("div");
        right.appendChild(T("h3", "h3", "How we measured"));
        right.lastChild.style.marginBottom = "14px";
        var ol = T("ol");
        lines.forEach(function (l) { ol.appendChild(T("li", null, l)); });
        right.appendChild(ol);
        mp.appendChild(right);
      }
      sh.wrap.appendChild(mp);
    }
    return sh.sec;
  }

  function buildFiles(d) {
    var f = obj(d.files), cars = arr(d.carousels);
    var pdf = safeUrl(f.pdf_url);
    var cpdfs = arr(f.carousel_pdf_urls).map(safeUrl).filter(Boolean);
    if (!pdf && !cpdfs.length) return null;
    var sh = shell("files", "Files", ["Your ", { m: "files" }], "Everything in this report is also available to keep.", "ui-only");
    var row = rv(T("div", "hero-act"));
    function dl(url, label, cls) {
      var a = put(T("a", "btn " + cls), mat(ICONS.download), label);
      a.href = url; a.setAttribute("download", ""); a.rel = "noopener";
      row.appendChild(a);
    }
    if (pdf) dl(pdf, "Full report (PDF)", "btn-red");
    cpdfs.forEach(function (u, i) { dl(u, "Carousel " + (i + 1) + " (PDF)", "btn-ghost"); });
    sh.wrap.appendChild(row);
    return sh.sec;
  }

  function buildFooter(d) {
    var f = T("footer", "foot");
    var w = T("div", "wrap");
    var left = T("a", "wordmark");
    left.href = "https://inboundonsteroids.com/";
    left.setAttribute("aria-label", "InboundOnSteroids");
    put(left, T("span", null, "INBOUND"), T("span", "on", "ON"), T("span", null, "STEROIDS"));
    w.appendChild(left);
    var gen = fmtDate(d.generated_at);
    w.appendChild(T("span", null, "Built from public LinkedIn data" + (gen ? ". Report created " + gen + "." : ".")));
    var ra = T("a", "ui-only", "Lost this link? Get it again");
    ra.href = "../resend/";
    w.appendChild(ra);
    f.appendChild(w);
    return f;
  }

  /* ═════════ render ═════════ */

  function renderAll(d) {
    NAV = [];
    var carousels = arr(d.carousels).filter(function (c) { return isObj(c) && str(c.id); }).map(function (c) {
      return { id: String(c.id), anchor: "car-" + String(c.id).replace(/[^A-Za-z0-9_-]/g, "-"), title: str(c.title) || "Carousel", pdf_url: c.pdf_url, cover_png_url: c.cover_png_url,
        slides: arr(c.slides).filter(function (s) { return isObj(s) && (str(s.title) || str(s.body)); }) };
    });
    var carMap = {};
    carousels.forEach(function (c) { carMap[c.id] = c; });

    main.textContent = "";
    var frag = document.createDocumentFragment();
    var hero = buildHero(d);
    frag.appendChild(hero);
    var navMain = NAV.slice();
    NAV = [];
    [buildRescanResult(d), buildRank(d), buildPatterns(d), buildEngagers(d), buildCalendar(d, carMap), buildCarousels(d, carousels), buildRewrites(d),
      buildProfile(d), buildSwipe(d), buildLeadMagnet(d), buildBandUp(d), buildClose(d), buildFiles(d)].forEach(function (s) { if (s) frag.appendChild(s); });
    frag.appendChild(buildFooter(d));
    var allNav = navMain.concat(NAV).filter(function (n) { return n.id !== "files" && n.id !== "next"; });
    main.appendChild(frag);
    drawAll();

    /* print: new page before the big blocks */
    if (PRINT) ["rescan", "rank", "patterns", "engagers", "calendar", "carousels", "rewrites", "profile", "swipe", "leadmagnet", "bandup", "next"].forEach(function (id) { var e = document.getElementById(id); if (e) e.classList.add("pbreak"); });

    var b = obj(d.buyer);
    if (str(b.name)) document.title = b.name + " | LinkedIn Peer Scan | InboundOnSteroids";

    /* top bar */
    var nav = document.getElementById("bar-nav"), act = document.getElementById("bar-act");
    if (nav) {
      nav.textContent = "";
      allNav.forEach(function (n) { var a = T("a", null, n.label); a.href = "#" + n.id; a.setAttribute("data-s", n.id); a.style.padding = "7px 9px"; nav.appendChild(a); });
      nav.style.justifyContent = "flex-start";
      if (nav.firstChild) nav.firstChild.style.marginLeft = "auto";
      if (nav.lastChild) nav.lastChild.style.marginRight = "auto";
    }
    if (act) {
      act.textContent = "";
      if (d.is_sample) act.appendChild(T("span", "chip-sample", "Sample"));
      var pdf = safeUrl(obj(d.files).pdf_url);
      if (pdf) {
        var a = put(T("a", "btn btn-light"), mat(ICONS.download), "PDF");
        a.href = pdf; a.setAttribute("download", ""); a.rel = "noopener";
        act.appendChild(a);
      }
    }

    /* anchors clear the sticky bar and scroll smoothly */
    Array.prototype.forEach.call(main.querySelectorAll("[id]"), function (e) { e.style.scrollMarginTop = "76px"; });
    if (!PRINT && !REDUCED) ROOT.style.scrollBehavior = "smooth";

    if (!PRINT) motion(allNav);
  }

  function motion(allNav) {
    var els = main.querySelectorAll(".rv");
    if (!("IntersectionObserver" in window)) { Array.prototype.forEach.call(els, function (e) { e.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.06, rootMargin: "0px 0px -4% 0px" });
    Array.prototype.forEach.call(els, function (e) { io.observe(e); });
    /* a hash link or a very fast scroll still reveals everything */
    setTimeout(function () { Array.prototype.forEach.call(main.querySelectorAll(".rv:not(.in)"), function (e) { var r = e.getBoundingClientRect(); if (r.top < window.innerHeight && r.bottom > 0) e.classList.add("in"); }); }, 1200);

    /* section highlight in the top bar */
    var links = {};
    Array.prototype.forEach.call(document.querySelectorAll("#bar-nav a"), function (a) { links[a.getAttribute("data-s")] = a; });
    var spy = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        for (var k in links) links[k].classList.toggle("on", k === e.target.id);
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    allNav.forEach(function (n) { var e = document.getElementById(n.id); if (e) spy.observe(e); });
  }

  /* ═════════ errors ═════════ */

  function showError(kind) {
    var M = {
      token: ["This link is incomplete", "Your report link needs its full code. Open the link from your email, or ask for a fresh one."],
      invalid: ["That link did not work", "The code in the link was not accepted. Open the latest email we sent you, or ask for a fresh link."],
      missing: ["We could not find that report", "The link may have lost a piece when it was copied, or the report belongs to another address. Ask for a fresh link and we will email it to you."],
      net: ["We could not load your report", "Please check your connection and try again in a minute. You can also ask for a fresh link by email."]
    };
    var m = M[kind] || M.net;
    main.textContent = "";
    var box = T("div", "state state-err");
    box.appendChild(T("h1", "disp", m[0]));
    box.appendChild(T("p", null, m[1]));
    var a = T("a", "btn btn-red", "Send my report link again");
    a.href = "../resend/";
    box.appendChild(a);
    if (kind === "net") {
      var r = T("button", "btn btn-ghost", "Try again");
      r.type = "button";
      r.addEventListener("click", function () { location.reload(); });
      box.appendChild(r);
    }
    main.appendChild(box);
    var nav = document.getElementById("bar-nav"), act = document.getElementById("bar-act");
    if (nav) nav.textContent = "";
    if (act) act.textContent = "";
    window.__REPORT_READY = true;
  }

  /* ═════════ loading ═════════ */

  function getJSON(url) {
    return fetch(url, { cache: "no-store" }).then(function (res) {
      if (!res.ok) throw { kind: "net" };
      return res.json();
    });
  }
  function load() {
    if (FIXTURE) return getJSON("fixture.json");
    if (SRC) return getJSON(SRC);
    var t = Q.get("t");
    if (!t || t.length > 300) return Promise.reject({ kind: "token" });
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
    return fetch(BASE + "/functions/v1/peer-scan-report?t=" + encodeURIComponent(t), {
      method: "GET", headers: { apikey: ANON, authorization: "Bearer " + ANON }, signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      clearTimeout(to);
      if (res.status === 400) throw { kind: "invalid" };
      if (res.status === 404) throw { kind: "missing" };
      if (!res.ok) throw { kind: "net" };
      return res.json();
    }, function () { clearTimeout(to); throw { kind: "net" }; });
  }

  /* one report_view per tab session */
  function trackView() {
    if (PRINT || FIXTURE || SRC) return;
    try {
      var sid = null;
      try { sid = sessionStorage.getItem("ps_sid"); } catch (e) {}
      if (!sid) {
        sid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        try { sessionStorage.setItem("ps_sid", sid); } catch (e) {}
      }
      fetch(BASE + "/rest/v1/rpc/peer_scan_track", {
        method: "POST", keepalive: true,
        headers: { "content-type": "application/json", apikey: ANON, authorization: "Bearer " + ANON },
        body: JSON.stringify({ p_session: sid, p_step: "report_view", p_utm: {}, p_meta: {} })
      }).catch(function () {});
    } catch (e) {}
  }

  function settle() {
    var imgs = Array.prototype.slice.call(main.querySelectorAll("img")).map(function (img) {
      return img.complete ? null : new Promise(function (res) { img.addEventListener("load", res); img.addEventListener("error", res); });
    }).filter(Boolean);
    void main.offsetHeight;
    var fonts = Promise.resolve();
    if (document.fonts && document.fonts.load) {
      var faces = ['800 40px "Bricolage Grotesque"', '400 16px "Geist"', '600 16px "Geist"', '500 12px "Geist Mono"', '500 20px "Schibsted Grotesk"'];
      fonts = Promise.all(faces.map(function (f) { return document.fonts.load(f).catch(function () {}); })).then(function () { return document.fonts.ready; }).catch(function () {});
    }
    var cap = new Promise(function (res) { setTimeout(res, 20000); });
    return Promise.race([Promise.all([fonts].concat(imgs, PENDING)), cap]);
  }

  load().then(function (data) {
    if (!isObj(data) || data.error) throw { kind: "missing" };
    renderAll(data);
    trackView();
    return settle().then(function () {
      /* fonts change text widths, so draw the charts once more at the final size */
      drawAll();
      window.__REPORT_READY = true;
    });
  }).catch(function (err) {
    if (err && err.kind) showError(err.kind);
    else { if (window.console && console.warn) console.warn("report render failed", err); showError("net"); }
  });
})();
