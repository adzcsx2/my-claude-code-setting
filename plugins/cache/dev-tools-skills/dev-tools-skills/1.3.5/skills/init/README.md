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
- 主 `SKILL.md` 会先按顺序读取 `references/general-principles.md`、`references/recon-and-stack-detection.md`、`references/docs-taxonomy.md`、`references/project-bootstrap.md`、`references/claude-hook-bootstrap.md`、`references/scoped-rules-and-enforcement.md`、`references/output-files.md`
- 写入 9 条 scoped-rules 与强制原则（SR-1 至 SR-9），把“只靠超长规则文件约束 AI”升级为“规则模块化 + 目录级就近规则 + Linter 强制 + 任务步骤拆分 + 依赖注入隔离 + 测试反 Mock 与环境防呆”：
  - SR-1: Why Not One Heavy File - 避免单文件臃肿与注意力涣散
  - SR-2: Modular Doc Architecture - 规则按主题拆到 `.ai/rules/<topic>.md`，主控文件只写红线 + 索引、按需加载
  - SR-3: Directory-Scoped Rules - 利用就近原则在 `src/` / `tests/` 等目录边界做物理隔离，防止 Mock 渗透生产代码
  - SR-4: Linter-Enforced Boundaries - 用 ESLint `no-restricted-imports`、Ruff、ArchUnit 等强制依赖边界，优先增量补充已有工具，不擅自引入新工具
  - SR-5: Split AI Task Workflow - 接口约定 -> 人类确认 -> 编写业务 -> 编写测试 的分步 TDD/BDD 工作流
  - SR-8: Dependency Injection Enforcement（栈感知）- 外部依赖经接口/注入隔离，业务函数禁止直接实例化或发真实请求；按侦察到的栈（后端 / Flutter / Web 等）生成对应写法，侦察不到外部依赖则不写
  - SR-9: Test Strategy And Env Safeguard（栈感知）- 集成测试反 Mock、负面边界、环境防呆；按栈选环境判断写法（Node `process.env`、Flutter `kReleaseMode`、Web `import.meta.env`），禁止跨栈套用
  - SR-6/SR-7: 明确生成规则文件必须携带的内容与边界约束（含栈感知 + 条件生成）
- SR-8 / SR-9 采用“栈感知 + 条件生成”：Flutter 项目只生成 Flutter 那套，后端项目只生成后端那套，不适合的栈不写、不跨栈套用
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
- 在所有步骤之前自动检测本地 CodeGraph 安装状态，若已安装但项目未初始化 `.codegraph/` 则自动执行 `codegraph init -i`
- 所有文件生成后自动对产出的规则文件（CLAUDE.md、AGENT.md、Copilot 配置）做完整性审查，检查必备内容是否覆盖、各文件是否一致、是否有遗漏的规则类别，发现 gap 自动补充修复
- 在所有文件生成和 review 完成后，自动确保 `.codegraph/` 已加入项目的 `.gitignore`，防止 codegraph 索引目录被提交到版本控制

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

| 参数                    | 说明                                                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 无参数                  | 标准 init，只做侦察、总结和规则文件生成或优化，不允许主动改架构；如果项目已有旧版 init 产物，会增量升级到当前标准 |
| `[optional focus]`      | 可选关注模块、技术栈或目录范围，例如 `web app`、`android`，所有结论仍必须由真实代码验证                           |
| `--experiment converge` | 启用架构收敛模式，用于新项目第一版或迁移早期对已落地结构做统一                                                    |
| `--experiment sync`     | 启用同步更新模式，用于已有架构在新增目录、模块或调用链后同步更新 AI 规则与路径映射                                |
| `--dry-run`             | 只输出侦察结果、变更预览、风险、验证项和回滚点，不落盘、不移动文件、不改配置                                      |

> 注意：`--experiment` 只允许使用这个开关名，不接受其他别名。只写 `--experiment` 但未指定 `converge` 或 `sync` 时，需要先澄清意图。

---

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，请修改 SKILL.md 后运行 /dt:update-remote-plugins。
