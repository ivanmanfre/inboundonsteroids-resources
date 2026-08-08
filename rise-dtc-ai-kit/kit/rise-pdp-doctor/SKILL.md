---
name: rise-pdp-doctor
description: Use when a DTC founder pastes a product page (title, description, current copy) plus that SKU's top return reason and return rate, and wants the page rewritten to convert better and return less. Triggers on "fix my PDP," "why is this returning so much," "rewrite this product page," "cut my return rate," or any paste of a product title + description + a stated return reason. Handles apparel (fit-driven returns) and skincare (usage/expectation-driven returns) with different playbooks.
---

# PDP Doctor, RISE Method, Conversion pillar

## What this does

Takes one product detail page and rewrites it to do two jobs at once: sell it
better, and set expectations accurate enough that fewer people send it back.
The two are the same problem. Most returns aren't a product defect, they're a
promise the copy made that the product didn't keep. This skill fixes the
promise.

It does not touch pricing, ads, imagery direction, or the storefront theme.
One PDP in, one rewritten PDP out. Works as a Claude Code skill or pasted
straight into a Claude chat.

## Inputs to ask for

Before starting, get all of these. If any are missing, ask for them rather
than guessing:

1. **Current title** (paste exactly as it appears on the live page)
2. **Current description / bullet copy** (paste as-is, including any specs already listed)
3. **Category**: apparel or skincare. If unclear from the product itself, ask.
4. **Top return reason**, in the customer's own words if possible ("runs small," "broke me out," "not what I expected," "didn't fit my skin type")
5. **Return rate %** for this specific SKU
6. Optional but useful if the founder has it: fabric/material %, fit model height and size worn, garment care, active ingredient % and skin-type suitability, price. Don't chase these before starting, work with what's given and flag the gaps in the output.

## Method

1. **Read the return reason as a copy problem first, product problem second.** A 28% "runs small" rate on a tee usually means the copy never said anything about fit, not that every unit is mis-sewn. Treat the rewrite as an expectation-setting job before treating it as a quality-control job.
2. **Find the gap.** Compare what the current copy promises against what the return reason says actually happened. That gap is the one thing this rewrite has to close.
3. **Rewrite the title.** Sharper, specific, and if the return reason is fit- or usage-related, let the title hint at it (a cut, a fit, a skin type) rather than staying generic.
4. **Rewrite the description.** Benefit-led, but every claim has to be something the founder actually gave you or something safely generic (how a garment is worn, general skincare usage patterns). No invented specifics.
5. **Build the fit block (apparel) or usage block (skincare).** This is the actual return-reducer. It has to speak directly to the stated return reason, not just describe the product in general.
6. **Write the FAQ.** First question always preempts the top return reason head-on. Add 2-4 more only if they're genuinely useful, not padding.
7. **Propose 3 A/B test ideas.** Each one has to be testable (a specific element, a specific variant, a specific thing you'd measure), not a vague suggestion.

## Category-specific handling

### Apparel
The fit block carries the whole job. Structure it as:
- A direct, honest sizing call if the founder stated one ("runs small, size up" beats a vague "true to size" if the data says otherwise)
- A short "how to choose your size" block that speaks to the actual return reason, not a generic sizing disclaimer
- Fit model height/size worn and fabric stretch, if supplied. If not supplied, flag them as missing rather than inventing them, since these are the two details that most reduce apparel sizing returns

### Skincare
The usage/expectation block carries the job. Structure it as:
- Skin type or concern this is suited for (only if the founder supplied it)
- How to use it and how often
- What results to expect and roughly when, or a flag that this needs the founder's real timeline
- A plain statement of what it will not do, plus a patch-test note if the category calls for it
- Ingredient or active % only if the founder supplied it. Never round up, estimate, or imply a concentration

## Output format

Return exactly these five sections, in order:

1. **Rewritten title**
2. **Rewritten description**
3. **Fit block** (apparel) or **Usage block** (skincare)
4. **FAQ** (starts with the top return reason)
5. **3 A/B test ideas**

Anywhere a real detail is missing, mark it inline as `[NEEDS: <what's missing>]`
instead of writing around it or filling it with a plausible guess.

## Hard guardrails

- Never invent product facts: materials, fabric %, ingredients, active concentrations, measurements, care instructions, certifications. If it wasn't pasted in, it doesn't go in the copy. Flag it instead.
- Never invent or imply reviews, star ratings, testimonials, or customer quotes. None of that exists unless the founder pastes it.
- No em dashes anywhere in the output.
- No corrective-contrast phrasing ("it's not just X, it's Y").
- Banned words, in any form: leverage, seamless, robust, elevate, unlock, delve, streamline, empower, game-changer, transformative.
- Conversion copy craft is welcome. Hype is not. No fabricated urgency, no fake scarcity, no claims that can't be verified from what was pasted.
- If the category is genuinely ambiguous (not clearly apparel or skincare), ask rather than picking one.
