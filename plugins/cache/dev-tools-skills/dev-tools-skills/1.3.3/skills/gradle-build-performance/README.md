# adt:gradle-build-performance

调试和优化 Android/Gradle 构建性能，适用于构建缓慢、CI/CD 性能问题、构建扫描分析和编译瓶颈排查。

---

## 功能

- 分析项目 Gradle 配置，生成当前状态与最优配置的对比诊断表
- 提供 12 种优化模式：Configuration Cache、Build Cache、并行执行、JVM 内存调优、Non-Transitive R、KSP 迁移等
- 按风险等级提出优化方案（零风险/低风险/中风险）
- 检测 ButterKnife 使用和跨模块 R 引用，避免启用不兼容的优化选项
- 处理 `gradle.properties` 的 UTF-8 编码问题（自动检测和转换）
- 提供 CI/CD 优化方案：远程 Build Cache、Gradle Enterprise、任务跳过

## 用法

```
/adt:gradle-build-performance
```

使用场景示例：
- "构建速度太慢，怎么优化？"
- "如何分析 Gradle Build Scan？"
- "为什么配置阶段耗时这么长？"
- "怎么启用 Configuration Cache？"

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，修改 SKILL.md 后运行 `/adt:update-remote-plugins`。
