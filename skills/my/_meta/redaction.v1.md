# Redaction v1

## Purpose

Define the minimum redaction boundary before any candidate text is written to disk.

Redaction is required for:

- realtime observation
- backfill
- promotion
- report generation

---

## Core Rule

Unredacted session excerpts must not be written to durable candidate storage.

Use a two-layer model:

1. **PreWrite redaction** — before writing candidate artifacts
2. **PrePromote review** — before creating official packages

---

## Remove or Replace

Always replace or remove:

- API keys / tokens / secrets
- email addresses
- phone numbers
- IP addresses and internal hosts
- absolute local paths
- customer / company / project identifiers
- personal names when not publicly relevant
- private URLs and internal endpoints

Use placeholders such as:

- `<TOKEN>`
- `<EMAIL>`
- `<PHONE>`
- `<HOST>`
- `<PATH>`
- `<PROJECT>`
- `<PERSON>`

---

## Allowlist Principle

Prefer allowlisting generic technical content rather than trying to blacklist every
sensitive possibility.

Allowed examples:

- public library/framework names
- standard error classes
- generic function or component names when not identifying private systems
- public documentation links
- abstract system descriptions like "a service", "an API", "a worker"

---

## Quarantine Triggers

Send candidate to quarantine when:

- redaction confidence is low
- text still appears to identify a private customer/project/system
- business terminology is too specific to safely preserve

---

## Promotion Rule

If a package cannot be safely generalized, do not promote it.

It may remain:

- in quarantine
- or be rejected entirely

---

## Notes

Regex-only redaction is necessary but not sufficient.
Natural-language review may still be required for Chinese business identifiers and
internal product names.
