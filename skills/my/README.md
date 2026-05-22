# My Skills

Personal Skills root for trigger-based playbooks, compact capability packages,
and reusable debugging knowledge.

This directory is intended to stay small at the entry layer and grow through
progressive loading rather than large always-loaded documents.

## Purpose

- store high-value personal playbooks
- keep machine-readable indexes for retrieval
- keep package structure consistent across many Skills

## Key Files

- `INDEX.md` — human-readable index
- `ERROR-INDEX.md` — human-readable error fingerprint index
- `INDEX.json` — machine-readable retrieval index
- `ERROR-INDEX.json` — machine-readable error fingerprint index
- `_meta/` — contracts, templates, budgets, lifecycle, and lint rules
- `_reports/` — generated audit/review/backfill reports
- `_archive/` — retired but preserved historical packages

## Package Philosophy

- default to the smallest viable package
- keep `SKILL.md` lean
- add `PLAYBOOK.md` before adding more layers
- add `references/` only for focused fact lookups
- keep `README.zh-CN.md` human-facing only

## Runtime Principle

Retrieval should use machine indexes first, then load only the minimum files
needed to act.
