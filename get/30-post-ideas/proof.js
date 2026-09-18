/* proof.js: LinkedIn-style reply cards, rendered from a JSON file.
 *
 * Usage
 *   <link rel="stylesheet" href="https://resources.inboundonsteroids.com/get/30-post-ideas/proof.css">
 *   <div class="proof" data-proof-src="https://resources.inboundonsteroids.com/get/30-post-ideas/proof.json"></div>
 *   <script src="https://resources.inboundonsteroids.com/get/30-post-ideas/proof.js" defer></script>
 *
 * Optional attributes on the mount element
 *   data-proof-title  heading above the cards (default "What people replied")
 *   data-proof-max    show at most this many comments
 *   class="proof on-ink"  card styling for a dark section
 *
 * proof.json shape
 *   { "comments": [ { "name": "...", "headline": "...", "line": "...",
 *                     "avatar": "https://...", "url": "https://linkedin.com/..." } ] }
 *
 * An empty list hides the whole block, so the page carries no placeholder space.
 * Adding ?preview=1 to the page URL renders three cards marked SAMPLE for a design
 * review. Those are never shown to a visitor and carry no real name.
 */
(function () {
  "use strict";

  var SAMPLES = [
    {
      name: "Sample name",
      headline: "Sample headline, agency owner",
      line: "did not expect these to be this specific, the third idea is literally my last client call"
    },
    {
      name: "Sample name",
      headline: "Sample headline, founder",
      line: "the voice one read like someone had gone through my old posts with a pen"
    },
    {
      name: "Sample name",
      headline: "Sample headline, B2B services",
      line: "posted the day 3 one almost as it came, two people replied asking how we do it"
    }
  ];

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).slice(0, 2);
    var s = parts.map(function (p) { return p.charAt(0); }).join("");
    return s.toUpperCase() || "·";
  }

  function avatar(c) {
    if (c.avatar) {
      var img = document.createElement("img");
      img.className = "proof-avatar";
      img.src = c.avatar;
      img.alt = "";
      img.width = 40;
      img.height = 40;
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () {
        img.replaceWith(initialsAvatar(c.name));
      });
      return img;
    }
    return initialsAvatar(c.name);
  }

  function initialsAvatar(name) {
    var n = el("span", "proof-avatar is-initials", initials(name));
    n.setAttribute("aria-hidden", "true");
    return n;
  }

  function card(c, sample) {
    var li = el("li", "proof-card" + (sample ? " is-sample" : ""));
    if (sample) li.appendChild(el("span", "proof-tag", "Sample, replaced by real replies"));
    li.appendChild(avatar(c));

    var body = el("div", "proof-body");
    body.appendChild(el("span", "proof-name", c.name || ""));
    if (c.headline) body.appendChild(el("span", "proof-role", c.headline));
    body.appendChild(el("p", "proof-line", c.line || ""));

    var mark;
    if (c.url && !sample) {
      mark = el("a", "proof-mark", "via LinkedIn");
      mark.href = c.url;
      mark.target = "_blank";
      mark.rel = "noopener nofollow";
    } else {
      mark = el("span", "proof-mark", "via LinkedIn");
    }
    body.appendChild(mark);

    li.appendChild(body);
    return li;
  }

  function render(mount, comments, sample) {
    if (!comments.length) return;
    mount.textContent = "";
    var title = mount.getAttribute("data-proof-title") || "What people replied";
    mount.appendChild(el("span", "proof-head", title));
    var list = el("ul", "proof-list");
    comments.forEach(function (c) { list.appendChild(card(c, sample)); });
    mount.appendChild(list);
    mount.classList.add("is-on");
  }

  function boot() {
    var preview = false;
    try { preview = new URLSearchParams(location.search).get("preview") === "1"; } catch (e) {}

    Array.prototype.forEach.call(document.querySelectorAll(".proof[data-proof-src]"), function (mount) {
      if (mount.getAttribute("data-proof-done") === "1") return;
      mount.setAttribute("data-proof-done", "1");

      if (preview) { render(mount, SAMPLES, true); return; }

      var max = parseInt(mount.getAttribute("data-proof-max"), 10);
      fetch(mount.getAttribute("data-proof-src"), { cache: "no-cache" })
        .then(function (r) { return r.ok ? r.json() : { comments: [] }; })
        .then(function (j) {
          var list = (j && Array.isArray(j.comments) ? j.comments : []).filter(function (c) {
            return c && typeof c.line === "string" && c.line.trim() && typeof c.name === "string" && c.name.trim();
          });
          if (max > 0) list = list.slice(0, max);
          render(mount, list, false);
        })
        .catch(function () {});
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
