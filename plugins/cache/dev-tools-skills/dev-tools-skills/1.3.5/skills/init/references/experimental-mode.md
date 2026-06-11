# Experimental Mode

本文件定义 `dt:init --experiment` 的适用条件、dry-run 协议、允许改动范围与回滚/验证要求。

## Activation

- 本模式只在显式传入 `--experiment` 时启用，不能自动进入
- `--experiment converge`：用于新项目第一版、迁移早期或结构混杂阶段，对已落地结构做架构收敛
- `--experiment sync`：用于已有 AI 友好架构在新增目录、模块、文件结构或调用链后做同步更新
- 如果只写 `--experiment` 而没有指定 `converge|sync`，且无法从用户意图与仓库事实推断，必须先澄清

## Applicability

只有同时满足以下条件时，才允许进入 experimental 模式：

- 仓库中存在真实代码、目录、模块、构建配置或调用链证据
- 可以判定本次属于 `converge` 或 `sync` 之一
- 影响范围可描述，且可以给出 dry-run 预览
- 可以定义最小验证项
- 用户已显式传入 `--experiment`

## Forbidden Conditions

出现以下任一情况时，不得执行 experimental 架构改动：

- 用户未传入 `--experiment`
- 只有口头目标，没有真实代码或构建证据
- 无法判定 `converge` 还是 `sync`
- 无法给出 dry-run 预览或回滚说明
- 任务本质是新增业务功能，而不是结构收敛或同步更新
- 改动会导致同时维护 `AGENTS.md` 和 `.github/copilot-instructions.md`

## Allowed Change Scope

Experimental 模式允许：

- 源码移动与重命名、模块拆分与合并
- 构建配置调整、依赖组织整理
- 导出关系、路径映射、入口索引更新
- `CLAUDE.md` 更新
- `AGENTS.md` 或 `.github/copilot-instructions.md` 二选一更新
- 与架构收敛或同步更新直接相关的测试、文档和配置引用修正

Experimental 模式不允许：

- 顺带开发无关业务功能
- 借机重写不相关模块
- 在没有代码证据的前提下引入理想化新架构

## Dry-Run Requirements

只要进入 experimental 模式，就必须先给出 dry-run 预览；`--dry-run` 只是在此基础上停止执行。

Dry-run 至少包含：

- 拟变更对象
- 每项变更的代码或配置依据
- 影响范围
- 潜在风险
- 预期收益
- 最小验证项
- 回滚点

如果传入 `--dry-run`：

- 只输出侦察结论、变更预览和回滚说明
- 不创建、不修改、不移动任何文件
- 不更新任何规则文件

## Execution Order

1. 先完成标准侦察和局部一致性判断
2. 判定本次属于 `converge` 或 `sync`
3. 输出 dry-run 预览
4. 如果带 `--dry-run`，到此结束，不落盘
5. 先更新构建与模块声明，再执行源码移动、重命名、拆分或合并
6. 再更新依赖组织、导出关系、路径映射和相关引用
7. 完成结构改动后，重新扫描项目事实
8. 只基于变更后重新扫描的结果，更新 `CLAUDE.md` 与 Copilot 项目级配置
9. 完成最小验证
10. 输出回滚说明、验证结果和 residual risk

## Config Update Rules

- Claude 侧更新项目根目录 `CLAUDE.md`
- Copilot 侧只能更新 `AGENTS.md` 或 `.github/copilot-instructions.md` 其中之一
- 所有项目级规则必须基于变更后重新扫描结果生成，不能基于变更前状态写入
- 结构收敛或同步后若改变了 `src/` / `tests/` 等目录边界，必须同步 `references/scoped-rules-and-enforcement.md` 的目录级隔离规则与 Linter 强制说明

## Rollback Requirements

Experimental 模式必须输出回滚说明，至少包含：

- 回滚单位与受影响文件类型
- 已移动或重命名的路径
- 已调整的构建配置
- 已调整的依赖组织
- 已更新的 `CLAUDE.md` 与 Copilot 规则文件
- 需要反向恢复的关键步骤
- 无法自动回滚的部分

## Minimum Verification

至少完成以下四层验证：

- 构建层：确认模块声明、源码路径、依赖关系、构建入口未失配
- 引用层：确认关键 import、导出关系、入口文件、关键调用链未断裂
- 规则层：确认 `CLAUDE.md` 与 Copilot 项目级配置和变更后结构一致
- 范围层：确认没有越界改动到无关业务逻辑或无关目录

如果仓库存在默认验证命令，优先运行；如果没有，必须明确说明 `not verified`。
