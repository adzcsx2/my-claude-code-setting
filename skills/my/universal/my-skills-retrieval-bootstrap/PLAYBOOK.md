# Playbook: My Skills Retrieval Bootstrap

## Goal

Validate that the personal `my-skills` system can:

1. retrieve candidate packages from machine indexes
2. choose one package for staged expansion
3. stop before context usage becomes wasteful

## Decision path

- If nothing matches -> inspect index coverage first
- If too many things match -> tighten ranking and trigger terms
- If the right package matches but too much content loads -> inspect Stage 2/3 boundaries
- If a backfill package dominates unfairly -> inspect lifecycle/source penalties

## Steps

1. Pick one realistic test prompt, not an abstract package name.
2. Confirm Stage 0 should only need `INDEX.json` and `ERROR-INDEX.json`.
3. Verify top candidates by slug and one-line reason only.
4. Expand only the best candidate's `SKILL.md`.
5. If still relevant, expand only `default_read_next`.
6. Read a single reference file only if Stage 2 reveals a concrete missing piece.
7. Stop once there is a sufficient handling plan.

## Common mistakes

- reading package files during Stage 0
- reading multiple packages in Stage 2
- reading an entire `references/` directory "just in case"
- injecting full markdown bodies into the prompt
- using README as runtime context

## Escalate to references when

- the problem is about index field responsibilities
- the problem is about stage boundaries and stop conditions
