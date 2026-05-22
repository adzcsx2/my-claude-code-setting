---
name: fdt:update-docs
description: "Auto-generate and audit Chinese technical documentation for Flutter projects. First audit code changes, then update all affected docs including README, docs index, SDK/API docs, references, reports, and example docs. If a read-only subagent is needed for change audit, tell the user before invoking it."
---

> **中文环境要求**
>
> 本技能运行在中文环境下，请遵循以下约定：
>
> - 面向用户的回复、注释、提示信息必须使用中文
> - AI 内部处理过程可以使用英文
> - 所有生成的文件必须使用 UTF-8 编码
>
> ---

# update-docs Skill

Flutter 项目文档自动生成工具。分析项目结构，生成中文技术文档，支持增量更新。

## Core Mode

本技能默认按“先审计代码改动，再补齐全部相关文档”的模式执行，而不是只生成单篇文档。

强制要求：

- 如果项目存在代码改动，先审计改动内容、影响范围和对外行为变化，再决定要更新哪些文档
- 文档更新范围必须覆盖所有受影响入口，而不是只更新单个模块文档
- 至少检查：根 README、docs/README、docs/guide、docs/modules、docs/references、docs/reports、docs/update-list，以及项目中的 example/示例文档
- 如果改动涉及公开 API、配置项、接入步骤、平台能力、权限、状态流、脚本、目录结构、依赖、示例行为或接口契约，必须同步更新对应文档
- 如果需要调用只读子代理做改动审计，必须先明确告知用户“将调用子代理先做审计，再回来修改文档”
- 最终输出要先给出审计结论，再说明已更新哪些文档；如果仍有未覆盖风险，也要点明

## When to Use

- 为 Flutter 应用生成项目文档
- 创建界面文档（Widget、控件分析）
- 文档化导航流程和路由关系
- 列出状态管理方案和分层结构
- 文档化 API 接口
- 将根目录 md 文件迁移到 docs/ 集中管理
- 更新 README 并添加分类文档快捷链接
- 跟踪文档变更并记录详细更新日志

## Example Prompts

- `/fdt:update-docs`
- "为我的 Flutter 项目生成文档"
- "使用 --force 更新文档"
- "只生成界面文档"
- "先审计这次代码改动，再把所有受影响文档一起更新"
- "检查 git diff，把 README、docs 和 example 文档全部补齐"

---

## Command Parameters

| Parameter    | Description          |
| ------------ | -------------------- |
| No args      | 增量更新所有文档     |
| `--force`    | 强制重新生成所有文档 |
| `--dry-run`  | 仅分析，不生成文件   |
| `widgets`    | 仅生成界面文档       |
| `navigation` | 仅生成导航/路由文档  |
| `state`      | 仅生成状态管理文档   |
| `api`        | 仅生成 API 文档      |

---

## Document Structure

```
README.md
├── 最近更新（3条摘要 + 链接到更新记录）
└── ...

docs/
├── guide/                    # 使用指南
│   ├── PROJECT_OVERVIEW.md   # 项目概览
│   └── SETUP.md              # 环境配置与开发指南
├── modules/                  # 模块说明
│   ├── WIDGETS.md            # 界面/Widget 文档
│   ├── NAVIGATION.md         # 导航/路由文档
│   └── STATE_MANAGEMENT.md   # 状态管理文档
├── references/               # 参考资料
│   ├── DEPENDENCIES.md       # 依赖文档
│   └── API.md                # API 文档
├── reports/                  # 报告
│   └── CHANGELOG.md          # 更新列表（每条有链接到详情）
├── .doc-metadata.json        # 元数据
└── update-list/              # 详情目录（可重新生成）
    └── update-YYYY-MM-DD.md  # 每次更新的详细内容
```

**注意**：根目录不应有 CHANGELOG.md，更新记录应存放在 `docs/reports/CHANGELOG.md`。

---

## Execution Flow

### 0. Audit Before Writing

Before editing any docs:

