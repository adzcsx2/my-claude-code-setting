# Scoped Rules And Enforcement

本文件定义 `dt:init` 如何把“只靠一个超长规则文件约束 AI”升级为“规则模块化 + 目录级就近规则 + 工具强制校验 + 任务步骤拆分”。核心思路：**不要把所有约束都塞进一个 `CLAUDE.md`，而是按需加载、按目录隔离、用 Linter 强制、用工作流拆分。**

主 `SKILL.md` 只负责编排；本文件负责这一维度的细则。

## SR-1 Why Not One Heavy File

把所有规则、边界条件、业务背景塞进单个 `CLAUDE.md` 或全局规则文件会导致：

- 文件臃肿、token 消耗大
- AI 注意力涣散（lost in the middle），规则越多越容易忽略关键约束
- 规则之间互相冲突、难以维护

因此 `dt:init` 生成的规则体系必须遵循四个维度：

1. 文档架构：规则模块化、按需加载
2. 目录级规则：利用就近原则做物理隔离
3. 代码架构：用 Linter 强制代替口头警告
4. 开发工作流：拆分 AI 任务步骤

## SR-2 Modular Doc Architecture (Load On Demand)

不要把所有规则写进一个文件。生成的规则体系必须分层：

- 主控路由（`CLAUDE.md` / Copilot 配置）：只写**最致命的红线** + **指向细则文件的索引**，保持高密度、低 token
- 细则文件：拆到 `.ai/` 下专门给 AI 看的规则目录，按主题分文件

推荐的 AI 规则目录结构（仅在项目有真实需求时建立，不要凭空塞满）：

```text
.ai/
├── README.md
├── rules/
│   ├── 01-architecture.md   # 整体架构与边界
│   ├── 02-testing.md        # 测试规范（重点：生产代码禁止 Mock）
│   ├── 03-api-rules.md      # 接口对接规范
│   └── ...                  # 其他按主题拆分的规则
└── skills/                  # canonical skills（见 project-bootstrap.md）
```

主控路由里的索引写法示例（生成到 `CLAUDE.md` 时使用英文）：

```markdown
Before writing code, read the relevant rule file on demand:

- Writing tests? Read `.ai/rules/02-testing.md`
- Touching APIs? Read `.ai/rules/03-api-rules.md`
- Production code in `src/` must never contain mocks; see `.ai/rules/01-architecture.md`
```

生成要求：

- 只在项目真实存在对应关注点时才创建 `.ai/rules/<topic>.md`；不要为没有的关注点造空文件
- 每个 rule 文件聚焦单一主题，低 token、高密度、可锚定
- `CLAUDE.md` 与 Copilot 配置只保留红线 + `@`/路径索引，不复述细则全文
- 若项目已有等价的 AI 规则目录（如 `docs/ai/`、`.cursor/rules/`），优先复用，不重复造目录

## SR-3 Directory-Scoped Rules (Near Principle)

利用 AI IDE 的就近原则，在子目录放置作用域规则文件，从物理目录层面切断 AI 的不良倾向（典型场景：防止 Mock 数据渗透进生产代码）。

### 检测与适配

- 先检测项目实际使用的 AI 工具，决定 scoped 规则文件的真实文件名：
  - Cursor：`.cursor/rules/*.mdc` 或子目录 `.cursorrules`
  - Windsurf：子目录规则文件
  - Copilot：`.github/instructions/*.instructions.md`（用 `applyTo` glob 限定作用域）
  - Claude Code：可在子目录放 `CLAUDE.md`（就近加载）
- 不要假设项目用某个 IDE 就硬塞对应文件；只在能确认工具约定或用户明确要求时落盘
- 若无法确认 IDE，把目录级隔离规则写进主 `CLAUDE.md`，用明确的“按目录区分”段落表达，不强行创建子目录规则文件

### 典型隔离：src vs tests

生产代码目录规则（如 `src/` 下的规则文件，内容用英文生成）：

```text
You are a production-code expert. All code in this directory must be real business logic.
Strictly forbidden: introducing any mock data, fake return values, or test-only libraries.
All data must come from injected dependencies or real interfaces.
```

测试代码目录规则（如 `tests/` 下的规则文件）：

```text
You are a testing expert. In this directory you may freely use Mock, Stub, and Spy
to isolate external dependencies. Do not modify the internal logic of the code under test.
```

效果：AI 在 `src/` 下改代码时只触发 `src/` 规则，在 `tests/` 下只触发测试规则，天然形成隔离。

### 生成要求

- 只为项目真实存在的目录边界（如 `src/` 与 `tests/`、`lib/` 与 `test/`、`app/` 与 `__tests__/`）生成 scoped 规则
- scoped 规则只描述该目录的约束，不复述全局规则
- 不要在每个子目录都塞规则文件；只在有明确隔离价值的边界处放置

## SR-4 Linter-Enforced Boundaries (Tools Over Words)

