# RISE DTC Ad Account Report Card

Three Claude skills for the paid side of a Shopify DTC brand. You connect your
Meta ad account to Claude, run a skill, and get work back the same day: a
letter-graded report card on your account, a scale-hold-cut call on your budget,
and a refresh brief for the ads going stale.

Built for RISE DTC clients. Claude does the reading and the writing on every one
of these. Profit first, always.

## The three skills

1. **rise-ad-account-report-card**, connect Meta and get a letter grade (A to F)
   on six line items that decide whether your spend makes money: spend
   concentration, creative fatigue, frequency hygiene, audience overlap,
   exclusions hygiene, and margin-aware efficiency. Overall grade, then the three
   fixes that move the most money first.
2. **rise-scaling-triage**, your account and your margin in, a scale-hold-cut
   call on every campaign out, each one graded against your own breakeven and
   sized in flat dollars saved or added per month.
3. **rise-creative-refresh-brief**, finds the ads whose click-through is falling
   while frequency climbs, keeps what worked, and writes a refresh brief a
   creator or editor can shoot this week.

Start with **rise-ad-account-report-card**. It grades the account and routes you
to the other two.

## Two ways to run it

### 1. Connect Meta and paste into Claude (no setup, a couple of minutes)

Open [claude.ai](https://claude.ai). In Settings, then Connectors, connect your
Meta / Facebook Ads account with read access. Then open the skill you want,
copy the whole `SKILL.md`, paste it into a new chat, and say "grade my account".
Claude reads your account through the connector and hands back the work.

No connector? You can still run every skill by pasting the numbers it asks for
by hand. The connector just saves the copy-paste.

### 2. Install into Claude Code (for the technical founder)

Drop each skill folder into your `~/.claude/skills/` directory:

```
cp -r rise-*/  ~/.claude/skills/
```

Claude Code picks them up automatically. Invoke by name, for example "run
rise-ad-account-report-card on my Meta account".

## The one rule every skill follows

No made-up numbers. Every grade and every dollar figure these skills produce
comes from your own account or from a breakeven you set from your own margin.
There is no industry benchmark anywhere in this pack. If a skill does not have
the data to grade a line, it tells you what is missing instead of guessing.

## Questions

This pack was built for you by RISE DTC. If you want a skill tuned to your
account or a new one for a problem that is not here, that is what the team is
for.
