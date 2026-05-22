---
name: dt:project-skills
description: "Manage canonical project-local AI skills under .ai/skills/: list skills, audit duplicates or overlaps, sync updates with confirmation, promote successful changes into skills, merge overlapping skills, and define the canonical mirror-refresh policy used by Claude project hooks."
argument-hint: "<list|audit|sync|promote|merge|export> [args]"
origin: dev-tools-skills
---

> 中文环境要求
>
> - 面向用户的回复、确认提示和审计结论必须使用中文
> - 默认生成或更新的项目级 canonical skill 文件使用英文，便于 Claude、Cursor、Copilot、Codex 共用
> - 所有生成文件必须使用 UTF-8 编码

# project-skills Skill

统一的项目级 AI skill 生命周期入口。它以 `.ai/skills/` 作为唯一事实源；如果项目启用了 Claude project hook，hook 只是执行 mirror refresh，而这份 skill 仍然是同步规则与 proposal 语义的唯一来源。

## Trigger

```text
/dt:project-skills <list|audit|sync|promote|merge|export> [args]
```

## When to Use

- 用户说“帮我总结一下加到 skill 里”“把这次修改沉淀成 skill”“把上面的经验补到对应 skill”
- 需要检查项目里已有 skill 是否重复、重叠、可融合
- 需要把一次成功实现提炼成可复用的项目级 skill
- 需要同步更新 `.ai/skills/` 下的 canonical skill，并把已配置工具的镜像一起刷新，但更新前必须先征求确认
- 需要按项目里已配置的 Claude / Codex 等工具自动刷新派生层
- 需要按需导出 Copilot 或其他非默认镜像适配层

## Core Model

### 1. Canonical Source Only

项目级 skill 的唯一事实源始终是：

- `.ai/skills/`
- `.ai/skills/registry.yml`
- `.ai/skills/.updates/`

强制规则：

- 只修改 `.ai/skills/` 下的 canonical skill 和注册表
- 不直接手改 `.claude/skills/`、`.ai/exports/codex/`、Copilot 或其他工具导出层
- 如需导出到其他工具，必须从 `.ai/skills/` 派生

### 2. Sync To Configured Tools Only

默认不假设任何工具镜像存在。`sync`、`promote`、`merge` 只同步到项目里已经配置好的 tool surfaces；如果项目里没有配置任何可识别的 tool mirror，则只更新 canonical source。

配置工具的判断顺序必须是：

1. 先读取 `dt:init` 写入 `.ai/README.md` 的 `## Configured Tool Mirrors` 段落；这份记录是项目级镜像配置的一手说明
2. 如果当前会话用户明确要求启用某个工具 mirror，把该工具加入本次同步目标
3. 兼容旧项目：若存在既有 `.claude/skills/`、`.ai/exports/codex/`、`.codex/` 或 legacy `tool_exports: [claude|codex]` 记录，可视为已配置信号
4. 若以上都没有，再判定为“未配置”

判定约束：

- `.ai/README.md` 中 configured tools 列表未出现的工具，默认视为当前项目未启用
- 如果 `.ai/README.md` 已明确列出 configured tools，步骤 2-3 只能作为补充启用信号，不能用来推翻 `.ai/README.md` 中对某工具的“未启用”结论
- 只有当 `.ai/README.md` 缺失或未写明 configured tools 时，才允许完全依赖步骤 2-3 做回退判断

最少支持这些判断：

- `claude`：`.ai/README.md` 声明了 `claude`，或当前会话用户明确要求启用，或存在既有 `.claude/skills/` / legacy `tool_exports: [claude]`
- `codex`：`.ai/README.md` 声明了 `codex`，或当前会话用户明确要求启用，或存在既有 `.ai/exports/codex/`、`.codex/` / legacy `tool_exports: [codex]`
- 其他工具：仅在 `.ai/README.md` 声明、当前会话用户明确要求启用，或仓库里已有明确目录/文件约定时纳入

执行规则：

