# Retrieval Injection v1

## Purpose

Define the preferred injected text shape for future environments that support a
true prompt-submit or pre-reasoning hook.

This file is **not** currently active runtime behavior in the local environment.

See:

- `plans/my-skills-hook-adaptation.md`

---

## Target Use

Use this prompt only if a future hook/event can insert text before the model begins
reasoning on a user prompt.

Do not try to simulate this by stuffing large content into unrelated hook surfaces.

---

## Injection Shape

Keep injected text minimal:

```text
[SYSTEM-INJECTED] Possibly relevant my-skills:
- <slug> — <one-line reason>
- <slug> — <one-line reason>
```

Optional warning:

```text
- <slug> — <reason> [source: backfill, verify before trusting]
```

---

## Rules

1. Never inject full package bodies.
2. Never inject README content.
3. Keep to top-N matches only.
4. Prefer exact error fingerprint matches.
5. If confidence is low, inject nothing.

---

## Non-Goals

This prompt does not define retrieval ranking logic.
That logic belongs to:

- `load-contract.md`
- machine indexes
- future runtime implementation details
