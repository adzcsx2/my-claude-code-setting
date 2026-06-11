# Everything Claude Code (ECC) — Agent Instructions

This is a **production-ready AI coding plugin** providing 63 specialized agents, 249 skills, 79 commands, and automated hook workflows for software development.

**Version:** 2.0.0-rc.1

## Core Principles

1. **Agent-First** — Delegate to specialized agents for domain tasks
2. **Test-Driven** — Write tests before implementation, 80%+ coverage required
3. **Security-First** — Never compromise on security; validate all inputs
4. **Immutability** — Always create new objects, never mutate existing ones
5. **Plan Before Execute** — Plan complex features before writing code

## Available Agents

| Agent | Purpose | When to Use |
|-------|---------|-------------|
| planner | Implementation planning | Complex features, refactoring |
| architect | System design and scalability | Architectural decisions |
| tdd-guide | Test-driven development | New features, bug fixes |
| code-reviewer | Code quality and maintainability | After writing/modifying code |
| security-reviewer | Vulnerability detection | Before commits, sensitive code |
| build-error-resolver | Fix build/type errors | When build fails |
| e2e-runner | End-to-end Playwright testing | Critical user flows |
| refactor-cleaner | Dead code cleanup | Code maintenance |
| doc-updater | Documentation and codemaps | Updating docs |
| cpp-reviewer | C/C++ code review | C and C++ projects |
| cpp-build-resolver | C/C++ build errors | C and C++ build failures |
| fsharp-reviewer | F# functional code review | F# projects |
| docs-lookup | Documentation lookup via Context7 | API/docs questions |
| go-reviewer | Go code review | Go projects |
| go-build-resolver | Go build errors | Go build failures |
| kotlin-reviewer | Kotlin code review | Kotlin/Android/KMP projects |
| kotlin-build-resolver | Kotlin/Gradle build errors | Kotlin build failures |
| database-reviewer | PostgreSQL/Supabase specialist | Schema design, query optimization |
| python-reviewer | Python code review | Python projects |
| django-reviewer | Django code review | Django apps, DRF APIs, ORM, migrations |
| django-build-resolver | Django build, migration, and setup errors | Django startup, dependency, migration, collectstatic failures |
| java-reviewer | Java and Spring Boot code review | Java/Spring Boot projects |
| java-build-resolver | Java/Maven/Gradle build errors | Java build failures |
| loop-operator | Autonomous loop execution | Run loops safely, monitor stalls, intervene |
| harness-optimizer | Harness config tuning | Reliability, cost, throughput |
| rust-reviewer | Rust code review | Rust projects |
| rust-build-resolver | Rust build errors | Rust build failures |
| pytorch-build-resolver | PyTorch runtime/CUDA/training errors | PyTorch build/training failures |
| mle-reviewer | Production ML pipeline review | ML pipelines, evals, serving, monitoring, rollback |
| typescript-reviewer | TypeScript/JavaScript code review | TypeScript/JavaScript projects |

## Agent Orchestration

Use agents proactively without user prompt:
- Complex feature requests → **planner**
- Code just written/modified → **code-reviewer**
- Bug fix or new feature → **tdd-guide**
- Architectural decision → **architect**
- Security-sensitive code → **security-reviewer**
- Autonomous loops / loop monitoring → **loop-operator**
- Harness config reliability and cost → **harness-optimizer**

Use parallel execution for independent operations — launch multiple agents simultaneously.

## Security Guidelines

**Before ANY commit:**
- No hardcoded secrets (API keys, passwords, tokens)
- All user inputs validated
- SQL injection prevention (parameterized queries)
- XSS prevention (sanitized HTML)
- CSRF protection enabled
- Authentication/authorization verified
- Rate limiting on all endpoints
- Error messages don't leak sensitive data

**Secret management:** NEVER hardcode secrets. Use environment variables or a secret manager. Validate required secrets at startup. Rotate any exposed secrets immediately.

**If security issue found:** STOP → use security-reviewer agent → fix CRITICAL issues → rotate exposed secrets → review codebase for similar issues.

## Coding Style

**Immutability (CRITICAL):** Always create new objects, never mutate. Return new copies with changes applied.

**File organization:** Many small files over few large ones. 200-400 lines typical, 800 max. Organize by feature/domain, not by type. High cohesion, low coupling.

**Error handling:** Handle errors at every level. Provide user-friendly messages in UI code. Log detailed context server-side. Never silently swallow errors.

**Input validation:** Validate all user input at system boundaries. Use schema-based validation. Fail fast with clear messages. Never trust external data.

**Code quality checklist:**
- Functions small (<50 lines), files focused (<800 lines)
- No deep nesting (>4 levels)
- Proper error handling, no hardcoded values
- Readable, well-named identifiers

## Testing Requirements

**Minimum coverage: 80%**

Test types (all required):
1. **Unit tests** — Individual functions, utilities, components
2. **Integration tests** — API endpoints, database operations
3. **E2E tests** — Critical user flows

**TDD workflow (mandatory):**
1. Write test first (RED) — test should FAIL
2. Write minimal implementation (GREEN) — test should PASS
3. Refactor (IMPROVE) — verify coverage 80%+

Troubleshoot failures: check test isolation → verify mocks → fix implementation (not tests, unless tests are wrong).

## Development Workflow

