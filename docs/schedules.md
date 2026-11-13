# Schedule and execution contract

The local store contains `schedules/<id>.json` definitions, `state/<id>.json` execution budgets and pending intents, and `runs/<run-id>.json` receipts. Only definitions are user-editable. CLI updates are validated and atomic. The daemon loads definitions each second; direct new interval/cron files establish their first due time when first observed. A malformed definition fails the tick visibly and leaves all files intact.

```json
{
  "schemaVersion": 1,
  "id": "worker-watch",
  "enabled": true,
  "trigger": { "everyMs": 300000 },
  "target": {
    "type": "codex-queue",
    "thread": "12345678-1234-1234-1234-123456789abc",
    "home": "/absolute/provider-home",
    "prompt": "Check the assigned worker. Act on blockers or completion; leave healthy work running."
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

```json
{"type":"cmux","workspace":"12345678-1234-1234-1234-123456789abc","surface":"12345678-1234-1234-1234-123456789abd","prompt":"Check the assigned worker."}
```

Resolve UUIDs with `cmux --id-format uuids tree --all`. Short refs are rejected. cmux must be running and accessible from the daemon's environment.

```json
{"type":"tmux","socket":"/absolute/tmux-socket","pane":"%3","prompt":"Check the assigned worker."}
```

Resolve the socket with `tmux display-message -p '#{socket_path}'` and pane IDs with `tmux list-panes -a -F '#{pane_id}'`. An explicit socket isolates servers with the same pane IDs. Terminal destinations are dedicated receivers; do not use a pane after replacing its process. Stop/remove the schedule before closing or repurposing a receiver. Generic terminal submission cannot prove that the text belongs to the same model conversation or that a model turn started.

```json
{"type":"codex-queue","thread":"12345678-1234-1234-1234-123456789abc","home":"/absolute/provider-home","prompt":"Check the assigned worker."}
```

Uses `codex queue --thread ... --message ...` in the declared home. The existing thread retains its model/account. No `exec`, `resume`, replacement session, remote API, or model process fallback is started. Verify native consumption separately. Use cmux/tmux only when terminal wake is the intended delivery route.

## Concurrency and recovery

One daemon owns a store. CLI mutations and dispatch claims take a short exclusive store lock. Multiple definitions cannot dispatch to the same normalized target while a run is pending. This bounds concurrent transport/command execution; it does not detect a model still processing previously accepted text. Use a suitable interval/cooldown and the supervisor's own work state to avoid accumulating prompts.

Every external attempt has a durable intent and budget claim before execution. Receipts distinguish `succeeded` (command exited zero), `transport-accepted` (text submitted only), `uncertain` (effect may have occurred), and `resolved-no-replay`. Terminal partial failures stay uncertain. Crash leftovers remain pending, including a command that may have finished before its receipt was persisted. There is no exactly-once delivery claim or automatic retry of ambiguous effects.

`stop` requests graceful shutdown through a file. Shutdown aborts in-flight child process groups; it cannot recall accepted prompts. Restart the daemon with `start`. Following an abrupt crash, inspect `status` and native effects; `unlock daemon`/`unlock store` requires an absent recorded PID on this host. A live reused PID or missing owner blocks automatic unlock. Then acknowledge uncertain receipts using `resolve ID RUN`; this never replays the old occurrence. Do not change state files to manufacture success.

Definitions, receipts, locks and daemon logs are local user data and are not synchronized to GitHub or either provider. The default store is `~/.local/state/agent-scheduler`; select `AGENT_SCHEDULER_HOME` or `--store` for isolation. The computer must remain running. The foreground `serve` process or detached `start` daemon must remain running; this release does not install login/startup services.
