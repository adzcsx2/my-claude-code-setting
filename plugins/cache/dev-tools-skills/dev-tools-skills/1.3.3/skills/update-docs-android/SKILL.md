---
name: adt:update-docs
description: Auto-generate and audit Chinese technical documentation for Android projects. First audit code changes, then update all affected docs including README, docs index, modules, references, reports, and example docs. If a read-only subagent is needed for change audit, tell the user before invoking it.
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

Android 项目文档自动生成工具。分析项目结构，生成中文技术文档，支持增量更新。

## Core Mode

本技能默认按“先审计代码改动，再补齐全部相关文档”的模式执行，而不是只生成单篇文档。

强制要求：

- 如果项目存在代码改动，先审计改动内容、影响范围和对外行为变化，再决定要更新哪些文档
- 文档更新范围必须覆盖所有受影响入口，而不是只更新单个模块文档
- 至少检查：根 README、docs/README、docs/guide、docs/modules、docs/references、docs/reports、docs/update-list，以及项目中的 example/示例文档
- 如果改动涉及公开 API、接入方式、平台能力、权限、脚本、目录结构、状态流、通知、组件或接口契约，必须同步更新对应文档
- 如果需要调用只读子代理做改动审计，必须先明确告知用户“将调用子代理先做审计，再回来修改文档”
- 最终输出要先给出审计结论，再说明已更新哪些文档；如果仍有未覆盖风险，也要点明

## When to Use

- Generating project documentation for Android apps
- Creating interface documentation with control analysis
- Documenting navigation flows and Activity-Fragment relationships
- Listing Android four components (Activity, Service, Receiver, Provider)
- Documenting notification channels and API endpoints
- Migrating root directory md files to docs/ for centralized management
- Updating README with categorized doc quick links
- Tracking document changes with detailed update logs

## Example Prompts

- "/update-docs"
- "Generate documentation for my Android project"
- "Update project docs with --force"
- "Only generate interface documentation"
- "审计这次代码改动并把所有相关文档一起更新"
- "先检查 git diff，再按影响范围补 README、docs 和 example 文档"

---

## Command Parameters

| Parameter       | Description                        |
| --------------- | ---------------------------------- |
| No args         | Incremental update of all docs     |
| `--force`       | Force regenerate all docs          |
| `--dry-run`     | Analyze only, don't generate files |
| `interfaces`    | Generate interface docs only       |
| `navigation`    | Generate navigation docs only      |
| `components`    | Generate four components docs only |
| `notifications` | Generate notification docs only    |
| `api`           | Generate API docs only             |

---

## Document Structure

