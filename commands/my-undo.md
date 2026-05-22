---
description: Undo a my-skills promotion or indexed write by run id or manifest record.
argument-hint: "[run-id | manifest path]"
---

# My Undo

Undo a bounded `my-skills` write operation using manifest history.

## Goal

Reverse a promotion or other official write safely without manually guessing which
files changed.

## Required Reads

- `~/.claude/state/my-skills/manifests/`
- relevant official package paths
- official indexes

## Supported Undo Targets

- one promotion run
- one backfill promotion run
- one index rebuild side effect if represented in a manifest

## Procedure

1. Resolve the run id or manifest.
2. Inspect:
   - created files
   - updated files
   - deleted/archived targets if any
3. Explain the undo plan before performing it.
4. Reverse the bounded changes.
5. Restore the manifest's pre-run index snapshots.

## Ordering Note

Current undo is snapshot-based, not arbitrary-history-aware.

That means it is safest when used to roll back the most recent bounded promote run.
If you need out-of-order historical undo, review current official packages first and
rebuild indexes after the rollback.

## Runtime Helper

Use the manifest-driven helper when you need a bounded undo:

```bash
node ~/.claude/scripts/my-skills/undo.js "<run-id or manifest path>" --dry-run
```

Execute the undo after review:

```bash
node ~/.claude/scripts/my-skills/undo.js "<run-id or manifest path>"
```

## Do Not

- Do not use destructive git commands as the primary undo path
- Do not guess without a manifest

## Output Format

```markdown
# My Undo

## Target
<run-id or manifest>

## Undo Plan
- <change 1>
- <change 2>

## Result
<completed or blocked>
```
