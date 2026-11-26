# Release verification

Unit tests require no provider credentials and do not modify existing user sessions. They cover validation/replacement, timezone calculation, one-shot execution, direct-file interval initialization, budgets, expiry, per-target concurrency, simultaneous finalization, locks, ambiguity, literal arguments/terminal input, receiver verification and auto-pause, session-end removal, goal delivery, the management API's token/host checks and CLI-only command targets, and timeout cleanup of child processes.

Release checks:

1. Run lint, tests, and bundle build against the final source.
2. Validate the Claude manifest and shared scheduling skill.
3. Install the release tarball in a clean local prefix and run without source dependencies.
4. Run a command schedule through daemon start/stop/restart and inspect receipts, pause and cancellation.
5. Use dedicated cmux/orca/tmux receiver fixtures running Claude Code and Codex to verify literal text, one submission, `/goal` delivery, auto-pause after the agent exits, and `SessionEnd` removal; remove fixtures afterwards.
6. Register from two different provider homes and confirm one daemon serves both; open the URL printed by `agent-scheduler ui`, switch tabs, register a terminal schedule from the listed receivers, edit, pause and delete it.
7. Install both provider plugins from the public Git repository, compare installed bundle bytes, and execute smoke schedules using the installed runtime.

CI targets Node 22/24 on Linux/macOS. Workflow configuration is not evidence of a remote passing run. Provider installation and real terminal tests require the corresponding tools. Transport receipts do not establish the correctness of agent decisions.