1. Detect whether the workspace has code changes, preferably via git diff, changed files, and recent commits
2. Summarize what changed from a documentation perspective: public APIs, config fields, onboarding steps, platform capabilities, examples, routes, state management, scripts, dependencies
3. Build an affected-doc list instead of defaulting to a single output file
4. If the affected area is broad or ambiguous, explicitly tell the user that a read-only subagent will be used for audit, then invoke it

**Affected-doc checklist:**

- `README.md`
- `docs/README.md`
- `docs/guide/*`, `docs/modules/*`, `docs/references/*`, `docs/reports/*`
- `docs/reports/CHANGELOG.md`
- `docs/update-list/update-YYYY-MM-DD.md`
- `example/README.md` and other demo-facing docs when example behavior changed

### 1. Verify Project Type

Check for these files:

- `pubspec.yaml`
- `lib/main.dart`
- `android/` or `ios/` directory

Exit if not a Flutter project.

### 2. Clean Old Update Files (Optional)

If `--force` is used, clean old update files:

```bash
# Remove old update-list directory (can be regenerated)
rm -rf docs/update-list/
rm -f docs/UPDATE_INDEX.md
```

### 3. Load/Create Metadata

Check `docs/.doc-metadata.json`:

```json
{
  "version": "1.0",
  "projectType": "flutter",
  "lastUpdate": "2026-04-14T10:30:00Z",
  "lastCommit": "abc1234def5678",
  "documents": {
    "PROJECT_OVERVIEW.md": {
      "updatedAt": "2026-04-14T10:30:00Z",
      "sourceFiles": ["pubspec.yaml"],
      "lastCommit": "abc1234"
    }
  },
  "updateHistory": [
    {
      "date": "2026-04-14",
      "diffFile": "update-list/update-2026-04-14.md",
      "summary": "新增登录功能文档，更新 API 接口说明",
      "documentsUpdated": ["WIDGETS.md", "API.md"]
    }
  ]
}
```

### 4. Analyze Git Changes

**Change-source priority (must follow in order):**

1. Read current working tree changes first: `git diff --name-only`, `git diff --cached --name-only`
2. If diff exists, inspect focused hunks before reading commit history; do not skip directly to commit summaries
3. Then read `docs/.doc-metadata.json` to get `lastUpdate` or `lastCommit`
4. Run `git log --since="{lastUpdate}" --oneline --no-merges` only as a supplement for already-committed changes
5. If metadata is missing or stale, fall back to recent commits plus current diff, but still prefer real workspace hunks over commit message summaries
6. For every changed file, read the relevant diff hunk or nearby source block before mapping to docs

**File to Document Mapping:**

| Source File Pattern                                                                                                    | Affected Documents                   |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `lib/**/*_page.dart`, `lib/**/*_screen.dart`                                                                           | WIDGETS.md, NAVIGATION.md            |
| `lib/**/*_widget.dart`, `lib/**/*_dialog.dart`                                                                         | WIDGETS.md                           |
| `lib/**/routes.dart`, `lib/**/router.dart`, `lib/**/*_route*.dart`                                                     | NAVIGATION.md                        |
| `pubspec.yaml`                                                                                                         | PROJECT_OVERVIEW.md, DEPENDENCIES.md |
| `lib/**/*_api.dart`, `lib/**/*_service.dart`, `lib/**/*_repository.dart`                                               | API.md                               |
| `lib/**/*_state.dart`, `lib/**/*_notifier.dart`, `lib/**/*_bloc.dart`, `lib/**/*_cubit.dart`, `lib/**/*_provider.dart` | STATE_MANAGEMENT.md                  |
| `lib/**/*_model.dart`, `lib/**/*_entity.dart`                                                                          | API.md, DEPENDENCIES.md              |

**扩展映射规则：**

- 如果公开 API、SDK 能力、配置项、接入方式或平台限制发生变化，额外更新 `README.md`、`docs/README.md` 以及对应 guide/reference 文档
- 如果 example 行为、调试入口、按钮文案、录音/回放方式、环境配置或示例流程变化，额外更新 `example/README.md` 或相关示例文档
- 如果一次改动同时影响快速接入、完整文档、API 参考和原生/平台专项文档，必须整组更新，不能只修一篇
- 如果当天已经有文档更新记录，写入当天同一文件中的新执行批次，并同步刷新 `docs/reports/CHANGELOG.md`

