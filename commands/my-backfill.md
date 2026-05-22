---
description: Backfill candidate packages from historical transcripts into runtime queues without touching the official my-skills package set by default.
argument-hint: "[--source <file|dir>] [--limit <n> | --from <YYYY-MM-DD> --to <YYYY-MM-DD>] [--dry-run] [--write-queue] [--queue inbox|quarantine]"
---

# My Backfill

Generate reviewable `my-skills` candidates from historical transcripts using a dry-run-first workflow.

## Goal

Produce bounded backfill candidates that can improve retrieval coverage without polluting the official package tree.

## Required Reads

- `~/.claude/skills/my/_meta/criteria.md`
- `~/.claude/skills/my/_meta/redaction.v1.md`
- `~/.claude/skills/my/_meta/lifecycle.md`
- `~/.claude/state/my-skills/backfill/`
- source transcript file(s) or directory

## Runtime Helper

Use the executable helper when you want deterministic backfill behavior:

```bash
node ~/.claude/scripts/my-skills/backfill.js --limit 5 --dry-run
```

Queue reviewed candidates without promoting them:

```bash
node ~/.claude/scripts/my-skills/backfill.js --limit 5 --write-queue --queue inbox
```

## Guardrails

1. Default to `--dry-run`.
2. Require either `--limit` or a date range.
3. Write only to runtime state unless a later explicit promote step is invoked.
4. Mark queued candidates as `source: backfill`.
5. Do not create official packages directly from backfill.

## Procedure

1. Select a bounded transcript source.
2. Generate backfill candidates and review the dry-run report.
3. If the candidates look safe, write them to `inbox/` or `quarantine/`.
4. Review and refine queued drafts before any promotion.
5. Promote separately with `/my-promote`.

## Output Format

```markdown
# My Backfill

## Source
<file or directory>

## Dry Run
- scanned: <n>
- candidates: <n>

## Queue Writes
- <if any>

## Result
<completed or blocked>
```
