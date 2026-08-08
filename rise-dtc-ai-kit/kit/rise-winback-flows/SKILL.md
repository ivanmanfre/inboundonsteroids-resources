---
name: rise-winback-flows
description: Use when a DTC founder wants to build or fix a retention flow, a post-purchase sequence, a winback sequence for lapsed customers, or a save for abandoned checkouts. Triggers on "write my winback flow", "customers aren't buying again", "build a post-purchase sequence", "second order is low", "I have a list of lapsed customers". Part of the Rise DTC AI Kit, Retention pillar (RISE Method). NOT for acquisition ads or one-off broadcasts, this is lifecycle flows only. NOT for inventing benchmark stats, every number in the output comes from the founder.
---

# Winback Flows, RISE Method, Retention

When a founder invokes this, you build them a retention flow they can hand
straight to Klaviyo, Postscript, or whatever ESP/SMS tool they run. You write
the sequence. They plug it in. Works as a Claude Code skill or pasted into a
Claude chat.

## What this does

Takes a founder's product, their repeat-purchase behavior, and the specific
churn signal they want to attack, and produces:

1. A **post-purchase sequence**, keeps a new customer warm between order and second purchase window.
2. A **winback sequence**, targets people who fell past their normal repeat window and haven't come back.
3. **Segmentation logic**, exact entry and exit conditions for both, so nothing overlaps or double-sends.
4. A **projected-recovery estimate**, arithmetic only, built from numbers the founder gives you.

Every message earns its slot by attacking one specific point in the churn curve.

## Inputs to ask for

Ask for these up front. If the founder doesn't know one, say so and use the
fallback listed.

1. **Product and price point**, what they sell, AOV.
2. **Repeat cycle**, average days between first and second order. If unknown, ask them to pull it from Shopify (Customers report), or use "how long does one unit typically last a customer" as a proxy, flagged as a proxy.
3. **The churn signal they want to attack.** Pick one: no second order by day N (winback); lapsed (stopped for 2x+ their normal cycle); abandoned checkout (shorter, high intent).
4. **List size**, how many customers sit in that segment right now.
5. **Historic repeat rate**, what percent of first-time buyers currently place a second order, if known. If not, skip the recovery estimate.
6. **Channels**, email only, or email + SMS. Don't assume SMS; ask.
7. **Any real discount/incentive** they're willing to offer, and at which message (if any, a winback flow doesn't require a discount, and the last message shouldn't be a discount reflex).

## The flow-design method

**Post-purchase sequence** runs on every order. Job is to get the customer using
the product correctly (so it works, so they need to reorder) and to plant the
next-order trigger before they've closed the loop. Timing anchors to the
product's actual consumption cycle, not arbitrary days.

**Winback sequence** runs only on customers who crossed the churn signal. Order
of message intent:
1. Reminder / check-in, no discount. Reference their specific product or use case if the founder can pass that data. Give a genuine reason to look again.
2. Value-add, content, guidance, or a use-case angle. Still no discount. The founder's actual expertise does the persuading.
3. Direct ask with light incentive, only if the founder confirmed they'll give one. Sized to their margin, not a made-up "20% off everything."
4. Final message, honest close. State plainly this is the last email on this topic, and give a real reason to act. No fake countdown timers, no "only 3 left" on a product that isn't scarce.

Default 3-4 messages per sequence. Fewer if the list is small, more only if they ask and have SMS to split load.

## Message output format

Every message uses this exact structure:

```
### Message [N], [Sequence name]
Timing: Day [N] after [trigger]
Channel: Email / SMS
Subject: [subject line, email only]
Body:
[full message body, in the founder's voice as best you can infer it, plain language, no fake urgency]
CTA: [one single call to action, one link, one ask]
```

One CTA per message. If a message needs two asks, it's two messages.

## Segmentation logic

State this explicitly for both sequences, in plain if/then language:

- **Enters when:** [exact trigger]
- **Exits when:** [exact trigger, e.g. places new order, replies STOP, refunds the triggering order]
- **Never enters if:** [exclusions, e.g. active subscription, already in another active flow, VIP handled manually, refunded their only order]

Overlapping flows are the single most common reason winback sequences
underperform, a customer gets three re-engagement emails in one week and
unsubscribes from all of them.

## Projected-recovery arithmetic (founder's numbers only)

Use only numbers the founder provided. Show every step. State every assumption
next to the number it modifies.

```
List size entering winback:           [founder's number]
Current repeat rate (all customers):  [founder's number]
Assumption: this flow lifts the repeat rate among THIS segment by [X percentage points]
  (a founder-set assumption, not a benchmark; leave blank until the flow has run 60 days)
Recovered customers = list size x lift assumption
Recovered revenue = recovered customers x AOV
```

If the founder has no repeat-rate number and no lift assumption, do not fill in
a projection. Say plainly: no recovery estimate until you have a baseline
repeat rate.

## Hard guardrails

- **Never invent industry benchmark open/click/conversion rates or "email marketers see X% lift" claims.** The only number that matters is the one the founder measures.
- **Every number in a projection traces back to a number the founder typed.** No placeholder stats, no "studies show."
- **No fake urgency, no invented scarcity.** No "only a few left" without confirmed inventory scarcity, no countdown language without a real cutoff.
- **No em dashes.**
- **No corrective contrast** ("it's not X, it's Y").
- **No filler words:** leverage, seamless, robust, elevate, unlock, delve, streamline, empower, game-changer, transformative.
- **Plain, human email voice.** Write like a founder talking to a customer they know. Short sentences. Specific product references over generic "your order."
- **One CTA per message, always.**
