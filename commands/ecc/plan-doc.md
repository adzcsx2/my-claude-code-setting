---
description: "Generate a complete task-scoped documentation set under docs/plan/<task-slug>-YYYY-MM-DD/: README, execution log with progress pointer and subagent plan, architecture design, dev guide, roadmap, and optional test docs. Prefer /ecc:plan for execution, fall back to plain-language resume prompt if declined."
argument-hint: "<task-slug> [test] | [test] <task-slug>"
---

> Language Requirements
>
> - Generated documents follow the host project's primary documentation language
>   - If `docs/README.md` is Chinese, generate Chinese docs
>   - If `docs/README.md` is English or missing, default to the user's conversation language
> - Filenames use numbered prefixes; file body language follows the project
> - All generated files must be UTF-8 (no BOM)

# plan-doc Command

Generate a complete task-scoped documentation set in `docs/plan/<task-slug>-YYYY-MM-DD/` so an AI can execute a multi-phase engineering task across multiple sessions without losing progress.

Default execution companion is `/ecc:plan`: it handles in-conversation phase execution, while `/ecc:plan-doc` **persists** that plan as linked markdown files with a progress pointer and a subagent plan baked in.

## Trigger

```text
/ecc:plan-doc <task-slug>          # standard set (5 docs)
/ecc:plan-doc <task-slug> test     # include test plan + test cases (7 docs)
/ecc:plan-doc test <task-slug>     # same, arg order flexible
/ecc:plan-doc                      # interactive, ask for slug
```

## When to Use

- A work item will produce 3+ linked docs (bug-fix campaign, refactor, feature rollout, audit follow-up)
- Work will span multiple sessions or multiple agents and needs a persistent progress anchor
- The task has distinct phases that should be executed in order with per-phase verification
- You want a subagent plan baked into the docs rather than re-decided each session

Do NOT use when:

- The change fits in a single file / single session / single PR → just edit directly
- The output is one doc → put it under the right top-level category (`docs/design/`, `docs/guide/`, etc.) instead

## Parameters

### Positional

- `<task-slug>` (required unless interactive): english kebab-case, stable, no dates unless disambiguating. Examples: `ble-multi-device-fix`, `home-card-migration`, `auth-rewrite-2026q2`.
- `test` (optional): include test plan + test cases.

### Implicit test-mode triggers

If any of these appear in the **invocation prompt body** (not the slug), enable test mode automatically:

- Chinese: `测试`, `回归`, `自测`, `QA`, `验证`, `用例`
- English: `test`, `regression`, `QA`, `verification`, `test case`, `test plan`

Only inspect the prompt body. Do NOT match the slug (e.g. a slug like `foo-test-migration` must not trigger test mode).

## Execution Flow

Every invocation runs 6 core stages plus the Stage 2.5 execution-command resolution checkpoint and the Stage 3.5 model-switch checkpoint. Do NOT skip any of them.

### Stage 1. Restate

- Read the user's task description
- Extract: task name, core problem, affected modules, observable symptoms, related source paths, related upstream docs (reports, existing guides)
- If the project has an audit / bug report / PRD, read it once and summarize in 3 bullets

### Stage 2. Ask Clarifying (only if missing)

Ask at most 3 targeted questions. Do NOT ask generic ones.

Required clarifications:

- Slug: if not provided
- Test docs: if ambiguous (test keyword absent but task clearly touches QA surface)
- Source files: if the task description is too abstract to know which files are in scope

Use a single AskUserQuestion tool call for multiple questions. Do NOT ask one-by-one.

### Stage 2.5. Resolve execution command

Before emitting the first execution prompt, resolve the preferred plan command in this order:

1. `/ecc:plan`
2. `/everything-claude-code:plan`
3. No slash plan command available

Rules:

- Default to `/ecc:plan` when it exists.
- If `/ecc:plan` is unavailable but `/everything-claude-code:plan` exists, use `/everything-claude-code:plan`.
- If neither exists, explicitly tell the user that the generated docs work best with `/ecc:plan` or `/everything-claude-code:plan` and ask whether they want to install one.
- If the user declines installation, degrade gracefully: generate the docs anyway and print a slash-command-free resume prompt that starts directly from "请先阅读 docs/plan/.../00-执行文档.md".
- Do NOT silently swap to a degraded prompt without first offering installation.

### Stage 3. Emit Plan + WAIT for confirmation

Output a plan in this exact shape:

