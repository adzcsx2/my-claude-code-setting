# Generic Reference

未识别语言的通用 update-docs 模板。当项目不属于 Android 或 Flutter 时使用。

---

## Project Detection

当 Android 和 Flutter 检测都未命中时，进入通用模式。

通用模式需要做以下推断：

1. **识别语言和框架**：通过项目文件推断技术栈
   - `package.json` → Node.js / TypeScript / JavaScript
   - `go.mod` → Go
   - `Cargo.toml` → Rust
   - `requirements.txt` / `pyproject.toml` / `setup.py` → Python
   - `*.sln` / `*.csproj` → C# / .NET
   - `Gemfile` → Ruby
   - `composer.json` → PHP
   - 其他 → 根据主要源文件扩展名推断

2. **推断项目结构**：扫描项目目录确定
   - 源码目录（如 `src/`、`lib/`、`app/`、`pkg/`）
   - 测试目录
   - 配置文件位置
   - 入口文件

3. **推断文档结构**：基于以上信息生成文档映射

---

## Command Parameters

| Parameter   | Description                        |
| ----------- | ---------------------------------- |
| No args     | Incremental update of all docs     |
| `--force`   | Force regenerate all docs          |
| `--dry-run` | Analyze only, don't generate files |

---

## File to Document Mapping (推断规则)

通用模式通过以下步骤建立文件到文档的映射：

### Step 1: 扫描源码目录

```
扫描候选目录: src/, lib/, app/, pkg/, internal/, cmd/, packages/
识别主要源码目录
```

### Step 2: 建立分类

| 文件分类   | 推断规则                                       | 目标文档         |
| ---------- | ---------------------------------------------- | ---------------- |
| UI / 界面  | 包含 component、view、page、screen 的文件      | INTERFACES.md    |
| 路由 / 导航 | 包含 route、router、navigation 的文件          | NAVIGATION.md    |
| API 接口   | 包含 api、controller、handler、endpoint 的文件 | API.md           |
| 数据 / 模型 | 包含 model、entity、schema、type 的文件        | ARCHITECTURE.md  |
| 配置       | 项目配置文件、环境变量文件                     | DEPENDENCIES.md  |
| 状态管理   | 包含 store、state、reducer、action 的文件      | ARCHITECTURE.md  |
| 测试       | 测试目录中的文件                               | 不单独生成文档   |

### Step 3: 确定文档列表

基于推断结果，生成以下文档（按需）：

| Document            | Location          | Content                              |
| ------------------- | ----------------- | ------------------------------------ |
| PROJECT_OVERVIEW.md | docs/guide/       | 项目概览（名称、版本、技术栈、结构） |
| ARCHITECTURE.md     | docs/modules/     | 架构文档（模块关系、分层、数据流）   |
| INTERFACES.md       | docs/modules/     | 界面 / API 文档（如适用）            |
| NAVIGATION.md       | docs/modules/     | 路由 / 导航文档（如适用）            |
| DEPENDENCIES.md     | docs/references/  | 依赖文档                             |
| API.md              | docs/references/  | API 接口文档（如适用）               |
| CHANGELOG.md        | docs/reports/     | 更新列表                             |
| update-list/*.md    | docs/update-list/ | 每次更新的详细内容                   |

**自适应规则：**

- 如果项目没有 UI 层（如 CLI 工具、后端服务），不生成 INTERFACES.md 和 NAVIGATION.md
- 如果项目是库/SDK，增加 API.md 的详细程度
- 如果项目是微服务架构，为每个服务生成独立文档
- 始终生成 PROJECT_OVERVIEW.md、DEPENDENCIES.md、CHANGELOG.md

---

## Analyze Project

### Analyze Project Config

根据检测到的语言，读取对应配置文件：

| 语言       | 配置文件                                         | 提取内容                                      |
| ---------- | ------------------------------------------------ | --------------------------------------------- |
| Node.js    | `package.json`                                   | name, version, dependencies, scripts          |
| Go         | `go.mod`                                         | module, go version, require                   |
| Rust       | `Cargo.toml`                                     | name, version, dependencies                   |
| Python     | `pyproject.toml` / `requirements.txt`            | name, version, dependencies                   |
| C# / .NET  | `*.csproj`                                       | ProjectReference, PackageReference            |
| Ruby       | `Gemfile`                                        | gems                                          |
| PHP        | `composer.json`                                  | name, version, require                        |

### Analyze Source Structure

Use Glob to find source files based on detected language:

| 语言    | Glob 模式                                |
| ------- | ---------------------------------------- |
| Go      | `**/*.go`                                |
| Rust    | `src/**/*.rs`                            |
| Python  | `**/*.py`                                |
| Node.js | `src/**/*.ts`, `src/**/*.js`             |
| C#      | `**/*.cs`                                |

### Analyze Entry Points

根据语言检测入口：

| 语言    | 入口模式                                       |
| ------- | ---------------------------------------------- |
| Go      | `func main()` in `main.go` or `cmd/*/main.go`  |
| Rust    | `fn main()` in `src/main.rs`                   |
| Python  | `if __name__ == "__main__":` in `*.py`         |
| Node.js | `"main"` in `package.json` or `index.ts`       |

### Analyze API Endpoints

根据框架检测 API 接口：

| 框架        | 检测模式                                          |
| ----------- | ------------------------------------------------- |
| Express     | `app.get(`, `app.post(`, `router.get(`            |
| FastAPI     | `@app.get(`, `@app.post(`, `@router.get(`         |
| Gin         | `r.GET(`, `r.POST(`, `group.GET(`                 |
| Actix       | `#[get("`, `#[post("`                             |
| Axum        | `.route("` with `get(`, `post(`                   |

---

## Metadata projectType

```json
{
  "projectType": "generic"
}
```

---

## Notes

- 通用模式生成的文档可能不如平台特有模式精确
- 如果通用模式检测结果不准确，用户可以通过参数指定项目类型
- 通用模式的核心价值在于保持一致的文档结构（guide/modules/references/reports/update-list）和更新流程
