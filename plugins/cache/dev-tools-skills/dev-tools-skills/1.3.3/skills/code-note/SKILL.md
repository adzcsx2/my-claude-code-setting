---
name: dt:code-note
description: "Add Chinese comments to source files. Auto-detects language (Kotlin/Java/Dart/others) and applies appropriate comment style."
argument-hint: "[filename]"
---

> **中文环境要求**
>
> 本技能运行在中文环境下，请遵循以下约定：
> - 面向用户的回复、注释、提示信息必须使用中文
> - AI 内部处理过程可以使用英文
> - 所有生成的文件必须使用 UTF-8 编码
>
> ---

# code-note Skill

为源代码文件添加中文注释。自动检测语言类型并应用对应注释风格。

## When to Use

- 为现有代码添加注释
- 提升代码可读性，方便团队协作
- 为遗留代码补充文档
- 为复杂逻辑添加行内说明

## Example Prompts

- `/dt:code-note AlbumActivity`
- `/dt:code-note login_page.dart`
- `给 AlbumActivity 添加注释`
- `帮我给这个文件写上注释`

---

## Command Parameters

| Parameter | Description |
|-----------|-------------|
| `文件名` | 要添加注释的文件名，可带或不带扩展名 |

---

## Execution Flow

### 1. Detect Language & Locate File

根据文件扩展名自动检测语言类型：

| Extension | Language | Comment Style |
|-----------|----------|---------------|
| `.kt`, `.java` | Kotlin / Java | KDoc / JavaDoc (`/** */`) |
| `.dart` | Dart | dartdoc (`///`) |
| `.swift` | Swift | `///` |
| `.py` | Python | docstring (`""" """`) |
| `.ts`, `.tsx`, `.js`, `.jsx` | TypeScript / JavaScript | JSDoc (`/** */`) |
| `.go` | Go | `//` |
| 其他 | - | `//` |

如果用户没有提供扩展名，按以下顺序搜索：
```
**/*{FileName}.kt
**/*{FileName}.java
**/*{FileName}.dart
**/*{FileName}.swift
**/*{FileName}.py
**/*{FileName}.ts
**/*{FileName}.tsx
```

If multiple matches found, list them and ask user to select.

### 2. Read File Content

Read the entire file to understand:
- Class/struct/enum structure and purpose
- Member variables
- Methods/functions and their behavior
- Key logic blocks

### 3. Analyze Code Structure

Identify elements that need comments:

#### Class Level
- Class/struct purpose and responsibility
- Key features/capabilities

#### Member Variables
- Purpose of each variable
- Data type significance if non-obvious

#### Methods
- Method purpose (in language-appropriate doc style)
- Parameter descriptions
- Return value meaning
- Side effects if any

#### Key Logic Blocks
- Complex conditional logic
- Loops and iterations
- Callback handlers
- Data transformations
- Error handling

### 4. Add Comments (Language-Specific)

#### Kotlin / Java (KDoc / JavaDoc)

```kotlin
/**
 * 类/方法说明
 * @param paramName 参数说明
 * @return 返回值说明
 */
```

```kotlin
// 单行注释说明关键逻辑
```

```kotlin
/** 成员变量说明 */
private var variable: Type
```

#### Dart (dartdoc)

```dart
/// 类/方法说明
/// [paramName] 参数说明
/// 返回值说明
```

```dart
// 单行注释说明关键逻辑
```

```dart
/// 成员变量说明
final String variable;
```

#### Swift

```swift
/// 类/方法说明
/// - Parameter name: 参数说明
/// - Returns: 返回值说明
```

#### Python (docstring)

```python
"""类/方法说明"""

# 单行注释说明关键逻辑
```

#### TypeScript / JavaScript (JSDoc)

```typescript
/**
 * 类/方法说明
 * @param name 参数说明
 * @returns 返回值说明
 */
```

#### Go

```go
// MethodName 类/方法说明
// 参数说明
func (r *Receiver) MethodName(param Type) ReturnType {
```

### 5. Apply Changes

Use Edit tool to add comments without modifying code logic.

---

## Comment Priority

| Priority | Element | Example |
|----------|---------|---------|
| High | Public methods/functions | Public API |
| High | Complex logic | Nested conditions, algorithms |
| High | Build methods (Dart) | `Widget build(BuildContext context)` |
| Medium | Class members | Instance variables |
| Medium | Private methods | Internal helpers |
| Medium | Lifecycle methods | `initState()`, `onCreate()` |
| Low | Self-explanatory code | Simple assignments |

---

## Notes

1. **Do not modify code logic** - Only add comments
2. **Chinese comments** - All comments in Chinese
3. **Concise but comprehensive** - Balance brevity with completeness
4. **Preserve formatting** - Maintain original code style
5. **No redundant comments** - Don't state the obvious
6. **Auto-detect language** - Apply appropriate comment style based on file extension
