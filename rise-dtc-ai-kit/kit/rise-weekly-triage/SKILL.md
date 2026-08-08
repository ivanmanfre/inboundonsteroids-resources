---
name: rise-weekly-triage
description: Use every Monday when you're staring at last week's Shopify numbers and don't know what to fix first, sessions, conversion rate, orders, revenue, AOV, returns, ad spend, top products, week-over-week deltas. Paste the numbers and get back the 3 things actually costing you money, ranked, with the dollar size of each and the one action to take this week. This is the router for the rest of the Rise DTC AI Kit, it tells you which other skill to run next.
---

# Rise Weekly Triage, RISE Method, operating cadence

## What this does

You paste last week's store numbers. Claude finds the 3 metrics that moved most
against you, sizes each one in dollars using ONLY the numbers you gave it, and
hands back a ranked "fix this first" list. Nothing here is a benchmark or an
industry average, every number in the output comes out of arithmetic done on
what you pasted.

This is the Monday cadence skill in the Rise DTC AI Kit. It doesn't fix returns,
rewrite a PDP, mine reviews, or build a winback flow. It tells you which of
those four jobs to run this week and why, in dollar terms. Works as a Claude
Code skill or pasted into a Claude chat.

## Inputs to ask for

If the founder pastes numbers without being asked, skip straight to triage.
Otherwise ask for last week vs. the prior week (or same week last month):

- Sessions
- Conversion rate
- Orders
- Revenue
- AOV
- Return rate / return count
- Ad spend (and CAC if they have it, or spend / orders if not)
- Top 3-5 products by revenue, with each product's conversion rate if available
- Anything the founder flags manually ("we ran a promo," "site was down Tuesday," "restocked X")

Missing a field is fine. Triage on what's there. Never invent the missing ones
and never assume a "typical" value.

## Triage method

1. **List every metric that moved** week over week in the direction that costs money.
2. **Size each move in dollars using their own numbers.** The three calculations you need:
   - Conversion or session move: `(this week's sessions x this week's rate) - (this week's sessions x last week's rate)` gives the order swing from the rate change; multiply by AOV for revenue. Isolate rate-driven loss from volume-driven loss, don't blend them without saying which is which.
   - Return spike: `(this week's return count - last week's return count) x AOV` = revenue at risk from refunds, roughly. Say "roughly," returns eat margin and shipping too, but you're not fabricating a margin number they didn't give you.
   - CAC/spend move: `(this week's CAC - last week's CAC) x this week's paid orders` = extra dollars spent for the same orders. If they didn't split paid vs. organic, use total orders and say so.
3. **Rank the moves by dollar size, largest first.** Not by which sounds urgent.
4. **Take the top 3.** If fewer than 3 moved against them, report what's there, don't pad.
5. **For each of the top 3, name exactly one first action for this week.** One move, not a project.
6. **Route each issue to the kit skill that owns the fix** (map below). If an issue doesn't map cleanly, say so and don't force a routing.

## Output format

```
WEEK IN ONE LINE
[revenue vs last week, in dollars and %, one sentence]

TOP 3 THIS WEEK

1. [Problem, named plainly]
   Impact: $[X], [the arithmetic, shown, not just the answer]
   First action this week: [one concrete move, doable today]
   Run next: [skill name], [one line on why]

2. [same shape]

3. [same shape]

WHAT'S FINE
[metrics that moved in your favor or didn't move, one line]
```

Show the arithmetic inline, not in a footnote.

## Routing map: the other four skills in the kit

Route by cause, not by category. One issue routes to exactly one skill.

- **Returns up** → `rise-return-rate-rescue`
- **Conversion dropped on a specific product** (PDP-level, not site-wide) → `rise-pdp-doctor`
- **CAC rose or ad spend outpaced order growth** → `rise-review-angle-miner` (new angles from real reviews fix the ad-creative fatigue that usually drives a CAC climb)
- **Repeat purchase rate or returning-customer revenue fell** → `rise-winback-flows`
- **Site-wide conversion or session drop with no single product or return cause** → flag as a traffic/UX issue outside the kit's scope this week; don't force a routing.

If two issues in the top 3 route to the same skill, say so, that skill is this week's real priority.

## Guardrails

- Compute only from the numbers pasted into this session. Never pull in an "industry average" of anything, the founder's own prior week is the only baseline that exists here.
- Show the arithmetic every time a dollar figure appears.
- If a number needed for a calculation wasn't provided, say what's missing and give the partial answer with the gap flagged, or skip that slot, never fill it with an assumption.
- No em dashes.
- No corrective-contrast structures ("it's not X, it's Y"). State what's true, once.
- Banned words: leverage, seamless, robust, elevate, unlock, delve, streamline, empower, game-changer, transformative.
- Decisive operator tone on a Monday, not a consultant. Short sentences. One clear priority.
- Never output more than one first action per issue.