**最强、最一劳永逸的维度：不要用文字说服 AI，要用报错“毒打” AI。** AI 最擅长修复静态检查报错。通过配置 Linter 从物理层面禁止违规（典型：禁止 Mock 数据污染生产环境）。

### 按栈选择强制工具

- 前端 / Node / TypeScript：ESLint `no-restricted-imports`（依赖边界规则）
- Python：Ruff / flake8 import 边界规则、`import-linter` 契约
- Java：Checkstyle / ArchUnit 架构约束
- Go：`depguard`、自定义 `go vet` 规则
- Rust：clippy、模块可见性约束

### ESLint 示例（禁止 src 引用 mock/tests）

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["**/mock/**", "**/tests/**"],
            message:
              "Do not import mock data or test files in production code (src). Use dependency injection.",
          },
        ],
      },
    ],
  },
};
```

效果：AI 若在 `src/user.js` 里写 `import mockData from '../mock/user'`，Linter 立刻报红；AI 看到报错会自动重写为正常业务逻辑，无需 Prompt 反复叮嘱。

### 生成要求（关键约束）

- 必须先检测项目**已有**的 Linter / 静态检查工具配置（`.eslintrc.*`、`ruff.toml`、`pyproject.toml`、`checkstyle.xml` 等）
- 优先在**已有**配置里**增量补充**边界规则，不引入项目尚未采用的新工具，除非用户明确要求
- 如果项目没有任何 Linter，且用户未要求引入，则只在生成的规则文件里**建议**可选的强制方案，不擅自落盘新工具配置（遵循 GP-3 Reuse-First、GP-4 File-Touch Discipline）
- 任何对 Linter 配置的改动都遵循 GP-5 Plan-First：先给计划或预览，再落盘
- 在生成的 `CLAUDE.md` 中记录“哪些边界由 Linter 强制”，让后续 AI 知道违规会被静态检查拦截

## SR-5 Split AI Task Workflow (TDD / BDD)

不要在一次对话里让 AI 同时搞定“业务逻辑”和“测试代码”。任务混杂时 AI 会在两个目标之间走捷径（为了测试好写而去改业务逻辑）。

生成的规则文件必须写入这个分步工作流（典型 TDD / BDD 模式）：

1. **定义接口约定**：先定义函数入参、出参、接口（Interface），不写实现、不写测试
2. **人类确认或生成桩**：确认接口设计、确认外部依赖都通过参数注入
3. **编写业务**：基于接口约定实现 `src/` 下真实业务逻辑，不允许任何 Mock
4. **编写测试**：保持业务代码原封不动，在 `tests/` 下写单元测试，Mock 外部 HTTP 请求等依赖

生成要求：

- 把这四步写进 `CLAUDE.md` / Copilot 配置的“开发工作流”段落（精简版，英文）
- 与 SR-3 目录隔离、SR-4 Linter 强制配合：第 3 步在 `src/` 触发生产规则，第 4 步在 `tests/` 触发测试规则
- 与 GP-5 Plan-First 一致：接口约定阶段相当于先给计划再实现

## SR-8 Dependency Injection Enforcement (Stack-Aware)

从代码结构上剥夺 AI 在业务逻辑里写死 Mock 的能力：外部依赖必须通过接口或注入传入,业务函数内部禁止直接实例化或发起真实调用。这条原则通用,但**具体写法必须按 Step 3/4 侦察到的栈来落地,侦察不到对应栈就不写**。

### 通用原则（所有适用项目）

- 对外部 API、数据库、网络、文件系统、第三方 SDK 的调用,必须经接口 / 依赖注入传入
- 业务函数内部禁止直接 `new`、直接发真实请求或直接读写存储
- 真实逻辑与 Mock 逻辑物理隔离,Mock 只能出现在测试侧

### 按栈映射强制手段（只生成侦察到的那一套）

| 栈                                 | DI / 隔离写法                                 | 业务侧禁止                                        |
| ---------------------------------- | --------------------------------------------- | ------------------------------------------------- |
| 后端 Python (FastAPI/Django/Flask) | `Depends()`、构造注入、Protocol/ABC           | service 内直接 `requests.get` / 直接实例化 repo   |
| 后端 Java/JVM (Spring)             | 构造注入、`@Autowired`、interface             | 业务类内 `new RestTemplate()` / 直接 DAO new      |
| 后端 Node (Express/NestJS)         | provider 注入、构造注入、interface            | handler 内直接 `axios.get` / 直接 `new Client()`  |
| Go                                 | interface 入参、显式依赖传入                  | 业务函数内直接 `http.Get` / 包级单例硬连          |
| Flutter / Dart                     | Repository + Provider/Riverpod/GetX 注入      | Widget / UseCase 内直接 `http.get` / 直接 `Dio()` |
| Web / React                        | api client 注入、props 注入、自定义 hook 边界 | 组件内直接 `fetch` 业务数据后混入硬编码           |

### 条件生成红线

- 项目侦察不到任何外部依赖（纯算法库、纯 UI 展示、无网络无存储）→ **不写** DI 强制,避免过度设计
- 项目已有自己的 DI / 注入约定 → 跟随既有方案,不引入新 DI 框架（GP-3、GP-4）
- 禁止跨栈套用写法（如把 Spring `@Autowired` 写进 Flutter 规则）
- 这是**约束后续 AI coding 的规则**,`dt:init` 不当场把现有业务代码重构成 DI（GP-4、GP-10）

## SR-9 Test Strategy And Env Safeguard (Stack-Aware)

防止 AI 写"同义反复"测试、为通过而全盘 Mock、以及把 Mock 漏进生产环境。通用原则一致,**集成测试命令、环境判断写法必须按栈生成,不适合的栈不写**。

### 通用原则（所有适用项目）

- 单元测试之外,补**集成测试**:连测试库 / 测试服务,该用例内禁用 Mock,用真实环境暴露业务里残留的 Mock
- 补**负面边界测试**:异常数据、超时、空返回、错误码,不只测完美主流程
- Mock 服务必须用环境判断包裹(防呆),生产构建禁带测试标志;CI 生产部署绝不注入 Mock flag

### 按栈映射（只生成侦察到的那一套）

| 栈             | 集成测试方式                                        | 环境防呆写法                                                             |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| 后端 Python    | pytest 连测试库/测试 API,`@pytest.mark.integration` | `os.environ["APP_ENV"]` 判断,禁用 `utf-8-sig`/Mock flag                  |
| 后端 Java      | `@SpringBootTest` + Testcontainers                  | profile `application-test.yml`,`@Profile`                                |
| 后端 Node      | supertest/真实测试 DB                               | `process.env.NODE_ENV` + `USE_MOCK` 包裹                                 |
| Go             | `go test -tags=integration` 连真实依赖              | build tag / env 判断                                                     |
| Flutter / Dart | `integration_test/` 跑真机或真服务                  | `kReleaseMode` / `kDebugMode` / `--dart-define`,**不要用 `process.env`** |
| Web / React    | Playwright E2E 打真实或测试后端                     | `import.meta.env.MODE` / `import.meta.env.DEV`                           |

环境防呆示例(仅作模式说明,实际按栈生成对应写法):

```text
后端 Node:    if (process.env.NODE_ENV === 'development' && process.env.USE_MOCK === 'true') { mock } else { real }
Flutter:      if (kDebugMode && useMock) { mock } else { real }   // 绝不写 process.env
React:        if (import.meta.env.DEV && useMock) { mock } else { real }
```

### 条件生成红线

- 项目没有任何测试目录、也无测试服务/测试库 → 集成测试只**建议**,不强制写入红线（GP-3）
- 项目已有测试框架与约定 → 跟随既有框架,不引入新测试栈（GP-4）
- 禁止跨栈套用环境判断写法(Flutter 用 `process.env`、React 用 `kReleaseMode` 都是错误)
- 不为满足覆盖率去改被测业务代码;测试验证逻辑正确性,而非反向迁就实现

## SR-6 What Generated Rule Files Must Carry

`dt:init` 生成或升级的规则文件（`CLAUDE.md`、Copilot 配置、必要时的 scoped 规则）至少要体现：

- 规则按主题模块化、主控文件只写红线 + 索引（SR-2）
- 生产代码目录禁止 Mock、测试目录允许 Mock 的目录级隔离（SR-3）
- 哪些边界由 Linter / 静态检查强制（SR-4）
- 接口 -> 确认 -> 业务 -> 测试 的分步工作流（SR-5）
- 依赖注入隔离外部依赖,按本项目栈生成对应写法（SR-8）
- 集成测试反 Mock、负面边界、环境防呆,按本项目栈生成对应写法（SR-9）

只写**侦察到的栈**对应的强制手段；不写、不套用其他栈的写法。

## SR-7 Boundaries

- 不引入项目尚未采用的新 Linter、新 IDE 规则机制，除非用户明确要求（GP-3、GP-4）
- 不在每个子目录无脑塞规则文件；只在有真实隔离价值处放置（SR-3）
- 不创建没有对应关注点的空 rule 文件（SR-2）
- 任何 Linter / 构建配置改动都先走 Plan-First 预览（GP-5）
- SR-8 / SR-9 必须**栈感知 + 条件生成**：只写侦察到的栈那一套，禁止跨栈套用（如 Flutter 写 `process.env`、React 写 `kReleaseMode`）
- 侦察不到外部依赖就不写 DI 强制；没有测试栈就只建议不强制集成测试
- SR-8 / SR-9 是约束后续 AI coding 的规则，`dt:init` 不当场重构现有源码（GP-4、GP-10）
- 若与旧版项目规则冲突，按本文件 + 真实代码做增量升级，不直接覆盖（GP-10）
