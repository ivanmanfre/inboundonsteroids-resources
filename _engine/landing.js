/* Landing engine — gated opt-in front door. Reads landing.json, renders the
 * shared template, captures first name + email, POSTs lm-beacon
 * (event_type:'landing_capture' → lm_events + Resend delivery email), then
 * redirects to the static /thanks/ page. Data shape (landing.json):
 * { slug, format_label, category, headline, headline_emphasis, subhead,
 *   subhead_secondary, cover_url, inside:[..], proof, proof_avatar,
 *   resource_url, gate_keyword, cta_label } */
(function () {
  "use strict";
  var L = window.LM || {};
  var BEACON = window.__lm_beacon_url || "https://bjbvqvzbzczjbatgmccb.supabase.co/functions/v1/lm-beacon";
  var root = document.getElementById("lmc-root");
  if (!root) return;
  var src = root.getAttribute("data-lm-landing-src") || "./landing.json";

  function esc(s) {
    return (L.esc ? L.esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c];
    }));
  }
  function emailIsValid(e) { return L.emailIsValid ? L.emailIsValid(e) : /[^@\s]+@[^@\s]+\.[^@\s]+/.test(e || ""); }

  // Italicize the emphasis phrase inside the headline (data-driven).
  function headlineHTML(d) {
    var h = String(d.headline || "");
    if (/<em\b|<i\b/i.test(h)) return h; // pre-marked
    var emph = d.headline_emphasis;
    if (emph && h.indexOf(emph) !== -1) {
      return esc(h.slice(0, h.indexOf(emph))) + "<em>" + esc(emph) + "</em>" + esc(h.slice(h.indexOf(emph) + emph.length));
    }
    return esc(h);
  }

  fetch(src, { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("load"); return r.json(); })
    .then(function (d) { render(d); window.__lm_rerender = function(){ render(window.__lm_data); }; })
    .catch(function () {
      // Fallback link is host-configurable so client-tenant pages never surface
      // Ivan's domain (wrong-brand skeptic finding, 2026-08-08).
      var fbHref = root.getAttribute("data-lm-fallback-href") || "https://ivanmanfredi.com";
      var fbLabel = root.getAttribute("data-lm-fallback-label") || "ivanmanfredi.com";
      root.innerHTML = '<div class="lp" style="padding:4rem 0;text-align:center"><p>This page didn\'t load. <a href="' + esc(fbHref) + '" style="color:#131210">' + esc(fbLabel) + "</a></p></div>";
    });

  function render(d) {
    window.__lm_data = d;
    window.__lm_format = "landing";  // required so edit mode can mount (shared.js waits for __lm_format + __lm_data)
    if (d.slug) window.__lm_slug = d.slug;

    var inside = (d.inside || []).map(function (b, i) {
      return '<li class="lp-b"><span class="n">' + (i + 1) + '</span><span>' + esc(b) + "</span></li>";
    }).join("");

    var cover = d.cover_url
      ? '<img class="lp-cover" src="' + esc(d.cover_url) + '" alt="' + esc(d.headline || "") + '" loading="lazy">'
      : '<div class="lp-cover-fallback">' + esc(d.headline || d.category || "Free resource") + "</div>";

    var avatar = d.proof_avatar
      ? '<img class="lp-ava" src="' + esc(d.proof_avatar) + '" alt="' + esc(d.proof_avatar_alt || "") + '">'
      : '<span class="lp-ava"></span>';

    var ctaLabel = esc(d.cta_label || ("Email me the " + (d.format_label ? d.format_label.toLowerCase() : "resource")));
    var eyebrow = [d.format_label, d.category].filter(Boolean).map(esc).join(" · ");

    // NOTE on registration exclusions (see report for full detail):
    // - eyebrow is a computed join of format_label + category, no single path
    // - the CTA button text below has a literal " →" arrow appended in the
    //   same text node as the label, so its textContent never equals the raw
    //   cta_label value — registering it would let an edit-mode save clobber
    //   the arrow into stored copy. Skipped.
    // - the cover fallback div text is an OR-chain (headline||category||literal),
    //   ambiguous single path. Skipped.

    root.innerHTML =
      '<div class="lp">' +
        '<section class="lp-hero">' +
          "<div>" +
            (eyebrow ? '<p class="lp-eyebrow">' + eyebrow + "</p>" : "") +
            '<h1 class="lp-h1">' + headlineHTML(d) + "</h1>" +
            (d.subhead ? '<p class="lp-sub">' + esc(d.subhead) + "</p>" : "") +
            (d.subhead_secondary ? '<p class="lp-sub-2">' + esc(d.subhead_secondary) + "</p>" : "") +
          "</div>" +
          '<div class="lp-form-card">' +
            cover +
            '<form id="lp-form" novalidate>' +
              '<label class="lp-label" for="lp-first">First name</label>' +
              '<input class="lp-input" id="lp-first" name="first_name" type="text" autocomplete="given-name" placeholder="First name" required>' +
              '<label class="lp-label" for="lp-email">Work email</label>' +
              '<input class="lp-input" id="lp-email" name="email" type="email" autocomplete="email" placeholder="you@company.com" required>' +
              '<button class="lp-cta" id="lp-submit" type="submit">' + ctaLabel + " &rarr;</button>" +
              '<p class="lp-err" id="lp-err"></p>' +
              '<p class="lp-micro">One email. The link lands in your inbox in under a minute.</p>' +
            "</form>" +
          "</div>" +
        "</section>" +
        (inside ? '<section class="lp-inside"><h2>What\'s inside</h2><ul class="lp-bullets">' + inside + "</ul></section>" : "") +
        (d.proof ? '<section class="lp-proof">' + avatar + "<p>" + d.proof + "</p></section>" : "") +
      "</div>";

    // Registration — capture nodes AFTER the innerHTML build above, don't
    // rewrite the render.
    if (L.editMode) {
      var h1El = root.querySelector(".lp-h1");
      if (h1El) L.editMode.registerField(h1El, "headline", { multiline: true });
      var subEl = root.querySelector(".lp-sub");
      if (subEl && d.subhead) L.editMode.registerField(subEl, "subhead", { multiline: true });
      var sub2El = root.querySelector(".lp-sub-2");
      if (sub2El && d.subhead_secondary) L.editMode.registerField(sub2El, "subhead_secondary", { multiline: true });

      // "inside" bullets — each <li> holds a computed index <span class="n">
      // (locked/skipped, not stored) plus a second <span> with the stored
      // bullet text.
      var bulletsList = root.querySelector(".lp-bullets");
      if (bulletsList) {
        Array.prototype.forEach.call(bulletsList.querySelectorAll("li.lp-b"), function (li, i) {
          var spans = li.querySelectorAll("span");
          var textEl = spans[1];
          if (textEl) L.editMode.registerField(textEl, "inside[" + i + "]");
        });
        L.editMode.registerArray(bulletsList, "inside", { itemLabel: "bullet", template: "New bullet" });
      }

      // Proof/testimonial — inserted as RAW (unescaped) HTML in the render
      // above, so treat it as rich text like other *_html fields.
      var proofEl = root.querySelector(".lp-proof p");
      if (proofEl && d.proof) L.editMode.registerField(proofEl, "proof", { contenteditable: true });
    }

    try { if (L.beacon) L.beacon("landing", "view"); } catch (_) {}
    wireForm(d);
  }

  function wireForm(d) {
    var form = document.getElementById("lp-form");
    var errEl = document.getElementById("lp-err");
    var btn = document.getElementById("lp-submit");
    if (!form) return;

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      errEl.textContent = "";
      var first = (document.getElementById("lp-first").value || "").trim();
      var email = (document.getElementById("lp-email").value || "").trim().toLowerCase();
      if (!emailIsValid(email)) { errEl.textContent = "Please enter a valid email."; return; }

      var label = btn.textContent;
      btn.disabled = true; btn.textContent = "Sending…";

      var q = new URLSearchParams(location.search);
      var body = {
        event_type: "landing_capture",
        tool_type: "landing",
        lm_slug: d.slug,
        first_name: first,
        email: email,
        src: q.get("src") || "landing",
        utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign"), term: q.get("utm_term"), content: q.get("utm_content") },
        prospect_id: q.get("pid") || null,
        referrer: document.referrer || ""
      };

      fetch(BEACON, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.j && res.j.error) || "send_failed");
          window.location.href = "/thanks/?lm=" + encodeURIComponent(d.slug || "");
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = label;
          // error_help is data-driven so client-tenant pages don't inherit Ivan's register.
          errEl.textContent = d.error_help || "That didn't send. Try again in a minute, or DM me on LinkedIn and I'll send it.";
        });
    });
  }
})();
