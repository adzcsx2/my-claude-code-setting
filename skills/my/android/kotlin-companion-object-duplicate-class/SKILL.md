---
name: kotlin-companion-object-duplicate-class
description: >
  Diagnose and fix kapt duplicate-class errors caused by multiple companion
  object declarations in a single Kotlin class. Kotlin syntax allows it,
  but kapt generates a Companion class per declaration, producing duplicate
  class conflicts at compile time.
category: android
package_type: atom
load_strategy: progressive
context_tier: small
lifecycle: promoted
quality_score: 25
source: realtime
source_session: null
stack_hint: "Kotlin, kapt, Gradle, Android"
tags: [kotlin, kapt, duplicate-class, companion-object, build-error]
default_read_next: PLAYBOOK.md
optional_reads: []
---

# Kotlin Companion Object Duplicate Class

## When to use

Use this package when:
- kapt fails with `duplicate class` errors during `:app:kaptDebugKotlin`
- the error points to a `Companion` class being generated more than once
- bisecting commits shows the failure started after a small change in a
  single Kotlin file
- the failing file is a simple one but the error looks like a build system bug

## When NOT to use

Do not use this package when:
- the duplicate class is about dependency conflicts (multiple JARs with
  same fully-qualified name)
- the error is `DuplicatePlatformClass` (JDK version mismatch)
- the issue appears without kapt (e.g. pure Kotlin compilation)

## Quick routing

- If you see `duplicate class` in kapt logs, in a commit with only
  Kotlin source changes -> read `PLAYBOOK.md` immediately.

## Read next

Read `PLAYBOOK.md`.