### 4.1 Build Evidence Matrix Before Writing

在生成任何文档前，先为每个实际改动文件建立一行证据记录，至少包含：

| 字段                | 必填内容                                               |
| ------------------- | ------------------------------------------------------ |
| Source file         | 实际变更文件路径                                       |
| Symbol / entry      | 变更的类、方法、Widget、路由、配置项、脚本入口或依赖名 |
| Real change         | 新增 / 删除 / 修改了什么行为，禁止只写“优化”“调整”     |
| User-visible impact | 对接入方、用户、调试流程或示例行为造成的影响           |
| Target docs         | 受影响文档列表                                         |
| Update-list bullet  | 准备写入 `update-list` 的具体条目                      |

强制要求：

- `update-list` 中的每个 bullet 必须能回溯到至少一条证据记录
- 禁止只依据 commit message 生成文档内容
- 禁止使用“完善逻辑”“更新内容”“修复问题”这类无法映射到代码事实的空泛描述
- 如果 diff hunk 无法说明真实行为，必须补读对应源文件后再写文档

### 5. Analyze Project

#### 5.1 Analyze pubspec.yaml

Extract: name, version, description, Flutter/Dart SDK constraints, dependencies, dev_dependencies

**扫描范围补充**：

- 依赖分析不能只看根 `pubspec.yaml`，还必须扫描 `example/pubspec.yaml`，以及工作区内本地 `path` 依赖指向的附加 `pubspec.yaml`
- 如果扫描到多个 `pubspec.yaml`，依赖文档和元数据要合并记录，不能只保留主工程结果

**重要：提取被注释掉的版本号**

在分析依赖时，必须同时记录被注释掉的版本信息（通常用于本地开发或备用配置）：

```yaml
# 示例配置
flutter_asr_lib:
  # git:
  #   url: https://gitee.com/chengdu-xiaochen/flutter-asr-lib.git
  #   ref: 1.0.1
  path: ../
```

**提取规则**：

- 检测 `# ref: X.Y.Z` 格式的注释版本号
- 检测 `# version: X.Y.Z` 格式的注释版本号
- 如果附加 `pubspec.yaml` 的依赖块中含有注释的 `ref` 或 `version`，也必须在 `DEPENDENCIES.md` 中同时记录当前配置与注释版本
- 在 DEPENDENCIES.md 中同时记录当前使用的依赖方式和注释中的版本信息
- 格式示例：

  ```markdown
  ### flutter_asr_lib

  - **当前配置**: path 依赖 (../)
  - **注释中的版本**: git ref: 1.0.1
  ```

#### 5.2 Analyze Directory Structure

Use Glob to find: `lib/**/*.dart`

#### 5.3 Analyze Pages/Screens

Use Glob: `lib/**/*_page.dart`, `lib/**/*_screen.dart`, `lib/**/*_view.dart`

#### 5.4 Analyze Widgets

Use Glob: `lib/**/*_widget.dart`, `lib/**/*_dialog.dart`, `lib/**/*_bottom_sheet.dart`

#### 5.5 Analyze Navigation/Routing

Detect routing approach:

- Named routes: `MaterialApp(routes: ...)`
- `go_router`: `GoRouter(...)` in `lib/`
- `auto_route`: `@MaterialAutoRouter` annotations
- `GetX`: `GetPage(...)` routes
- Navigator 1.0: `Navigator.push(...)`

Use Grep: `GoRoute`, `GetPage`, `MaterialPageRoute`, `Navigator.push`, `context.go(`, `context.push(`

#### 5.6 Analyze State Management

Detect state management approach:

- `setState`: grep for `setState(()`
- `ChangeNotifier` / `Provider`: grep for `ChangeNotifier`, `Consumer`, `Provider`, `context.watch`, `context.read`
- `Riverpod`: grep for `ProviderScope`, `ref.watch`, `ref.read`, `@riverpod`
- `BLoC` / `Cubit`: grep for `BlocProvider`, `BlocBuilder`, `context.read<`, `emit(`
- `GetX`: grep for `GetxController`, `Get.put`, `Obx(`, `Get.find`
- `MobX`: grep for `@observable`, `@action`, `Store`

