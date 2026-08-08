# Rise DTC AI Kit

Five Claude skills for running the money side of a DTC brand. Each one takes
numbers or copy you already have and hands back work you can use the same day:
a dollar-sized returns plan, a rewritten product page, ad angles pulled from
your reviews, a retention flow, and a Monday triage that tells you which of the
other four to run first.

Built for Rise DTC clients. Claude does the work on every one of these.

## The five skills

1. **rise-return-rate-rescue**, your return numbers in, the annual dollar leak and a 3-move rescue plan out.
2. **rise-pdp-doctor**, a high-return product page in, a rewrite built to sell more and return less out.
3. **rise-review-angle-miner**, paste your reviews, get 5 ad angles, 10 hooks, and 3 UGC briefs, each traced to a real review line.
4. **rise-winback-flows**, your product and churn signal in, post-purchase and winback sequences out with the recovery math.
5. **rise-weekly-triage**, last week's Shopify numbers in, the 3 things costing you money this week out, each routed to the skill that fixes it.

## Two ways to run it

### 1. Paste into Claude (no setup, 2 minutes)

Open [claude.ai](https://claude.ai) (or any Claude chat). Open the skill folder
you want, copy the whole `SKILL.md` file, paste it into a new chat, then paste
your own numbers or copy underneath and hit send. That's it. The skill file is
written to work as a standalone prompt.

Start with **rise-weekly-triage** on a Monday if you're not sure where to begin.
It points you to the right skill.

### 2. Install into Claude Code (for the technical founder)

Drop each skill folder into your `~/.claude/skills/` directory:

```
cp -r rise-*/  ~/.claude/skills/
```

Claude Code picks them up automatically. Invoke by name (for example, "run
rise-return-rate-rescue on these numbers").

## The one rule every skill follows

No made-up numbers. Every dollar figure these skills produce is computed from
numbers you give them, with the arithmetic shown so you can check it. The only
outside figure anywhere in the kit is the NRF and Happy Returns 2024 industry
return rate, cited where it's used. If a skill doesn't have the data to answer,
it tells you what's missing instead of guessing.

## Questions

This kit was built for you by Rise DTC. If you want a skill tuned to your store
or a new one built for a problem that isn't here, that's what the team is for.
