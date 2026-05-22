# adt:android-i18n

审计 Android 项目中的硬编码中文字符串，自动生成 4 种语言的国际化资源（en/ru/zh/zh-rTW），并更新代码使用字符串资源。

---

## 功能

- 扫描 XML 布局和 Kotlin/Java 代码中的硬编码中文字符串
- 自动生成 strings.xml 并翻译为 4 种语言（中文、英文、俄文、繁体中文）
- 将硬编码字符串替换为资源引用（XML 布局和 Kotlin/Java 代码）
- 支持扫描 `android:text`、`android:hint`、`android:contentDescription` 等属性
- 执行完成后生成审计报告，包含处理数量和警告信息

## 用法

```bash
# 审计当前目录的 Android 项目
/adt:android-i18n

# 审计指定目录的 Android 项目
/adt:android-i18n /path/to/android/project
```

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，修改 SKILL.md 后运行 `/adt:update-remote-plugins`。
