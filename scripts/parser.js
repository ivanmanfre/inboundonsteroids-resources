import * as cheerio from "cheerio";

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "section";
}

const DEFAULT_SELF_PROMPT = "Is your team already doing this?";

/**
 * Strip inline style attributes from elements (they reference the old Tailwind
 * comic palette and conflict with the engine's brand. The engine guide.css
 * provides its own typography.) Keep structural tags only.
 */
function stripInlineStyles($, el) {
  $(el).find("[style]").addBack("[style]").removeAttr("style");
  // Strip class attributes since they refer to old tailwind classes
  $(el).find("[class]").addBack("[class]").removeAttr("class");
  return el;
}

export function parseBakedGuide(html, slug) {
  const $ = cheerio.load(html);

  const title = $(".hero-title").first().text().trim()
    || $("h1").first().text().trim()
    || $("title").first().text().split("|")[0].trim()
    || slug;

  // Subtitle: prefer .hero-intro (visible page copy) over meta description,
  // because some baked guides have polluted meta descriptions containing raw
  // markdown like "## Resource Page Copy **Headline:** ...".
  function isPolluted(s) {
    return /^\s*(##|\*\*Headline:|\*\*Resource Type:|\*\*Introduction:)/.test(s || "");
  }
  let subtitle = $(".hero-intro").first().text().trim() || "";
  if (!subtitle || isPolluted(subtitle)) {
    const meta = $('meta[name="description"]').attr("content") || "";
    if (meta && !isPolluted(meta)) subtitle = meta.trim();
  }
  // Final guard: if still polluted, blank it rather than show garbage
  if (isPolluted(subtitle)) subtitle = "";

  // Estimated minutes from "X Min Read" chip
  let estimated_minutes = 10;
  const bodyText = $("body").text();
  const minMatch = bodyText.match(/(\d+)\s*Min\s*Read/i);
  if (minMatch) estimated_minutes = Number(minMatch[1]);

  // Optional intro paragraph
  const introText = $(".hero-intro").first().text().trim();

  // Parse sections from .resource-content
  const content = $(".resource-content").first();
  const introHtml = [];
  const sections = [];
  let currentSection = null;
  let seenH2 = false;

  function pushCurrent() {
    if (currentSection) {
      sections.push(currentSection);
      currentSection = null;
    }
  }

  content.children().each((_, el) => {
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    const $el = $(el);
    if (tag === "hr") {
      pushCurrent();
      return;
    }
    if (tag === "h2") {
      pushCurrent();
      seenH2 = true;
      currentSection = {
        id: slugify($el.text()),
        title: $el.text().trim(),
        html: "",
        self_prompt: DEFAULT_SELF_PROMPT,
      };
      return;
    }
    if (currentSection) {
      // Strip inline styles + classes from this element before serializing
      stripInlineStyles($, el);
      currentSection.html += $.html(el).trim() + "\n";
    } else if (!seenH2) {
      stripInlineStyles($, el);
      introHtml.push($.html(el).trim());
    }
  });
  pushCurrent();

  // Trim section.html + drop empty sections
  sections.forEach((s) => { s.html = s.html.trim(); });

  // Build intro paragraph: prefer .hero-intro, fall back to first pre-h2 paragraph
  let introParagraph = introText;
  if (!introParagraph && introHtml.length > 0) {
    const tmp = cheerio.load("<div>" + introHtml.join("") + "</div>");
    introParagraph = tmp("div").text().trim().slice(0, 280);
  }

  return {
    slug,
    title,
    subtitle,
    estimated_minutes,
    brand: {
      hero_badge: "Guide",
    },
    intro: {
      paragraph: introParagraph || "",
    },
    sections,
    data_version: 1,
  };
}
