# Stochastic System Audit

Health-check your whole setup with parallel agents, then verify before reporting.

Optional scope: $ARGUMENTS  (e.g. "the lead pipeline"). No scope = full audit.

1. First read CLAUDE.md / your project to list YOUR subsystems (your tools, databases, automations, workflows). Pick up to 6.
2. Spawn one agent per subsystem in parallel (Task tool). Each checks LIVE state (query your data, check your automations/logs) and returns RED / YELLOW / GREEN with specific evidence.
3. Adversarial verification: for every RED and the top YELLOWs, spawn a skeptic agent to try to REFUTE the finding (look for a benign explanation; default to refuted when evidence is weak). Drop refuted findings to a footnote; downgrade over-stated ones.
4. Synthesize a dashboard: each subsystem with a colour + one-line summary, then the confirmed issues ranked by impact, each with one next action.
