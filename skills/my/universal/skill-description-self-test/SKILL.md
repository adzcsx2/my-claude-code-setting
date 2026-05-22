---
name: skill-description-self-test
description: >
  Validate whether a personal Skill can retrieve itself from its own symptoms and
  trigger terms. Use when authoring or reviewing a Skill, or when a package seems
  hard to find through retrieval, prompt matching, or error-keyword lookup.
category: universal
package_type: atom
load_strategy: progressive
context_tier: tiny
lifecycle: promoted
quality_score: 24
source: realtime
source_session: null
stack_hint: "Markdown, retrieval design"
tags: [retrieval, skill-authoring, self-test, indexing]
default_read_next: null
optional_reads: []
---

# Skill Description Self-Test

## When to use

Use this package when:

- a newly written Skill does not seem retrievable
- a package description feels too vague
- retrieval keeps missing a package that should match
- you need a quick authoring sanity check before promotion

## When NOT to use

Do not use this package when:

- the issue is package structure rather than description quality
- the problem is runtime loading after a package has already matched
- the package is failing due to sensitive content or redaction issues

## Quick routing

- If the package is not in the index at all -> rebuild indexes first
- If the package is indexed but never matches -> test its `description` and symptom terms
- If the package matches but loses later -> inspect load stages, not this package

## Read next

None. This is a single-file `atom`.

## Self-test loop

1. Extract 3-6 concrete phrases from the package's real symptom language.
2. Prefer distinctive trigger terms over generic words like "bug", "issue", or "fix".
3. Run `/my-test` with those phrases or a realistic prompt variant.
4. If the package does not appear near the top, tighten the `description`.
5. Re-test until the package can reliably retrieve itself from its own intended trigger language.

## Good trigger terms

- exact error class or warning phrase
- concrete platform signal
- distinctive symptom wording
- one or two nearby variant phrasings

## Bad trigger terms

- generic words shared by many packages
- implementation details users would never say
- long narrative text instead of crisp symptom phrases
