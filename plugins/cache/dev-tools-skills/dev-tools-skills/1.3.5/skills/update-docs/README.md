# dt:update-docs

跨平台项目文档自动生成工具。自动检测项目类型（Android / Flutter / 其他语言），分析项目结构，生成中文技术文档，支持增量更新。

## 功能

- **自动检测项目类型**：无需手动指定，自动识别 Android、Flutter 或其他语言项目
- **先审计后更新**：先审计代码改动，再全链路更新所有受影响文档
- **增量更新**：只更新有变化的部分，避免全量重写
- **完整文档体系**：README、docs 索引、模块文档、API 文档、更新日志
- **证据矩阵**：每个文档更新都有源代码变更作为证据支撑
- **多语言扩展**：通过 `reference/` 目录支持任意语言项目的文档生成

## 平台支持

| 平台    | 检测方式                      | Reference              |
| ------- | ----------------------------- | ---------------------- |
| Android | `settings.gradle` + `build.gradle` | `reference/android.md` |
| Flutter | `pubspec.yaml` + `lib/main.dart`   | `reference/flutter.md` |
| 其他    | 自动推断语言和框架            | `reference/generic.md` |

## 使用示例

```
/dt:update-docs
/dt:update-docs --force
/dt:update-docs --dry-run
```

## 参数

| 参数        | 说明                 |
| ----------- | -------------------- |
| 无参数      | 增量更新所有文档     |
| `--force`   | 强制重新生成所有文档 |
| `--dry-run` | 仅分析，不生成文件   |

各平台特有参数见对应的 reference 文件。

## 文档结构

```
docs/
├── guide/          # 使用指南
├── modules/        # 模块说明
├── references/     # 参考资料
├── reports/        # 报告（含 CHANGELOG.md）
└── update-list/    # 更新详情
```
