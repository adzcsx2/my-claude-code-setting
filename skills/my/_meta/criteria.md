# Criteria

## Purpose

Define the admission criteria for what deserves to become a personal Skill.

This file prevents low-value, one-off, or obvious fixes from bloating `skills/my/`.

---

## Gate A: Must Pass All

### A1. Non-trivial effort

At least one of:

- took meaningful investigation time
- required multiple failed attempts
- involved non-obvious debugging or synthesis

### A2. Non-obvious root cause

Reject if it is mainly:

- typo
- missing import
- forgot to restart
- routine dependency reinstall

### A3. Reusable

The pattern should plausibly happen again.

Reject if it is mainly:

- one-off data corruption
- user-specific temporary state
- environment-only noise with no reusable lesson

---

## Gate B: Must Pass At Least One

- hard to search directly
- has meaningful failed paths worth preserving
- spans multiple layers/tools/components
- correct fix is counterintuitive
- would likely be re-solved from scratch if not captured

---

## Typical Rejects

- "forgot import"
- "restart fixed it"
- "delete lockfile and reinstall"
- "single user data row was bad"
- "solved in minutes with no reusable insight"

---

## Preferred Accepts

- one root cause with clear trigger conditions
- strong symptom-to-fix mapping
- reusable negative lesson
- can be encoded as `atom`, `cookbook`, `capability`, or `router`

---

## Notes

Passing criteria means "worth capturing", not "safe to promote".

Promotion still requires:

- redaction
- scoring
- self-review
- lifecycle assignment