- `.ai/skills/` 仍是唯一事实源
- `sync`、`promote`、`merge` 在更新 canonical source 后，默认同步 `tool_exports` 覆盖到的且“项目已配置”的工具
- `tool_exports: follow_configured_tools` 表示直接跟随当前项目已配置工具集合
- 如果 `tool_exports` 是显式列表，实际同步目标等于“显式列表 ∩ 已配置工具集合”
- 如果只检测到 `claude`，就只同步 Claude
- 如果检测到 `claude` 和 `codex`，就同步这两个
- 如果没有检测到任何已配置工具，就不创建、不刷新任何工具侧镜像
- `.claude/skills/`、`.ai/exports/codex/` 等都是派生层，可被 `sync` 覆盖，不是手改入口
- 单次 `export codex` 只生成 view，不自动把 `codex` 写进 `.ai/README.md`；只有 `dt:init` 写入记录或用户明确要求启用 mirror 时，后续才持续自动同步
- `export copilot ...`、`export <tool> ...` 只在用户显式要求时执行，用于生成额外 view，而不是替代自动同步

### 2.5 Claude Hook Execution

如果项目由 `dt:init` 生成了 Claude project hook：

- `.claude/settings.json` 的 `PostToolUse` hook 只是执行层，不是规则源
- hook 只应在 canonical 相关文件被编辑后触发 mirror refresh
- hook 必须忽略 `.claude/skills/**`、`.ai/exports/**` 等导出层改动，避免循环
- hook 默认 fail-open，不能因为同步脚本报错而阻塞编辑
- 只有当当前会话能明确判定为 Claude Code 时，skill 才能把 direct refresh 交给 hook；若环境无法判定，一律执行 direct refresh，不冒险跳过
- duplicate-check、overlap-check、merge-check、proposal-before-write、configured tools 判定，仍然以本 skill 为准，不能搬进 hook 里各自实现一套

### 3. Proposal Before Write

除 `list` 外，任何会改动 `.ai/skills/` 的操作都必须先给出 proposal，再等待用户确认。

## Required Project Layout

如果目标项目没有下面这些 canonical 路径，先提示用户运行 `/dt:init`；只有在用户明确允许时，才按 `dt:init` 的 Phase 3.6 约束补同一套最小骨架：

```text
.ai/
├── README.md
└── skills/
    ├── registry.yml
    ├── .updates/
    └── project-skills/
        └── SKILL.md
```

可选派生层（只有工具已配置时才需要存在）：

```text
.claude/
├── settings.json
├── hooks/
│   └── sync-project-skills.sh
└── skills/
    └── ...

.ai/
└── exports/
    └── codex/
        └── ...
```

## Command Modes

### `list`

列出当前项目已有 project skill：

- skill 名称
- 用途摘要
- 当前状态（active / deprecated / merged）
- 是否存在待确认的更新提案

### `audit`

审计 `.ai/skills/`，重点检查：

- 重复 skill
- `When to Use` 高度重叠的 skill
- 明显应该合并却被拆开的 skill
- 缺少 canonical 说明、缺少 registry 记录、缺少状态字段的 skill

### `sync`

用于更新已有 project skill，并默认刷新所有“已配置且命中导出策略”的工具镜像，但必须先征求确认。若项目启用了 Claude project hook，这一套规则也应成为 hook 执行 mirror refresh 时遵循的语义来源。

执行步骤：

1. 扫描 `.ai/skills/` 与 `registry.yml`
2. 读取 `.ai/README.md`，判定当前项目的 configured tools
3. 判断哪些 skill 因最近改动、规则漂移或描述过时而需要更新
4. 生成 proposal，写明：
   - 建议更新哪个 skill
   - 为什么要更新
   - 是补充、重写局部还是合并
   - 影响哪些 canonical 文件
   - 检测到哪些已配置工具
   - 实际会同步哪些 skill 到哪些工具路径
   - 哪些工具因未配置而被跳过
5. 等用户确认后先更新 `.ai/skills/`
6. 仅当检测到 `.claude/hooks/sync-project-skills.sh` 且当前会话能明确判定为 Claude Code 时，才跳过直接 refresh，交给 hook；若环境无法判定，则仍执行 direct refresh，再把实际同步目标内的 skill 刷新到对应工具派生层
7. 如果本次是用户明确要求启用某个新工具 mirror，需同步更新 `.ai/README.md`
8. 最后报告 canonical 变更和各工具镜像变更

### `promote`

把一次“已经验证有效的实现”提炼成项目级 skill。

如果用户只说“帮我总结一下加到 skill 里”，默认进入 `promote`。

执行步骤：

1. 先读取本次改动、对话总结和相关代码路径
2. 对照已有 `.ai/skills/*/SKILL.md` 做重复检查
3. 做重叠检查和可融合判断
4. 输出 proposal：
   - 更新现有 skill
   - 新建 skill
   - 融合多个 skill
