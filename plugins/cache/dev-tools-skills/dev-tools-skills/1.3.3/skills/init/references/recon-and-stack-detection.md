# Reconnaissance And Stack Detection

本文件定义 `dt:init` 的侦察、技术栈识别、约定检测，以及各技术栈的局部一致性约束。

## Reconnaissance

先做并行侦察，不要一上来通读整个仓库。至少扫描这些信号：

```text
1. 包管理与构建清单
   package.json, pnpm-workspace.yaml, yarn.lock, bun.lockb
   pyproject.toml, requirements.txt, poetry.lock, Pipfile
   pom.xml, build.gradle, build.gradle.kts, settings.gradle, settings.gradle.kts
   Cargo.toml, go.mod, pubspec.yaml

2. 框架指纹
   next.config.*, vite.config.*, angular.json, nuxt.config.*
   manage.py, settings.py, flask app, fastapi main, spring boot main
   AndroidManifest.xml, app/src/main/, lib/main.dart

3. 入口点
   main.*, index.*, app.*, server.*, src/main/, cmd/, lib/main.dart

4. 目录快照
   顶层和二级目录，忽略 .git, node_modules, dist, build, target,
   .next, .dart_tool, .gradle, __pycache__, vendor

5. 文档目录
   docs/, doc/, documentation/, wiki/ 及 /docs 下现有分类目录
   识别语义等价目录，例如 plan/plans、guide/guides、reference/references

6. 配置与工具链
   tsconfig.json, eslint/prettier 配置, analysis_options.yaml
   pytest.ini, tox.ini, mypy.ini, Dockerfile, docker-compose*
   .github/workflows/, Makefile, CI 配置

7. 测试结构
   tests/, test/, __tests__/, integration_test/, e2e/, src/test/, src/androidTest/
   *.spec.*, *.test.*, *_test.py, *_test.go
```

## Stack Detection

必须根据真实文件判断项目类型，可同时识别多种技术栈共存。

### Android

识别信号：

- `settings.gradle` 或 `settings.gradle.kts`
- `build.gradle` 或 `build.gradle.kts`
- `AndroidManifest.xml`

额外必须检测：

- Java / Kotlin 混合情况
- ButterKnife / ViewBinding / DataBinding 使用情况
- BaseActivity / BaseFragment / Adapter / Http / Utils 等复用入口
- 资源、日志、Toast、存储等强约束工具类

### Flutter

识别信号：

- `pubspec.yaml`
- `lib/main.dart`
- `android/` 或 `ios/`

额外必须检测：

- 状态管理方案及混用情况
- 路由、主题、网络、存储方案
- 公共 Widget / Service / Utils / Base 类入口

### Web / Node.js / React

识别信号：

- `package.json`
- `next.config.*`、`vite.config.*`、webpack 配置
- `src/`、`app/`、`pages/`、`server/`

额外必须检测：

- React / Next.js / Vue / Express / NestJS 等实际框架
- 路由、状态管理、请求层、样式方案
- UI 组件库、shared hooks、utils、api client 复用入口
- 不要因为看到少量 Zustand、Redux、React Query 就自动推断完整架构

### Python

识别信号：

- `pyproject.toml`、`requirements.txt`、`setup.py`、`manage.py`
- `app/`、`src/`、`project/` 等源码目录

额外必须检测：

- Django / FastAPI / Flask / Celery / Click 等实际框架
- 虚拟环境与依赖管理方式
- settings、schema、service、repository、client 组织方式
- 同步 / 异步风格与 typing 使用情况

### Java / JVM

识别信号：

- `pom.xml`
- `build.gradle` / `build.gradle.kts`
- `src/main/java`、`src/main/kotlin`

额外必须检测：

- Spring Boot / Spring MVC / plain Java / Kotlin JVM
- controller / service / repository / config 分层是否真实存在
- DI、注解风格、模块结构、测试目录

### Other Projects

如果不是以上典型栈，也必须输出：

- 能确认的语言与构建工具
- 主入口和关键目录
- 现有命名、测试、依赖和错误处理模式
- 未确认部分明确标注 `unknown`

## Convention Detection

### 命名与组织

- 文件命名风格：kebab-case、camelCase、PascalCase、snake_case
- 类、组件、模块命名模式
- 测试命名模式
- feature-first、layer-first、package-first 或混合目录结构

### 代码模式

- 错误处理方式
- 依赖注入还是直接 import / new
- 异步模式
- 状态管理或数据流风格
- 是否存在历史代码与新代码混用

### Git 约定

- 最近提交信息风格
- 分支命名模式
- PR 合并方式
- 如果 git 历史不存在或过浅，明确写 unavailable

## Stack-Specific Local Consistency Rules

### Android 必须额外写入

- Java 文件优先延续 Java，Kotlin 文件优先延续 Kotlin
- ButterKnife、ViewBinding、DataBinding 并存时，优先跟随目标文件和同目录模式
- 文本优先复用 `strings.xml`，颜色优先复用 `colors.xml`
- Toast、日志、SharedPreferences、常量、Utils 优先复用既有封装

### Flutter 必须额外写入

- 已有 `setState` 的页面优先延续 `setState`
- 已使用 Provider、BLoC、Riverpod、GetX 的模块优先延续原方案
- 文本优先走既有国际化方案
- 样式、路由、网络、存储优先复用既有封装

### Web / React 必须额外写入

- 已有状态管理、样式方案、请求层优先延续原方案
- 优先复用现有组件、hooks、api client、schema、constants
- 不主动把 CSS Modules 改成 Tailwind，也不主动把 REST 改成 GraphQL 或 tRPC

### Python 必须额外写入

- 优先沿用现有包结构、依赖管理、格式化和测试方案
- 已有 sync 或 async 风格优先保持一致
- 优先复用 settings、client、service、schema、repository 等既有模块

### Java / JVM 必须额外写入

- 优先沿用已有 DI、注解、模块和测试组织方式
- 不主动引入新的分层或响应式框架
- 优先复用现有 controller、service、repository、util、config 入口
