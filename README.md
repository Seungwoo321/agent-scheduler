# Agent Scheduler

A standalone, file-based scheduler for local commands and prompts to existing agent sessions. Claude Code and Codex plugins use the same Node.js engine and local schedule files. No model API, relay, database, HTTP service, or other agent plugin is required.

Timer ticks do not use model tokens. Delivered prompts can start real model work and consume quota. Use a small command for mechanical checks and wake a supervisor when judgment is needed.

## Install

Requires Node.js 22 or newer, plus the executable for the selected target (`cmux`, `tmux`, or `codex`). Command schedules work without a terminal manager.

Claude Code:

```sh
claude plugin marketplace add Seungwoo321/agent-scheduler
claude plugin install agent-scheduler@agent-scheduler
```

Invoke `/agent-scheduler:schedule` or ask to schedule a task. Restart the session or reload plugins if the skill is not visible.

Codex:

```sh
codex plugin marketplace add Seungwoo321/agent-scheduler
codex plugin add agent-scheduler@agent-scheduler
```

Start a new Codex session to discover the plugin's `schedule` skill. Both providers install a bundled runtime and require no dependency installation inside the plugin folder.

Standalone CLI from a [GitHub release](https://github.com/Seungwoo321/agent-scheduler/releases):

```sh
npm install -g ./seungwoo321-agent-scheduler-0.1.0.tgz
agent-scheduler --help
```

The package is distributed as a GitHub release asset; npm registry publication is not required. Verify the downloaded asset against the release's `SHA256SUMS`.

## Schedule a command

Save `schedule.json` with a future expiry and paths appropriate for your computer:

```json
{
  "schemaVersion": 1,
  "id": "local-check",
  "enabled": true,
  "trigger": { "everyMs": 300000 },
  "target": {
    "type": "command",
    "argv": ["/usr/bin/true"],
    "cwd": "/tmp"
  },
  "maxRuns": 12,
  "expiresAt": "2027-01-01T09:00:00Z",
  "timeoutMs": 30000
}
```

```sh
agent-scheduler put schedule.json
agent-scheduler start
agent-scheduler list
agent-scheduler history
agent-scheduler pause local-check
agent-scheduler remove local-check
agent-scheduler stop
```

The plugin skill runs these commands with `node <installed-plugin>/dist/cli.mjs`. Use `--store /absolute/path` or `AGENT_SCHEDULER_HOME` to isolate a project. The default is `~/.local/state/agent-scheduler`. `serve` runs in the foreground; `start` runs detached. The computer and daemon must remain running; no login service is installed automatically.

## Targets

| Target | Delivery | Acknowledgment |
| --- | --- | --- |
| `command` | Executable and argument array, no shell | Command exited zero |
| `cmux` | Literal text RPC to workspace/surface UUID, then Enter | Transport accepted |
| `tmux` | Literal text to an exact pane, then Enter | Transport accepted |
| `codex-queue` | Existing thread in its declared credential home | Queue accepted |

Transport acceptance does **not** prove a model turn started or finished. Terminal targets need dedicated receivers: do not target unfinished user input or a pane whose process has been replaced. Codex queueing never creates a replacement model session. The engine does not judge tasks, merge PRs, or mark work complete.

## Reliability

One-shot timestamps, intervals, and cron with explicit timezones are supported. Each schedule has a finite run budget and expiry. Missed recurring occurrences coalesce into one execution. One daemon owns each store; pending execution is serialized per destination. An intent and execution budget are persisted before effects, with the exact claimed definition retained in the receipt.

Ambiguous submission or a process crash leaves the run pending without automatic replay. Inspect actual effects, stop the owner, and acknowledge using `resolve ID RUN`. Failed commands are conservatively uncertain because they may have produced effects. Lock recovery rejects live/unknown owners. This provides at-most-once automatic attempts, not exactly-once external effects.

See [the schema and recovery contract](docs/schedules.md) and [release verification](docs/verification.md).

## Develop

```sh
npm ci
npm run lint
npm test
npm run build
```

Source lives in `src/`; `dist/cli.mjs` is a self-contained esbuild bundle with Croner. Node's built-in test runner covers persistence, timing, concurrent dispatch, literal input, uncertain effects, and process-tree termination.

MIT licensed. Croner's license is included in `dist/CRONER-LICENSE`.
