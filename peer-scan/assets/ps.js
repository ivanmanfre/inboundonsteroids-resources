/* LinkedIn Peer Scan: shared helpers for the sales, thanks and resend pages.
   - one session id per tab (sessionStorage "ps_sid")
   - UTM params from the landing URL, kept in sessionStorage "ps_utm" so they survive Stripe and page changes
   - first referrer of the session in sessionStorage "ps_ref"
   - fire-and-forget funnel tracking into the anon RPC peer_scan_track (never blocks, never throws) */
(function () {
  "use strict";
  var BASE = "https://bjbvqvzbzczjbatgmccb.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqYnZxdnpiemN6amJhdGdtY2NiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMDUwODAsImV4cCI6MjA4Mzg4MTA4MH0.yqghcn-Rw5dIFadLhvUASIeUARPvu_CyPOGayI8KyTI";
  var HEADERS = { "content-type": "application/json", apikey: ANON, authorization: "Bearer " + ANON };
  var UTM_KEYS = ["source", "medium", "campaign", "content", "term"];

  function store(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function read(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function newId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return "s" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  var sid = read("ps_sid");
  if (!sid) { sid = newId(); store("ps_sid", sid); }

  /* UTM: a landing URL that carries any utm_* replaces the stored set; otherwise keep what we stored */
  var q = new URLSearchParams(location.search);
  var fromUrl = {}, hasUtm = false;
  UTM_KEYS.forEach(function (k) {
    var v = q.get("utm_" + k);
    v = v ? String(v).slice(0, 200) : null;
    fromUrl[k] = v;
    if (v) hasUtm = true;
  });
  var utm;
  if (hasUtm) { utm = fromUrl; store("ps_utm", JSON.stringify(utm)); }
  else {
    try { utm = JSON.parse(read("ps_utm") || "null"); } catch (e) { utm = null; }
    if (!utm || typeof utm !== "object") utm = fromUrl;
    UTM_KEYS.forEach(function (k) { if (!(k in utm)) utm[k] = null; });
  }

  /* referrer: keep the first outside referrer of the session */
  var ref = read("ps_ref");
  if (ref === null) {
    var r = document.referrer || "";
    try { if (r && new URL(r).host === location.host) r = ""; } catch (e) { r = ""; }
    ref = r.slice(0, 500);
    store("ps_ref", ref);
  }

  function track(step, meta) {
    try {
      var m = { path: location.pathname };
      if (meta) for (var k in meta) if (Object.prototype.hasOwnProperty.call(meta, k)) m[k] = meta[k];
      fetch(BASE + "/rest/v1/rpc/peer_scan_track", {
        method: "POST", keepalive: true, headers: HEADERS,
        body: JSON.stringify({ p_session: sid, p_step: step, p_utm: utm, p_meta: m })
      }).catch(function () {});
    } catch (e) {}
  }

  /* POST JSON to an edge function. Resolves { status, j } where j is the parsed body or {}; rejects only on network failure. */
  function post(fn, body) {
    return fetch(BASE + "/functions/v1/" + fn, { method: "POST", headers: HEADERS, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (j) { return { status: res.status, j: j || {} }; });
      });
  }

  function checkEmail(raw) {
    var s = String(raw || "").trim();
    if (!s) return { err: "empty" };
    if (s.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return { err: "bad" };
    return { value: s };
  }

  /* nav turns solid once the page scrolls */
  var nav = document.getElementById("nav");
  if (nav) {
    var onScroll = function () { nav.classList.toggle("solid", window.scrollY > 24); };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* reveal on scroll */
  var ins = document.querySelectorAll("[data-in], [data-line]");
  if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add("on"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    Array.prototype.forEach.call(ins, function (el) { io.observe(el); });
  } else {
    Array.prototype.forEach.call(ins, function (el) { el.classList.add("on"); });
  }

  window.PS = {
    sid: sid,
    utm: utm,
    referrer: function () { return ref || null; },
    track: track,
    post: post,
    checkEmail: checkEmail,
    store: store,
    read: read
  };
})();
