---
name: my-skills-retrieval-bootstrap
description: >
  Design or debug the retrieval and staged loading path for the personal my-skills
  system. Use when validating INDEX entries, retrieval ranking, load stages,
  prompt injection behavior, or seed package bootstrap.
category: universal
package_type: capability
load_strategy: progressive
context_tier: small
lifecycle: promoted
quality_score: 25
source: realtime
source_session: null
stack_hint: "Markdown, retrieval/load architecture"
tags: [retrieval, load-contract, bootstrap, indexes, prompt-injection]
default_read_next: PLAYBOOK.md
optional_reads:
  - references/index-contract.md
  - references/load-stages.md
---

# My Skills Retrieval Bootstrap

## When to use

Use this package when:

- validating the first retrieval path for `skills/my/`
- checking whether machine indexes are sufficient for Stage 0 retrieval
- debugging why a prompt matched the wrong package
- planning `/my-test`, `/my-explain`, or `/my-simulate-load`

## When NOT to use

Do not use this package when:

- the issue is package admission quality rather than retrieval behavior
- the package already failed due to redaction/sensitivity concerns
- you need a specific business/domain playbook unrelated to the `my-skills` system

## Quick routing

- If the issue is "package cannot be found" -> read `PLAYBOOK.md`, then `references/index-contract.md` if needed
- If the issue is "too much content gets read" -> read `PLAYBOOK.md`, then `references/load-stages.md`
- If the issue is "wrong package selected" -> start with `PLAYBOOK.md` only

## Read next

Read `PLAYBOOK.md`.
