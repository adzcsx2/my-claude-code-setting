---
name: dt:local-worktree
description: "Create an isolated local git worktree branch from an existing repo for AI-driven development. Pass the ORIGINAL repo path; the worktree is created as a sibling directory next to it (remote-<name> -> local-<name>, otherwise local-<repo>). Then run dt:init inside it, audit the project and rewrite README, and guarantee that all init artifacts (CLAUDE.md, .ai/, .claude/, /docs) never reach the original branch and never get pushed to remote. Generates a whitelist merge script that syncs only real source code back, plus a CLAUDE.md push-ban rule and a Claude PreToolUse hook that blocks git push."
argument-hint: "<repo-path> [--branch <name>] [--worktree-dir <path>] [--dry-run] e.g. /dt:local-worktree /path/to/remote-myproj"
origin: dev-tools-skills
---

> **中文环境要求**
>
> 本技能运行在中文环境下：
>
> - 面向用户的回复、注释、提示信息必须使用中文
> - AI 内部处理过程可以使用英文
> - **所有生成的文档文件（CLAUDE.md、AGENT.md、README、脚本注释）必须使用英文**
> - 所有生成的文件必须使用 UTF-8 编码（无 BOM）
>
> ---

# local-worktree Skill

针对**一个已 clone 的原仓库**创建隔离的本地开发 worktree，专供 AI 编码使用。

**调用方式：把原仓库路径作为参数传入**，skill 在该仓库的**同级（父）目录**生成一个 worktree 目录。命名规则：

- 原仓库目录名以 `remote-` 开头 → 把前缀换成 `local-`（`remote-bim-cloud-manage` → `local-bim-cloud-manage`）
- 否则 → `local-<repo-name>`

例如 `/dt:local-worktree /Users/hoyn/Documents/小园长/bim-cloud-manage/remote-bim-cloud-manage` 会在 `/Users/hoyn/Documents/小园长/bim-cloud-manage/` 下生成 `local-bim-cloud-manage` worktree。

核心目标：

1. 生成一个独立的 `local` 分支 worktree 目录（原仓库的同级目录），不污染原有工作树
2. 在 worktree 内执行 `dt:init`，审计项目并重写 README
3. 让所有初始化产物（`CLAUDE.md`、`AGENT.md`、`.ai/`、`.claude/`、`/docs/`、Copilot 配置）**只活在 local 分支**，不进入 main/dev/release
4. 合并业务代码时，**只带走真实源码白名单**，不带任何初始化文件
5. 在 `CLAUDE.md` 写死「禁止 push 到远程」铁律，并生成 Claude PreToolUse hook 强制拦截 `git push`

**重要：参数即原仓库路径，skill 在任意 cwd 都能执行，所有 git 命令针对该仓库及其 worktree。**

---

## 四条铁律（执行前必读）

| #   | 规则                                                                         | 违反后果                                                 |
| --- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | **worktree 必须用独立分支（默认 `local`），绝不在原工作树直接初始化**        | 初始化文件污染主分支，无法干净剥离                       |
| 2   | **合并回主分支只能用白名单 checkout，禁止 `git merge local`**                | 整分支合并会把 CLAUDE.md / .ai / .claude / docs 全带过去 |
| 3   | **local 分支禁止 push 到远程，由 CLAUDE.md 规则 + PreToolUse hook 双重拦截** | 初始化文件、本地配置泄漏到远程                           |
| 4   | **初始化产物路径必须显式排除在合并白名单之外**                               | 业务 merge 时夹带 AI 上下文文件                          |

---

## Trigger

```text
/dt:local-worktree <repo-path> [--branch <name>] [--worktree-dir <path>] [--dry-run]
```

## When to Use

- 刚 clone 一个原始仓库（如 `remote-xxx`），想用 AI 全面初始化但又不想污染任何远程分支
- 需要一个「AI 沙盒分支」：在里面跑 `dt:init`、审计、重写 README、加规则
- 团队仓库不允许提交 `CLAUDE.md` / `.ai/` / `.claude/` 等 AI 上下文文件
- 希望本地随便改配置（如 `@Value` / 端口 / mock），但合并回去时只带业务代码
- 需要一个可重复执行的「只同步源码白名单」合并脚本

