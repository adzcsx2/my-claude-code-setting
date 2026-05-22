---
name: adt:android-i18n
description: Audit Android project for hardcoded Chinese strings, generate i18n resources for 4 languages (en/ru/zh/zh-rTW), and update code to use string resources.
---

> **中文环境要求**
>
> 本技能运行在中文环境下，请遵循以下约定：
> - 面向用户的回复、注释、提示信息必须使用中文
> - AI 内部处理过程可以使用英文
> - 所有生成的文件必须使用 UTF-8 编码
>
> ---

# Android i18n Audit Tool

审计 Android 项目中的硬编码中文字符串,自动生成 4 种语言的国际化资源 (en/ru/zh/zh-rTW),并更新代码使用字符串资源。

## 功能概述

此 skill 执行以下任务:

1. **扫描硬编码字符串** - 查找 XML 布局和 Kotlin/Java 代码中的中文字符串
2. **生成字符串资源** - 自动创建 strings.xml 并翻译为 4 种语言
3. **更新代码引用** - 将硬编码字符串替换为资源引用

## 使用方法

### 基本用法

```bash
# 审计当前目录的 Android 项目
/adt:android-i18n

# 审计指定目录的 Android 项目
/adt:android-i18n /path/to/android/project
```

### 扫描范围

| 文件类型 | 扫描内容 |
|---------|---------|
| `*.xml` (布局) | `android:text`, `android:hint`, `android:contentDescription` 等属性 |
| `*.kt` / `*.java` | 字符串字面量中的中文字符 |
| `strings.xml` | 检查缺失的翻译 |

## 工作流程

### 1. 扫描硬编码字符串

扫描项目中的中文字符串:

```bash
# 扫描 XML 布局
grep -r --include="*.xml" "[\u4e00-\u9fff]" res/layout/

# 扫描 Kotlin/Java 代码
grep -r --include="*.kt" --include="*.java" "[\u4e00-\u9fff]" app/src/
```

### 2. 生成字符串资源

在 `res/values/strings.xml` 中创建字符串资源:

```xml
<resources>
    <string name="app_name">应用名称</string>
    <string name="login_button">登录</string>
    <string name="welcome_message">欢迎使用</string>
</resources>
```

### 3. 生成多语言翻译

自动生成以下文件:

| 目录 | 语言 |
|------|------|
| `res/values/` | 中文 (默认) |
| `res/values-en/` | 英文 |
| `res/values-ru/` | 俄文 |
| `res/values-zh-rTW/` | 繁体中文 |

### 4. 更新代码引用

将硬编码字符串替换为资源引用:

**XML 布局:**
```xml
<!-- Before -->
<TextView android:text="登录" />

<!-- After -->
<TextView android:text="@string/login_button" />
```

**Kotlin 代码:**
```kotlin
// Before
showToast("操作成功")

// After
showToast(getString(R.string.operation_success))
```

## 输出报告

执行完成后,生成审计报告:

```
=== Android i18n Audit Report ===

Total hardcoded strings found: 42
  - XML layouts: 28
  - Kotlin files: 14

Generated translations:
  - res/values/strings.xml (base)
  - res/values-en/strings.xml
  - res/values-ru/strings.xml
  - res/values-zh-rTW/strings.xml

Code updates:
  - 28 XML files updated
  - 14 Kotlin files updated

Warnings:
  - 3 strings may need manual review for context
```

## 注意事项

1. **备份项目** - 执行前请确保已提交代码到 Git
2. **人工审核** - 自动翻译可能需要人工校对
3. **上下文敏感** - 某些字符串可能需要根据上下文调整翻译
4. **格式字符串** - 带参数的字符串需要特殊处理 (`%1$s`, `%d`)

## 最佳实践

1. **命名规范** - 使用描述性的资源名称 (`login_button` 而非 `text1`)
2. **分组管理** - 按功能模块组织字符串资源
3. **避免重复** - 复用已有的字符串资源
4. **保持同步** - 确保 4 种语言的 strings.xml 结构一致