```
# plan-doc generation plan: <task-slug>

## Output location
docs/plan/<task-slug>-<YYYY-MM-DD>/

## Documents to generate
- README.md — index
- 00-执行文档.md — execution log with progress pointer + subagent plan
- 01-架构设计.md — core decisions
- 02-开发规范.md — dev guide (禁止/必须, code templates, anti-patterns)
- 03-修复路线图.md — phase breakdown, milestones, rollback
- 04-测试计划.md — (only if test mode)
- 05-测试用例清单.md — (only if test mode)

## Detected stack
<flutter | android | web | python | java | generic>

## Subagent plan (embedded in 00-执行文档.md)
<table of phases × roles × recommended agents, stack-specific>

## Phases detected from task description
Phase 1: ...
Phase 2: ...
...

## Upstream sources of truth (will NOT be modified)
- <list of .cursor/rules/*.mdc, docs/guide/*使用规范.md, etc.>

## Waiting for confirmation
Reply "yes" / "proceed" to enter the model-switch checkpoint, or "modify: ..." to adjust.
```

**DO NOT generate files until the user confirms.**

### Stage 3.5. Model-switch checkpoint + WAIT for `继续`

Immediately after the user replies `yes` / `proceed`, pause before file generation and create an explicit generation handoff.

1. Build a compact `Generation Handoff` block containing:
   - `task_slug`
   - `output_dir`
   - `docs_language`
   - `test_mode`
   - `detected_stack`
   - `resolved_plan_command`
   - `upstream_sources`
   - `phase_list`
   - `doc_list`
   - `generation_risks`
2. Recommend the generation model using this routing policy:
   - Default to `haiku` for template filling, cross-linking, and straightforward markdown generation.
   - Recommend `sonnet` instead when any of the following is true:
     - test mode is enabled and the task needs nontrivial test strategy or regression matrix synthesis
     - upstream sources are numerous (`> 3`) or materially conflict with each other
     - the task is terminology-heavy, mixed-language, or architecture-heavy
     - `01-架构设计.md`, `04-测试计划.md`, or `05-测试用例清单.md` require fresh synthesis rather than direct expansion from the handoff
     - the user explicitly prefers quality over cost
3. Print the checkpoint in this exact shape:

```text
## Model switch checkpoint
已完成审计和写文档准备。下一步建议切换到 <haiku | sonnet> 再继续生成文档。

### Generation Handoff
- task_slug: ...
- output_dir: ...
- docs_language: ...
- test_mode: ...
- detected_stack: ...
- resolved_plan_command: ...
- upstream_sources:
  - ...
- phase_list:
  - Phase 1: ...
  - Phase 2: ...
- doc_list:
  - README.md
  - 00-执行文档.md
  - ...
- generation_risks:
  - ...

切换完成后请输入：继续
```

4. Stop after the checkpoint. Do NOT create files yet.
5. Only continue when the user replies exactly `继续`.
6. If the currently active model already matches the recommendation, still stop and require `继续` so there is a clean boundary between audit and generation.
7. If the user changes the task after the checkpoint, go back to Stage 1 or Stage 2 as needed instead of blindly continuing.

### Stage 4. Generate

Only after confirmation and the Stage 3.5 `继续` reply:

1. Read the Stage 3.5 `Generation Handoff` block first and use it as the primary input for generation.
   - Do NOT repeat the full audit if the handoff already contains enough information.
   - Only reread upstream sources when the handoff is missing details, the sources conflict, or the user changed the task after the checkpoint.
2. Compute the target directory: `docs/plan/<task-slug>-<today-date>/` where `<today-date>` is the local date in `YYYY-MM-DD` format at generation time.
   - Before creating, scan for existing directories matching `docs/plan/<task-slug>-*/` (same slug, any date). If one is found, ask the user: "已存在 `<found-dir>`，是续做（reuse）还是新任务（create new）？" Only create a new directory if the user chooses new task.
   - Fail if the target directory already exists with content — ask before overwriting.
3. Write the docs in this order: `README.md` → `00-执行文档.md` → `01` → `02` → `03` → (`04` → `05` if test)
4. Cross-link documents (README links to all; `00` links to `01-03`; each numbered doc has prev/next links)

### Stage 5. Post-generation

After writing all files:

1. Report total line count per file
2. Append an entry to `docs/README.md` under its `计划文档 / Plan docs` section linking to the new task subdir (if such a section exists; otherwise suggest adding one)
3. Remind the user that `.cursor/rules/*` and top-level usage guides were NOT modified
4. Print the first execution prompt the user should give the AI, after applying Stage 2.5 command resolution

## Output Structure

目录命名规则：`docs/plan/<task-slug>-<YYYY-MM-DD>/`
- `<task-slug>`：用户提供的英文 kebab-case 标识符
- `<YYYY-MM-DD>`：生成当天的本地日期，例如 `2026-05-06`
- 示例：`docs/plan/ble-multi-device-fix-2026-05-06/`

