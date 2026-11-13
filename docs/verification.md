# Release verification

Unit tests require no provider credentials and do not modify existing user sessions. They cover validation/replacement, timezone calculation, one-shot execution, direct-file interval initialization, budgets, expiry, per-target concurrency, simultaneous finalization, locks, ambiguity, literal arguments/terminal input, and timeout cleanup of child processes.

Release checks:

1. Run lint, tests, and bundle build against the final source.
2. Validate the Claude manifest and shared scheduling skill.
3. Install the release tarball in a clean local prefix and run without source dependencies.
4. Run a command schedule through daemon start/stop/restart and inspect receipts, pause and cancellation.
5. Use dedicated cmux/tmux receiver fixtures to verify literal text and one submission; remove fixtures afterwards.
6. Queue into a dedicated existing Codex thread. Check queue acceptance and native persistence separately from model processing.
7. Install both provider plugins from the public Git repository, compare installed bundle bytes, and execute smoke schedules using the installed runtime.

CI targets Node 22/24 on Linux/macOS. Workflow configuration is not evidence of a remote passing run. Provider installation and real terminal tests require the corresponding tools. Transport receipts do not establish the correctness of agent decisions.
