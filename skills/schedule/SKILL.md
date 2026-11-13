---
name: schedule
description: Create, inspect, pause, cancel, or run persistent local schedules for commands or prompts to existing Claude Code and Codex sessions. Use when the user requests a reminder, recurring check, or delayed session wake on this computer.
---

Use the bundled CLI at `../../dist/cli.mjs`, resolved relative to this skill directory. It requires Node 22 or newer. No model API credentials or package installation are needed.

1. Inspect `node <plugin-root>/dist/cli.mjs status` and `list`. Preserve existing schedules. An explicit `--store <absolute-directory>` isolates a project; otherwise both providers use `AGENT_SCHEDULER_HOME` or the user's default local store.
2. Turn the user's authorized task into a schedule JSON file using [the schema](../../docs/schedules.md). Set a finite `maxRuns` and `expiresAt`. Use one schedule per monitored worker, with the supervisor as the delivery destination. Confirm missing time/timezone or destination identity when it affects delivery. Scheduling never grants new permissions for the future prompt.
3. Prefer `codex-queue` for an existing Codex thread. Resolve its UUID and its actual credential home; never create another model session or change its account. A queue acceptance does not prove processing. For cmux, use exact workspace/surface UUIDs. For tmux, use the explicit server socket path and exact pane ID. Terminal input is intended for a dedicated receiver: do not append to a user's unfinished prompt or inject into an unrelated shell. Newlines are flattened and control characters are rejected.
4. Register with `node <plugin-root>/dist/cli.mjs put <file>`, then `start` if the daemon is absent. Read back `list` and `status`; report the schedule ID, destination, next time, expiry, and whether the daemon started. A wake starts a real agent turn and can consume model quota; ordinary timer ticks do not.
5. Use `pause ID`, `resume ID`, or `remove ID` for changes. Pause/remove does not recall a delivered prompt. At completion or user-requested stop, remove the relevant schedule and preserve its receipts.

When a receipt is `uncertain` or an `intent` is left after a crash, inspect the native queue/terminal and command effects first. Do not resend or switch transport automatically. Stop the daemon, confirm the owner has exited, then use `resolve ID RUN` to acknowledge without replay. `unlock store|daemon` only removes a lock whose recorded process is absent on this host. Unknown/live owners block recovery. Do not delete locks or edit runtime state manually.

The scheduler only executes declared commands or submits text. It does not decide whether a worker is blocked, claim a merge is complete, or mark tasks done. Use a cheap command target for mechanical checks; wake a supervisor only when model judgment is needed. Keep task-specific decisions in the existing project context.
