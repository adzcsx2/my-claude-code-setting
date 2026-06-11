# Android Reference

Android 项目 update-docs 平台特有逻辑。

---

## Project Detection Files

检测以下文件确认是 Android 项目：

- `settings.gradle` 或 `settings.gradle.kts`
- `build.gradle` 或 `build.gradle.kts`
- `app/src/main/AndroidManifest.xml`

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

## File to Document Mapping

| Source File Pattern                                      | Affected Documents                  |
| -------------------------------------------------------- | ----------------------------------- |
| `**/*Activity.kt`, `**/*Activity.java`                   | INTERFACES.md, NAVIGATION.md        |
| `**/*Fragment.kt`, `**/*Fragment.java`                   | INTERFACES.md, NAVIGATION.md        |
| `**/res/layout/*.xml`                                    | INTERFACES.md                       |
| `**/http/*Api.kt`, `**/api/*.kt`                         | API.md                              |
| `AndroidManifest.xml`                                    | COMPONENTS.md, NAVIGATION.md        |
| `build.gradle`, `build.gradle.kts`                       | BUILD_VARIANTS.md, DEPENDENCIES.md  |
| `**/notification/*`, `*Notification*.kt`                 | NOTIFICATIONS.md                    |

**扩展映射规则：**

- 如果公开接口、接入步骤、命令入口或能力边界发生变化，额外更新 `README.md` 与 `docs/README.md`
- 如果示例工程、调试入口、联调方式或演示界面发生变化，额外更新 `example/README.md` 或对应示例文档
- 如果当天已经有文档更新记录，写入当天同一文件中的新执行批次，并同步刷新 `docs/reports/CHANGELOG.md`
- 如果一次改动同时影响多个文档，必须一次性全量更新，不要只修最先命中的那一篇

---

## Analyze Project

### Analyze AndroidManifest.xml

Extract: applicationId, versionCode, versionName, four components list, permissions list

### Analyze build.gradle

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

**提取规则：**

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

### Analyze Activity/Fragment

Use Glob to find: `**/*Activity.java`, `**/*Activity.kt`, `**/*Fragment.java`, `**/*Fragment.kt`

### Analyze Layout Files

Use Glob: `**/res/layout/*.xml`

### Analyze Notification Config

Use Grep: `NotificationChannel`, `NotificationManager`

### Analyze API Interfaces

Use Grep: `@GET`, `@POST`, `@PUT`, `@DELETE`

---

## Document List

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
| CHANGELOG.md        | docs/reports/     | Update list with links to details                 |
| update-list/*.md    | docs/update-list/ | Detailed update content per update                |

---

## Metadata projectType

```json
{
  "projectType": "android"
}
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
