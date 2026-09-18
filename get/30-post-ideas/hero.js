/* Motion runtime. The head script already decided whether motion is allowed and
   put the .motion class on <html>; this file does nothing at all without it, so
   a reduced-motion visitor gets a completely static page. */
(function () {
  var root = document.documentElement;
  if (!root.classList || !root.classList.contains("motion")) return;

  /* (a) the deliverable rotates every 2.4s, one grid cell, no reflow */
  var roll = document.querySelector(".roll");
  if (roll) {
    var items = roll.querySelectorAll(".roll-i");
    if (items.length > 1) {
      var i = 0;
      setInterval(function () {
        var out = items[i];
        i = (i + 1) % items.length;
        var next = items[i];
        out.classList.remove("is-on");
        out.classList.add("is-out");
        next.classList.remove("is-out");
        next.classList.add("is-on");
        setTimeout(function () { out.classList.remove("is-out"); }, 320);
      }, 2400);
    }
  }

  /* (b) + (d) draw the five-day thread and fade the hooks up on first sight */
  var targets = [];
  var drip = document.querySelector(".drip");
  var idea = document.querySelector(".idea");
  if (drip) targets.push(drip);
  if (idea) targets.push(idea);
  if (!targets.length) return;

  if (!("IntersectionObserver" in window)) {
    targets.forEach(function (el) { el.classList.add("is-in"); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("is-in");
      io.unobserve(e.target);
    });
  }, { threshold: 0.2, rootMargin: "0px 0px -8% 0px" });

  targets.forEach(function (el) { io.observe(el); });
})();
