# 基于 ECC 的自学习 Claude 工作台

[English](README.md)

这个仓库是一套可移植的 `~/.claude` 工作空间，核心是 **Everything Claude Code (ECC)**，并叠加了一套自定义的 **自学习 Skill 架构**（`my-skills`）。

它的重点不只是“把 prompts、skills 和 hooks 放进 git”，而是要让整套环境能够：

- 观察真实项目开发过程
- 自动捕获可复用的 bug / root cause / 修复路径
- 把这些经验整理成 skill 候选
- 再经过受控流程沉淀成正式 skill 库

这样你就不需要每个月都从零重新解决同一类问题。

## 这个项目是做什么的

这个仓库同时承担两件事：

1. **可跨机器复用的 Claude Code / ECC 工作环境**
2. **能把真实项目经验转成 Skill 的自学习架构**

第二点才是它最核心的价值。

## 主要功能

- **ECC 工作流核心层**：包含 **60 个 specialized agents**、**232 个 skills**、**75 个 legacy command shims**
- **自学习 Skill 管道**：调试中发现的 bug、根因和修复模式，可以被捕获、脱敏、排队、审查并沉淀到 `skills/my/`
- **自动 bug 总结为 Skill 候选**：observe-only hooks 会观察 root cause、fixed、resolved 等强信号，并写入 runtime candidate artifacts
- **历史经验回填**：通过 `/my-backfill` 可以把历史 transcript 转成 skill 草稿
- **受控 promote 与回滚**：通过 `/my-promote` 进入正式 skill 库，通过 `/my-undo` 做有边界的回滚
- **检索与分层加载**：先命中正确 skill，再按层加载，避免一次性吞掉太多 context
- **跨机器复现能力**：`.gitignore` 保留需要同步的内容，排除本机运行态、缓存和敏感文件

## 自学习架构

自学习层就是 `my-skills`。

### 高层流程

```text
真实项目工作
  -> hooks 观察可复用信号
  -> 脱敏与摘要
  -> 写入 runtime candidate
  -> 审查 / 精炼
  -> promote 到正式 skills
  -> 重建索引
  -> 后续遇到类似问题时再次被检索出来
```

### 它会学什么

典型候选包括：

- 一个反复出现、但根因不直观的 bug
- 一个值得复用的调试路径
- 一个经历了多次失败尝试后才找到的正确修法
- 某类平台/框架/工具链下的稳定处理模式

### “会自动生成 Skill”具体是什么意思

当前已经实现的是：

- **自动生成 Skill 候选 / 草稿**
- **自动把 bug 与修复过程总结成 runtime candidates**
- **可通过 `/my-backfill` 自动把历史 transcript 回填成 draft candidates**

但它并不是无门槛地把所有观察结果直接写进正式 skill 库。

当前边界是：

- hooks 会**自动采集并生成候选**
- backfill 在**被调用时**会自动生成 draft candidates
- 正式 skill 进入 `skills/my/` 之前，仍然走**受控 promote**

所以它是自学习的，但不是失控自写的。

## 实现原理

### 1. Observe

本地 hooks，尤其是 `PostToolUse` 和 `Stop`，会观察真实会话中的高价值信号。

常见信号包括：

- `root cause`
- `fixed`
- `resolved`
- 同一类 bug / solution pattern 的重复证据

这些 hooks 是 **observe-only** 的，不会直接修改正式 skill 库。

### 2. Redact and Summarize

捕获到的内容会先做脱敏和压缩，只把小而可控的摘要写入 runtime state，不会直接把完整 transcript 倒进正式区。

### 3. Queue Runtime Candidates

运行时候选会进入：

- `state/my-skills/pending/`
- `state/my-skills/inbox/`
- `state/my-skills/quarantine/`
- `state/my-skills/audit-log.jsonl`

这样 runtime 与 official package 区会天然分离。

### 4. 生成结构化 Skill 草稿

候选进一步整理后，会按 Skill 结构生成：

- `atom`：单个高价值 bug / root cause
- `cookbook`：相近问题合集
- `capability`：复杂系统或多步骤能力包
- `router`：主题路由入口

### 5. Promote 进入正式库

审查通过后，候选可以 promote 到 `skills/my/`，流程包括：

- 校验
- staging
- lock
- 机械化重建索引
- manifest 记录
- undo 回滚

