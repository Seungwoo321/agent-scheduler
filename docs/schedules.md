# Schedule and execution contract

The local store contains `schedules/<id>.json` definitions, `state/<id>.json` execution budgets and pending intents, and `runs/<run-id>.json` receipts. Only definitions are user-editable. CLI updates are validated and atomic. The daemon loads definitions each second; direct new interval/cron files establish their first due time when first observed. A malformed definition fails the tick visibly and leaves all files intact.

```json
{
  "schemaVersion": 1,
  "id": "worker-watch",
  "enabled": true,
  "trigger": { "everyMs": 300000 },
  "target": {
    "type": "cmux",
    "workspace": "12345678-1234-1234-1234-123456789abc",
    "surface": "12345678-1234-1234-1234-123456789abd",
    "mode": "prompt",
    "prompt": "Supervise the AIRS-9300 implementation session in workspace 126: read its screen, unit and git state. Leave it alone while it is progressing; if it is stopped, asking a question or failing, tell it the next step within the already approved scope."
  },
  "maxRuns": 12,
  "expiresAt": "2027-01-01T09:00:00Z",
  "timeoutMs": 30000,
  "cooldownMs": 300000
}
```

Exactly one trigger is present:

| Trigger | Meaning |
| --- | --- |
| `{"at":"2027-01-01T00:00:00Z"}` | One dispatch, including a past due time if not expired |
| `{"everyMs":300000}` | Interval of at least one second |
| `{"cron":{"expression":"*/5 * * * *","timezone":"Asia/Seoul"}}` | Cron expression interpreted by bundled Croner, with an explicit IANA timezone |

The daemon coalesces missed interval/cron occurrences into one dispatch. It schedules the next occurrence from the current clock, rather than replaying a backlog after sleep. It preserves budgets when a definition is replaced. Set `maxRuns` to the desired total across replacements. One-shot schedules do not repeat even if `maxRuns` exceeds one. `expiresAt` and `maxRuns` are mandatory; attempts consume budget before effects, including uncertain attempts. `timeoutMs` is between 100 and 900000 milliseconds.

Targets:

```json
{"type":"command","argv":["/usr/bin/true"],"cwd":"/absolute/project"}
```

Commands execute without a shell. Shell syntax is literal unless the user explicitly selects a shell as the command. Commands inherit the daemon's environment; store secrets in the host credential system, not definitions. Command output is bounded in memory and not written into receipts.

Terminal targets deliver to a coding agent session through the terminal manager it runs in. The scheduler does not depend on which agent CLI (Claude Code, Codex or another) is running there, or on whether that agent has its own scheduling feature: every terminal target follows the same contract. Before any input, the receiver is verified: the exact terminal must exist and a coding agent must still be running in it. If the check fails, nothing is typed and the receipt is `not-delivered`. When the receiver is absent (terminal or workspace gone, no agent, or a different agent process) the receipt sets `receiverGone` and the daemon pauses the schedule. When the check itself fails (daemon shutdown, timeout, terminal manager not running) the schedule stays enabled and runs at its next occurrence. A passing check is followed by the literal prompt (newlines flattened, control characters rejected) and Enter.

```json
{"type":"cmux","workspace":"12345678-1234-1234-1234-123456789abc","surface":"12345678-1234-1234-1234-123456789abd","prompt":"…"}
```

Resolve UUIDs with `cmux --id-format uuids tree --all` or `agent-scheduler terminals`. Short refs are rejected. A live agent means a cmux agent-hook session record on the surface whose recorded process still exists. The optional `agent` field (`{"pid": 4242, "startedAt": "<ps lstart in the C locale>"}`) binds the schedule to that agent process, whether Claude Code or Codex; `terminals` and the management page fill it in for cmux. `/clear` and `/resume` keep the process, so a bound schedule keeps its receiver; it is delivered only while that exact process runs on the surface. `agent` is accepted only for cmux targets. cmux must be running and accessible from the daemon's environment.

```json
{"type":"orca","terminal":"<runtime-issued handle>","prompt":"…"}
```

Resolve the handle with `orca terminal list --json` or `agent-scheduler terminals`. Handles are scoped to the Orca runtime: after an Orca restart the old handle fails verification and the schedule pauses; register the replacement handle. A live agent means Orca reports an agent identity for the terminal. Delivery uses `orca terminal send --enter`.

