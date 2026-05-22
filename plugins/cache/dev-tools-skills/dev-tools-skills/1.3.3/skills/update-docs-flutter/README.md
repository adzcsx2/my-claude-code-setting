# fdt:update-docs

为 Flutter 项目自动生成并审计中文技术文档。先审计代码改动，再按影响范围更新 README、docs、reports、update-list 和示例文档。

---

## 功能

- 分析项目结构
- 生成界面文档（Widget、控件分析、功能说明）
- 文档化导航流程和路由关系
- 列出状态管理方案和分层结构
- 文档化 API 接口
- 支持增量更新：基于 Git 变更先做文档影响审计，再更新全部受影响文档
- 会同时扫描根目录 pubspec.yaml、example/pubspec.yaml 以及工作区内本地 path 依赖指向的附加 pubspec，并记录注释中的 ref/version 信息
- 将根目录 md 文件迁移到 docs/ 目录
- 更新 README 并添加分类文档快捷链接
- 会额外检查根 README、docs/README、SDK/API 文档、CHANGELOG、update-list 和 example 文档是否需要同步
- CHANGELOG.md 作为更新列表，支持点击查看详情
- 详细更新文档存放在 `docs/update-list/`，记录实际内容变更
- 同一天多次执行会合并到同一条更新记录，不再生成 `-2`、`-3` 这类同日详情文件
- 当改动范围较大或不明确时，可先提示用户后调用只读子代理做审计，再回到主线程统一改文档

## 用法

```bash
/fdt:update-docs [--force] [--dry-run] [widgets|navigation|state|api]
```

---

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，修改 SKILL.md 后运行 `/dt:update-remote-plugins`。
