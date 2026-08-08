# Claude Code starter kit — setup checklist

Run these in order. Heads-up: only the **commands** live in this repo — everything
else installs from its own source (npm / the Claude Code `/plugin` marketplace / MCP).
A package like n8nac can't be "in" a repo; it's always an install command.

## 1. The commands (this repo)
Copy `.claude/commands/` into your project →
`/stochastic-decision` · `/stochastic-research` · `/stochastic-audit` · `/stochastic-red-team`

## 2. Superpowers (free pack) — in Claude Code
```
/plugin marketplace add anthropics/claude-plugins-official
/plugin install superpowers@claude-plugins-official
```

## 3. n8nac (manage n8n as code, look up node configs)
```
npm install -g n8nac
```
(needs Node — if missing, tell Claude: "install Node, then n8nac")

## 4. MCP tools (just tell Claude)
- Browser automation → "add the Playwright MCP"
- Drive my screen → "add the computer-control MCP"  (grant screen + accessibility access on macOS)

## 5. Connect your tools (keys go in .env — git-ignored)
- **Pipedrive:** Settings → Personal preferences → API → copy token → "save my Pipedrive token in .env and read my deals"
- **n8n:** Settings → n8n API → create key → "save my n8n key + URL in .env and check my workflows"
