---
name: rise-return-rate-rescue
description: Use when a DTC founder wants to know exactly how many dollars returns are costing per year and what to fix first, paste your Shopify return numbers and Claude sizes the annual leak, names how bad it is, and writes a 3-move rescue plan ordered by dollar recovery.
---

# Return Rate Rescue

Part of the Rise DTC AI Kit, RISE Method, Financial Health pillar.

## What this does

You give Claude eight numbers from your own Shopify data. Claude runs the
math in front of you, sizes your annual return-related dollar leak, tells
you which of three tiers you're in, and writes a 3-move rescue plan ordered
by which move recovers the most money first. Every dollar in the output
traces back to a number you gave it or to one named public benchmark. This
works as a Claude Code skill or pasted straight into a Claude chat: same
inputs, same math, same output.

## Step 1: Collect these eight inputs

Ask for all eight before computing anything. Use these hints verbatim if the
founder is unsure where to find a number:

| Field | What it is | Where to find it |
|---|---|---|
| Monthly orders | Orders in the last 30 days | Shopify, Analytics, Orders |
| AOV | Average order value ($) | Total sales divided by orders, on your Shopify overview |
| Return rate | Returns divided by orders, last 90 days (%) | Shopify, Analytics, Returns |
| Category | apparel / footwear / skincare and beauty / other DTC | Steers the plan copy only, not the math |
| Top return reason | sizing/fit, quality defect, not as described, changed mind, arrived damaged, other | Whichever reason is tagged most on your return requests |
| Exchange share | Of every 10 returns, how many become an exchange instead of a refund (%) | Rough is fine |
| Outbound shipping per order ($) | What you pay to ship one order out | A returned order already spent this, it never comes back |
| Return handling cost ($ per return) | Your cost to take one return back: label if you pay it, warehouse time, inspection, restock | Estimate from your own ops, no public figure is reliable enough to fill this in for you |

## Step 2: Compute the leak

Constants (the only two fixed rates in this whole model):

```
p = 0.029   f = 0.30     (published card processing rate, Shopify Payments / Stripe standard)
```

Convert inputs: `N` = monthly orders, `A` = AOV, `r` = return rate / 100,
`x` = exchange share / 100, `s` = outbound shipping, `h` = return handling.

Leak per returned order:

```
L_per_return = (1 - x)*A + s + (1 - x)*(p*A + f) + h
```

Monthly and annual totals:

```
Monthly_leak = N * r * L_per_return
Annual_leak  = 12 * Monthly_leak
```

Break the annual leak into its four components (show all four, this is what
ranks the plan):

```
Refunded revenue (annual)       = 12 * N * r * (1-x) * A
Sunk outbound shipping (annual) = 12 * N * r * s
Lost processing fees (annual)   = 12 * N * r * (1-x) * (p*A + f)
Return handling (annual)        = 12 * N * r * h
```

These four must add up to `Annual_leak`. Show the check.

Revenue kept by exchanges (not a cost line, state it as retained revenue):

```
Exchange_offset_annual = 12 * N * r * x * A
```

Recoverable slice, anchored to the one external figure in this whole model,
NRF and Happy Returns, 2024 Consumer Returns in the Retail Industry: US
retailers estimate 16.9% of annual sales get returned, all channels
combined. That is the floor, never a target below your current rate:

```
r_target = min(r, 0.169)
Recoverable_annual   = 12 * N * (r - r_target) * L_per_return
Residual_leak_annual = 12 * N * r_target * L_per_return
```

If the founder's rate is already at or under 16.9%, `Recoverable_annual = 0`.
Say so plainly, and point the plan at the exchange mix and handling cost
instead of the rate.

Leak as a share of revenue (this drives the tier):

```
Annual_revenue = 12 * N * A
Leak_pct = Annual_leak / Annual_revenue
```

## Step 3: Name the tier

```
Leak_pct < 8%          -> SLOW LEAK
8% <= Leak_pct < 16%   -> STEADY DRAIN
Leak_pct >= 16%        -> OPEN DRAIN
```

## Step 4: Write the 3-move plan

Rank the four leak components (Refunded revenue, Return handling, Sunk
outbound shipping, Lost processing fees) largest annual dollar figure first.
Output in this exact shape:

```
[tier name], you're leaking $[Annual_leak]/yr, [Leak_pct]% of revenue.

[One line naming the #1 driver by name and its annual dollar figure.]

1. [Component #1 name], $[annual figure]/yr. [One concrete action tied to
   category and top return reason, doable this week.]
2. [Component #2 name], $[annual figure]/yr. [Same.]
3. [Component #3 name], $[annual figure]/yr. [Same.]

If this lands: you recover $[Recoverable_annual]/yr and the leak drops to
$[Residual_leak_annual]/yr.

Your exchange rate already keeps $[Exchange_offset_annual]/yr that a
refund-only policy would lose.
```

Concrete-action examples by top return reason (adapt to the store's
category, don't invent a dollar figure for them): sizing/fit, add a fit
guide and per-product size chart to the three highest-return SKUs. quality
defect, pull the return notes on the top 3 returned SKUs and open a supplier
ticket. arrived damaged, photograph a week of damaged returns and switch the
worst SKU to protective mailers. not as described, rewrite the product copy
and photos on the top 3 returned SKUs against what customers say in the
return note. changed mind, tighten the pre-purchase expectation (sizing
quiz, comparison chart) at the point where changed-mind returns originate.

## Hard rules

- Never state a number that isn't computed from the founder's own inputs or
  the NRF 16.9% figure above. No invented benchmarks, no rounding tricks, no
  "industry average" claims beyond that one citation.
- Show the arithmetic. The founder should be able to check every figure by
  hand.
- No em dashes.
- No corrective-contrast phrasing: no "isn't X, it's Y," no "not just X,"
  no "X, not Y."
- Never use: leverage, seamless, robust, elevate, unlock, delve, streamline,
  empower, game-changer, transformative.
- Dollars first, always. Lead every line with the number, not the framing.
- Plain operator tone. Active voice, concrete nouns, no hype, no sign-off.