```
docs/plan/<task-slug>-<YYYY-MM-DD>/
├── README.md                  # required - task index, background, doc list, task status
├── 00-执行文档.md             # required - progress pointer, subagent plan, checklists
├── 01-架构设计.md             # required - core architectural decisions
├── 02-开发规范.md             # required - coding rules, must/forbidden, templates, anti-patterns
├── 03-修复路线图.md           # required - phase breakdown, milestones, rollback
├── 04-测试计划.md             # optional - test strategy (entry/exit criteria, environment)
└── 05-测试用例清单.md         # optional - structured test cases, regression matrix
```

## Key Design: 00-执行文档.md

This is the file that makes `plan-doc` different from a plain execution command like `/ecc:plan`.

### Must contain

1. **Progress pointer** wrapped in `<!-- progress-pointer:start -->` / `<!-- progress-pointer:end -->` HTML comments, containing a YAML block with:
   - `current_phase` (int)
   - `current_phase_status` (enum: not_started / planning / coding / self_testing / in_review / completed / blocked)
   - `last_updated` (ISO 8601 UTC)
   - `last_actor` (main-agent / subagent:<name> / human)
   - `last_commit` (git hash or null)
   - `next_action` (one-line)
   - `blockers` (string array)

2. **Resume protocol** (mandatory reading for any AI entering the task):
   - Step 1: read progress pointer
   - Step 2: jump to corresponding Phase checklist
   - Step 3: continue from first unchecked item
   - Step 4: on completion, tick checkbox + update pointer + append to execution log
   - Step 5: on blocker, set status=blocked, stop, report to user
   - Step 6: phase switch only after all checklist items verified

3. **Subagent plan** (stack-specific, see below)

4. **Per-phase checklists** with ordered atomic items (P<N>.<M> format), branch name, acceptance criteria

5. **Execution log** (reverse chronological table, AI appends every state change)

6. **Execution prompt template** users can hand to a fresh AI session

### Placeholder conventions

- `{{TASK_SLUG}}` — slug only, no date, used for descriptive task name references
- `{{TASK_DIR}}` — full directory name `<task-slug>-<YYYY-MM-DD>`, used for file path references
- All path placeholders in templates use `{{TASK_DIR}}`

### Forbidden in 00-执行文档.md

- Do not leave the progress pointer outside the HTML comment anchors (other tools rely on the anchors)
- Do not omit the resume protocol
- Do not put architectural content here (put in 01)
- Do not put code templates here (put in 02)

## Subagent Plan (Stack-Specific)

Stack detection signals:

- `pubspec.yaml` + `lib/main.dart` → Flutter
- `settings.gradle[.kts]` + `AndroidManifest.xml` → Android
- `package.json` + `next.config.*` / `vite.config.*` → Web
- `pyproject.toml` / `requirements.txt` → Python
- `pom.xml` / `build.gradle[.kts]` with `src/main/java` → Java

### Flutter recommended subagents

| Role                   | Recommended                                     |
| ---------------------- | ----------------------------------------------- |
| Coding                 | main-agent                                      |
| Build fix              | `ecc:dart-build-resolver`                       |
| Review                 | `ecc:flutter-reviewer`                          |
| E2E test orchestration | `ecc:e2e-runner` (real-device tests stay human) |

### Android recommended subagents

| Role        | Recommended                                              |
| ----------- | -------------------------------------------------------- |
| Coding      | main-agent                                               |
| Build fix   | `ecc:kotlin-build-resolver` or `ecc:java-build-resolver` |
| Review      | `ecc:kotlin-reviewer` or `ecc:java-reviewer`             |

### Web / Node / React

| Role      | Recommended                |
| --------- | -------------------------- |
| Coding    | main-agent                 |
| Build fix | `ecc:build-error-resolver` |
| Review    | `ecc:typescript-reviewer`  |
| E2E       | `ecc:e2e-runner`           |

### Python

| Role    | Recommended           |
| ------- | --------------------- |
| Coding  | main-agent            |
| Review  | `ecc:python-reviewer` |
| Testing | `ecc:tdd-guide`       |

### Java / Spring Boot

| Role      | Recommended               |
| --------- | ------------------------- |
| Coding    | main-agent                |
| Build fix | `ecc:java-build-resolver` |
| Review    | `ecc:java-reviewer`       |

### Generic (unknown stack)

| Role     | Recommended             |
| -------- | ----------------------- |
| Coding   | main-agent              |
| Review   | `ecc:code-reviewer`     |
| Security | `ecc:security-reviewer` |

Forbidden subagent uses (apply universally):

