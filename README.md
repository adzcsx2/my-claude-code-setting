# Self-Learning Claude Workspace with ECC

[简体中文](README.zh-CN.md)

This repository is a portable `~/.claude` workspace built around **Everything Claude Code (ECC)** plus a custom **self-learning skill architecture** (`my-skills`).

The goal is not just to store prompts and tools in git. The workspace is designed to:

- observe real project work
- capture reusable bug / root-cause / fix patterns
- turn them into skill candidates automatically
- promote the good ones into a structured, searchable skill library

So instead of solving the same class of bug from scratch every month, the system gradually accumulates reusable knowledge.

## What This Repository Does

This repo serves two roles at once:

1. **Portable Claude Code / ECC workspace** — sync it to another machine and get the same agents, skills, hooks, commands, and plugin assets.
2. **Self-learning knowledge architecture** — turn real debugging and implementation work into reusable skills over time.

The second role is the differentiator.

## Core Capabilities

- **ECC operator layer**: production-oriented workflow surface with **60 specialized agents**, **232 skills**, and **75 legacy command shims**
- **Self-learning skill pipeline**: bug discoveries and reusable solutions can be captured, redacted, queued, reviewed, and promoted into `skills/my/`
- **Automatic bug-to-skill summarization**: observe-only hooks watch for strong signals such as root cause, fixed, and resolved, then write bounded runtime candidate artifacts
- **Historical backfill**: `/my-backfill` can turn old transcripts into draft skill candidates
- **Controlled promotion and rollback**: `/my-promote` writes official packages, rebuilds indexes, and `/my-undo` can roll back a bounded run
- **Retrieval and staged loading**: find the right skill without loading too much context
- **Cross-machine portability**: portable source stays in git; machine-specific runtime state is excluded via `.gitignore`

## Self-Learning Architecture

The self-learning layer is implemented as `my-skills`.

### High-level flow

```text
Project work
  -> hooks observe useful signals
  -> redact and summarize
  -> write runtime candidates
  -> review / refine
  -> promote into official skills
  -> rebuild indexes
  -> retrieve later when similar problems appear
```

### What gets learned

Typical candidates include:

- a recurring bug with a non-obvious root cause
- a project-specific debugging pattern worth preserving
- a workflow that required multiple failed attempts before the correct fix
- an integration or architecture pattern that should become reusable

### What "automatic skill generation" means here

The system already supports:

- **automatic candidate generation** from live sessions
- **automatic bug summarization into runtime candidates**
- **automatic draft generation from historical transcripts via `/my-backfill`**

It does **not** blindly write every observation into the official skill library.

Current boundaries:

- hooks **automatically** observe and write runtime candidate artifacts
- backfill **can automatically** generate draft candidates when invoked
- official packages enter `skills/my/` only through **controlled promotion**

So the system is self-learning, but not recklessly self-publishing.

## How It Works

### 1. Observe

Local hooks, especially `PostToolUse` and `Stop`, watch for reusable debugging signals.

Examples:

- `root cause`
- `fixed`
- `resolved`
- repeated evidence of the same bug/fix pattern

These hooks are **observe-only**. They do not mutate the official skill library directly.

### 2. Redact and summarize

Captured content is redacted before durable runtime writes. The runtime layer stores small summaries and queue artifacts instead of dumping full transcripts into the official skill tree.

### 3. Queue runtime candidates

Candidates are written into:

- `state/my-skills/pending/`
- `state/my-skills/inbox/`
- `state/my-skills/quarantine/`
- `state/my-skills/audit-log.jsonl`

Runtime state stays separate from the official skill library.

### 4. Generate structured skill drafts

Candidates can be turned into structured packages with category, package type, frontmatter, and staged content design:

- `atom` — one high-value bug or root cause
- `cookbook` — related variants
- `capability` — larger workflows or systems
- `router` — topic routing entry

### 5. Promote into the official library

After review, a candidate can be promoted into `skills/my/` through:

- validation
- staging
- lock protection
- mechanical index rebuild
- manifest-based undo support

