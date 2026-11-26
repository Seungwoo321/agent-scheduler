# Agent Scheduler

A standalone, file-based scheduler for local commands and prompts to existing coding agent sessions. Claude Code and Codex plugins use the same Node.js engine and local schedule files. Sessions are woken through the terminal manager they run in (cmux, Orca or tmux), so scheduling, delivery, receiver checks and cleanup behave the same whichever coding agent CLI is running and whether or not it has its own scheduling feature. No model API, relay, database, or other agent plugin is required.

Timer ticks do not use model tokens. Delivered prompts can start real model work and consume quota. Use a small command for mechanical checks and wake a supervisor when judgment is needed.

## Install

Requires Node.js 22 or newer, plus the terminal manager for the selected target (`cmux`, `orca`, or `tmux`). Command schedules work without a terminal manager.

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

Start a new Codex session to discover the plugin's `schedule` skill. Both providers install a bundled runtime and a `SessionEnd` hook, and require no dependency installation inside the plugin folder.

Standalone CLI from a [GitHub release](https://github.com/Seungwoo321/agent-scheduler/releases):

```sh
npm install -g ./seungwoo321-agent-scheduler-0.3.2.tgz
agent-scheduler --help
```

The package is distributed as a GitHub release asset; npm registry publication is not required. Verify the downloaded asset against the release's `SHA256SUMS`.

## Upgrade to 0.3.0

0.3.0 removes `--store`: every session uses the one global store and daemon. Before upgrading, run `list` on the global store and `pause` or `remove` enabled definitions you no longer want: the first `put`, `resume`, `ui` or `start` starts the global daemon, which fires every enabled, unexpired schedule with runs left. Move definitions from any project store into the global store with `put`, stop the project daemons with the old version, then reinstall as below. The daemon no longer inherits the starting session's terminal identity or provider home, so a `command` that needs a provider home must set it in its argv.

## Upgrade from 0.1.0

0.2.0 removes the `codex-queue` target. A remaining `codex-queue` definition fails validation and stops every tick, `list`, the web page and the session-end hook, so remove those first with the 0.1.0 CLI (`agent-scheduler remove ID`; resolve a pending run before removal). Then update the plugin, remove the old cached version, and reload:

```sh
claude plugin marketplace update agent-scheduler
claude plugin update agent-scheduler@agent-scheduler
codex plugin marketplace upgrade agent-scheduler
codex plugin remove agent-scheduler@agent-scheduler
codex plugin add agent-scheduler@agent-scheduler
```

In open Claude Code sessions run `/reload-plugins`; start a new Codex session. Re-register any `codex-queue` schedule as a terminal schedule addressed to the session's cmux, Orca or tmux terminal. A `command` schedule that only wraps a script to type a prompt into a session should also become a terminal schedule, with the prompt written in the definition.

## Wake an agent session

List receivers with their agent, session and working directory, then pick the exact terminal:

```sh
agent-scheduler terminals
```

```json
{
  "schemaVersion": 1,
  "id": "release-watch",
  "enabled": true,
  "trigger": { "cron": { "expression": "*/20 9-19 * * 1-5", "timezone": "Asia/Seoul" } },
  "target": {
    "type": "cmux",
    "workspace": "12345678-1234-1234-1234-123456789abc",
    "surface": "12345678-1234-1234-1234-123456789abd",
    "mode": "prompt",
    "prompt": "Check PR #42: if CI failed, find the cause and fix it within the approved scope; if review comments arrived, address them; if it is green and approved, report that it is ready and stop."
  },
  "maxRuns": 30,
  "expiresAt": "2027-01-01T09:00:00Z",
  "timeoutMs": 30000
}
```

Write the prompt from the actual task context so a person can review what will be delivered: the goal, what to inspect, the completion criteria, what to do when blocked, and the authorized limits. `mode: "goal"` sends `/goal <prompt>` instead, for an objective the session should keep working on until its condition holds; it replaces the session's current goal.

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
agent-scheduler list
agent-scheduler history
agent-scheduler pause local-check
agent-scheduler remove local-check
agent-scheduler stop
```

The plugin skill runs these commands with `node <installed-plugin>/dist/cli.mjs`. Every session, coding agent and provider home on this computer shares one store (`~/.local/state/agent-scheduler`) and one daemon. `put` and `resume` start the daemon when it is absent; it runs detached in the background, independent of the session that started it, until `stop`. `start` starts it explicitly and `serve` runs it in the foreground. The computer must remain running; no login service is installed automatically.

## Targets

| Target | Delivery | Acknowledgment |
| --- | --- | --- |
| `command` | Executable and argument array, no shell | Command exited zero |
| `cmux` | Literal text RPC to workspace/surface UUID, then Enter | Input line cleared after Enter |
| `orca` | `orca terminal send --enter --wait-submit` to a runtime terminal handle | Orca submission or `turn_started` stage |
| `tmux` | Literal text to an exact pane, then Enter | Input line cleared after Enter |

Every terminal target is verified before input: the terminal must exist and a coding agent must still run in it. Otherwise nothing is typed; an absent receiver pauses the schedule, while a failed check (shutdown, timeout) leaves it enabled. Text is typed only when the agent is not working and its input line is empty (cmux and tmux read the cursor row; Orca only reports idleness and cannot see a draft); a busy or drafting receiver skips that occurrence, which still counts toward `maxRuns`. After Enter the submission must be observed, otherwise the run is `uncertain` and is never resent automatically. `mode: "goal"` delivers the prompt as `/goal <prompt>` for Claude Code and Codex alike. When a receiving session ends (not on `/clear` or `/resume`), the plugin's `SessionEnd` hook removes the schedules addressed to its terminal; a cmux schedule bound to its `agent` process is removed only when that process ends.

Prompts are written at registration from the actual task context and stored verbatim, so every delivered instruction is readable in the definition and receipts. Transport acceptance does **not** prove a model turn started or finished. The engine does not judge tasks, merge PRs, or mark work complete.

## Manage on the web

The daemon serves the page at `http://127.0.0.1:47800/`. Print the URL with its access token (starting the daemon if needed):

```sh
agent-scheduler ui
```

The token is stored with the store and stays the same across daemon restarts; only `ui` prints it. If the port is taken, `ui` fails and `status` shows why while scheduling continues. The page has Schedules and Run history tabs and uses the full window width. It lists schedules, their state and recent receipts with the delivered prompt. It registers and edits terminal schedules by choosing a receiver from the running sessions, with the receiver's recent screen as context for writing the prompt, and pauses, resumes and deletes any schedule. Command targets run arbitrary programs, so they are registered and edited only with the CLI. The page supports Korean and English and light, dark or system theme. It listens on loopback only and API calls require the token.

## Reliability

One-shot timestamps, intervals, and cron with explicit timezones are supported. Each schedule has a finite run budget and expiry. Missed recurring occurrences coalesce into one execution. One global daemon owns the store; pending execution is serialized per destination. An intent and execution budget are persisted before effects, with the exact claimed definition retained in the receipt.

Ambiguous submission or a process crash leaves the run pending without automatic replay. Inspect actual effects, stop the owner, and acknowledge using `resolve ID RUN`. Failed commands are conservatively uncertain because they may have produced effects. Lock recovery rejects live/unknown owners. This provides at-most-once automatic attempts, not exactly-once external effects.

See [the schema and recovery contract](docs/schedules.md) and [release verification](docs/verification.md).

## Develop

```sh
npm ci
npm run lint
npm test
npm run build
```

Source lives in `src/`; `dist/cli.mjs` is a self-contained esbuild bundle with Croner. `src/ui.html` is inlined into the bundle at build time. Node's built-in test runner covers persistence, timing, concurrent dispatch, literal input, receiver verification and auto-pause, session-end cleanup, goal delivery, the management API, uncertain effects, and process-tree termination.

MIT licensed. Croner's license is included in `dist/CRONER-LICENSE`.