- Do not delegate progress pointer updates to subagents
- Do not delegate phase switching decisions
- Do not delegate core logic touching upstream sources of truth

## Relationship With Other Commands

- **`/ecc:plan`** — in-conversation plan, no file output. Use for quick decisions.
- **`/ecc:plan-doc`** — persists plan as file set with progress pointer. Use for multi-session work.
- **`/ecc:prp-plan`** / **`/ecc:prp-implement`** — PRD-driven artifact planning; use when the task starts from a product spec rather than an engineering problem.

## Model Routing Policy

`plan-doc` separates expensive reasoning from cheaper document generation.

- Stages 1-3: use the current stronger model to restate the task, clarify gaps, resolve execution command, and design the phase plan.
- Stage 3.5: stop and explicitly tell the user which model to switch to for document generation.
- Stage 4: resume only after the user switches model manually and replies `继续`.

Routing rules:

- Default recommendation: `haiku`
- Recommend `sonnet` when the generation work still needs substantial synthesis, conflict resolution, or complex test/architecture writing
- Never auto-switch silently; always ask the user to switch manually
- Never ask the cheaper model to redo the full audit unless the handoff is incomplete or the user changed requirements

When in doubt:

- One-shot change → just edit
- Single-session multi-file → `/ecc:plan`
- Multi-session with phases → `/ecc:plan-doc`
- PRD → `/ecc:prp-plan`

## Anti-Patterns

- Generating docs before user confirmation (violates the plan-first workflow)
- Generating docs immediately after `yes` / `proceed` without first stopping at the Stage 3.5 model-switch checkpoint
- Writing test docs by default when user didn't ask or the task doesn't involve QA
- Hardcoding subagent names that don't exist in the host's installed agents
- Putting code changes in 02-开发规范.md (it's a guide, not an implementation)
- Omitting the progress pointer anchors or using a different marker
- Copying the original audit/report content verbatim into 01 (01 should synthesize decisions, not restate evidence)
- Generating more than 7 files under `docs/plan/<task-slug>-<YYYY-MM-DD>/` — the fixed structure is the contract
- Modifying `.cursor/rules/*.mdc` or top-level `docs/guide/*使用规范.md` during generation
- Omitting the date suffix from the directory name
- Embedding a date inside the slug itself to work around the suffix rule (results in double-date)
- Silently creating a new dated directory when a same-slug directory already exists — always prompt the user to choose between reuse and new task first
- Matching `test` keyword inside the slug (slug is not prompt body)
- Creating nested task subdirs
- Letting the generation model re-read every audit source by default instead of using the Stage 3.5 `Generation Handoff`
- Defaulting to `sonnet` for routine template filling that `haiku` can handle
- Defaulting to `haiku` when the task still needs substantial synthesis for architecture or QA documents

## Examples

### Example 1: Bug fix campaign with test docs

```
User: /ecc:plan-doc ble-multi-device-fix test
      based on docs/reports/bluetooth-audit.md

Agent:
# plan-doc generation plan: ble-multi-device-fix

## Output location
docs/plan/ble-multi-device-fix-2026-05-06/
...
(emits 7-doc plan, waits for confirmation)

User: yes

Agent:
## Model switch checkpoint
已完成审计和写文档准备。下一步建议切换到 sonnet 再继续生成文档。
...
切换完成后请输入：继续

User: 继续

Agent:
(generates 7 files + first execution prompt)
```

### Example 2: Implicit test trigger from prompt

```
User: /ecc:plan-doc home-card-migration
      需要完整测试计划和回归用例

Agent: (detects "测试计划" + "用例" in prompt body -> test mode on)
# plan-doc generation plan: home-card-migration
... includes 04 and 05 ...
```

### Example 3: Standard feature rollout (no test docs)

```
User: /ecc:plan-doc realtime-notifications

Agent:
# plan-doc generation plan: realtime-notifications
... 5 docs (no 04/05) ...

User: yes

Agent:
## Model switch checkpoint
已完成审计和写文档准备。下一步建议切换到 haiku 再继续生成文档。
...
切换完成后请输入：继续

User: 继续

Agent:
(generates 5 files + first execution prompt)
```

## Best Practices

1. Always restate in your own words before asking clarifying questions
2. Keep phase count <= 5 by default; if task truly needs more, group into sub-phases under a parent phase
3. Each phase checklist item should be atomic (one PR can complete it) and verifiable
4. Cross-link every doc to README and prev/next
5. Reserve `00-` prefix exclusively for the execution log — never use it for content docs
6. When the task does NOT produce code (e.g. pure research), still generate `00-执行文档.md`; set subagent plan accordingly (reviewer-only roles)
