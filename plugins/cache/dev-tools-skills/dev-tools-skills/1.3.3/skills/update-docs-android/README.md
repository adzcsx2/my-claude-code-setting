# adt:update-docs

Android 项目文档自动生成与审计工具。先审计代码改动，再按影响范围更新 README、docs、reports、update-list 和示例文档，支持增量更新。

---

## 功能

- 分析 AndroidManifest.xml、build.gradle、Activity/Fragment、布局文件等生成多类型文档
- 支持增量更新：基于 Git 变更检测，先审计代码改动，再更新全部受影响文档
- 生成的文档包括：项目概览、界面文档、导航文档、四大组件、通知文档、构建变体、依赖文档、API 文档
- 会额外检查根 README、docs/README、docs/reports、docs/update-list 和 example 文档是否也需要同步
- 维护更新日志（CHANGELOG.md），每次更新生成详情文档并可链接跳转
- 同一天多次执行会合并到同一条更新记录，不再生成 `-2`、`-3` 这类同日详情文件
- 将根目录散落的 md 文件迁移到 docs/ 目录集中管理
- 更新 README.md 显示最近更新摘要和文档快速链接
- 支持参数控制：`--force` 强制重新生成、`--dry-run` 仅分析不生成、按类型单独生成
- 当改动范围较大或不明确时，可先提示用户后调用只读子代理做审计，再回到主线程统一改文档

## 用法

```bash
# 增量更新所有文档
/adt:update-docs

# 强制重新生成所有文档
/adt:update-docs --force

# 仅生成界面文档
/adt:update-docs interfaces
```

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，修改 SKILL.md 后运行 `/dt:update-remote-plugins`。
