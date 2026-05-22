# Observe Hooks v1

## Purpose

Define the observe-only hook behavior for the current local hook surface.

This contract is specifically for:

- `PostToolUse`
- `Stop`

It does **not** assume a prompt-submit hook exists.

Related references:

- `load-contract.md`
- `redaction.v1.md`
- `lifecycle.md`
- `plans/my-skills-hook-adaptation.md`

---

## Observe-Only Principle

Observe hooks may:

- log events
- write queue artifacts
- summarize candidates

Observe hooks may NOT:

- create official Skill packages
- mutate official indexes
- change lifecycle in official packages
- commit to git

---

## Supported Hook Roles

### `PostToolUse`

Use for:

- low-cost signal capture
- candidate hint accumulation
- governance event observation

### `Stop`

Use for:

- bounded session summary
- queue artifact emission
- append-only audit logging

---

## Runtime Output Targets

Allowed write targets:

- `~/.claude/state/my-skills/pending/`
- `~/.claude/state/my-skills/inbox/`
- `~/.claude/state/my-skills/quarantine/`
- `~/.claude/state/my-skills/audit-log.jsonl`

Disallowed write targets:

- `~/.claude/skills/my/**`
- official indexes under `skills/my/`

---

## Event Types

### `candidate_hint`

Use when:

- a session appears to contain a reusable problem/solution pattern

Suggested fields:

```json
{
  "event": "candidate_hint",
  "ts": "2026-05-22T10:00:00Z",
  "source": "posttooluse",
  "tool_name": "ReadFile",
  "signal_terms": ["root cause", "state loss"],
  "confidence": "low|medium|high",
  "session_ref": "<optional session/transcript reference>",
  "notes": "short summary"
}
```

### `retrieval_miss`

Use when:

- a command-driven retrieval flow strongly suggests something should match but does not

Suggested fields:

```json
{
  "event": "retrieval_miss",
  "ts": "2026-05-22T10:00:00Z",
  "query": "foldable stale fragment after rotate",
  "normalized_terms": ["foldable", "fragment", "rotate"],
  "notes": "no confident my/ match"
}
```

### `negative_feedback`

Use when:

- a matched package appears to mislead or fail

Suggested fields:

```json
{
  "event": "negative_feedback",
  "ts": "2026-05-22T10:00:00Z",
  "slug": "universal/my-skills-retrieval-bootstrap",
  "reason": "wrong package selected",
  "severity": "low|medium|high"
}
```

### `load_trace`

Use when:

- `/my-simulate-load` is run
- staged expansion needs debugging

Suggested fields:

```json
{
  "event": "load_trace",
  "ts": "2026-05-22T10:00:00Z",
  "query": "retrieval reads too much context",
  "candidates": ["slug-a", "slug-b"],
  "selected": "slug-a",
  "stage2": "PLAYBOOK.md",
  "stage3": null,
  "stop_reason": "sufficient plan"
}
```

---

## Queue Artifact Shapes

### `pending/*.json`

This is the short-lived handoff artifact.

Suggested shape:

```json
{
  "kind": "pending-candidate",
  "created_at": "2026-05-22T10:00:00Z",
  "source": "stop",
  "summary": "short redacted summary",
  "signal_terms": ["root cause", "fragment"],
  "stack_hint": "Android",
  "confidence": "medium"
}
```

### `inbox/*.json`

Use for candidates worth review.

Suggested shape:

```json
{
  "kind": "inbox-candidate",
  "created_at": "2026-05-22T10:00:00Z",
  "summary": "short redacted summary",
  "proposed_category": "android",
  "proposed_package_type": "atom",
  "source": "realtime",
  "quality_score": null,
  "notes": []
}
```

### `quarantine/*.json`

Use for risky or low-confidence candidates.

Suggested shape:

```json
{
  "kind": "quarantine-candidate",
  "created_at": "2026-05-22T10:00:00Z",
  "summary": "short redacted summary",
  "risk_flags": ["sensitive-content", "low-confidence"],
  "notes": []
}
```

---

## Redaction Rule

All observe-hook outputs must already be redacted before writing.

If redaction confidence is low:

- write to `quarantine/`, or
- drop the artifact

Do not write raw excerpts first and clean them later.

---

## Stop-Time Behavior

Recommended Stop behavior:

1. collect accumulated hints
2. reduce them to a bounded redacted summary
3. write at most one or a few small queue artifacts
4. append compact audit-log events

Avoid:

- long transcript dumps
- large candidate files
- promotion attempts

---

## Invariants

1. Observe hooks are append-only or queue-only.
2. Official package mutation belongs to commands, not observe hooks.
3. Runtime queue files must stay small and redacted.
4. If confidence is unclear, prefer quarantine or no write.
