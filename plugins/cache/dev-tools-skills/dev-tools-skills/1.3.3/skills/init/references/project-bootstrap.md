# Project Bootstrap

本文件定义 `dt:init` 如何建立 `.ai/skills/` canonical source、configured mirrors 记录，以及项目内 `project-skills` 元 skill。

## Canonical Source

项目级 skill 的唯一事实源必须是：

```text
.ai/
├── README.md
└── skills/
    ├── registry.yml
    ├── .updates/
    └── project-skills/
        └── SKILL.md
```

强制要求：

- 若 `.ai/` 不存在，必须创建 `.ai/`
- 若 `.ai/skills/` 不存在，必须创建 `.ai/skills/`
- 若 `.ai/README.md` 不存在，必须创建
- 若 `registry.yml` 不存在，必须创建最小注册表
- 若 `.updates/` 不存在，必须创建，用于存放待确认更新提案
- 若 `project-skills/SKILL.md` 不存在，必须创建项目内元 skill，说明 `.ai/skills/` 是 canonical source

## Registry Minimum Fields

`registry.yml` 至少维护这些字段：

- `id`
- `name`
- `purpose`
- `origin`
- `status`
- `overlaps_with`
- `merged_into`
- `last_reviewed_at`
- `tool_exports`
- `update_policy`

默认值建议：

- `status: active`
- `overlaps_with: []`
- `merged_into: null`
- `last_reviewed_at: <today-iso-date>`
- `tool_exports: follow_configured_tools`
- `update_policy: manual_confirm`

## Bootstrapped project-skills Meta Skill

bootstrapped `.ai/skills/project-skills/SKILL.md` 至少包含这些内容：

- 标题明确为项目内 project-skills 元 skill
- 写清 `.ai/skills/` 是唯一事实源
- 写清 mirror refresh 只从 canonical source 派生，不手改 `.claude/skills/`、`.ai/exports/`
- 写清如果项目存在 `.claude/hooks/sync-project-skills.sh`，则 Claude 会在 canonical 改动后自动触发 refresh
- 写清“帮我总结一下加到 skill 里”默认触发 duplicate-check、overlap-check、proposal、确认后写入

建议最小模板：

```markdown
---
name: project-skills
description: Canonical project-local skill governance.
---

# project-skills

- Canonical source: `.ai/skills/`
- Do not hand-edit `.claude/skills/` or other exports
- If `.claude/hooks/sync-project-skills.sh` exists, Claude triggers mirror refresh after canonical edits
- Configured tool mirrors are recorded in `.ai/README.md`
- When the user says "summarize into a skill": duplicate-check -> overlap-check -> proposal -> confirm -> write
```

## Configured Tool Record

`dt:init` 只负责把“当前项目已配置哪些 mirrors”规范化并记录到 `.ai/README.md`；完整的同步判定逻辑与 refresh 语义由 `dt:project-skills` 定义。

### Detection

在第一次生成 `.ai/README.md` 前，必须先判断项目里哪些 tool mirrors 已配置。判断顺序：

1. 若 `.ai/README.md` 已存在，先读取其中的 `## Configured Tool Mirrors`
2. 再看仓库里已有的工具镜像或工具约定目录
3. 再看用户是否在当前需求里明确要求启用某个 tool mirror
4. 兼容旧项目：如果存在 legacy `tool_exports: [claude|codex]` 记录，也视为该工具原本已启用
5. 最终把确认后的结果写回 `.ai/README.md`

最少支持这些判断：

- `claude`：存在 `.claude/skills/`，或用户明确要求启用 Claude mirror，或检测到 legacy `tool_exports: [claude]`
- `codex`：存在 `.ai/exports/codex/`、`.codex/`，或用户明确要求启用 Codex mirror，或检测到 legacy `tool_exports: [codex]`
- 其他工具：仅在仓库里已有明确目录/文件约定，或用户明确要求接入时纳入

最少要求：

- 记录 configured tool mirrors，供后续 `dt:project-skills` 与 Claude hook 读取
- 记录 `.ai/skills/` 是 canonical source，工具侧文件不是事实源
- 如果当前没有已配置 tool mirror，也必须把空状态写清楚
- 如果项目未来新增或移除 tool mirror，必须先更新 `.ai/README.md`

固定段落格式：

```markdown
## Configured Tool Mirrors

- claude: .claude/skills
- codex: .ai/exports/codex
```

若当前没有任何已配置 mirror：

```markdown
## Configured Tool Mirrors

- none
```

这里记录的是项目采用的约定 mirror 路径；默认 Claude hook 按这些约定路径工作，不在运行时再发明其他目标位置。

## Boundaries

- `CLAUDE.md`、`AGENT.md`、`AGENTS.md`、`.github/copilot-instructions.md` 这些规则文件本身不自动等价为“已启用 mirror”
- 单次 `export <tool>` 生成的 view，不自动等价为“长期已配置 mirror”
- `dt:init` 只保留最小原则说明；不要在 init 主 skill 里复制 `dt:project-skills` 的整套 sync / proposal 细则
