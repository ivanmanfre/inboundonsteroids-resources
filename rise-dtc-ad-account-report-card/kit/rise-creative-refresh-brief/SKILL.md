---
name: rise-creative-refresh-brief
description: Use when the Ad Account Report Card flags creative fatigue, or when an ad that used to work is sliding and you need a refresh brief a creator or editor can shoot this week. Reads your Meta ad account, finds the ads whose click-through is falling while frequency climbs, and writes a concrete refresh brief for each: what is tiring, what to keep, and the new angle to shoot. Triggers on "my ads are fatiguing", "refresh my creative", "this ad stopped working", "write me a creative brief", or a paste of ad-level performance with a fatigue signal. No invented performance numbers. Every brief is built from your own ads.
---

# Creative Refresh Brief

Part of the RISE DTC AI Kit. RISE Method, Acquisition pillar.

## What this does

Fatigue is the most common reason a good account slides. The same people see
the same ad too many times, click-through falls, cost per purchase climbs, and
the account quietly gets more expensive. This skill finds the ads that are
tiring in your own account and writes a refresh brief for each one: what is
fatiguing, what is still working and worth keeping, and a specific new angle to
shoot, so a creator or editor can act on it this week.

It does not invent performance numbers, promise a lift, or make up what
customers said. It reads your ads, names the fatigue from your own trend, and
turns it into a brief.

Runs on Claude's native ad-account connector. No plugin, no MCP, no CLI. Connect
Meta in claude.ai Settings, then Connectors, or paste ad-level numbers by hand.

## Step 1: find the fatiguing ads

Over the last 30 days (widen if spend is thin), pull for each ad carrying real
spend:

- Frequency, and its trend across the window.
- Click-through (or hook rate / thumb-stop / 3-second view rate if available),
  and its trend.
- Spend, so you can rank by how much money sits behind the fatigue.

An ad is fatiguing when frequency is climbing and click-through is falling on
the same ad over the window. Rank the fatiguing ads by spend behind them. Work
the top ones first, since a refresh there recovers the most money.

If the connector cannot return per-ad trend, say so and ask the founder to paste
the ad-level breakdown, rather than guessing which ads are tired.

## Step 2: read what the tiring ad was doing right

For each fatiguing ad, before writing the new brief, name what made it work
while it worked: the hook, the format (UGC, static, founder talking, demo), the
angle, the offer framing. You keep the DNA that earned the early results and
change the surface that has gone stale. Pull this from the ad itself, the ad
copy, and whatever creative notes the founder can give. If you cannot tell what
the ad was doing, ask, rather than inventing a rationale.

## Step 3: write the refresh brief per ad

For each of the top fatiguing ads, output a brief in this shape:

```
### Refresh: [ad name or short description]
Fatigue read: frequency [trend], click-through [trend], [$spend] behind it.
What worked (keep this): [hook / angle / format that earned the early results].
What is tired (change this): [the specific stale surface].

New angle to shoot:
- Format: [UGC / static / founder / demo / testimonial-style], and why it fits.
- Hook: [a concrete opening beat a creator can actually shoot or say].
- Proof beat: [what the creator demonstrates on camera, not just states].
- Offer / CTA framing: [kept consistent with the winning ad].
- Do not say: [one guardrail if the angle is fragile, or a claim the product
  cannot back].
```

Write two to three of these for the top fatiguing ads, not one for every ad in
the account. A refresh brief the founder never shoots is worth nothing, so keep
it to the few that carry the most spend.

## Step 4: the shoot list

Close with a short list the founder can hand straight to a creator or editor:

```
SHOOT THIS WEEK
1. [Angle], for [the fatiguing ad it replaces], [format].
2. ...
```

## Where the angles come from when the account is thin

If the founder wants angles grounded in real customer language rather than only
in what the old ad did, route them to `rise-review-angle-miner` in the wider
RISE DTC AI Kit. Paste reviews there, get angles traced to real review lines,
then bring the winning angle back here to shape into a shoot brief.

## Hard rules

- No invented performance numbers. Never promise a lift, a click-through, or a
  cost per purchase the account has not shown. Fatigue is read from the ad's own
  trend.
- Never invent what a customer said. If a brief leans on customer language, it
  comes from real reviews or notes the founder provides, or it is routed to
  `rise-review-angle-miner`.
- Keep the winning DNA. A refresh changes the stale surface and keeps what
  earned the early results.
- Two to three briefs for the top-spend fatiguing ads, not one per ad.
- No em dashes.
- No corrective-contrast phrasing.
- Never use: leverage, seamless, robust, elevate, unlock, delve, streamline,
  empower, game-changer, transformative.
- Plain operator tone. Briefs a creator can shoot, not adjectives.