### 6. 检索与按层加载

后续再遇到类似问题时，系统会尽量只加载必要层级：

1. machine index
2. `SKILL.md`
3. 必要时再读 `PLAYBOOK.md`
4. 再必要时只读某一个 `reference` 或 `example`

## 示例：一个 Bug 如何变成 Skill

```text
1. 你在项目里调试一个 Android state-loss bug，并找到真实根因
2. PostToolUse / Stop hooks 识别出可复用信号
3. 系统把脱敏后的候选写入 state/my-skills/pending/ 或 inbox/
4. 你审查候选，并精炼 summary / trigger terms
5. 通过 /my-promote 写入 skills/my/<category>/<slug>/
6. 系统机械化重建索引
7. 下次遇到类似 bug 时，/my-find 或 /my-test 就能检索到它
```

## Skill 结构为什么要分层

重点不是“多生成 skill”，而是“生成出来之后还能持续用”。

- `SKILL.md` — 机器入口层
- `PLAYBOOK.md` — 核心执行层
- `references/` — 事实层、规则层、边界层
- `examples/` — 样例层
- `README.zh-CN.md` — 面向人的说明层

## 仓库里有什么

- `agents/` — specialized subagents 和相关编排资产
- `skills/` — 可复用的 skill 包，包括 ECC skills 和个人扩展
- `commands/` — 命令入口和兼容层
- `hooks/` — Claude hook 接线与运行时自动化入口
- `scripts/` — 本地工具脚本和工作流自动化辅助
- `rules/` — 持续生效的规则和操作约束
- `plans/` — 架构说明、执行文档和交接文档
- `plugins/` — marketplace plugin 源、可移植插件资产和插件清单
- `mcp-configs/` — MCP 相关配置
- `state/` — runtime state、queues、logs、manifests 和本地运行产物

## 快速开始

### 新电脑初始化

1. 把这个仓库同步或 clone 到 `~/.claude`
2. 使用那台机器自己的 Claude 凭据和传输配置启动 Claude Code
3. 让 git 保留可移植内容，让 `.gitignore` 排除本机运行态

### 日常使用方式

#### A. 正常开发，系统被动学习

你照常开发即可。当你在项目里定位 bug、找到根因、完成修复时，observe-only hooks 会自动把高价值信号写成 runtime candidates。

#### B. 检索和调试学习链路

- `/my-test` — 只测试检索
- `/my-explain` — 解释某个 skill 为什么命中
- `/my-simulate-load` — 模拟 staged loading 与 context 成本
- `/my-find` — 手工搜索技能

#### C. 审查候选并沉淀为正式 Skill

- `/my-backfill` — 从历史 transcript 生成候选
- `/my-promote` — 把候选 promote 到 `skills/my/`
- `/my-undo` — 回滚某次有边界的 promote
- `/my-review` / `/my-health` / `/my-context-audit` / `/my-lint-skill` — 做治理和维护

示例：

```bash
node ~/.claude/scripts/my-skills/backfill.js --limit 5 --dry-run
node ~/.claude/scripts/my-skills/backfill.js --limit 5 --write-queue --queue inbox
node ~/.claude/scripts/my-skills/promote.js "<candidate path or id>" --dry-run
node ~/.claude/scripts/my-skills/promote.js "<candidate path or id>"
```

## 当前实现状态

`my-skills` 的主要实施里程碑已经完成到：

- foundation contracts
- root scaffolding and indexes
- seed package validation
- retrieval bootstrap
- command layer
- observe-only hook mode
- backfill and controlled promotion

也就是说，目前已经具备：

- 可运行的 runtime state 模型
- observe-only capture hooks
- 历史回填能力
- 受控 promote 能力
- 机械化索引重建
- manifest-based undo

## 相关文件

- `plans/my-skills-architecture-v0.4.md` — 主架构说明
- `plans/my-skills-execution.md` — 实施状态与里程碑记录
- `skills/my/_meta/observe-hooks.v1.md` — observe-only hook 合同
- `AGENTS.md` — 面向 agent 的简明说明
- `CLAUDE.md` — 个人工作原则与默认流程
- `plugin.json` — 插件 manifest 元数据
- `marketplace.json` — marketplace 打包元数据
- `PLUGIN_SCHEMA_NOTES.md` — 插件 manifest 校验坑点说明