#### 5.7 Analyze API Interfaces

Use Grep: `@GET`, `@POST`, `@PUT`, `@DELETE`, `dio.get`, `dio.post`, `http.get`, `http.post`

### 6. Migrate Root MD Files to docs/

Scan root directory for markdown files (excluding README.md) and migrate to appropriate docs/ subdirectories.

### 7. Generate Documents

All docs go in `docs/` subdirectories based on their category:

| Document            | Location          | Content                                           |
| ------------------- | ----------------- | ------------------------------------------------- |
| PROJECT_OVERVIEW.md | docs/guide/       | 项目概览（名称、版本、SDK、技术栈、目录结构）     |
| WIDGETS.md          | docs/modules/     | 界面文档（页面、Widget、控件分析、功能说明）      |
| NAVIGATION.md       | docs/modules/     | 导航文档（路由方案、页面跳转关系、命名路由列表）  |
| STATE_MANAGEMENT.md | docs/modules/     | 状态管理文档（方案、Provider/Bloc/Riverpod 列表） |
| DEPENDENCIES.md     | docs/references/  | 依赖文档（Flutter/Dart SDK、第三方依赖列表）      |
| API.md              | docs/references/  | API 接口文档（URL、请求方法、参数说明）           |
| CHANGELOG.md        | docs/reports/     | **更新列表，支持点击查看详情**                    |
| update-list/\*.md   | docs/update-list/ | **每次更新的详细内容**                            |

**重要规则**：

- 创建 docs/ 及其子目录（guide、modules、references、reports）如果不存在
- 根目录**不应**有 CHANGELOG.md
- CHANGELOG.md 应位于 `docs/reports/CHANGELOG.md`

---

## 8. Generate Update Detail Document (CRITICAL)

Generate or merge the detailed update document in `docs/update-list/` for each day:

### 8.1 Filename Convention

- Base format: `update-YYYY-MM-DD.md`
- One day only keeps one detail file: always use `update-YYYY-MM-DD.md`
- If the file for today already exists, read it, merge the new actual changes into the same file, and overwrite it
- **CRITICAL**: NEVER create `-2`, `-3`, `v2`, `v3` or any other same-day suffix variant
- Correct examples: `update-2026-04-16.md`, `update-2026-04-17.md`
- Wrong examples: `update-2026-04-16-2.md`, `update-2026-04-16-3.md`, `update-2026-04-16-v2.md`

### 8.1.1 Same-Day Merge Rules

- 同一天重复执行时，必须更新当天已有的详情文件，而不是新建第二条
- 同一文件内按执行批次追加 `## 执行批次 - HH:MM`，不要把当天早些时候的批次覆盖掉
- 每个执行批次都要保留自己的来源范围、关联提交、受影响文档和证据矩阵
- 如果同一文档当天被多次更新，只在对应批次内合并本次新增事实；不得重写之前批次已确认的事实
- 如果本次只有时间戳或元数据变化，没有实际文档变化，则不要改写详情文件内容

### 8.2 Document Content Structure

**MUST include actual document changes, NOT just git commits:**

