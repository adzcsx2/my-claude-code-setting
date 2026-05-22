---
description: "Plan-Doc + TDD + auto code review (full pipeline): generate task-scoped documentation set, then execute with strict TDD, then auto code review."
argument-hint: "<task-slug> [test] e.g. /ecc:plan-doc-tr my-feature"
---

# Plan-Doc-TR: Plan-Doc + TDD + Code Review (Full Pipeline)

**Key constraint**: This command is a three-phase mandatory pipeline. All three Phases MUST be executed via real tool calls. Before outputting the final summary, it is NEVER allowed to:
- Skip Phase 2 or Phase 3
- Replace actual Agent/Skill tool calls with verbal declarations ("I've completed TDD/Review")
- Write code directly in the main conversation context (all implementation must be done by the tdd-guide agent)
- Reverse TDD order (tests MUST be written first, then implementation)

Any execution that violates the above constraints is considered a **command failure** and must be redone.

---

## Plan-Doc-TR Execution Flow

Task: $ARGUMENTS

### === Phase 1 START: Plan-Doc Generation ===

Call `/ecc:plan-doc` via Skill tool:

```
Skill tool with skill: "ecc:plan-doc", args: $ARGUMENTS
```

`ecc:plan-doc` will:
1. Restate requirements
2. Ask clarifying questions (if needed)
3. Emit a generation plan and **wait for user confirmation** ("yes"/"proceed")
4. Pause at the model-switch checkpoint and **wait for** `继续`
5. Generate the full documentation set under `docs/plan/<task-slug>-YYYY-MM-DD/`
6. Print the first execution prompt

**Hard check**: The plan-doc command has TWO confirmation gates:
- Gate 1: User must reply "yes" / "proceed" / "confirm" / "可以" / "好的" / "同意" to approve the generation plan
- Gate 2: User must reply `继续` after the model-switch checkpoint

If either gate is not passed, stop and wait for the correct signal.

**Phase 1 completion marker**: All documentation files generated under `docs/plan/<task-slug>-YYYY-MM-DD/`.

---

### === Phase 2 START: TDD Execution ===

**Pre-flight verification (must complete)**:
- [ ] Are all plan-doc files generated under `docs/plan/<task-slug>-*/`?
- [ ] Has the user explicitly confirmed to proceed with TDD implementation?
- If any item is NO, stop and return to Phase 1

**Three No's principle** (before Phase 2 starts):
- No writing any source code directly in the main conversation
- No making direct code modification decisions
- No skipping tests and jumping directly to implementation

**Execution**:

Call the `tdd-guide` subagent via Agent tool to execute according to the plan:

```
Agent tool with subagent_type: "tdd-guide"
prompt: "Follow the plan in docs/plan/<task-slug>-*/00-执行文档.md and execute strict TDD. Must follow RED->GREEN->IMPROVE->REPEAT cycle. 80% minimum coverage."
```

**TDD mandatory flow** (executed by tdd-guide agent):

1. **RED**: Write **failing tests** FIRST for each plan item
2. **GREEN**: Write minimal code to make tests pass
3. **IMPROVE**: Refactor while keeping tests green
4. **REPEAT**: Loop through all plan items

**Coverage requirements**:
- General code: >=80%
- Security-critical / financial logic: 100%

**Phase 2 completion marker**: After tdd-guide agent returns, must see:
- [x] All tests passing (string "passed" or numeric success indication)
- [x] Coverage metric >= 80%
- [x] git log shows test files committed first

---

### === Phase 3 START: Code Review ===

**Pre-flight verification (must complete)**:
- [ ] Was the tdd-guide agent actually called? (check Agent tool call history)
- [ ] Are all tests passing?
- [ ] Is coverage >= 80%?
- If any item is NO, stop and go back to Phase 2

**Execution**:

Call the `code-reviewer` subagent via Agent tool to audit all changes:

```
Agent tool with subagent_type: "code-reviewer"
prompt: "Review all changed files in git diff HEAD. Check security (CRITICAL), structure (HIGH), patterns (MEDIUM), style (LOW). Auto-fix all CRITICAL issues."
```

**Code review coverage**:
1. Run `git diff --name-only HEAD` to identify modified files
2. Review file by file:
   - **CRITICAL**: Security vulnerabilities, hardcoded secrets, injection risks
   - **HIGH**: Large functions (>50 lines), deep nesting (>4 levels), missing error handling
   - **MEDIUM**: Mutation patterns, missing tests, complexity issues
   - **LOW**: Naming inconsistencies, formatting issues
3. Output structured review report (with severity level + file:line)
4. **Auto-fix** all CRITICAL issues
5. Fix HIGH issues if directly fixable, otherwise mark them

**Phase 3 completion marker**: After code-reviewer agent returns, must see:
- [x] Review report completed
- [x] CRITICAL issues all auto-fixed
- [x] HIGH/MEDIUM/LOW issues categorized

---

## Final Self-Check Report (mandatory output)

Before fully ending, output the following table to verify all three Phases were correctly executed:

| Phase | Status | Evidence |
|-------|--------|----------|
| **Phase 1: Plan-Doc** | ✅/❌ | User confirmation text + generated doc directory path |
| **Phase 2: TDD** | ✅/❌ | tdd-guide agent call ID + final test pass count + coverage % |
| **Phase 3: Review** | ✅/❌ | code-reviewer agent call ID + CRITICAL issues fixed count + other issues categorized |

**Acceptance criteria**:
- If any item in the table is ❌, the command is considered **failed**
- All items must be ✅ before outputting the final summary
- If there is a ❌, redo the corresponding Phase until it becomes ✅

---

## Final Summary (output only after all Phases are ✅)

Summarize:
- What functionality was implemented / what problem was solved
- Final test results (passed / total) + coverage %
- Issues found in code review + number of items fixed
- Whether there are remaining HIGH/MEDIUM issues to address
