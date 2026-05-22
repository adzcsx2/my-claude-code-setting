# Scoring v1

## Purpose

Define the first scoring model for Skill candidates before promotion.

Scoring is used to separate:

- obvious rejects
- inbox candidates
- quarantine cases
- high-confidence promotion candidates

---

## Score Dimensions

Use 1-5 scoring for each dimension:

1. `novelty_score`
   - how non-generic and non-duplicative this pattern is
2. `reuse_score`
   - how likely future sessions are to benefit
3. `complexity_score`
   - how much real debugging/understanding was required
4. `specificity_score`
   - how precisely symptoms map to the guidance
5. `sensitivity_score`
   - risk of leaking sensitive or overly specific details
6. `confidence_score`
   - confidence that the extracted package is coherent and correct

---

## Interpretation

### High-confidence promote candidate

Typical profile:

- novelty/reuse/specificity/confidence high
- sensitivity controlled

### Inbox candidate

Typical profile:

- promising, but not yet strong enough
- needs manual review or more evidence

### Quarantine candidate

Typical profile:

- sensitive
- low confidence
- structurally weak
- likely to mislead if promoted quickly

---

## v1 Routing Guidance

This version intentionally keeps thresholds simple:

- promote path: high total score and no major redaction concern
- inbox path: middle score band
- quarantine path: low confidence or sensitivity concern

Do not encode brittle numeric magic until more examples exist.

---

## Required Companion Checks

Scoring alone is not enough.

Every candidate must also pass:

- `criteria.md`
- `redaction.v1.md`
- `quality-rubric.md`

---

## Future Calibration

Use `golden-set/` later to calibrate exact thresholds and weighting.

Until calibration exists, prefer conservative routing over aggressive promotion.