```json
{"type":"tmux","socket":"/absolute/tmux-socket","pane":"%3","prompt":"…"}
```

Resolve the socket with `tmux display-message -p '#{socket_path}'` and pane IDs with `tmux list-panes -a -F '#{pane_id}'`. An explicit socket isolates servers with the same pane IDs. A shell in the foreground of the pane means the agent has exited.

`mode` is optional. `prompt` (default) delivers the text as one turn. `goal` delivers `/goal <prompt>`, which Claude Code and Codex both accept: the session keeps working until the stated condition holds, replacing any goal already set in that session. Choose `goal` only for an objective with a verifiable completion condition; recurring goal schedules re-set the goal on every run.

The prompt is the human-readable instruction the receiving session acts on. Write it at registration from the actual context: the goal, what to inspect, the completion criteria, what to do when blocked, and the limits of the authorized scope. It is stored verbatim in the definition and in every run receipt, so the delivered text is always reviewable. Do not generate prompts in wrapper scripts or append opaque markers.

Terminal destinations are dedicated receivers. Generic terminal submission cannot prove that the text reached the intended model conversation or that a model turn started.

## Session end

Each plugin installs a `SessionEnd` hook (Claude Code and Codex) that runs `agent-scheduler session-end` with the hook input on stdin. Reasons `clear` and `resume` keep the agent running in the terminal and are ignored. Otherwise the command identifies the terminal it runs in from `CMUX_WORKSPACE_ID`/`CMUX_SURFACE_ID`, `TMUX`/`TMUX_PANE`, or `ORCA_PANE_KEY`, and removes the schedules in the default store (`AGENT_SCHEDULER_HOME` when set) addressed to that terminal. A schedule bound to an `agent` is removed only when the hook's `session_id` resolves (through cmux session records) to that same agent process, so another agent process ending in the same terminal does not remove it. Unbound schedules (Orca, tmux) are removed by terminal match, so a child agent process ending in the same terminal also removes them. A schedule with a pending run is paused instead, so its receipt can be inspected first. Receipts are kept. Schedules in an explicit `--store` are not cleaned by the hook; the daemon still pauses them when the receiver is gone.

## Management page

`agent-scheduler ui [--port N]` serves a page on `127.0.0.1` and prints its URL with a one-time access token. It lists schedules, state and recent receipts; registers and edits terminal schedules by choosing a receiver from the listed terminals, with the receiver's recent screen as context for writing the prompt; and pauses, resumes and deletes any schedule. Command targets execute arbitrary programs, so they are registered and edited only with the CLI. API requests require the token and a loopback `Host` header.

## Concurrency and recovery

One daemon owns a store. CLI mutations and dispatch claims take a short exclusive store lock. Multiple definitions cannot dispatch to the same normalized target while a run is pending. This bounds concurrent transport/command execution; it does not detect a model still processing previously accepted text. Use a suitable interval/cooldown and the supervisor's own work state to avoid accumulating prompts.

Every external attempt has a durable intent and budget claim before execution. Receipts distinguish `succeeded` (command exited zero), `transport-accepted` (text submitted only), `not-delivered` (receiver check failed before input; paused when `receiverGone`), `uncertain` (effect may have occurred), and `resolved-no-replay`. Editing a one-shot schedule that already ran does not re-arm it unless its `at` moves past the last run. Terminal partial failures stay uncertain. Crash leftovers remain pending, including a command that may have finished before its receipt was persisted. There is no exactly-once delivery claim or automatic retry of ambiguous effects.

`stop` requests graceful shutdown through a file. Shutdown aborts in-flight child process groups; it cannot recall accepted prompts. Restart the daemon with `start`. Following an abrupt crash, inspect `status` and native effects; `unlock daemon`/`unlock store` requires an absent recorded PID on this host. A live reused PID or missing owner blocks automatic unlock. Then acknowledge uncertain receipts using `resolve ID RUN`; this never replays the old occurrence. Do not change state files to manufacture success.

Definitions, receipts, locks and daemon logs are local user data and are not synchronized to GitHub or either provider. The default store is `~/.local/state/agent-scheduler`; select `AGENT_SCHEDULER_HOME` or `--store` for isolation. The computer must remain running. The foreground `serve` process or detached `start` daemon must remain running; this release does not install login/startup services.