## Command Parameters

| Parameter               | Description                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| `<repo-path>`           | **必填**：原仓库路径。worktree 默认创建在该仓库的同级目录，命名 `remote-<x>`→`local-<x>`，否则 `local-<repo>` |
| `--branch <name>`       | 指定 worktree 分支名，默认 `local`                                                                            |
| `--worktree-dir <path>` | 显式指定 worktree 目录路径，覆盖默认的「同级 + local- 前缀」推断                                              |
| `--dry-run`             | 只输出审计结果、白名单方案、将生成的文件预览，不落盘、不创建 worktree                                         |

> 若未传 `<repo-path>`，则回退到「当前目录即原仓库」，worktree 仍按同级 + 命名规则生成。

---

## Execution Workflow

### Step 0. 解析参数 + 前置校验

1. **确定原仓库路径 `REPO_PATH`**：
   - 取第一个位置参数；未传则用当前工作目录。
   - 校验 `REPO_PATH` 是 git 仓库：`git -C "<REPO_PATH>" rev-parse --is-inside-work-tree`。否则停止并提示用户先 clone。
   - 规范化为绝对路径：`REPO_PATH="$(cd "<REPO_PATH>" && pwd)"`（取 `git -C ... rev-parse --show-toplevel` 更稳妥）。
2. **推断 worktree 目录 `WORKTREE_DIR`**（除非 `--worktree-dir` 显式指定）：
   - `REPO_NAME = basename(REPO_PATH)`，`PARENT_DIR = dirname(REPO_PATH)`。
   - 命名：
     - `REPO_NAME` 以 `remote-` 开头 → `WT_NAME="local-${REPO_NAME#remote-}"`
     - 否则 → `WT_NAME="local-${REPO_NAME}"`
   - `WORKTREE_DIR="${PARENT_DIR}/${WT_NAME}"`。
   - 示例：`REPO_PATH=.../bim-cloud-manage/remote-bim-cloud-manage` → `WORKTREE_DIR=.../bim-cloud-manage/local-bim-cloud-manage`。
3. **解析其余参数**：`BRANCH`（默认 `local`）。
4. **Stale worktree 检测与清理**（关键：防止因手动 `rm -rf` 删除目录后重新执行失败）：
   - 执行 `git -C "<REPO_PATH>" worktree list --porcelain` 检查目标 `WORKTREE_DIR` 是否在 worktree 注册列表中。
   - 如果 `WORKTREE_DIR` 被注册但磁盘目录已不存在（worktree 状态为 `prunable`）：
     - 输出中文提示："检测到上一次的 local worktree 目录已被手动删除（如 rm -rf），但 git 仍保留其注册记录。正在自动清理..."
     - 执行 `git -C "<REPO_PATH>" worktree prune` 清理所有失效的 worktree 注册记录。
     - 清理完成后继续后续流程（如果 `<BRANCH>` 分支仍存在，会进入下面的分支复用确认流程）。
   - **重要**：此步骤只清理 git 元数据中的失效 worktree 记录，**绝不触碰原始仓库的任何文件**。
5. **冲突检查**：
   - `git -C "<REPO_PATH>" rev-parse --verify "<BRANCH>"` 已存在 → 输出中文提示："检测到 `<BRANCH>` 分支已存在（上次创建），将复用该分支重新创建 worktree"，要求用户确认后继续。
   - `WORKTREE_DIR` 磁盘目录已存在且非空 → 停止并报告（避免覆盖已有内容）。
6. `--dry-run` 时，从这一步起所有写操作只输出预览，并打印推断出的 `REPO_PATH` / `WORKTREE_DIR` / `BRANCH`。

### Step 1. 创建隔离 worktree

针对原仓库执行（`-C` 指向原仓库，无需先 cd）：

```bash
# 基于原仓库当前 HEAD 创建新分支 + 同级独立工作目录
git -C "<REPO_PATH>" worktree add "<WORKTREE_DIR>" -b "<BRANCH>"
```