```markdown
# 更新详情 - YYYY-MM-DD

## 执行批次 - HH:MM

**触发方式**: 工作区 diff / staged diff / Git 提交分析 / --force 强制更新
**来源范围**: `git diff` / `git diff --cached` / `abc1234..def5678`
**关联提交**: abc1234, def5678
**受影响文档**: API.md, WIDGETS.md, NAVIGATION.md

## 变更证据矩阵

| 源文件                            | 变更符号/入口 | 实际变化                       | 用户可见影响               | 目标文档                      |
| --------------------------------- | ------------- | ------------------------------ | -------------------------- | ----------------------------- |
| `lib/pages/login/login_page.dart` | `LoginPage`   | 新增邮箱密码登录和忘记密码跳转 | 登录页交互发生变化         | `WIDGETS.md`, `NAVIGATION.md` |
| `lib/services/auth_service.dart`  | `login()`     | 新增登录接口和超时处理         | 接口能力与错误处理发生变化 | `API.md`                      |

## 文档变更详情

### API.md

**变更类型**: 新增接口

**变更内容**:

- 新增 `POST /user/login` 登录接口
  - 请求参数: `email`, `password`
  - 返回: `token`, `userInfo`

### WIDGETS.md

**变更类型**: 新增页面

**变更内容**:

- 新增 LoginPage 登录页面
  - 支持邮箱密码登录
  - 支持忘记密码跳转
- 更新 HomePage 说明
  - 新增用户信息展示区域

### NAVIGATION.md

**变更类型**: 更新路由

**变更内容**:

- 新增 /login 路由
  - 对应 LoginPage
  - 支持从 /home 跳转
```

### 8.3 Git Commit Detailed Analysis (CRITICAL)

**分析每个提交中每个文件的变动，多处变动都要写上：**

```markdown
## Git 提交详细分析

### a7f334e - 修复登录页面输入验证逻辑

**变动文件**:

- `lib/pages/login/login_page.dart`
  - 新增邮箱格式验证
  - 修复密码长度检查
  - 新增错误提示文案
- `lib/services/auth_service.dart`
  - 修复登录接口超时处理
  - 新加重试逻辑
- `lib/widgets/loading_button.dart`
  - 新增加载状态切换

### 612a131 - 新增用户注册流程

**变动文件**:

- `lib/pages/register/register_page.dart`
  - 新增注册页面
- `lib/services/auth_service.dart`
  - 新增注册接口
- `lib/routes/app_routes.dart`
  - 新增 /register 路由
```

**注意**：

- 每个文件的**多处变动都要列出**
- 不要写"保持不变"的文件列表
- 只写有实际变动的文件
- 如果本次主要来自未提交 diff，也要写成 `### 当前工作区改动` 或 `### 已暂存改动`，不要强行伪造成 commit
- 每条文件级描述都要来自 diff hunk 或补读后的源文件事实，不能复述 commit 标题代替分析

### 8.4 What to EXCLUDE from Update Log (CRITICAL)

**以下内容只有在发生实际变动时才写入更新日志：**

| 内容类型       | 排除规则                                         |
| -------------- | ------------------------------------------------ |
| **项目统计**   | Pages/Widgets 数量等统计数据，**不变动不写**     |
| **页面列表**   | Page/Screen 名称列表，**不变动不写**             |
| **路由列表**   | 路由配置，**不变动不写**                         |
| **状态管理**   | Provider/Bloc 列表，**不变动不写**               |
| **依赖库版本** | dio/flutter_riverpod 等版本号，**不变动不写**    |
| **技术栈**     | Flutter/Riverpod/BLoC 等技术选型，**不变动不写** |

### 8.5 Comment-Only Changes (Simplified Format)

**如果源文件只是添加了注释（没有代码逻辑变更）：**

```markdown
### API.md

**变更类型**: 新增注释

**变更内容**:

- 以下文件新增代码注释：
  - `lib/services/api_service.dart`
  - `lib/services/user_service.dart`
```

**不要展开列出完整的接口内容，只说明哪些文件增加了注释。**

### 8.6 How to Detect Actual Changes (CRITICAL)

**适用于所有文档，不只是 API.md**

**Before writing to update log, verify:**

1. **Read existing doc content** before regeneration
2. **After regeneration**, compare new content with old
3. **Only record actual differences**:
   - New sections added
   - Sections removed
   - Content modified (not just formatting)
4. **Skip if only metadata changed** (timestamps, etc.)
5. **Write `update-list` first** using actual document diffs plus evidence matrix, then derive CHANGELOG and README from that detail file
6. **Do not invent detail in summaries**: CHANGELOG and README may only summarize facts already present in `update-list`

### 8.7 Ignore Code Formatting Changes (CRITICAL)

**代码格式化变化不应记录到更新日志：**