1. **Plan** — Use planner agent, identify dependencies and risks, break into phases
2. **TDD** — Use tdd-guide agent, write tests first, implement, refactor
3. **Review** — Use code-reviewer agent immediately, address CRITICAL/HIGH issues
4. **Capture knowledge in the right place**
   - Personal debugging notes, preferences, and temporary context → auto memory
   - Team/project knowledge (architecture decisions, API changes, runbooks) → the project's existing docs structure
   - If the current task already produces the relevant docs or code comments, do not duplicate the same information elsewhere
   - If there is no obvious project doc location, ask before creating a new top-level file
5. **Commit** — Conventional commits format, comprehensive PR summaries

## Workflow Surface Policy

- `skills/` is the canonical workflow surface.
- New workflow contributions should land in `skills/` first.
- `commands/` is a legacy slash-entry compatibility surface and should only be added or updated when a shim is still required for migration or cross-harness parity.

## Git Workflow

**Commit format:** `<type>: <description>` — Types: feat, fix, refactor, docs, test, chore, perf, ci

**PR workflow:** Analyze full commit history → draft comprehensive summary → include test plan → push with `-u` flag.

## Architecture Patterns

**API response format:** Consistent envelope with success indicator, data payload, error message, and pagination metadata.

**Repository pattern:** Encapsulate data access behind standard interface (findAll, findById, create, update, delete). Business logic depends on abstract interface, not storage mechanism.

**Skeleton projects:** Search for battle-tested templates, evaluate with parallel agents (security, extensibility, relevance), clone best match, iterate within proven structure.

## Performance

**Context management:** Avoid last 20% of context window for large refactoring and multi-file features. Lower-sensitivity tasks (single edits, docs, simple fixes) tolerate higher utilization.

**Build troubleshooting:** Use build-error-resolver agent → analyze errors → fix incrementally → verify after each fix.

## Project Structure

```
agents/          — 63 specialized subagents
skills/          — 249 workflow skills and domain knowledge
commands/        — 79 slash commands
hooks/           — Trigger-based automations
rules/           — Always-follow guidelines (common + per-language)
scripts/         — Cross-platform Node.js utilities
mcp-configs/     — 14 MCP server configurations
tests/           — Test suite
docs/            — Documentation (plan/, architecture/, business/, guide/, modules/, references/, checklist/, reports/)
```

`commands/` remains in the repo for compatibility, but the long-term direction is skills-first.

## Single Sources of Truth

- Build, dependencies, scripts: `package.json` (yarn@4.9.2, Node.js >=18)
- Module list: `package.json` `files` field
- Project rules: `CLAUDE.md`, `AGENTS.md`, `.claude/rules/`
- Directory structure: filesystem scan; code over docs when they conflict
- Canonical skills: `.ai/skills/` is the sole source; never hand-edit `.claude/skills/` or other exports
- Configured mirrors: recorded in `.ai/README.md`

## Coding Conventions

**Reuse-first:** Search for existing implementations before writing new code. Prefer minimal diffs — no unrelated refactoring or bulk formatting.

**File-touch discipline:** Only modify files directly related to the task. Do not overwrite user changes that predate the current task.

**Plan triggers:** Plan before acting when a task touches 3+ source files, crosses module boundaries, adds dependencies, changes public APIs or data models, or has unclear requirements.

**AI vibe coding:** Keep source files <=500 lines; one responsibility per file. Never append unrelated logic to an already-large file. Do not refactor untouched legacy code just to meet limits.

**Verification:** Run `node tests/run-all.js` after changes. Lint with `npm run lint`. If no verification command applies, state `not verified`.

**Commit format:** `<type>: <description>` — Types: feat, fix, refactor, docs, test, chore, perf, ci. No AI attribution lines in commit messages.

## Copilot Config Exclusivity

This project uses `AGENTS.md` as the Copilot project-level config. Do not maintain both `AGENTS.md` and `.github/copilot-instructions.md` simultaneously — `AGENTS.md` takes precedence.

## Documentation Rules

- Default docs root: `/docs`
- Categories: `plan/`, `business/` (product), `architecture/` (design), `guide/`, `modules/`, `references/`, `checklist/`, `reports/`
- New docs go under `/docs`; check for semantic-equivalent directories first
- Multi-doc work items aggregate under `docs/plan/<task-slug>/`
- Audit / performance / evaluation / postmortem reports use `docs/reports/<report-topic>/`
- `CHANGELOG.md` stays at repo root

## Project-Level Skills

- `.ai/skills/` is the canonical source for project skills
- Edit only `.ai/skills/`; `.claude/hooks/sync-project-skills.sh` handles mirror refresh to `.claude/skills/`
- "Summarize into a skill" workflow: duplicate-check -> overlap-check -> proposal -> confirm -> write

## Common Commands

| Command | Purpose |
|---------|---------|
| `node tests/run-all.js` | Run all unit tests |
| `npm test` | Full CI check (validation + catalog + tests) |
| `npm run lint` | ESLint + markdownlint |
| `npm run coverage` | c8 coverage (80% threshold) |
| `npx ecc <type>` | Install ECC rules for a tech stack |

## Success Metrics

- All tests pass with 80%+ coverage
- No security vulnerabilities
- Code is readable and maintainable
- Performance is acceptable
- User requirements are met
