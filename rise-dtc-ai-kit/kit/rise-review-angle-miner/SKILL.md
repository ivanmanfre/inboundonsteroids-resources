---
name: rise-review-angle-miner
description: Use when you've got a pile of customer reviews (Shopify, Judge.me, Loox, Yotpo, screenshotted DMs, support tickets) and you want real ad angles out of them instead of guessing at copy. Paste in reviews, get back angles, hooks, and UGC briefs where every line traces to something a customer actually said. Not for writing ad copy from scratch with no reviews to back it, and not for reviews you can't verify are real.
---

# Review-to-Angles Miner

Part of the Rise DTC AI Kit, RISE Method, Acquisition pillar.

## What this does

You paste in real customer reviews. Claude reads them the way a performance
marketer reads a review dump before a creative sprint: not for star ratings,
for the exact words customers use to describe what changed for them, what
almost stopped them from buying, and what phrase would stop a scroll if it
showed up in an ad.

Output is three things: 5 ad angles, 10 hooks, 3 UGC creator briefs. Every
single one is tied to a specific phrase from a review you pasted. Nothing here
is invented. This is a mining exercise. If your review batch is too thin to
support a claim, Claude says so instead of padding it out.

This works two ways: as a Claude Code skill (drop reviews in a file, run it),
or as a straight paste-into-Claude prompt (copy this whole file into a Claude
chat, paste your reviews after it, done). No dependencies either way.

## What to give Claude

Before mining, hand over:

1. **The reviews.** Paste them raw, star rating optional, review text required. More is better; 15-20 is a workable batch, 40+ gives real frequency signal. Include the product name if the review text doesn't say it.
2. **Return reasons or support tickets (optional but valuable).** These are where objections live in the wild. Objections you can pre-empt in ad copy are worth as much as benefits you can promote.
3. **Brand voice notes (optional).** If you have brand guidelines, a tagline, or "we never say X" rules, paste them. If you don't, say so, Claude will infer voice from how customers already talk about you and flag that it's inferred, not confirmed.
4. **The product being reviewed**, if it's not obvious from the reviews (name, price point, category).

If reviews are missing entirely, stop and ask for them. This skill does not run on vibes.

## The mining method

Work the reviews in this order. Don't skip steps or jump straight to "here are
some angles", the ranking at the end depends on doing the earlier steps for
real.

### Step 1: Extract benefits (in the customer's words)
Go review by review. Pull out every distinct benefit a customer names,
emotional ("I finally feel put-together") and functional ("doesn't pill after
washing"). Keep the customer's actual phrasing, not a summary of it. Note which
review each one came from.

### Step 2: Extract objections
Look for pre-purchase hesitation the customer names directly: "I almost didn't
buy because...", "wasn't sure it would fit...", "skeptical after trying three
other brands...". Also pull these from return reasons and support tickets if
provided.

### Step 3: Extract exact phrases worth stealing
Separately from the above, flag any sentence or fragment that is unusually
vivid, specific, or quotable, the kind of line that could go on an ad graphic
verbatim with quotation marks around it. A phrase earns this flag for being
distinctive, not for being positive.

### Step 4: Cluster
Group the benefits from Step 1 into 4-8 themes (e.g. "fit/true to size,"
"fabric feel," "confidence in public," "gift-worthy"). Do the same for
objections. A theme needs at least 2 independent reviews behind it to count.

### Step 5: Rank by frequency
Order clusters by how many distinct reviews support them, not by which one
sounds best to you. The angle with 6 reviews behind it beats the angle with 1.
Note the count next to each cluster so the founder can see the evidence weight.

## Output format

Produce exactly this, in order:

### 5 Ad Angles
For each: a one-line angle name, the customer-language benefit or
objection-resolution it's built on, and 2-3 supporting review phrases with
attribution (paraphrase the reviewer as "Review #N" or a short anonymized
descriptor, never a real name unless the founder explicitly says these can be
public). State the review count backing the angle.

### 10 Hooks
Short, ad-ready opening lines built from Steps 1-3. Each hook gets a one-line
note on which review phrase or cluster it traces to. Hooks must pass basic
ad-voice checks (below), if a hook can't clear them, cut it.

### 3 UGC Creator Briefs
For each: the angle it serves, the specific customer phrase or objection a
creator should speak to, a suggested proof beat (what the creator demonstrates on camera,
beyond describing it), and a one-line "don't say this" flag if the angle is fragile.

### Evidence note
One line at the end: how many reviews were mined, and if any angle or theme was
included on thin evidence (fewer than 2 supporting reviews), name it and say why
it's still in the output or recommend cutting it.

## Hard guardrails

- **Every angle and every hook traces to a pasted review phrase.** If you can't point to the line it came from, it doesn't ship.
- **Never invent a review, a quote, or a customer.** Not a composite, not a "reviews like this often say," not a plausible-sounding line filling a gap. If a cluster is thin, say the cluster is thin.
- **If evidence is thin, say so, in the output itself, not buried.**
- **No em dashes.**
- **No corrective contrast**, don't structure lines as "it's not X, it's Y."
- **Banned filler words:** leverage, seamless, robust, elevate, unlock, delve, streamline, empower, game-changer, transformative. If a review itself uses one, you can quote it, but don't write your own copy using them.
- **Hooks pass basic ad-voice checks:** no claim the reviews don't support, no invented before/after numbers, no authority claims not present in the source, no implied guarantee that isn't in the reviews.
- **No real customer names in output** unless the founder explicitly confirms those reviews can be attributed publicly. Default to anonymized references.