| 变化类型         | 是否记录 | 示例                      |
| ---------------- | -------- | ------------------------- |
| 新增 Widget/方法 | 记录     | 新增 `LoginPage`          |
| 删除 Widget/方法 | 记录     | 删除 `OldPage`            |
| 修改方法参数     | 记录     | 参数 `email` 改为 `phone` |
| 代码换行/缩进    | 不记录   | `setState(() {` 换行      |
| 代码格式化       | 不记录   | IDE 自动格式化            |
| 注释变化         | 简化记录 | 只列出文件名，不展开内容  |

**检测方法：**

```bash
# 忽略空白变化，检查是否有实际内容变化
git diff HEAD --ignore-all-space -- docs/API.md

# 如果忽略空白后没有变化，则不记录
if git diff HEAD --ignore-all-space --quiet -- docs/API.md; then
  echo "No actual changes, skip recording"
fi

# 检查源代码是否有逻辑变化（不只是格式化）
git diff HEAD --ignore-all-space -- "*.dart"
```

### 8.8 Source Code Change Detection

**分析源代码变更时，区分格式化和逻辑变化：**

```markdown
## Git 提交详细分析

### e205804 - 重构图片加载,提高加载效率

**变动文件**:

- `lib/services/image_service.dart`
  - 代码格式化（换行调整）← 无需详细展开
  - 新增 `CachedNetworkImage` 替换旧图片加载 ← 实际变更
- `lib/utils/oss_utils.dart`
  - 新增文件哈希计算方法 ← 实际变更
```

**规则**：

- 如果文件只有格式化变化，写"代码格式化（无需详细展开）"
- 如果有实际逻辑变化，只写逻辑变化的部分
- 不要因为代码格式化而展开列出无意义的内容

---

## 9. Update CHANGELOG.md (Update List)

CHANGELOG.md 位于 `docs/reports/CHANGELOG.md`，作为更新列表包含可点击的详情链接：

```markdown
# 文档更新日志

> 本文档记录项目文档的所有更新历史。点击查看详情。

---

## 2026-04-14 - 登录功能文档更新

**变更概述**: 新增用户登录相关文档，更新 API 接口说明

| 文档          | 变更类型 | 简介                        |
| ------------- | -------- | --------------------------- |
| API.md        | 新增接口 | 新增 `/user/login` 登录接口 |
| WIDGETS.md    | 新增页面 | 新增 LoginPage 登录页面     |
| NAVIGATION.md | 更新路由 | 新增 /login 路由配置        |

[查看详情](../update-list/update-2026-04-14.md)

---

## 2026-04-10 - 首次文档生成

**变更概述**: 生成完整项目文档

| 文档                | 变更类型 | 简介         |
| ------------------- | -------- | ------------ |
| PROJECT_OVERVIEW.md | 新增     | 项目概览文档 |
| WIDGETS.md          | 新增     | 界面文档     |
| ...                 | ...      | ...          |

[查看详情](../update-list/update-2026-04-10.md)

---

[← 返回主文档](../../README.md)
```

**CHANGELOG Update Rules:**

1. **Newest first**: Keep the newest date at the TOP
2. **Summary table**: Show document, change type, and brief description derived from the same-day `update-list` execution batches
3. **Detail link**: Each update has a link to `update-list/update-YYYY-MM-DD.md`
4. **One entry per day**: If today's entry already exists, merge new changes into the same section instead of creating another same-day section
5. **No new facts**: CHANGELOG 只能压缩 `update-list` 已有事实，不能补写未在详情文档出现的信息

---

## 10. Update README.md

README.md shows **3 most recent updates**:

```markdown
## 文档导航

> 快速访问: [文档中心](docs/) | [更新记录](docs/reports/CHANGELOG.md)

### 最近更新

| 日期       | 描述                                    |
| ---------- | --------------------------------------- |
| YYYY-MM-DD | 新增用户登录相关文档，更新 API 接口说明 |
| YYYY-MM-DD | 新增界面文档、导航流程文档              |
| YYYY-MM-DD | 首次生成项目文档                        |

> 查看全部更新: [更新记录](docs/reports/CHANGELOG.md)

---

### 快速开始

| 文档                                       | 描述                       |
| ------------------------------------------ | -------------------------- |
| [项目概览](docs/guide/PROJECT_OVERVIEW.md) | 项目简介、版本信息、技术栈 |
| [界面文档](docs/modules/WIDGETS.md)        | 页面与 Widget 列表         |

...
```