- 创建成功后，**后续所有步骤都在 `<WORKTREE_DIR>` 内执行**（`cd "<WORKTREE_DIR>"`）。
- 若 `<BRANCH>` 已存在且用户确认复用，改用 `git -C "<REPO_PATH>" worktree add "<WORKTREE_DIR>" "<BRANCH>"`（不带 `-b`）。
- 向用户报告：原仓库路径、worktree 路径、分支名、基于哪个 commit。

### Step 2. 审计项目 + 推断业务代码白名单

在 worktree 内审计仓库，确定「合并回主分支时应该同步的真实业务代码路径」：

- 扫描真实源码模块（`src/`、各 Maven/Gradle 子模块、`package.json` workspaces、`pyproject.toml` 包等）。
- 扫描真实构建/依赖文件（`pom.xml`、`build.gradle(.kts)`、`package.json`、`requirements.txt`、`Dockerfile`、`*.csproj` 等）。
- 扫描真实运行所需的非源码资源（如 `mock/`、`checkstyle.xml`、`.gitlab-ci.yml` / `.github/workflows`）。
- 把这些路径汇总成 `SYNC_PATHS` 白名单。

**白名单必须显式排除以下初始化产物（绝不进入合并）：**

```
CLAUDE.md
AGENT.md
AGENTS.md
.github/copilot-instructions.md
.ai/
.claude/
.codegraph/
docs/        # 仅当 docs 是本次 init 新建、且原分支无 docs 时排除；若原仓库本就有 docs 业务文档，需向用户确认是否纳入
README.md    # AI 重写后的 README 可能含本地化说明，不同步回原始仓库
README_AI.md # 任何 AI 专用衍生文件
```

- 把推断出的 `SYNC_PATHS` 白名单和排除清单**展示给用户确认**，再继续。
- `--dry-run` 时到此输出白名单方案即可。

### Step 3. 在 worktree 内执行 dt:init

- 在 `<WORKTREE_DIR>` 调用 `dt:init`（标准模式），生成 `CLAUDE.md`、`AGENT.md`、Copilot 配置、`.ai/skills/`、`/docs` 骨架，并（Claude 环境下）bootstrap `.claude/settings.json` + sync hook。
- init 完成后，**审计项目并重写 `README.md`**：基于真实代码事实重写项目说明、模块结构、构建命令、目录约定。README 在排除清单中，不同步回原始仓库，因此可包含 AI 沙盒专属说明。
- 把「local worktree 专属约束」写进 `CLAUDE.md`（见 Step 4），而不是写进 README。

### Step 4. 写入 CLAUDE.md 的 push-ban 铁律

在 worktree 的 `CLAUDE.md` 末尾追加 **Push Restriction** 小节（英文）：

```markdown
## Push Restriction (branch: <BRANCH>)

- **ABSOLUTE RULE: Never push to remote on this branch.**
- This `<BRANCH>` branch and worktree are for local AI-driven development only. All commits stay local.
- A Claude PreToolUse hook (`.claude/hooks/prevent-push.sh`) blocks every `git push` command.
- AI-context files (CLAUDE.md, AGENT.md, .ai/, .claude/, .codegraph/, AI-only docs) must NEVER be merged into other branches.
- To bring real source changes back, run `scripts/merge-from-local.sh` (whitelist-only cross-directory sync). It checks out whitelist files from this `<BRANCH>` branch into the original repo directory. Do NOT use `git merge <BRANCH>`.
- Other branches (main, release, dev, feature/\*) are NOT subject to this restriction.
```

> `<BRANCH>` 用实际分支名替换。

### Step 5. 生成 Claude PreToolUse 防 push hook

写入 `<WORKTREE_DIR>/.claude/hooks/prevent-push.sh`（若 `dt:init` 已生成同名 hook，则合并 push 拦截逻辑，不覆盖既有逻辑），并赋可执行权限：

```bash
#!/usr/bin/env bash
# prevent-push.sh — Block git push on the local worktree branch
# PreToolUse hook: matcher="Bash", exit 2 to block, 0 to allow
set -euo pipefail

HOOK_INPUT=$(cat)

# Decode command from hook JSON input (pure bash fallback if jq is missing)
if command -v jq &>/dev/null; then
  COMMAND=$(echo "$HOOK_INPUT" | jq -r '.tool_input.command // ""')
else
  COMMAND=$(echo "$HOOK_INPUT" | grep -o '"command":"[^"]*"' | head -1 | sed 's/"command":"//;s/"$//')
fi

# Match git push at line start or after common command separators (;, &&, ||, |, newline)
if echo "$COMMAND" | grep -qE '(^|;|&&|\|\||\||\s)\s*git[[:space:]]+push\b'; then
  echo "[Hook] BLOCKED: git push is forbidden on this local worktree branch" >&2
  echo "[Hook] Commit locally only. Sync source back via scripts/merge-from-local.sh." >&2
  exit 2
fi

exit 0
```

