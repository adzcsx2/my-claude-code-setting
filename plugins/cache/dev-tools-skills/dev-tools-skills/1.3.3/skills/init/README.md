# dt:init

统一跨技术栈项目初始化入口。现在采用“主 skill 编排 + references 细则”结构：主 `SKILL.md` 负责按步骤执行，详细规则拆分在 `references/` 下。基于真实代码和配置，生成或优化 CLAUDE.md、AGENT.md、Copilot 项目级指令，建立 `.ai/skills/` 项目级 canonical skill 工作面，在 Claude Code 项目里生成 project-level PostToolUse hook，建立 `/docs` 分类规则，并输出简洁的代码库入门摘要。

---

## 功能特性

- 支持 Android、Flutter、React、Python、Java、Node.js 等项目
- 检测真实构建文件、入口点、目录结构和已有编码规范
- 生成或优化 CLAUDE.md、AGENT.md 及 Copilot 可读的项目配置
- 创建或升级 `.ai/README.md`、`.ai/skills/registry.yml`、`.ai/skills/.updates/`、`.ai/skills/project-skills/SKILL.md`，并检测/记录项目里哪些工具镜像已经配置
- 在 Claude Code 项目里生成 `.claude/settings.json` 与 `.claude/hooks/sync-project-skills.sh`
- 把“项目级 skill 只改 `.ai/skills/` canonical source”的规则写入生成的 CLAUDE.md 与 AGENT.md
- 建立 hook-first 的 Claude project-skills 工作流：`.ai/skills/` 是事实源；Claude project hook 负责在 canonical 改动后执行 mirror refresh
- 建立 `/docs` 根目录及标准分类体系，**强制创建缺失的标准分类目录**（plan、product、design、guide、modules、references、checklist、reports）
- 审计、性能、评估、复盘类报告默认按 `docs/reports/<report-topic>/` 主题目录组织，支持同一主题二次、三次审计持续追加；持续更新日志如 `CHANGELOG.md` 可保留在 `docs/reports/` 根下
- 主 `SKILL.md` 会先按顺序读取 `references/general-principles.md`、`references/recon-and-stack-detection.md`、`references/docs-taxonomy.md`、`references/project-bootstrap.md`、`references/claude-hook-bootstrap.md`、`references/output-files.md`
- 写入 10 条通用原则（GP-1 至 GP-10）：
  - GP-1: Evidence-Only Conclusions - 只基于真实代码和配置得出结论
  - GP-2: Single Sources of Truth - 建立并遵循各类事实来源映射
  - GP-3: Reuse-First - 搜索优先、复用优先、最小改动、局部一致
  - GP-4: File-Touch Discipline - 只修改需求直接相关文件
  - GP-5: Plan-First Triggers - 明确需要计划时的触发条件
  - GP-6: Minimal Verification - 最小验证规则和执行要求
  - GP-7: AI Vibe Coding Constraints - 源文件 500 行偏好（含显式例外）
  - GP-8: Copilot Config Exclusivity - AGENTS.md 与 copilot-instructions.md 二选一
  - GP-9: Documentation Taxonomy - `/docs` 分类规则与任务聚合约定
  - GP-10: Incremental Upgrade on Re-run - 重复执行时增量升级旧版规则文件
- 保留 Android 和 Flutter 本地一致性约束，适配其他技术栈
- 可在明确请求时生成已验证的 API、依赖和模块清单文档
- 确保后续 AI 复用已有文档分类目录，避免在 `/docs` 下创建语义重复目录或在仓库根目录散落文档
- 支持 `--experiment converge` 用于新项目首次版本或早期迁移架构收敛
- 支持 `--experiment sync` 在新增目录、模块或文件结构后同步更新 AI 规则和路径映射
- 支持 `--dry-run` 预览变更范围、风险、验证项和回滚点后再执行

## 语言要求

**所有生成的文档文件（CLAUDE.md、AGENT.md、清单文件）必须使用英文。**

## 使用方法

```bash
/dt:init
/dt:init [optional focus]
/dt:init --experiment converge
/dt:init --experiment sync
/dt:init --experiment converge --dry-run
```

### 参数说明

| 参数                      | 说明                                                             |
| ----------------------- | -------------------------------------------------------------- |
| 无参数                     | 标准 init，只做侦察、总结和规则文件生成或优化，不允许主动改架构；如果项目已有旧版 init 产物，会增量升级到当前标准 |
| `[optional focus]`      | 可选关注模块、技术栈或目录范围，例如 `web app`、`android`，所有结论仍必须由真实代码验证          |
| `--experiment converge` | 启用架构收敛模式，用于新项目第一版或迁移早期对已落地结构做统一                                |
| `--experiment sync`     | 启用同步更新模式，用于已有架构在新增目录、模块或调用链后同步更新 AI 规则与路径映射                    |
| `--dry-run`             | 只输出侦察结果、变更预览、风险、验证项和回滚点，不落盘、不移动文件、不改配置                         |

> 注意：`--experiment` 只允许使用这个开关名，不接受其他别名。只写 `--experiment` 但未指定 `converge` 或 `sync` 时，需要先澄清意图。

---

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，请修改 SKILL.md 后运行 /dt:update-remote-plugins。