### 6. Retrieve and load later

When similar work appears again, the system retrieves the right skill and loads only the minimum necessary layers:

1. machine index
2. `SKILL.md`
3. `PLAYBOOK.md` if needed
4. one exact reference/example file if needed

## Example: How A Bug Becomes A Skill

```text
1. You debug an Android state-loss bug and find the real root cause
2. PostToolUse / Stop hooks detect strong reusable signals
3. A redacted candidate is written to state/my-skills/pending/ or inbox/
4. You review the candidate and refine the summary / trigger terms
5. /my-promote writes the package into skills/my/<category>/<slug>/
6. Indexes are rebuilt mechanically
7. Next time a similar bug appears, /my-find or /my-test can retrieve it
```

## Skill Structure

The goal is not "auto-generate more markdown". The goal is to generate skills that remain usable at 10, 50, or 100+ packages.

- `SKILL.md` — machine entry layer
- `PLAYBOOK.md` — core execution layer
- `references/` — fact-heavy deep material
- `examples/` — optional example layer
- `README.zh-CN.md` — human-facing maintenance layer

## Repository Layout

- `agents/` — specialized subagents and orchestration surfaces
- `skills/` — reusable skill packages, including ECC skills and personal additions
- `commands/` — command entrypoints and compatibility shims
- `hooks/` — Claude hook wiring and runtime automation entrypoints
- `scripts/` — local utilities and workflow automation helpers
- `rules/` — always-on guidance and operating constraints
- `plans/` — architecture notes, execution docs, and handoff documents
- `plugins/` — marketplace plugin sources and portable plugin assets
- `mcp-configs/` — MCP-related configuration
- `state/` — runtime state, queues, logs, manifests, and local operational artifacts

## Quick Start

### Setup on a new machine

1. Sync or clone this repository into `~/.claude`
2. Start Claude Code with your own local credentials and transport settings
3. Keep portable content in git; let `.gitignore` exclude local runtime state

### Day-to-day usage

#### A. Normal coding with passive learning

Work normally. As you debug and solve problems, observe-only hooks can capture reusable signals and write candidate artifacts into runtime state.

#### B. Retrieval and inspection

- `/my-test` — test retrieval only
- `/my-explain` — explain why a skill matched
- `/my-simulate-load` — simulate staged loading and context cost
- `/my-find` — search skills manually

#### C. Candidate review and promotion

- `/my-backfill` — generate candidates from historical transcripts
- `/my-promote` — promote a reviewed candidate into `skills/my/`
- `/my-undo` — undo a bounded promote run
- `/my-review` / `/my-health` / `/my-context-audit` / `/my-lint-skill` — governance and maintenance

Example:

```bash
node ~/.claude/scripts/my-skills/backfill.js --limit 5 --dry-run
node ~/.claude/scripts/my-skills/backfill.js --limit 5 --write-queue --queue inbox
node ~/.claude/scripts/my-skills/promote.js "<candidate path or id>" --dry-run
node ~/.claude/scripts/my-skills/promote.js "<candidate path or id>"
```

## Current Implementation Status

The main `my-skills` milestones are already completed through:

- foundation contracts
- root scaffolding and indexes
- seed package validation
- retrieval bootstrap
- command layer
- observe-only hook mode
- backfill and controlled promotion

That means the workspace already has:

- a working runtime state model
- observe-only capture hooks
- backfill support
- controlled promotion
- mechanical index rebuild
- manifest-based undo

## Related Files

- `plans/my-skills-architecture-v0.4.md` — main architecture spec
- `plans/my-skills-execution.md` — execution status and milestone history
- `skills/my/_meta/observe-hooks.v1.md` — observe-only hook contract
- `AGENTS.md` — concise agent-facing instructions
- `CLAUDE.md` — personal operating principles and workflow defaults
- `plugin.json` — plugin manifest metadata
- `marketplace.json` — marketplace packaging metadata
- `PLUGIN_SCHEMA_NOTES.md` — plugin manifest validation edge cases