在 `<WORKTREE_DIR>/.claude/settings.json` 注册（与 init 生成的 PostToolUse sync hook 合并，不互相覆盖）：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/prevent-push.sh",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

- 执行 `chmod +x .claude/hooks/prevent-push.sh`。
- 若环境非 Claude Code（仅 Copilot），仍生成该脚本并在 README/CLAUDE.md 标注需手动接入，同时保留 CLAUDE.md 规则作为约束。

### Step 6. 生成白名单合并脚本

写入 `<WORKTREE_DIR>/scripts/merge-from-local.sh`（英文注释，UTF-8 无 BOM），用**跨目录白名单 checkout**而非 `git merge`。

与 SKILL.md 之前的版本不同，此脚本采用跨目录模型：从 worktree 目录（`local-*`）把白名单文件同步到原始仓库目录（`remote-*` 或原始目录名）。由于两者共享同一 git 数据库（worktree 机制），无需切换分支即可完成 checkout。

```bash
#!/usr/bin/env bash
# merge-from-local.sh — Sync ONLY real source code from the local worktree
# into the original (remote) project directory. Init artifacts (CLAUDE.md,
# .ai/, .claude/, docs/, Copilot config) are intentionally excluded.
#
# Usage:
#   bash scripts/merge-from-local.sh        # sync whitelist into remote project
#   bash scripts/merge-from-local.sh -n     # dry-run preview only
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_NAME="$(basename "$LOCAL_DIR")"
PARENT_DIR="$(dirname "$LOCAL_DIR")"

# Infer the original repo directory name:
#   local-<x> -> remote-<x>  (if remote-<x> exists)
#   otherwise  -> <x>         (strip local- prefix)
REMOTE_NAME="${LOCAL_NAME#local-}"
if [ -d "$PARENT_DIR/remote-$REMOTE_NAME" ]; then
  REMOTE_NAME="remote-$REMOTE_NAME"
fi
REMOTE_DIR="$PARENT_DIR/$REMOTE_NAME"

SOURCE_BRANCH="<BRANCH>"

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] || [ "${1:-}" = "-n" ] && DRY_RUN=true

if [ ! -d "$REMOTE_DIR/.git" ]; then
  echo "[ERROR] Remote project not found at $REMOTE_DIR"
  echo "[INFO]  Expected original repo at: $REMOTE_DIR"
  exit 1
fi

# Whitelist: ONLY real source / build / runtime files. Inferred during dt:local-worktree.
# README.md is EXCLUDED — it is rewritten during dt:init and should not overwrite the original.
SYNC_PATHS=(
  # <-- filled from Step 2 audit, e.g.:
  # "src"
  # "pom.xml"
  # "Dockerfile"
)

echo "Local  (source) : $LOCAL_DIR ($SOURCE_BRANCH)"
echo "Remote (target) : $REMOTE_DIR"
echo "--- Whitelist paths ---"
VALID_PATHS=()
for p in "${SYNC_PATHS[@]}"; do
  if [ -e "$LOCAL_DIR/$p" ] || git -C "$LOCAL_DIR" cat-file -e "$SOURCE_BRANCH:$p" 2>/dev/null; then
    echo "  $p"
    VALID_PATHS+=("$p")
  else
    echo "  [SKIP] $p (missing in local worktree)"
  fi
done

if [ ${#VALID_PATHS[@]} -eq 0 ]; then
  echo "No valid paths to sync. Exiting."
  exit 0
fi

if $DRY_RUN; then
  echo "[dry-run] no changes applied"
  exit 0
fi

cd "$REMOTE_DIR"

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Target branch in remote: $CURRENT_BRANCH"

if [ "$CURRENT_BRANCH" = "$SOURCE_BRANCH" ]; then
  echo "[ERROR] Remote is ON the '$SOURCE_BRANCH' branch. Switch to a target branch first."
  exit 1
fi

# Checkout whitelist files from the local branch into the remote working tree.
# Since both directories share the same git database (worktree), the local branch
# is visible from the remote repo context.
git checkout "$SOURCE_BRANCH" -- "${VALID_PATHS[@]}"

echo "Done. Review 'git status' in $REMOTE_DIR then commit on '$CURRENT_BRANCH'."
```

