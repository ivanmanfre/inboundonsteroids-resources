---
name: rise-scaling-triage
description: Use after the Ad Account Report Card, when a founder knows their grades and now has to decide what to scale, hold, or cut without torching profit. Reads your Meta ad account and your contribution margin and sorts every campaign into scale, hold, or cut, with the dollar reason next to each call. Triggers on "what do I scale", "should I cut this campaign", "where do I put more budget", "my ROAS dropped, what now", or a paste of campaign-level Meta numbers plus a margin figure. Every call is graded against your own breakeven, never an industry ROAS.
---

# Scaling Triage

Part of the RISE DTC AI Kit. RISE Method, Financial Health pillar.

## What this does

A report card tells you the account's health. This tells you what to do with
the budget on Monday. You connect Meta and give Claude your contribution
margin. Claude reads each campaign and ad set, works out which ones clear your
breakeven with room, which are sitting on the line, and which are losing money,
then sorts them into three buckets: scale, hold, cut. Each call comes with the
dollar reason behind it.

Nothing here uses an outside benchmark. The line between a good campaign and a
bad one is your own breakeven, and that comes from your margin, which only you
know.

Runs on Claude's native ad-account connector. No plugin, no MCP, no CLI. If the
account is not connected, connect Meta in claude.ai Settings, then Connectors,
or paste campaign-level numbers by hand.

## Step 1: get the two things Claude needs

1. **Contribution margin per order** (percent or dollars): the money left after
   product cost, shipping, and payment fees, before ad spend. Claude cannot
   pull this. Ask for it. If the founder does not have it, stop and say the
   triage cannot run honestly without it, because every scale-or-cut call
   depends on the breakeven. Do not assume a margin.
2. **The window and a stability check.** Default 30 days. Confirm no campaign in
   the set is under a few days old or under enough conversions to read, and flag
   any that are as "too new to judge" rather than bucketing them.

Compute breakeven ROAS once and show it:

```
Breakeven ROAS = 1 / contribution_margin   (margin as a decimal)
```

## Step 2: read every campaign against breakeven

Pull spend, ROAS (or CPA and AOV), and purchase volume per campaign and per ad
set over the window. For each one, work out:

- Where its ROAS sits against your breakeven (above with room, on the line,
  below).
- Its own trend inside the window (climbing, flat, sliding).
- Whether it has the volume to trust the read.

## Step 3: sort into scale, hold, cut

Put every campaign in exactly one bucket. Use these rules and show the numbers.

- **SCALE**: ROAS clears breakeven with room and is holding or rising, and the
  campaign has real volume behind it. These earn more budget. Say how much you
  would add and why, in steps the account can absorb (a large overnight jump
  resets learning; move in increments the campaign's own volume supports).
- **HOLD**: near breakeven, or clearing it but sliding, or not enough volume yet
  to trust. These keep their budget and get watched, or get a creative or
  audience fix before they earn more. Name the fix.
- **CUT or fix**: below breakeven with enough volume to trust the read, and no
  sign of turning. These are buying orders that lose money before overhead.
  Cutting one is the fastest profit move on the page. Say what the account saves
  per month by cutting it (its monthly spend, minus the contribution it brings
  back at its current ROAS).

Never cut on thin data. If a losing campaign does not have the volume to trust,
it is a HOLD with a watch note, not a CUT.

## Step 4: the triage output

```
SCALING TRIAGE, [account name], [window]
Your breakeven ROAS: [x.x]  (from your [y]% margin)

SCALE (add budget)
- [Campaign], ROAS [x.x] vs breakeven [x.x], [trend]. Add [amount], [why].
- ...

HOLD (keep and watch, or fix first)
- [Campaign], ROAS [x.x], [why it holds]. Fix: [the one thing]. Run next: [skill].
- ...

CUT or fix (losing money)
- [Campaign], ROAS [x.x] under breakeven [x.x] on [$spend]/mo. Cutting saves
  about [$]/mo. [Or: the fix if it is fixable and worth it.]
- ...

THE ONE MOVE THIS WEEK
[The single highest-dollar action from the three buckets, named, with its
dollar size.]
```

## Routing

- A HOLD campaign whose problem is tired creative -> `rise-creative-refresh-brief`
- You are not sure the account is healthy enough to scale at all -> run
  `rise-ad-account-report-card` first
- The losing campaign's angle is stale and needs new ones from customer
  language -> `rise-review-angle-miner` (from the wider RISE DTC AI Kit)

## Hard rules

- No invented benchmarks. The only line is your breakeven, computed from the
  founder's margin. Never an "industry" ROAS or CPA.
- No scale or cut call without the numbers shown next to it.
- Never cut on thin data. Under-volume losers are HOLD with a watch note.
- Contribution margin is required. No margin, no triage. Do not guess it.
- Express the payoff in flat dollars saved or added per month, not in ratios
  alone.
- No em dashes.
- No corrective-contrast phrasing.
- Never use: leverage, seamless, robust, elevate, unlock, delve, streamline,
  empower, game-changer, transformative.
- Decisive operator tone. One bucket per campaign, one move for the week.
