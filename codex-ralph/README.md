# Codex Ralph Loop

Minimal harness to run Codex CLI in a Ralph-style loop: one feature at a time,
update the PRD, append progress, commit, repeat.

Files
- `plans/prd.json`: feature list with pass flags
- `plans/progress.txt`: append-only notes
- `plans/PROMPT.md`: instructions given to Codex
- `scripts/ralph.ps1`: loop runner
- `scripts/ralph-once.ps1`: single iteration

Usage
1) Copy this folder into the repo you want Codex to work in.
2) Edit `plans/prd.json` with small, testable features.
3) Commit a clean baseline.
4) Run `.\scripts\ralph.ps1 -MaxIterations 10` or `.\scripts\ralph-once.ps1`.

Options
- `-PromptPath` to use a different prompt file
- `-Model` to pick a model (example: `gpt-5`)
- `-SkipGitCheck` if running outside a git repo

The loop stops early if the agent outputs `PROMISE COMPLETE`.