- `SYNC_PATHS` 用 Step 2 确认的白名单填充。**README.md 已加入排除清单，不同步回原始仓库**。
- `REMOTE_DIR` 推断逻辑：`local-<x>` 对应 `remote-<x>`（如存在），否则对应 `<x>`。
- 脚本在 `REMOTE_DIR` 上下文执行 `git checkout`，利用 worktree 共享 git 数据库的特性。
- 拒绝在 remote 目录处于 `SOURCE_BRANCH` 时运行。
- `chmod +x scripts/merge-from-local.sh`。
- 如检测到 Windows 用户，附带生成 `scripts/merge-from-local.ps1` 等价实现。

### Step 7. 加固 .gitignore（可选但推荐）

- 检查 worktree 内 `.gitignore`，如有纯本地缓存（`.codegraph/`、`logs/`、IDE 文件）补充进去。
- **注意**：`CLAUDE.md` / `.ai/` / `.claude/` 是要在 local 分支被 git 跟踪的（这样 worktree 切换时不丢），它们靠**合并白名单排除**而非 `.gitignore` 来实现「不进主分支」。不要把它们加入 `.gitignore`。

### Step 8. 提交 + 输出摘要

- 在 local 分支提交初始化产物：`git add -A && git commit`（commit message 用 `chore: bootstrap local worktree (dt:init + push guard + merge script)`，绝不含 AI 署名）。
- **不执行任何 push**（hook 也会拦截）。
- 输出 onboarding 摘要：
  - worktree 路径 + 分支名 + 基线 commit
  - SYNC_PATHS 白名单 + 排除清单
  - 生成的文件清单（CLAUDE.md push 段、prevent-push.sh、settings.json、merge 脚本）
  - 下一步指引：如何在目标分支运行 merge 脚本同步业务代码

---

## Hard Constraints

- 禁止在原仓库工作树直接初始化；必须在原仓库**同级目录**生成独立 worktree + 独立分支。
- worktree 目录命名遵循 `remote-<x>`→`local-<x>`，否则 `local-<repo>`；`--worktree-dir` 可覆盖。
- 禁止用 `git merge <BRANCH>` 把 local 分支整体并入主分支。
- 禁止把初始化产物加入合并白名单。
- 禁止 push local 分支（CLAUDE.md 规则 + PreToolUse hook 双保险）。
- 禁止在 commit message 中加入任何 AI 署名（`Co-Authored-By` 等）。
- 所有生成文件 UTF-8 无 BOM；文档/脚本注释一律英文。
- 禁止在遇到 stale worktree 报错时使用 `git worktree add -f` 强制覆盖或手动删除原始仓库。必须先执行 `git worktree prune` 清理失效记录，再正常重建。**绝不删除原始仓库目录**。

## Example Prompts

- `/dt:local-worktree /Users/hoyn/Documents/小园长/bim-cloud-manage/remote-bim-cloud-manage` — 在 `bim-cloud-manage/` 下生成 `local-bim-cloud-manage` worktree 并完成全部初始化
- `/dt:local-worktree /path/to/remote-myproj --branch local` — 指定分支名
- `/dt:local-worktree /path/to/remote-myproj --worktree-dir /tmp/myproj-sandbox` — 显式指定 worktree 目录
- `/dt:local-worktree /path/to/remote-myproj --dry-run` — 仅预览推断结果与白名单，不落盘

## Relationship to Other Skills

- 复用 `dt:init` 做实际的项目初始化与规则生成；本 skill 负责 worktree 隔离 + push 防护 + 白名单合并这层「安全外壳」。
- 与 `dt:push` 互斥：local 分支严禁 push，`dt:push` 不应在该分支运行。
