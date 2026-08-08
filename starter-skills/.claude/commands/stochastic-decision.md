# Stochastic Decision

Weigh a hard decision with several independent agents, then stress-test it before deciding.

The decision to weigh: $ARGUMENTS

1. Spawn 4 agents in parallel (Task tool, subagent_type: general-purpose). Give each:
   - The decision and any constraints.
   - Your real context: tell them to read CLAUDE.md and relevant files so their argument is grounded in your actual setup, not theory.
   - A distinct job: agent 1 argues FOR, agent 2 argues AGAINST, agent 3 finds the cheapest/simplest path, agent 4 looks for what everyone is missing (second-order effects, hidden risk).
   - Instruction to return a clear recommendation with concrete reasons + evidence.
2. Adversarial check: spawn 1 skeptic agent to refute the strongest recommendation. Tell it to default to "not convinced" when evidence is thin.
3. Synthesize into one answer: the recommendation, the 2-3 reasons that survived the skeptic, the main risk, and the first concrete step. No fence-sitting.
