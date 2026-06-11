# General Principles

本文件定义 `dt:init` 在所有阶段都必须遵循的跨阶段原则。主 `SKILL.md` 只负责编排；执行细节以本文件为准。

## GP-1 Evidence-Only Conclusions

- 所有结论必须来自真实代码、配置文件或目录扫描
- 不推断、不猜测、不凭经验补全
- 无法确认的部分明确写 `unknown`

## GP-2 Single Sources of Truth

- 构建、版本、依赖：以真实构建文件为准
- 模块列表：以 settings.gradle、workspace 配置、package workspaces、monorepo 配置等为准
- 项目特有规则：以已有 `CLAUDE.md`、`AGENTS.md`、`.github/copilot-instructions.md`、README、开发规范文档为准
- 真实目录结构：以源码扫描结果为准
- 默认命令：以 package scripts、Makefile、Gradle、Maven、Flutter、Python 工具配置为准
- 项目级 canonical skills：以 `.ai/skills/` 为唯一事实源；工具导出层不是事实源
- 项目已配置的 tool mirrors：以仓库中真实存在的工具目录、导出目录或用户明确要求为准；生成的通用规则文件本身不自动等价为已启用 mirror
- 若文档与代码冲突，以代码和构建配置为准

## GP-3 Reuse-First

- 修改前先搜索目标文件同目录和同类实现
- 优先复用已有实现、公共工具和既有调用链
- 优先最小改动，不做无关重构
- 保持目标目录、相邻代码和现有风格一致
- 不主动引入新架构、新封装、新库，除非用户明确要求
- 局部已有旧写法或混合写法时，优先跟随局部，而不是强行全局统一

## GP-4 File-Touch Discipline

- 只修改与当前需求、bug 或用户指令直接相关的文件
- 不做顺手格式化、批量 import 重排、全仓库 lint fix 或无关重命名，除非用户明确要求
- 如果工作区已有未由当前 AI 产生的改动，必须保留并绕开；不要覆盖、回滚或重写用户改动
- 修改大文件时只触碰必要片段；不要借机整理整文件
- 新增文件前先确认现有目录、模块或工具是否已经能承载该职责

## GP-5 Plan-First Triggers

后续 AI coding 遇到以下情况时，必须先给出简短计划或向用户确认，再执行：

- 预计修改超过 3 个源码文件
- 跨模块、跨包、跨服务或跨端改动
- 新增依赖、构建配置、脚本、CI 或运行时配置
- 改动 public API、数据模型、路由、权限、持久化格式或迁移逻辑
- 需要重构、移动文件、拆分模块或改变目录边界
- 需求、验收标准或影响范围不清晰

## GP-6 Minimal Verification

- 每次代码改动后优先运行与改动范围最小相关的 test、lint、typecheck、build 或 smoke 验证
- 如果仓库提供默认验证命令，必须在生成的 AI 规则文件中记录
- 如果没有可执行验证命令，必须明确写 `not verified` 或同等说明
- 文档-only 改动至少检查路径、链接、分类和规则文件一致性
- 验证失败时，优先修复当前改动引入的问题，不顺手修历史问题

## GP-7 AI Vibe Coding Constraints

- 源码文件优先控制在 500 行以内；接近或超过 500 行时，优先拆分职责清晰的组件、service、helper、module 或测试文件
- 不要继续向已经过大的文件追加无关逻辑；除非当前变更本身是局部 bug fix 或必须保持框架入口完整
- 单个文件只承担一个清晰职责；跨职责逻辑应按项目现有目录结构拆分
- 新增代码优先放在可复用、可测试、可检索的小单元中，避免大段内联实现
- AI 面向文档必须低 token、高密度、可锚定；长文档应拆分到 `/docs` 对应分类，并通过索引互链
- 例外：生成文件、lockfile、迁移文件、快照、vendor、第三方代码、协议生成物、框架强制入口和已有大型遗留文件
- 不要为了满足 500 行偏好而主动重构未被需求触碰的既有代码

## GP-8 Copilot Config Exclusivity

- 项目已存在 `AGENTS.md` -> 只更新 `AGENTS.md`
- 项目不存在 `AGENTS.md` -> 创建或更新 `.github/copilot-instructions.md`
- 永远不同时维护两份 Copilot 项目级指令文件

## GP-9 Documentation Taxonomy

- 默认文档根目录是 `/docs`
- 标准分类：`plan`、`product`、`design`、`guide`、`modules`、`references`、`checklist`、`reports`
- 新建目录前必须先检查语义等价目录，有则复用
- 初始化时必须创建缺失的标准分类目录
- 多文档工作项（>=3 份关联文档）统一聚合到 `docs/plan/<task-slug>/`
- 审计 / 性能 / 评估 / 复盘类报告统一写到 `docs/reports/<report-topic>/`
- `CHANGELOG.md` 这类持续更新日志可保留在 `docs/reports/` 根下

## GP-10 Incremental Upgrade On Re-run

- 项目已有 `CLAUDE.md`、`AGENT.md` 或 Copilot 配置时，必须增量升级到当前 init 标准
- `"文件已存在"` 不是跳过升级的理由
- 升级 AI 规则文件不等于主动重构源码
