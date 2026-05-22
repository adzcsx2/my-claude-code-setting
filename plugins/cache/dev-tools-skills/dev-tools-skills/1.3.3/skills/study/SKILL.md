---
name: dt:study
description: "Capture one verified root cause back into the current workspace source skill, keep rule updates minimal, and avoid cached copies and hardcoded paths."
argument-hint: "[target-skill] [issue-summary]"
origin: dev-tools-skills
---

> 中文环境要求
>
> - 面向用户的回复、注释、提示信息必须使用中文
> - AI 内部分析可以使用英文
> - 所有生成或更新的文档必须使用 UTF-8 编码
> - 输出优先简洁、可执行，避免扩写成长篇复盘

# study Skill

统一的已修复问题回写入口。用于把一次已经确认并修复的 skill 问题沉淀回工作区源 skill，补足可复用规则与边界，避免重复踩坑，而不是写冗长复盘。

## Trigger

```text
/dt:study [target-skill] [issue-summary]
```

## When to Use

- 某个 skill 的问题已经确认根因并完成修复，需要把约束补回源 skill
- 需要把一次真实失误沉淀成 1 到 3 条可执行规则，而不是保留在对话里
- 需要收紧已有 skill 的边界、扫描范围、验收条件或同步规则
- 需要明确只修改当前工作区源 skill，避免误改 ~/.claude 缓存、副本或 marketplace 镜像

## Example Prompts

- `/dt:study update-docs-flutter 漏掉 example/pubspec.yaml 扫描范围`
- `/dt:study skills/update-docs-flutter/SKILL.md 只补一个根因，不要写长复盘`
- `把这次已确认并修复的 skill 问题回写到源 skill，规则写短一点`
- `整理成可复用规则，但不要改 ~/.claude 缓存，也不要写绝对路径`

## Execution Flow

### 1. Confirm Workspace Source Of Truth

先确认目标只能是当前工作区里的源 skill。

强制约束：

- 只允许修改当前工作区下的 `skills/*/SKILL.md` 与必要的同目录 README.md
- 不允许把 `~/.claude`、插件缓存、marketplace 副本或安装结果当成事实源
- 如果当前工作区不存在 `skills/`、`.claude-plugin/plugin.json` 等 dev-tools-skills 结构，则停止执行
- 路径表达只能使用工作区相对路径、skill 名称和目录模式，禁止写死绝对路径

### 2. Capture Only One Root Cause

单次只沉淀一个根因。

- 先基于真实现象、已完成修复和现有 skill 文本确认唯一根因
- 一次只写 1 个根因
- 最终只落 1 到 3 条规则；超过 3 条说明范围过大，需要拆分下一次再写

### 3. Prefer Minimal Local Edits

优先补到已有段落，不新增经验专区。

- 优先修改已有的 `When to Use`、`Execution Flow`、`Acceptance Criteria`、`Notes`、映射表或示例
- 只有原位置无法承载时，才增加一个很短的小节
- 不新增“经验总结”“踩坑记录”“复盘大全”这类长篇区域

### 4. Write Reusable Rules

规则必须能阻止同类问题再次发生。

- 使用“必须”“不得”“仅在...时”这类可执行表述
- 规则要具体到文件类型、目录模式、触发条件或同步边界，但不要绑定个人机器环境
- 示例只用于说明规则，不替代规则本身

### 5. Sync Only What Changed

同步范围必须最小化。

- 当 SKILL.md 的用途、触发方式、关键限制、示例或用户必须知道的边界发生变化时，同步该 skill 的 README.md
- 如果只是压缩措辞、合并重复规则且不改变对外能力与使用方式，可以不动该 skill README.md
- 只有在新增、删除、重命名 skill，或影响根级技能索引、安装逻辑、发布元数据时，才同步根 README.md、README_EN.md、installer、marketplace
- 如果只是补充现有 skill 的内部执行规则，通常不要扩散修改根 README、installer、marketplace

### 6. Example: update-docs-flutter 漏掉 example/pubspec.yaml

如果 Flutter 文档更新只分析根目录 `pubspec.yaml`，漏掉 `example/pubspec.yaml` 或本地 `path` 依赖指向的附加 `pubspec.yaml`，说明依赖扫描范围定义不完整。

正确沉淀方式：

- 根因只写一个：Flutter 依赖分析范围只覆盖主工程，没有覆盖示例工程与本地 path 依赖目标
- 规则只保留最小必要约束，例如：
  1. 依赖分析不能只看根 `pubspec.yaml`，还必须扫描 `example/pubspec.yaml` 以及工作区内本地 path 依赖指向的附加 `pubspec.yaml`
  2. 如果这些附加 `pubspec` 的依赖块中含有注释的 `ref` 或 `version`，必须在 `DEPENDENCIES.md` 同时记录当前配置与注释版本
  3. 这些规则应直接并入项目识别、依赖分析或文件映射段落，不新增经验专区

## Acceptance Criteria

- 只修改当前工作区 source skill，不修改任何 `~/.claude` 缓存、副本或安装目录
- 规则文本中不出现绝对路径，路径表达均为工作区相对路径或模式
- 本次只沉淀 1 个根因，且最终新增或改写的规则总数为 1 到 3 条
- 优先复用已有段落，没有新增长篇经验区
- 如果 SKILL.md 的用户可见能力或关键限制发生变化，对应 README.md 已按需同步
- 根 README、installer、marketplace 只在技能目录或发布面变化时同步

## Notes

1. 事实源始终是当前工作区里的 source skill，不是 `~/.claude` 下的任何副本
2. 沉淀的是可复用规则，不是事件经过
3. 一次只解决一个根因，避免把多个问题揉成模糊长段落
4. 能改原段落就不要新开章节；能写 2 条规则就不要写 10 条
