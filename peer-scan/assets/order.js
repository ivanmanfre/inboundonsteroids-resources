/* LinkedIn Peer Scan: order forms on the sales page.
   Step 1 LinkedIn profile URL, step 2 email, then POST to peer-scan-order and redirect to the returned checkout_url.
   Request:  { linkedin_url, email, session_id, utm: {source, medium, campaign, content, term}, referrer }
   Response: { ok: true, order_id, checkout_url }  or  { ok: false, error } */
(function () {
  "use strict";
  var PS = window.PS;
  if (!PS) return;

  var COPY = {
    li_empty: "Add your LinkedIn profile URL.",
    li_company: "That is a company page. Paste your own profile, the link with /in/ in it.",
    li_bad: "That does not look like a LinkedIn profile. It looks like linkedin.com/in/yourname.",
    em_empty: "Add the email where your report should go.",
    em_bad: "That email looks off. Check the spelling.",
    closed: "Orders are paused for a moment. Try again a little later.",
    busy: "Lots of orders right now. Wait a minute and try again.",
    nf: "We could not find that profile. Check the link and try again.",
    net: "That did not go through. Check your connection and try again.",
    server: "Something broke on our side. Try again in a minute."
  };

  /* accepts linkedin.com/in/x, www./country subdomains, http(s), trailing slash, query; returns https://www.linkedin.com/in/<slug> */
  function checkLinkedin(raw) {
    var s = String(raw || "").trim();
    if (!s) return { err: COPY.li_empty, code: "empty" };
    if (!/^https?:\/\//i.test(s)) s = "https://" + s.replace(/^\/+/, "");
    var u;
    try { u = new URL(s); } catch (e) { return { err: COPY.li_bad, code: "bad_url" }; }
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return { err: COPY.li_bad, code: "bad_host" };
    if (/^\/(company|school|showcase|groups|posts|feed|pulse)\//i.test(u.pathname)) return { err: COPY.li_company, code: "not_profile" };
    var m = u.pathname.match(/^\/in\/([^\/?#]+)\/?/i);
    if (!m || !m[1] || m[1].length > 120) return { err: COPY.li_bad, code: "bad_path" };
    return { value: "https://www.linkedin.com/in/" + m[1] };
  }

  var forms = document.querySelectorAll("form.order");
  var started = false;

  function q(form, sel) { return form.querySelector(sel); }
  function input(form, name) { return q(form, '[name="' + name + '"]'); }
  function setErr(form, key, msg) {
    var el = q(form, '[data-err="' + key + '"]');
    if (el) el.textContent = msg || "";
    var name = key === "linkedin" ? "linkedin_url" : key === "email" ? "email" : null;
    var i = name && input(form, name);
    if (i) { if (msg) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); }
    size(form);
  }
  function size(form) {
    var box = q(form, ".steps"), pane = q(form, ".step-pane.on");
    if (box && pane) box.style.height = pane.offsetHeight + "px";
  }

  function setStep(form, n, dir) {
    var cur = q(form, ".step-pane.on");
    var next = q(form, '.step-pane[data-pane="' + n + '"]');
    if (!next) return;
    form.setAttribute("data-dir", dir || "fwd");
    form.setAttribute("data-step", String(n));
    if (cur && cur !== next) cur.classList.remove("on");
    next.classList.add("on");
    Array.prototype.forEach.call(form.querySelectorAll(".step-pane"), function (p) {
      if (p === next) p.removeAttribute("inert"); else p.setAttribute("inert", "");
    });
    Array.prototype.forEach.call(form.querySelectorAll(".dots i"), function (d, k) { d.classList.toggle("on", k < n); });
    var fine = q(form, "[data-fine]");
    if (fine) fine.textContent = n === 1 ? "Next, your email. Then you pay on Stripe." : "You pay on Stripe next. Your scan starts once it clears.";
    size(form);
    if (cur && cur !== next) {
      var f = input(form, n === 1 ? "linkedin_url" : "email");
      if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 60);
    }
  }

  function step1(form) {
    var li = checkLinkedin(input(form, "linkedin_url").value);
    if (li.err) { setErr(form, "linkedin", li.err); input(form, "linkedin_url").focus({ preventScroll: true }); return; }
    setErr(form, "linkedin", "");
    var w = q(form, "[data-which]");
    if (w) w.textContent = li.value.replace(/^https:\/\/www\./, "");
    setStep(form, 2, "fwd");
  }

  function submit(form) {
    var li = checkLinkedin(input(form, "linkedin_url").value);
    if (li.err) { setStep(form, 1, "back"); setErr(form, "linkedin", li.err); return; }
    var em = PS.checkEmail(input(form, "email").value);
    if (em.err) { setErr(form, "email", em.err === "empty" ? COPY.em_empty : COPY.em_bad); input(form, "email").focus({ preventScroll: true }); return; }
    setErr(form, "email", ""); setErr(form, "form", "");

    var btn = q(form, "[data-pay]");
    if (btn.disabled) return;
    var label = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = "Opening secure checkout <i aria-hidden=\"true\">&#8599;</i>";
    form.setAttribute("aria-busy", "true");

    PS.track("submit", { form: Number(form.dataset.fi || 0) });

    var body = {
      linkedin_url: li.value,
      email: em.value,
      session_id: PS.sid,
      utm: PS.utm,
      referrer: PS.referrer(),
      preview: (location.search.match(/[?&]preview=([A-Za-z0-9_-]{8,64})/) || [])[1] || null
    };

    function fail(msg, toStep1, field) {
      btn.disabled = false; btn.innerHTML = label; form.removeAttribute("aria-busy");
      if (toStep1) { setStep(form, 1, "back"); setErr(form, "linkedin", msg); return; }
      setErr(form, field || "form", msg);
    }

    PS.post("peer-scan-order", body).then(function (res) {
      var j = res.j || {};
      var url = typeof j.checkout_url === "string" ? j.checkout_url : "";
      var okUrl = false;
      try { okUrl = new URL(url).protocol === "https:"; } catch (e) {}
      if (j.ok === true && okUrl) {
        if (j.order_id) PS.store("ps_order", String(j.order_id));
        PS.track("checkout_redirect", { form: Number(form.dataset.fi || 0), order_id: j.order_id || null });
        setTimeout(function () { location.assign(url); }, 120);
        return;
      }
      var e = String(j.error || "").toLowerCase();
      if (/linkedin|profile_url|bad_url/.test(e) && !/not_found/.test(e)) fail(COPY.li_bad, true);
      else if (/not_found|no_profile/.test(e)) fail(COPY.nf, true);
      else if (/email/.test(e)) fail(COPY.em_bad, false, "email");
      else if (/closed|not_open|paused|disabled/.test(e)) fail(COPY.closed);
      else if (/rate|limit|busy|too_many/.test(e) || res.status === 429) fail(COPY.busy);
      else fail(COPY.server);
    }).catch(function () { fail(COPY.net); });
  }

  Array.prototype.forEach.call(forms, function (form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (form.getAttribute("data-step") === "2") submit(form); else step1(form);
    });
    var edit = q(form, ".edit");
    if (edit) edit.addEventListener("click", function () { setStep(form, 1, "back"); });
    var toggle = q(form, ".help-toggle"), help = q(form, ".help");
    if (toggle && help) toggle.addEventListener("click", function () {
      var open = help.hidden;
      help.hidden = !open;
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      size(form);
    });
    Array.prototype.forEach.call(form.querySelectorAll("input"), function (i) {
      i.addEventListener("focus", function () {
        if (started) return;
        started = true;
        PS.track("start", { form: Number(form.dataset.fi || 0), field: i.name });
      });
      i.addEventListener("input", function () {
        if (i.getAttribute("aria-invalid")) setErr(form, i.name === "email" ? "email" : "linkedin", "");
        if (q(form, '[data-err="form"]').textContent) setErr(form, "form", "");
      });
    });
    Array.prototype.forEach.call(form.querySelectorAll(".step-pane"), function (p) { if (!p.classList.contains("on")) p.setAttribute("inert", ""); });
    size(form);
  });

  function sizeAll() { Array.prototype.forEach.call(forms, size); }
  window.addEventListener("resize", sizeAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeAll);

  /* header and sticky buttons jump to the first form and focus the URL field */
  function goForm(ev) {
    if (ev) ev.preventDefault();
    var f = forms[0];
    if (!f) return;
    f.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    setTimeout(function () {
      var i = input(f, f.getAttribute("data-step") === "2" ? "email" : "linkedin_url");
      if (i) i.focus({ preventScroll: true });
    }, 450);
  }
  Array.prototype.forEach.call(document.querySelectorAll("[data-goform]"), function (a) { a.addEventListener("click", goForm); });

  /* sticky mobile CTA while no order form is on screen */
  var stick = document.querySelector(".stick");
  if (stick && "IntersectionObserver" in window) {
    document.body.classList.add("has-stick");
    var seen = new Set();
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
      var on = seen.size === 0;
      stick.classList.toggle("on", on);
      stick.setAttribute("aria-hidden", on ? "false" : "true");
      var b = stick.querySelector("button");
      if (b) b.tabIndex = on ? 0 : -1;
    }, { threshold: 0 });
    Array.prototype.forEach.call(forms, function (f) { io.observe(f); });
    stick.querySelector("button").addEventListener("click", goForm);
  }

  /* sample screenshots: a missing file shows the drawn placeholder frame */
  Array.prototype.forEach.call(document.querySelectorAll(".shot img"), function (img) {
    img.addEventListener("error", function () { img.style.visibility = "hidden"; });
  });

  /* back from Stripe via the back button: the page may come from the bfcache with a disabled button */
  window.addEventListener("pageshow", function (ev) {
    if (!ev.persisted) return;
    Array.prototype.forEach.call(forms, function (form) {
      var btn = q(form, "[data-pay]");
      if (btn && btn.disabled) { btn.disabled = false; btn.innerHTML = "Pay $99 and start my scan <i aria-hidden=\"true\">&#8599;</i>"; }
      form.removeAttribute("aria-busy");
    });
  });

  PS.track("view", { referrer: PS.referrer() });
})();
