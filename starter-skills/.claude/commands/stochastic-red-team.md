# Stochastic Red Team

Stress-test a system, plan, or build to find where it breaks — before reality does.

What to red-team: $ARGUMENTS

1. Read CLAUDE.md / the relevant files so the attack is grounded in your real setup.
2. Spawn 4 agents in parallel (Task tool), each attacking a different angle: cost/complexity (is it worth it?), failure modes (what breaks, and silently?), usage reality (will it actually get used, or build-and-forget?), security/data (what could leak or go wrong?).
3. Each returns the top concrete risks with evidence + a severity.
4. Adversarial check: spawn a skeptic to refute the scariest risks (default to refuted when speculative).
5. Synthesize: the real risks that survived, ranked, each with a mitigation. Be honest if it's solid.