**README Update Rules:**

1. **3 recent updates**: Show the latest 3 updates
2. **Link to CHANGELOG**: Point to `docs/reports/CHANGELOG.md` for full history
3. **Brief description**: Summarize each update in one sentence derived from CHANGELOG, not directly from source diff
4. **No drift**: README 的最近更新必须与 CHANGELOG 同步，CHANGELOG 又必须与 `update-list` 同步

---

## 11. Update Metadata

Update `docs/.doc-metadata.json` with:

1. **Update timestamps** for modified documents
2. **Update lastCommit** to current HEAD
3. **Merge into the same-day item in updateHistory** if today's entry already exists; only append when the date is new
4. **Skip metadata-only runs**: If no actual doc changed, do not append updateHistory or refresh summaries
5. **Update stats** section

---

## 12. Auto-Update docs/README.md When Structure Changes (CRITICAL)

**每次文档更新后，必须检查并更新 docs/README.md，确保文档索引与实际目录结构一致。**

### 12.1 Detect docs/ Structure Changes

在文档生成完成后，执行以下检查：

```bash
# 获取当前 docs/ 目录结构
find docs/ -type f -name "*.md" | sort

# 检查是否存在新的子目录
find docs/ -type d -mindepth 1 -maxdepth 1
```

### 12.2 Determine When to Update docs/README.md

**必须更新 docs/README.md 的情况**：

| 触发条件              | 说明                               |
| --------------------- | ---------------------------------- |
| 新增文档子目录        | 如新增 `sdk/`、`api/`、`guide/` 等 |
| 删除文档子目录        | 目录结构发生变化                   |
| 新增 Markdown 文件    | 在任何子目录中新增 `.md` 文件      |
| 删除 Markdown 文件    | 文档被移除或重命名                 |
| docs/README.md 不存在 | 首次创建文档索引                   |

**检测方法**：

```bash
# 对比上次更新后的目录结构
# 方法 1: 检查子目录变化
CURRENT_DIRS=$(find docs/ -type d -mindepth 1 -maxdepth 1 | wc -l)
if [ "$CURRENT_DIRS" -ne "$LAST_DIRS_COUNT" ]; then
  echo "Directory structure changed, need to update README"
fi

# 方法 2: 检查是否有新的 .md 文件
git diff --name-only HEAD -- "docs/**/*.md" | grep -v "README.md" | grep -v "CHANGELOG.md" | grep -v "update-list/"
if [ $? -eq 0 ]; then
  echo "New markdown files detected, need to update README"
fi
```

### 12.3 docs/README.md Structure Template

更新 docs/README.md 时，使用以下模板：

```markdown
# 文档索引

本目录按内容分类组织，覆盖 [项目类型] 文档、项目文档、API 文档和更新记录。

## 目录结构

\`\`\`
docs/
├── guide/ # 指南文档
├── modules/ # 模块说明
├── references/ # 参考资料
├── reports/ # 报告文档
├── [其他目录]/ # 其他分类
├── update-list/ # 更新详情
└── README.md # 本文件
\`\`\`

## 建议阅读顺序

**[角色 A]**：[描述]

1. [link1]
2. [link2]

**[角色 B]**：[描述]

1. [link1]
2. [link2]

---

## 指南文档 (guide/)

面向新用户的入门文档。

- [link](path) - description

---

## 模块文档 (modules/)

SDK 各模块的详细说明。

- [link](path) - description

---

## 参考文档 (references/)

开发过程中的参考资料。

- [link](path) - description

---

## 报告文档 (reports/)

项目各类报告和记录。

- [link](path) - description

---

## [其他分类] ([目录名]/)

[分类说明]

- [link](path) - description

---

## 更新详情 (update-list/)

每次更新的详细内容，可从 [reports/CHANGELOG.md](reports/CHANGELOG.md) 跳转。

---

## 约定

- [项目特定约定]

---

[← 返回项目根目录](../README.md)
```

