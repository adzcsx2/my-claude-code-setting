# Docs Taxonomy

本文件定义 `dt:init` 对 `/docs` 的建立、分类映射、任务聚合和报告归档规则。

## Docs Root

- 默认文档根目录是 `/docs`
- 如果仓库没有 `/docs`，需要创建 `/docs`
- 如果仓库已有 `doc/`、`documentation/`、`wiki/` 等目录，不要直接删除；先判断是否已承担主文档目录职责
- 只要项目最终仍缺少 `/docs`，就必须创建 `/docs` 作为后续 AI 的标准文档入口

## Standard Categories

默认标准分类目录（必须创建，若不存在）：

- `plan`：计划、方案、roadmap、todo
- `product`：产品需求、PRD、用户故事、验收标准、功能范围
- `design`：设计、架构、ADR、spec
- `guide`：接入、使用、操作、runbook
- `modules`：模块说明、目录边界、组件总览
- `references`：参考资料、术语、索引
- `checklist`：核对清单、审计清单、初始化清单
- `reports`：测试、审计、性能、复盘报告

如果用户、团队规范或仓库现状明确存在额外分类语义，也必须纳入分类表。

`api` 不是默认强制分类；只有项目或用户需求明确需要 API 文档分类时才创建。

## Semantic Folder Mapping

- 分类以语义为准，不以字面完全一致为准
- 如果标准分类已有语义等价目录，则复用现有目录，不再重复创建
- 例如已有 `/docs/plans`，就不要再创建 `/docs/plan`
- 例如已有 `/docs/requirements`、`/docs/prd` 或 `/docs/product-docs`，就不要再创建 `/docs/product`
- 只有在找不到语义等价目录时，才创建标准目录名

## Creation Rules

- 若 `/docs` 不存在，创建 `/docs`
- 若 `/docs` 存在但缺少分类层级，必须立即创建缺失的标准分类目录
- 若项目已有分类但命名不完全标准，优先保留原目录并记录映射，不强制重命名
- 不要在仓库根目录、临时目录或任意子模块下随意散落新文档，除非项目已有明确且稳定的非 `/docs` 约定

执行要求：

1. 识别 `/docs` 下已存在的目录
2. 对比标准分类列表，找出缺失目录
3. 创建所有缺失目录
4. 在输出中明确列出已创建目录

## Task-Scoped Documentation

触发条件：一个工作项会产出 >=3 份关联文档时，使用任务聚合子目录；1-2 份独立文档按传统分类归档。

位置约定：`docs/plan/<task-slug>/`，`<task-slug>` 使用英文 kebab-case。

最低结构要求：

- `README.md`：任务背景、文档清单、建议阅读顺序、关联源码、任务状态
- `00-执行文档.md`：进度指针、断点续做协议、Phase checklist、执行日志

其他约定：

- 任务聚合子目录内的文档不重复落到 `docs/design/`、`docs/guide/` 等顶级分类
- 任务聚合文档不直接修改项目单一事实源
- `docs/README.md` 的计划文档章节必须列出活跃任务子目录

完整协议见 `dt:plan-doc`。

## Report Topic Folders

以下点时间报告类文档默认先创建主题目录，再在目录内创建各轮报告文件：

- 审计
- 性能
- 评估
- 复盘

推荐结构：

```text
docs/reports/<report-topic>/<report-file>.md
```

规则：

- 不要把这类单个报告 `.md` 直接平铺到 `docs/reports/`
- 同一主题的二次、三次或更多轮报告，继续复用同一主题目录
- 持续更新日志如 `CHANGELOG.md` 不受此规则约束，可直接放在 `docs/reports/` 根下

## Future AI Rules

初始化后，生成的 `CLAUDE.md` 和 Copilot 项目级配置必须显式写入这些精简版规则：

- 新文档默认放在 `/docs` 下
- 新建文档前，先检查 `/docs` 及其现有分类是否已有语义等价目录，有则复用
- 默认不要在仓库根目录新增零散 `.md` 文档
- 多文档工作项统一聚合到 `docs/plan/<task-slug>/`
- 审计 / 性能 / 评估 / 复盘类报告默认使用 `docs/reports/<report-topic>/`
- `CHANGELOG.md` 这类持续更新日志可保留在 `docs/reports/` 根下