5. 用户确认后先写入 canonical source
6. 仅当检测到 `.claude/hooks/sync-project-skills.sh` 且当前会话能明确判定为 Claude Code 时，才跳过直接 refresh，交给 hook；若环境无法判定，则仍执行 direct refresh，再根据已配置工具列表，刷新目标 skill 的对应派生层；没有配置工具则只停留在 canonical source
7. 如果本次是用户明确要求启用某个新工具 mirror，需同步更新 `.ai/README.md`

### `merge`

当两个或多个 skill 已明显重叠时，合并为一个更清晰的 canonical skill，并在 `registry.yml` 中标记被合并项。

如果本次 `merge` 同时启用了新的工具 mirror，也必须同步更新 `.ai/README.md`。仅当检测到 `.claude/hooks/sync-project-skills.sh` 且当前会话能明确判定为 Claude Code 时，merge 后的 refresh 才交给 hook；若环境无法判定，则仍执行 direct refresh。

### `export`

按需从 `.ai/skills/` 生成额外工具适配层或强制重建某个工具 view。

规则：

- 只有用户明确说“生成 Copilot 版本”“导出 Codex 版本”时才执行
- 导出层是 view，不是事实源
- 不允许跳过 canonical source 直接在导出层手改
- 已配置工具的默认镜像优先由 `sync` / `promote` / `merge` 自动维护；`export` 用于补建、强制重建或额外工具 view
- `export copilot` 默认沿用 `dt:init` 的 Copilot 路径规则：已有 `AGENTS.md` 就更新 `AGENTS.md`，否则更新 `.github/copilot-instructions.md`
- `export codex` 默认写入 `.ai/exports/codex/` 派生视图；若项目已有明确 Codex 约定，优先复用项目既有位置

## Duplicate, Overlap, And Merge Heuristics

判断时至少检查这四类信号：

1. `When to Use` 是否服务同一类场景
2. 核心执行步骤是否大体相同
3. 产物和验收标准是否相同
4. 是否只是旧 skill 的一个新案例或新边界

默认判断规则：

- 如果只是给已有 skill 增加一个新边界或一条新规则，优先更新旧 skill
- 如果两个 skill 目标场景基本相同，但表达方式不同，优先建议 merge
- 如果只是“本次实现的流水账”，不要直接沉淀；必须先提炼成可复用规则
- 单次 promote 优先沉淀最小必要规则，不要把多个根因揉成一个巨型 skill

## Proposal Format

在任何写入前，先给出最小 proposal：

```text
project-skills proposal
- action: update existing | create new | merge existing
- target: <skill-name or skill set>
- rationale: <why>
- duplicate-check: <result>
- overlap-check: <result>
- configured-tools: <detected tools or none>
- export-impact: canonical only | plus configured claude/codex mirrors | plus explicit extra exports
- files-to-change:
  - .ai/skills/...
  - .ai/skills/registry.yml
  - <tool mirror paths if configured>
Please confirm before apply.
```

## Registry Minimum Fields

`registry.yml` 至少维护这些字段：

- `id`
- `name`
- `purpose`
- `origin` (`manual` / `promoted` / `synced`)
- `status` (`active` / `deprecated` / `merged`)
- `overlaps_with`
- `merged_into`
- `last_reviewed_at`
- `tool_exports`
- `update_policy`

默认值：

- `tool_exports: follow_configured_tools`
- `update_policy: manual_confirm`

兼容要求：

- 如果旧项目已有 `tool_exports: [claude]`、`[codex]` 等显式列表，不得因为 mirror 目录暂时缺失就静默停止同步
- 这类 legacy 显式列表应视为“项目原本意图同步到该工具”，下次 `sync` 时允许重新创建缺失的 mirror

## Acceptance Criteria

只有同时满足下面条件，才算完成：

1. canonical 改动只发生在 `.ai/skills/` source，所有工具侧文件都只作为同步镜像更新
2. 在写入前已完成重复检查、重叠检查和融合判断
3. 在写入前已给用户看过 proposal 并获得确认
4. 若检测到已配置工具，相关 skill 已同步刷新到这些工具的派生层；若未检测到，则只更新 canonical source
5. 如果涉及其他导出层，导出来源明确来自 `.ai/skills/`
6. 如果只是补充旧 skill 的局部边界，没有无意义新建 skill
7. 如果发现多个 skill 可融合，已明确给出 merge 建议而不是静默保留重复内容