### 12.4 Auto-Update Rules

1. **检测新增目录**：扫描 `docs/` 下的一级子目录
2. **检测新增文件**：扫描每个目录下的 `.md` 文件（排除 `update-list/`）
3. **生成目录树**：更新 `## 目录结构` 部分
4. **更新文档列表**：为每个目录生成对应的文档链接列表
5. **保持阅读顺序**：根据项目类型更新 `## 建议阅读顺序`

### 12.5 Update Metadata

当 docs/README.md 被更新时，同步更新元数据：

```json
{
  "documents": {
    "README.md": {
      "updatedAt": "2026-04-16T12:30:00Z",
      "sourceFiles": [],
      "lastCommit": "current-sha"
    }
  }
}
```

### 12.6 Example Update Flow

```bash
# 1. 扫描当前目录结构
find docs/ -type d -mindepth 1 -maxdepth 1 | sort

# 2. 扫描各目录下的 .md 文件
for dir in docs/*/; do
  echo "## $(basename $dir)/"
  find "$dir" -name "*.md" -not -name "update-list*" | sort
done

# 3. 对比差异，判断是否需要更新
# 4. 如果需要，重新生成 docs/README.md
# 5. 更新元数据
```

---

## Analysis Patterns

### Route Detection

```
GoRoute\(path:\s*['"]([^'"]+)['"]
GetPage\(name:\s*['"]([^'"]+)['"]
MaterialPageRoute\(builder:.*?(\w+Page|Screen)
Navigator\.push\(
context\.go\(['"]([^'"]+)['"]
context\.push\(['"]([^'"]+)['"]
```

### State Management Detection

```
setState\(()
ChangeNotifier
context\.watch<(\w+)>
context\.read<(\w+)>
ref\.watch\(
ref\.read\(
BlocProvider<(\w+)>
BlocBuilder<(\w+),\s*(\w+)>
Get\.put<(\w+)>()
Obx\(
Store<(\w+)>
```

### API Interface Detection

```
@GET\(["']([^"']+)["']\)
@POST\(["']([^"']+)["']\)
dio\.get\(['"]([^'"]+)['"]
dio\.post\(['"]([^'"]+)['"]
http\.get\(Uri\.parse\(['"]([^'"]+)['"]
```

### Widget Type Detection

```
class\s+(\w+)\s+extends\s+StatefulWidget
class\s+(\w+)\s+extends\s+StatelessWidget
class\s+(\w+)\s+extends\s+HookWidget
class\s+(\w+)\s+extends\s+ConsumerWidget
class\s+(\w+)\s+extends\s+ConsumerStatefulWidget
```

---

## Widget Type Mapping

| Dart Pattern                          | Type                  | Category    |
| ------------------------------------- | --------------------- | ----------- |
| extends StatefulWidget                | StatefulWidget        | Page/Widget |
| extends StatelessWidget               | StatelessWidget       | Page/Widget |
| extends HookWidget                    | HookWidget            | Page/Widget |
| extends ConsumerWidget                | Riverpod Widget       | Page/Widget |
| extends ConsumerStatefulWidget        | Riverpod State Widget | Page/Widget |
| extends StatelessWidget with \_prefix | Private Widget        | Component   |

---

## Notes

1. All documents are written in **Chinese**
2. Time format uses ISO 8601 standard
3. **CHANGELOG.md**: Serves as update list with links to details
4. **update-list/**: Contains detailed update content (can be regenerated)
5. **README.md**: Shows only 3 most recent updates
6. **Document changes**: Record actual document changes, not just git commits
7. **Old update-list files**: Can be deleted and regenerated if needed
8. Root md files are migrated to docs/ and deleted from root
9. Duplicate detection: keep more detailed version when merging
10. Same-day updates must be merged into one `update-YYYY-MM-DD.md` file and one `updateHistory` item
