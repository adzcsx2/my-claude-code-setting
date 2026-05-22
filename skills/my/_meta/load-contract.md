# Load Contract

## Purpose

Define the exact retrieval and loading behavior for `skills/my/`.

This contract exists so that hooks, commands, prompts, and future scripts all
follow the same staged loading model.

Related contracts:

- `package-types.md`
- `context-budgets.md`
- `scoring.v1.md`
- `lifecycle.md`

---

## Core Invariants

1. Retrieval does not imply full load.
2. The system must prefer the smallest sufficient read path.
3. README files are excluded from retrieval and auto-load.
4. A single prompt expands at most one Skill package by default.
5. `references/` and `examples/` may only be read by exact file path.
6. If relevance is unclear after Stage 1, stop and do not expand further.

---

## Data Sources

### Machine-Readable Sources

- `INDEX.json`
- `ERROR-INDEX.json`

### Human-Readable Sources

- `INDEX.md`
- `ERROR-INDEX.md`

### Package Files

- `SKILL.md`
- `PLAYBOOK.md`
- `references/*.md`
- `examples/*.md`
- `README.zh-CN.md` (human only; excluded from auto-load)

---

## Staged Loading Model

### Stage 0: Retrieval

#### Inputs

- latest user prompt
- optional error snippet / stack trace

#### Allowed Reads

- `INDEX.json`
- `ERROR-INDEX.json`

#### Actions

1. normalize the user prompt
2. extract keywords
3. extract error fingerprints when present
4. score candidate slugs from machine indexes
5. return top-N candidates

#### Output

For each candidate:

- slug
- one-line reason
- source hint if `source: backfill`

#### Forbidden

- reading `SKILL.md`
- reading `PLAYBOOK.md`
- reading any `reference` or `examples`
- injecting markdown bodies

---

### Stage 1: Entry Validation

#### Allowed Reads

- `SKILL.md` of top-N candidates

#### Goal

Decide which single package, if any, deserves expansion.

#### Entry Validation Checklist

For each candidate, verify:

1. scope match
2. trigger-term match
3. "When NOT to use" does not exclude the prompt
4. package type is compatible with the problem

#### Output

Exactly one of:

- `selected_slug`
- `no_confident_match`

If confidence is low, stop here.

---

### Stage 2: Core Expansion

#### Allowed Reads

- `default_read_next` for the selected package, if not `null`

In most cases this is:

- `PLAYBOOK.md`

#### Goal

Load the minimum core procedure needed to act.

#### Output

- core handling plan
- list of unresolved questions
- list of exact optional follow-up files, if needed

#### Forbidden

- auto-reading all optional files
- reading sibling packages

---

### Stage 3: Targeted Follow-Up

#### Allowed Reads

- one exact file from:
  - `references/*.md`
  - `examples/*.md`

#### Trigger Conditions

Stage 3 is allowed only when Stage 2 explicitly reveals a missing piece such as:

- an edge case
- a parameter/detail lookup
- a known failure mode
- an output pattern that requires examples

#### Output

- one focused supplement to the Stage 2 plan

#### Forbidden

- reading an entire directory
- reading multiple follow-up files without new evidence

---

### Stage 4: Stop Condition

The system MUST stop expansion when:

- a sufficient plan exists
- confidence drops instead of rising
- the next read would be speculative
- context cost starts to exceed value

Default behavior after Stage 3 is stop.

---

## Candidate Ranking Rules

### First-Pass Ranking

Rank `my/` candidates using:

1. exact error fingerprint match
2. normalized keyword overlap
3. category alignment
4. lifecycle preference
5. source penalty for backfill items

### Lifecycle Preference

Prefer:

1. `battle-tested`
2. `verified`
3. `promoted`
4. `candidate`
5. `stale`

Do not select:

- `archived`
- `rejected`

unless explicitly requested for historical inspection.

### Backfill Penalty

If `source: backfill`, lower ranking unless it is the only strong match.

### ECC Fallback

If `my/` has no confident match:

1. log `retrieval_miss`
2. optionally run a second-pass ECC lookup

Do not blend ECC into the first pass by default.

---

## Injection Contract

The retrieval hook may inject:

- selected slug candidates
- one-line match reasons
- one-line warnings such as `source: backfill`

It may NOT inject:

- full skill bodies
- full error index text
- README content
- large examples

Recommended injected shape:

```text
[SYSTEM-INJECTED] Possibly relevant my-skills:
- android/fold-state-loss — matches foldable + stale Fragment + config-change symptoms
- web/hydration-mismatch — matches hydration warning pattern
```

If no good match exists, inject nothing.

---

## Runtime Logging

### Log `retrieval_miss` when:

- prompt strongly resembles a debug/problem request
- no `my/` candidate is confident enough

### Log `load_trace` when:

- `/my-simulate-load` is invoked
- debugging retrieval/load behavior

Suggested `load_trace` fields:

- prompt summary
- candidates considered
- selected slug
- files actually read
- stop stage

---

## Command Integration

### `/my-test <prompt>`

Runs Stage 0 only.

Returns:

- top candidates
- reasons

### `/my-explain <slug>`

Explains:

- why the package tends to match
- what its entry says
- what its next layer would be

### `/my-simulate-load <prompt>`

Runs the staged model in dry-run form.

Returns:

- Stage 0 candidates
- Stage 1 selected package
- Stage 2 chosen file
- Stage 3 optional follow-up
- stop condition

### `/my-context-audit`

Checks whether package structures and runtime paths still obey this contract.

---

## Failure Modes and Responses

### Too Many Candidates

Response:

- tighten Stage 0 ranking
- improve descriptions and trigger terms
- prefer error fingerprints

### Wrong Package Selected

Response:

- use `/my-explain`
- inspect `When NOT to use`
- review `INDEX.json` trigger terms
- add negative feedback if needed

### Package Too Heavy

Response:

- move procedures to `PLAYBOOK.md`
- move facts to `references/`
- downgrade or split package scope

### Repeated Expansion Loops

Response:

- enforce Stage 4 stop
- audit load traces
- reduce optional reads

---

## Non-Goals

This contract intentionally does NOT define:

- embedding/vector retrieval
- semantic graph routing
- automatic multi-package merging at runtime

Those can be added later only if the staged local model becomes clearly insufficient.

For now, the system should stay lexical, staged, cheap, and inspectable.
