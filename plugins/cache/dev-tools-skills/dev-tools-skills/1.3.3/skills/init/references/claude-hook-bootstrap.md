# Claude Hook Bootstrap

本文件定义 `dt:init` 在 Claude Code 项目里如何生成项目级 hook，把 project-skills mirror refresh 从“文案提醒”变成“执行路径”。

## When To Bootstrap

如果当前环境是 Claude Code，或用户明确要求启用 Claude 项目自动化，必须在目标项目内生成：

```text
.claude/
├── settings.json
└── hooks/
    └── sync-project-skills.sh
```

若本次带 `--dry-run`，这些文件只输出预览，不写盘。

## Hook Requirements

- 作用域必须是项目级 `.claude/settings.json`，不是用户级 `~/.claude/settings.json`
- 事件使用 `PostToolUse`
- `matcher` 默认使用 Claude Code 官方文档示例里的 `Edit|Write`
- 若目标 Claude 版本暴露了额外编辑工具（如 `MultiEdit`），只能在验证真实 tool name 后再补独立 matcher 条目
- hook 类型使用 command hook
- 默认 fail-open：hook 失败不能阻塞编辑

脚本约束：

- 只处理 canonical 相关改动：
  - `.ai/skills/**`
  - `.ai/skills/registry.yml`
  - `.ai/README.md`
- 忽略 mirror 层改动，避免回环：
  - `.claude/skills/**`
  - `.ai/exports/**`
- 只读取 `.ai/README.md` 中 `## Configured Tool Mirrors` 段落
- 若没有 configured tool mirrors，直接成功退出，不做同步
- 必须执行明确的文件同步动作，不能只写成“调用 skill 语义”
- 脚本生成后必须设为可执行

## Dependency Check

生成前必须检查依赖：

- `command -v python3`
- `command -v jq`

若脚本依赖 `python3`、`jq` 或其他解析工具，必须在生成时确认可用；无法确认时，hook 仍然 fail-open，并明确标注 `not verified`。

## settings.json Example

推荐的 `.claude/settings.json` 最小结构：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/sync-project-skills.sh",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

## PostToolUse Input

`PostToolUse` stdin JSON 最低可依赖字段：

```json
{
  "tool_name": "Edit|Write",
  "tool_input": {
    "file_path": "/absolute/path/to/edited-file"
  }
}
```

提取路径时优先读取：

- `tool_input.file_path`

## sync-project-skills.sh Minimum Behavior

1. 从 stdin 读取 hook JSON
2. 提取 `tool_input.file_path`
3. 若路径不在 canonical source 范围内，直接退出
4. 若路径落在 mirror 层，直接退出
5. 读取 `.ai/README.md` 中 `## Configured Tool Mirrors` 段落
6. 若没有 configured mirrors，直接退出
7. 至少对 `.ai/skills/*/SKILL.md` 执行以下明确同步：
   - 若 configured mirrors 包含 `claude`：复制到 `.claude/skills/<skill-name>/SKILL.md`
   - 若 configured mirrors 包含 `codex`：复制到 `.ai/exports/codex/<skill-name>/SKILL.md`
8. 创建缺失的目标目录
9. 不同步 `.ai/skills/.updates/`

其他工具若没有本地文件型 mirror 约定，不由这个 Claude hook 隐式发明目标路径，继续走显式 export 或项目自定义适配层。

## Re-run Behavior

若 `.claude/settings.json` 已存在：

- 读取现有配置
- 检查 `hooks.PostToolUse` 是否已包含 `sync-project-skills.sh`
- 若已包含，跳过；若未包含，增量合并，不覆盖其他 hook 条目
- 若文件损坏且无法解析，先备份再重建

## Boundary

- hook 是执行层，不是规则源
- 完整同步规则仍以 `dt:project-skills` 与 `.ai/README.md` 为准
