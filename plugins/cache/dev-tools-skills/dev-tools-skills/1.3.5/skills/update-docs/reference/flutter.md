# Flutter Reference

Flutter 项目 update-docs 平台特有逻辑。

---

## Project Detection Files

检测以下文件确认是 Flutter 项目：

- `pubspec.yaml`
- `lib/main.dart`
- `android/` 或 `ios/` 目录

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

## File to Document Mapping

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

---

## Analyze Project

### Analyze pubspec.yaml

Extract: name, version, description, Flutter/Dart SDK constraints, dependencies, dev_dependencies

**扫描范围补充：**

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

**提取规则：**

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

### Analyze Directory Structure

Use Glob to find: `lib/**/*.dart`

### Analyze Pages/Screens

Use Glob: `lib/**/*_page.dart`, `lib/**/*_screen.dart`, `lib/**/*_view.dart`

### Analyze Widgets

Use Glob: `lib/**/*_widget.dart`, `lib/**/*_dialog.dart`, `lib/**/*_bottom_sheet.dart`

### Analyze Navigation/Routing

Detect routing approach:

- Named routes: `MaterialApp(routes: ...)`
- `go_router`: `GoRouter(...)` in `lib/`
- `auto_route`: `@MaterialAutoRouter` annotations
- `GetX`: `GetPage(...)` routes
- Navigator 1.0: `Navigator.push(...)`

Use Grep: `GoRoute`, `GetPage`, `MaterialPageRoute`, `Navigator.push`, `context.go(`, `context.push(`

### Analyze State Management

Detect state management approach:

- `setState`: grep for `setState(()`
- `ChangeNotifier` / `Provider`: grep for `ChangeNotifier`, `Consumer`, `Provider`, `context.watch`, `context.read`
- `Riverpod`: grep for `ProviderScope`, `ref.watch`, `ref.read`, `@riverpod`
- `BLoC` / `Cubit`: grep for `BlocProvider`, `BlocBuilder`, `context.read<`, `emit(`
- `GetX`: grep for `GetxController`, `Get.put`, `Obx(`, `Get.find`
- `MobX`: grep for `@observable`, `@action`, `Store`

### Analyze API Interfaces

Use Grep: `@GET`, `@POST`, `@PUT`, `@DELETE`, `dio.get`, `dio.post`, `http.get`, `http.post`

---

## Document List

| Document            | Location          | Content                                           |
| ------------------- | ----------------- | ------------------------------------------------- |
| PROJECT_OVERVIEW.md | docs/guide/       | 项目概览（名称、版本、SDK、技术栈、目录结构）     |
| WIDGETS.md          | docs/modules/     | 界面文档（页面、Widget、控件分析、功能说明）      |
| NAVIGATION.md       | docs/modules/     | 导航文档（路由方案、页面跳转关系、命名路由列表）  |
| STATE_MANAGEMENT.md | docs/modules/     | 状态管理文档（方案、Provider/Bloc/Riverpod 列表） |
| DEPENDENCIES.md     | docs/references/  | 依赖文档（Flutter/Dart SDK、第三方依赖列表）      |
| API.md              | docs/references/  | API 接口文档（URL、请求方法、参数说明）           |
| CHANGELOG.md        | docs/reports/     | 更新列表，支持点击查看详情                        |
| update-list/*.md    | docs/update-list/ | 每次更新的详细内容                                |

---

## Metadata projectType

```json
{
  "projectType": "flutter"
}
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
