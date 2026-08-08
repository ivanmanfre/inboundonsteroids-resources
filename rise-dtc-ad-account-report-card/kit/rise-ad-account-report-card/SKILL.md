---
name: rise-ad-account-report-card
description: Use when a Shopify DTC founder wants a straight grade on their Meta ad account and does not want to read another 40-tab spreadsheet. Connect your Meta Ads account to Claude, run this skill, and get a letter grade (A to F) on every line item that decides whether your ad spend makes money or leaks it. Triggers on "grade my ad account", "audit my Meta ads", "why is my ROAS fine but my profit isn't", "where is my ad budget leaking", or any paste of Meta Ads Manager numbers. Every grade is relative to your own account's numbers or to a breakeven you set. No invented industry benchmarks.
---

# Ad Account Report Card

Part of the RISE DTC AI Kit. RISE Method, Financial Health pillar.

## What this does

You connect your Meta Ads account to Claude, then run this skill. Claude reads
your own account over a set window and hands back a report card: a letter grade
on each of six line items, one line saying why, the numbers behind it, and an
overall grade. Then the three fixes that move the most money first.

Every grade comes from your account's own numbers or from a breakeven you type
in. There is no industry benchmark anywhere in this skill. Your account is
graded against itself and against the point where an order starts making money,
which only you can set.

This runs on Claude's native ad-account connector. No plugin, no MCP, no CLI.
If you have not connected Meta yet, do that first (see setup below), then come
back and run the skill.

## Setup: connect Meta once

1. In claude.ai, open Settings, then Connectors.
2. Connect your Meta / Facebook Ads account and grant read access to the ad
   account you want graded.
3. Come back to this chat and paste this whole file, then say "grade my account".

If a founder is on Claude Code or a Claude Project without the connector, they
can still run this: paste the numbers the skill asks for by hand and it grades
the same way. The connector just saves the copy-paste.

## Step 1: set the window and the one number Claude cannot get

Before grading, confirm two things with the founder:

1. **Window.** Default to the last 30 days for fatigue and frequency, and the
   last 90 days for spend concentration and efficiency trend. If the account
   spends under a set amount a day and 30 days is thin, say so and widen the
   window instead of grading on noise.
2. **Contribution margin per order, as a percent or a dollar figure.** This is
   the money left after product cost, shipping, and payment fees, before ad
   spend. Claude cannot pull this from Meta. Ask for it plainly. If the founder
   does not have it, grade line item 6 on the account's own baseline only and
   mark the margin-aware grade as `[NEEDS: contribution margin]`. Never guess a
   margin. Never assume a "typical" DTC margin.

From the margin, compute the breakeven ROAS once and show it:

```
Breakeven ROAS = 1 / contribution_margin
  (contribution_margin as a decimal, e.g. 0.40 margin -> breakeven ROAS 2.5)
```

That breakeven is the only efficiency line that matters. It is the founder's
own number, not a benchmark.

## Step 2: grade the six line items

Grade each one A to F. For every grade, show the numbers you pulled and one
plain sentence on why it landed where it did. If the connector cannot return
the data a line item needs, do not grade it. Mark it `[NO DATA: <what is
missing>]` and move on. A missing grade is honest. A guessed grade is not.

### 1. Spend concentration
Pull spend by campaign and by ad set over the 90-day window. Rank them and look
at how the budget is spread.

- Grade toward A when spend sits behind a few proven performers and there are
  clear runners-up ready to take budget.
- Grade toward F when one ad set eats most of the account with nothing tested
  behind it (one point of failure), or when spend is scattered across many ad
  sets with no clear winner (no signal).

Relative rule: rank ad sets by spend, report what share the top ad set and the
top three ad sets carry, and grade against how top-heavy or how scattered the
account is compared with a healthy spread of its own volume. State the shares.

### 2. Creative fatigue
For each ad carrying real spend, pull frequency and click-through (or hook rate
/ thumb-stop if available) across the window and compare each ad against its own
earlier baseline in the same window.

- Rising frequency plus falling click-through on the same ad is fatigue.
- Grade by how much of the account's spend sits behind ads that are fatiguing
  right now.
- Grade toward A when spend sits behind ads holding their click-through with
  flat frequency. Grade toward F when most spend is behind ads whose
  click-through has fallen while frequency climbs.

Name the specific ads that are fatiguing and the share of spend behind them.

### 3. Frequency hygiene
Pull 7-day frequency per ad set. Compare each ad set against the account's own
distribution.

