# Output Files

本文件定义 `dt:init` 生成或升级的项目级规则文件、Copilot 配置、onboarding 摘要以及可选 checklist 的要求。

## Output Constraints

生成的 AI 配置文件（`CLAUDE.md`、`AGENT.md`、Copilot 项目级配置）必须完整覆盖这些原则：

- GP-2 Single Sources of Truth
- GP-3 Reuse-First
- GP-4 File-Touch Discipline
- GP-5 Plan-First Triggers
- GP-6 Minimal Verification
- GP-7 AI Vibe Coding Constraints（精简版）
- GP-8 Copilot Config Exclusivity
- GP-9 Documentation Taxonomy（精简版）
- `.ai/skills/` canonical-only 规则与 project-skills proposal-first 工作流

## CLAUDE.md

默认行为是优化已有 `CLAUDE.md`，不是全量重写。只有以下情况才接近重写：

- 项目不存在 `CLAUDE.md`
- 现有内容严重过时且与代码冲突
- 用户明确要求重写

生成结果要求：

- 60 到 120 行优先
- 采用规则 + 路径索引的高密度写法
- 不复制 README 大段内容；不展开完整依赖表、完整构建教程、完整架构宣讲

必须显式包含：

1. 单一事实来源与证据要求
2. 复用优先规则
3. 触碰文件原则与计划触发条件
4. 最小验证规则，包含仓库默认验证命令
5. AI vibe coding 约束（精简版）
6. Copilot 配置互斥规则
7. 文档根目录、分类映射、新文档落位规则（含任务聚合与审计 / 性能 / 评估 / 复盘 reports 主题目录规则）
8. 真实目录结构、默认构建与测试方式
9. 项目级 skill 的唯一事实源是 `.ai/skills/`，修改 skill 时只改 canonical source，不手改导出层；若项目生成了 Claude project hook，则后续 refresh 由 hook 触发
10. 当用户要求“总结并加到 skill”时，先做重复 / 重叠 / 融合判断，先提 proposal 再写入
11. 若本次已升级旧版 AI 规则文件，注明已升级到当前 init 标准
12. 当前标准只约束后续 AI coding，不主动重构未被需求触碰的既有源码

若启用 experimental 模式，`CLAUDE.md` 必须基于变更后重新扫描的结果生成。

## AGENT.md

`AGENT.md` 是面向所有 AI 工具的通用规范文件，不包含平台特定语法。

内容要求：

- 50 到 80 行优先
- 采用纯文本描述，避免使用特定平台语法
- 不包含 Tool 调用、特定 Agent 指令等平台相关内容

必须包含：

1. 项目概览：项目名称和用途、技术栈列表、目录结构说明
2. 单一事实来源：构建文件胜过文档，目录扫描结果胜过经验推断
3. 通用编码规范：复用优先、AI vibe coding 约束、触碰文件与计划触发、最小验证、文件命名约定、提交信息格式
4. Copilot 项目级配置互斥：不同时维护 `AGENTS.md` 与 `.github/copilot-instructions.md`
5. 项目级 skill 规则：`.ai/skills/` 是唯一事实源，只改 canonical source；若存在 Claude project hook，则 mirror refresh 由 hook 从 canonical source 驱动
6. 关键路径索引：主入口、公共组件/工具类位置、文档目录结构、任务聚合子目录约定，以及审计 / 性能 / 评估 / 复盘报告的 `docs/reports/<report-topic>/` 目录约定
7. 常用命令：构建、测试、运行命令

若启用 experimental 模式，`AGENT.md` 必须基于变更后重新扫描的结果生成。

## Copilot Project Instructions

规则文件选择：

- 项目已有 `AGENTS.md` -> 更新 `AGENTS.md`
- 项目不存在 `AGENTS.md` -> 创建或更新 `.github/copilot-instructions.md`

无论使用哪一个，内容要求一致：

- 长度优先控制在 30 到 80 行；不能复制一整份 `CLAUDE.md`
- 只保留对所有任务都有帮助的规则
- 必须包含精简版 GP-2 至 GP-9：单一事实来源、复用优先、触碰文件与计划触发、最小验证、AI vibe coding、配置文件互斥、文档归档规则
- 如果项目已建立 `.ai/skills/`，必须补一句：项目级 skill 只改 `.ai/skills/` canonical source，不手改导出层；若项目存在 Claude project hook，则 hook 负责后续 refresh

若启用 experimental 模式，Copilot 项目级配置必须基于变更后重新扫描结果更新。

## Onboarding Summary

在会话中输出一份 2 分钟可扫完的摘要，至少包含：

- 项目是什么、技术栈、关键入口、目录地图
- 一条典型请求或调用链
- 主要约定、常用命令
- 我想改哪里该看哪里
- 文档应该放在哪个 `/docs` 分类目录
- 审计 / 性能 / 评估 / 复盘类报告应放在 `docs/reports/<report-topic>/`；`CHANGELOG.md` 可保留在 `docs/reports/` 根下
- 项目级 skill 在 `.ai/skills/`；若项目生成了 Claude project hook，则 canonical 改动后会自动触发 mirror refresh，否则只维护 canonical source

若启用 experimental 模式，摘要还必须额外包含：

- 本次属于 `converge` 还是 `sync`
- 变更涉及的关键目录或模块
- 风险点
- 最小验证结果
- 回滚说明摘要

## Optional Checklist Docs

只有用户明确要求时，才生成 `/docs` 下的 checklist 文档；如果项目已有语义等价目录，如 `/docs/checklists`，则复用该目录。

可选模板：

- `references/checklist-templates/api.md`
- `references/checklist-templates/dependencies.md`
- `references/checklist-templates/modules.md`

所有 checklist 都必须满足：

- 只写真实扫描到的信息
- 不保留占位字段
- 不补示例内容
- 无法验证的字段直接省略