```
README.md
├── 最近更新（3条摘要 + 链接到更新记录）
└── ...

docs/
├── guide/                    # 使用指南
│   ├── PROJECT_OVERVIEW.md   # 项目概览
│   └── BUILD_VARIANTS.md     # 构建变体
├── modules/                  # 模块说明
│   ├── INTERFACES.md         # 界面文档
│   ├── NAVIGATION.md         # 导航文档
│   ├── COMPONENTS.md         # 四大组件
│   └── NOTIFICATIONS.md      # 通知文档
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
2. Summarize what changed from a documentation perspective: API, behavior, permissions, routes, build, config, modules, examples, scripts
3. Build an affected-doc list instead of defaulting to a single output file
4. If the affected area is broad or ambiguous, explicitly tell the user that a read-only subagent will be used for audit, then invoke it

**Affected-doc checklist:**

- `README.md`
- `docs/README.md`
- `docs/guide/*`
- `docs/modules/*`
- `docs/references/*`
- `docs/reports/CHANGELOG.md`
- `docs/update-list/update-YYYY-MM-DD.md`
- `example/README.md` and other user-facing demo docs when example behavior changed

### 1. Verify Project Type

Check for these files:

- `settings.gradle` or `settings.gradle.kts`
- `build.gradle` or `build.gradle.kts`
- `app/src/main/AndroidManifest.xml`

Exit if not an Android project.

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
  "version": "1.3",
  "projectType": "android",
  "lastUpdate": "2026-03-12T10:30:00Z",
  "lastCommit": "abc1234def5678",
  "documents": {
    "PROJECT_OVERVIEW.md": {
      "updatedAt": "2026-03-12T10:30:00Z",
      "sourceFiles": ["build.gradle", "settings.gradle"],
      "lastCommit": "abc1234"
    }
  },
  "updateHistory": [
    {
      "date": "2026-03-12",
      "diffFile": "update-list/update-2026-03-12.md",
      "summary": "新增铸造功能文档，更新 API 接口说明",
      "documentsUpdated": ["INTERFACES.md", "API.md"]
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
| Source File Pattern | Affected Documents |
|---------------------|-------------------|
| `**/*Activity.kt`, `**/*Activity.java` | INTERFACES.md, NAVIGATION.md |
| `**/*Fragment.kt`, `**/*Fragment.java` | INTERFACES.md, NAVIGATION.md |
| `**/res/layout/*.xml` | INTERFACES.md |
| `**/http/*Api.kt`, `**/api/*.kt` | API.md |
| `AndroidManifest.xml` | COMPONENTS.md, NAVIGATION.md |
| `build.gradle`, `build.gradle.kts` | BUILD_VARIANTS.md, DEPENDENCIES.md |
| `**/notification/*`, `*Notification*.kt` | NOTIFICATIONS.md |

**扩展映射规则：**

- 如果公开接口、接入步骤、命令入口或能力边界发生变化，额外更新 `README.md` 与 `docs/README.md`
- 如果示例工程、调试入口、联调方式或演示界面发生变化，额外更新 `example/README.md` 或对应示例文档
- 如果当天已经有文档更新记录，写入当天同一文件中的新执行批次，并同步刷新 `docs/reports/CHANGELOG.md`
- 如果一次改动同时影响多个文档，必须一次性全量更新，不要只修最先命中的那一篇

### 4.1 Build Evidence Matrix Before Writing

在生成任何文档前，先为每个实际改动文件建立一行证据记录，至少包含：

| 字段                | 必填内容                                                                 |
| ------------------- | ------------------------------------------------------------------------ |
| Source file         | 实际变更文件路径                                                         |
| Symbol / entry      | 变更的 Activity、Fragment、接口、权限、通知渠道、Gradle 配置项或脚本入口 |
| Real change         | 新增 / 删除 / 修改了什么行为，禁止只写“优化”“调整”                       |
| User-visible impact | 对用户、接入方、构建方式、联调流程或示例行为造成的影响                   |
| Target docs         | 受影响文档列表                                                           |
| Update-list bullet  | 准备写入 `update-list` 的具体条目                                        |

强制要求：

- `update-list` 中的每个 bullet 必须能回溯到至少一条证据记录
- 禁止只依据 commit message 生成文档内容
- 禁止使用“完善逻辑”“更新内容”“修复问题”这类无法映射到代码事实的空泛描述
- 如果 diff hunk 无法说明真实行为，必须补读对应源文件后再写文档

### 5. Analyze Project

#### 5.1 Analyze AndroidManifest.xml

Extract: applicationId, versionCode, versionName, four components list, permissions list

#### 5.2 Analyze build.gradle

Extract: compileSdkVersion / compileSdk, minSdk, targetSdk, buildTypes, productFlavors, plugins, module dependencies, external dependencies

**重要：提取被注释掉的版本号**

在分析依赖时，必须同时记录被注释掉的版本信息（通常用于本地开发或备用配置）：

```kotlin
// implementation("com.squareup.okhttp3:okhttp:4.12.0")
implementation(project(":network"))

// api(project(":legacy-sdk"))
api("com.squareup.retrofit2:retrofit:2.11.0")
```

```toml
# retrofit = "2.10.0"
retrofit = "2.11.0"
```

**提取规则**：

- 同时扫描根工程与各模块的 `build.gradle` / `build.gradle.kts`、`settings.gradle` / `settings.gradle.kts`、`gradle/libs.versions.toml`、`gradle.properties`
- 检测 Gradle/KTS 中被注释掉的 `implementation`、`api`、`classpath`、`id(...) version ...`、`project(...)` 依赖或插件版本
- 检测 version catalog / TOML 中被注释掉的 alias 版本，如 `# retrofit = "2.10.0"`
- 如果当前使用 alias，必须同时记录 alias 名和解析后的实际版本
- 在 `DEPENDENCIES.md` 中同时记录当前使用方式和注释中的备选版本或本地模块方案
- 格式示例：

  ```markdown
  ### retrofit

  - **当前配置**: version catalog `libs.retrofit` -> `2.11.0`
  - **注释中的版本**: `retrofit = "2.10.0"`

  ### network module

  - **当前配置**: `implementation(project(":network"))`
  - **注释中的备选方案**: `api(project(":legacy-sdk"))`
  ```

#### 5.3 Analyze Activity/Fragment

Use Glob to find: `**/*Activity.java`, `**/*Activity.kt`, `**/*Fragment.java`, `**/*Fragment.kt`

#### 5.4 Analyze Layout Files

Use Glob: `**/res/layout/*.xml`

#### 5.5 Analyze Notification Config

Use Grep: `NotificationChannel`, `NotificationManager`

#### 5.6 Analyze API Interfaces

Use Grep: `@GET`, `@POST`, `@PUT`, `@DELETE`

### 6. Migrate Root MD Files to docs/

Scan root directory for markdown files (excluding README.md) and migrate to appropriate docs/ subdirectories.

### 7. Generate Documents

All docs go in `docs/` subdirectories based on their category:

| Document            | Location          | Content                                           |
| ------------------- | ----------------- | ------------------------------------------------- |
| PROJECT_OVERVIEW.md | docs/guide/       | Project overview                                  |
| INTERFACES.md       | docs/modules/     | Interface docs (control analysis, functionality)  |
| NAVIGATION.md       | docs/modules/     | Navigation docs (Activity-Fragment relationships) |
| COMPONENTS.md       | docs/modules/     | Four components docs                              |
| NOTIFICATIONS.md    | docs/modules/     | Notification docs                                 |
| BUILD_VARIANTS.md   | docs/guide/       | Build variants docs                               |
| DEPENDENCIES.md     | docs/references/  | Dependencies docs                                 |
| API.md              | docs/references/  | API interface docs (URL and method)               |
| CHANGELOG.md        | docs/reports/     | **Update list with links to details**             |
| update-list/\*.md   | docs/update-list/ | **Detailed update content per update**            |

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
**受影响文档**: API.md, INTERFACES.md, NAVIGATION.md

## 变更证据矩阵

| 源文件                                  | 变更符号/入口  | 实际变化                   | 用户可见影响               | 目标文档                  |
| --------------------------------------- | -------------- | -------------------------- | -------------------------- | ------------------------- |
| `app/src/main/java/.../CastDialog.kt`   | `CastDialog`   | 新增铸造确认和失败重试交互 | 铸造对话框行为发生变化     | `INTERFACES.md`           |
| `app/src/main/java/.../WCController.kt` | `WCController` | 新增钱包连接超时与重连逻辑 | 连接流程与错误处理发生变化 | `NAVIGATION.md`, `API.md` |

## 文档变更详情

### API.md

**变更类型**: 新增接口

**变更内容**:

- 新增 `POST /mint/nft` NFT 铸造接口
  - 请求参数: `imageHash`, `walletAddress`
  - 返回: `transactionHash`, `status`
- 新增 `GET /user/wallet` 钱包地址查询接口

### INTERFACES.md

**变更类型**: 新增组件

**变更内容**:

- 新增 CastDialog 铸造确认对话框
  - 支持显示铸造进度
  - 支持失败重试
- 更新 AlbumActivity 说明
  - 新增铸造状态显示逻辑

### NAVIGATION.md

**变更类型**: 更新流程

**变更内容**:

- 新增 WalletConnect 连接流程
  - ReviewActivity → WalletConnectResponseActivity
  - 支持返回重连逻辑
```

### 8.3 Git Commit Detailed Analysis (CRITICAL)

**分析每个提交中每个文件的变动，多处变动都要写上：**

```markdown
## Git 提交详细分析

### a7f334e - 修复作品页铸造失败重试逻辑与Toast文案

**变动文件**:

- `CastDialog.kt`
  - 新增重试按钮点击事件
  - 更新错误提示文案
  - 新增铸造状态监听
- `WCController.kt`
  - 修复连接断开重连逻辑
  - 新增超时处理
- `MintPendingManager.kt`
  - 新增待处理队列管理
  - 新增状态回调接口
- `AlbumActivity.kt`
  - 更新铸造状态显示

### 612a131 - 重构完成第一版-铸造流程跑通

**变动文件**:

- `MyApplication.kt`
  - 初始化铸造管理器
- `ReviewActivity.kt`
  - 新增铸造入口
- `CastDialog.kt`
  - 重构铸造对话框
- `MintHelper.kt`
  - 新增铸造辅助类
- `WCController.kt`
  - 集成钱包连接
```

**注意**：

- 每个文件的**多处变动都要列出**
- 不要写"保持不变"的文件列表
- 只写有实际变动的文件
- 如果本次主要来自未提交 diff，也要写成 `### 当前工作区改动` 或 `### 已暂存改动`，不要强行伪造成 commit
- 每条文件级描述都要来自 diff hunk 或补读后的源文件事实，不能复述 commit 标题代替分析

### 8.3 What to EXCLUDE from Update Log (CRITICAL)

**以下内容只有在发生实际变动时才写入更新日志：**

| 内容类型       | 排除规则                                                     |
| -------------- | ------------------------------------------------------------ |
| **项目统计**   | Activities/Fragments/Services 数量等统计数据，**不变动不写** |
| **组件列表**   | Activity/Fragment 名称列表，**不变动不写**                   |
| **通知渠道**   | 通知渠道配置，**不变动不写**                                 |
| **构建变体**   | stageEnv/releaseEnv 等配置，**不变动不写**                   |
| **依赖库版本** | CameraX/OkHttp/Retrofit 等版本号，**不变动不写**             |
| **技术栈**     | Kotlin/MVVM/Room 等技术选型，**不变动不写**                  |

### 8.4 Comment-Only Changes (Simplified Format)

**如果源文件只是添加了注释（没有代码逻辑变更）：**

```markdown
### API.md

**变更类型**: 新增注释

**变更内容**:

- 以下文件新增代码注释：
  - `BaseApi.kt`
  - `CenterApi.kt`
  - `AIApi.kt`
```

**不要展开列出完整的接口内容，只说明哪些文件增加了注释。**

### 8.5 How to Detect Actual Changes (CRITICAL)

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

### 8.6 Ignore Code Formatting Changes (CRITICAL)

**代码格式化变化不应记录到更新日志：**

| 变化类型      | 是否记录    | 示例                                 |
| ------------- | ----------- | ------------------------------------ |
| 新增接口/方法 | ✅ 记录     | 新增 `POST /mint/nft`                |
| 删除接口/方法 | ✅ 记录     | 删除 `GET /old/api`                  |
| 修改接口参数  | ✅ 记录     | 参数 `userId` 改为 `walletAddress`   |
| 代码换行/缩进 | ❌ 不记录   | `builder.addHeader("token", x)` 换行 |
| 代码格式化    | ❌ 不记录   | IDE 自动格式化                       |
| 注释变化      | ⚠️ 简化记录 | 只列出文件名，不展开内容             |

**检测方法：**

```bash
# 忽略空白变化，检查是否有实际内容变化
git diff HEAD --ignore-all-space -- docs/API.md

# 如果忽略空白后没有变化，则不记录
if git diff HEAD --ignore-all-space --quiet -- docs/API.md; then
  echo "No actual changes, skip recording"
fi

# 检查源代码是否有逻辑变化（不只是格式化）
git diff HEAD --ignore-all-space -- "*.kt" "*.java"
```

### 8.7 Source Code Change Detection

**分析源代码变更时，区分格式化和逻辑变化：**

```markdown
## Git 提交详细分析

### e205804 - 重构图片加载,提高加载效率

**变动文件**:

- `HttpUtils.kt`
  - 代码格式化（换行调整）← 无需详细展开
  - 新增 `LoggingInterceptor` 替换旧日志拦截器 ← 实际变更
- `ALiYunOSS.kt`
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

## 2026-03-12 - 铸造功能文档更新

**变更概述**: 新增 NFT 铸造相关文档，更新 WalletConnect 集成说明

| 文档          | 变更类型 | 简介                                       |
| ------------- | -------- | ------------------------------------------ |
| API.md        | 新增接口 | 新增 `/mint/nft` 铸造接口、钱包查询接口    |
| INTERFACES.md | 新增组件 | 新增 CastDialog 对话框，更新 AlbumActivity |
| NAVIGATION.md | 更新流程 | 新增 WalletConnect 连接导航流程            |

[查看详情](../update-list/update-2026-03-12.md)

---

## 2026-03-09 - 首次文档生成

**变更概述**: 生成完整项目文档

| 文档                | 变更类型 | 简介         |
| ------------------- | -------- | ------------ |
| PROJECT_OVERVIEW.md | 新增     | 项目概览文档 |
| INTERFACES.md       | 新增     | 界面文档     |
| ...                 | ...      | ...          |

[查看详情](../update-list/update-2026-03-09.md)

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

| 日期       | 描述                                               |
| ---------- | -------------------------------------------------- |
| YYYY-MM-DD | 新增 NFT 铸造相关文档，更新 WalletConnect 集成说明 |
| YYYY-MM-DD | 新增界面文档、导航流程文档                         |
| YYYY-MM-DD | 首次生成项目文档                                   |

> 查看全部更新: [更新记录](docs/reports/CHANGELOG.md)

---

### 快速开始

| 文档                                       | 描述                       |
| ------------------------------------------ | -------------------------- |
| [项目概览](docs/guide/PROJECT_OVERVIEW.md) | 项目简介、版本信息、技术栈 |
| [开发环境](docs/guide/SETUP.md)            | 环境配置与开发指南         |

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
4. **Update stats** section
5. **Skip metadata-only runs**: If no actual doc changed, do not append updateHistory or refresh summaries

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

### Activity Jump Detection

```
startActivity\(new Intent\(.*?,\s*(\w+Activity)\.class\)\)
ActivityUtil\.next\(.*?,\s*(\w+Activity)\.class\)
(\w+Activity)\.start\(
```

### Fragment Switch Detection

```
beginTransaction\(\)[\s\S]*?replace\((\w+),\s*(\w+Fragment)
viewPager\.setCurrentItem\((\d+)\)
```

### Control Detection

```
findViewById\(R\.id\.(\w+)\)
binding\.(\w+)
android:onClick="(\w+)"
```

### Notification Channel Detection

```
NotificationChannel\(["']([^"']+)["'],\s*["']([^"']+)["']
```

### API Interface Detection

```
@GET\(["']([^"']+)["']\)
@POST\(["']([^"']+)["']\)
["'](https?://[^"']+)["']
["'](\/api\/[^"']+)["']
```

---

## Control Type Mapping

| XML Tag      | Type         | Category    |
| ------------ | ------------ | ----------- |
| TextView     | TextView     | Display     |
| EditText     | EditText     | Input       |
| Button       | Button       | Interactive |
| ImageButton  | ImageButton  | Interactive |
| ImageView    | ImageView    | Display     |
| RecyclerView | RecyclerView | Container   |
| ViewPager2   | ViewPager2   | Container   |
| CheckBox     | CheckBox     | Input       |
| Switch       | Switch       | Input       |

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