- Grade toward A when frequencies sit in a sane band for the account and none
  are climbing hard. Grade toward F when several ad sets show frequency well
  above the account's own norm and still climbing.
- Name the ad sets that are running hot.

### 4. Audience overlap
List active prospecting ad sets and their audience definitions. Flag ad sets
that target overlapping or duplicate audiences and therefore bid against each
other in the same auction.

- Grade toward A when audiences are distinct or deliberately structured (broad
  plus a few clean segments). Grade toward F when several ad sets chase the same
  people and a large share of spend sits inside the overlap.
- State how much spend sits in overlapping sets. If Meta's own overlap read is
  not reachable through the connector, infer overlap from the audience
  definitions and say it is inferred, not measured.

### 5. Exclusions hygiene
This one is a structural checklist, not a number. Check the account for:

- Purchasers excluded from prospecting campaigns.
- Existing customers and recent buyers excluded from cold acquisition.
- Retargeting windows that are not stale (for example, a 180-day window still
  chasing people who bought last week).
- Employees / internal traffic excluded where the founder has a list.

Grade by how many of these controls are actually in place. Name the ones that
are missing. This is hygiene the account either has or does not, so grade on
presence, never against an outside figure.

### 6. Margin-aware efficiency
Pull blended ROAS and cost per purchase over the window. Compare against two
things:

- The account's own trailing baseline (is efficiency improving or sliding).
- The breakeven ROAS computed in Step 1 from the founder's margin.

- Grade toward A when ROAS clears breakeven with room and is holding or rising.
- Grade toward F when ROAS is at or under breakeven, which means the account is
  buying orders that lose money before overhead.
- Show the account ROAS, the breakeven ROAS, and the gap in plain dollars where
  you can (spend times the ROAS-to-breakeven gap).

If no margin was given, grade only on the account's own trend and mark the
breakeven half `[NEEDS: contribution margin]`.

## Step 3: the report card

Output in exactly this shape:

```
AD ACCOUNT REPORT CARD, [account name], [window]

Overall: [letter]    (the average of the six grades, rounded to a letter)

1. Spend concentration ....... [letter]  [one line + the numbers]
2. Creative fatigue .......... [letter]  [one line + the ads and spend share]
3. Frequency hygiene ......... [letter]  [one line + the hot ad sets]
4. Audience overlap .......... [letter]  [one line + spend in overlap]
5. Exclusions hygiene ........ [letter]  [one line + what is missing]
6. Margin-aware efficiency ... [letter]  [account ROAS vs your breakeven]

WHERE THE MONEY IS

[The single line item bleeding the most money right now, named, with the
dollar size where the data supports one.]

FIX THESE THREE FIRST

1. [Lowest grade or biggest dollar leak], [one concrete move doable this week].
   Run next: [the kit skill that owns the fix, if one does].
2. [Same shape.]
3. [Same shape.]
```

Rank the three fixes by dollar size where you can compute one, and by grade
where you cannot. One move each, doable this week, not a project.

## Routing to the rest of the kit

Route each fix to the skill that owns it, only when it maps cleanly:

- Creative fatigue is dragging the account -> `rise-creative-refresh-brief`
- ROAS is under breakeven and you need to decide what to scale, hold, or cut
  -> `rise-scaling-triage`
- The ad-creative angle is stale and you need fresh angles from real customer
  language -> `rise-review-angle-miner` (from the wider RISE DTC AI Kit)

If a fix does not map to a skill, say the move plainly and do not force a
routing.

## Hard rules

- No invented benchmarks. Never state an "industry average" ROAS, CPA,
  frequency, click-through, or return rate. The only outside number allowed is
  the breakeven ROAS, and that is computed from a margin the founder typed.
- Grade against the account's own numbers or against the founder's breakeven.
  Nothing else.
- If the connector cannot return the data for a line item, mark it
  `[NO DATA: ...]`. Do not grade on a guess.
- Show the numbers behind every grade. The founder should be able to open Ads
  Manager and check you.
- No em dashes.
- No corrective-contrast phrasing: no "not X, it's Y", no "not just X".
- Never use: leverage, seamless, robust, elevate, unlock, delve, streamline,
  empower, game-changer, transformative.
- Profit first. Lead with the money, not the ratio. ROAS is a means to a
  dollar figure, never the headline on its own.
- Plain operator tone. Short lines, concrete nouns, no hype, no sign-off.
