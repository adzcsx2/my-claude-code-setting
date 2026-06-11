---
name: "dt:work-report"
description: "Generate non-technical Chinese daily work report from git log and uncommitted changes. Defaults to today; supports natural-language date args."
argument-hint: "[日期范围] e.g. /dt:work-report 昨天 | /dt:work-report 最近3天"
---

> **中文环境要求**
>
> 本技能运行在中文环境下，请遵循以下约定：
> - 面向用户的回复、输出日报必须使用中文
> - AI 内部处理过程可以使用英文
> - 所有生成的文件必须使用 UTF-8 编码
>
> ---

# work-report Skill

基于 `git log` 提交记录和当前未提交改动，自动生成一份"老板能看懂"的中文工作日报。每条 ≤ 30 字、功能性描述、按改动数量动态决定条数。

## When to Use

- 每天提交日报前，快速汇总当日代码改动
- 周报、月报回顾若干天内的工作
- 想把 commit 信息翻译成业务/产品视角的描述
- 检查自己今天到底改了哪些东西

## Example Prompts

- `/dt:work-report` — 默认今天
- `/dt:work-report 昨天`
- `/dt:work-report 最近3天`
- `/dt:work-report 2026-05-18`
- `/dt:work-report 2026-05-15..2026-05-19`
- `/dt:work-report all 今天` — 不按 author 过滤
- `帮我生成今天的工作日报`
- `把昨天的代码改动总结成日报`

---

## Command Parameters

| Parameter | Description |
|-----------|-------------|
| `日期范围` | 可选。支持：`今天`(默认) / `昨天` / `最近N天` / `YYYY-MM-DD` / `YYYY-MM-DD..YYYY-MM-DD` |
| `all` | 可选。前置 `all` 表示不按当前 git user.email 过滤作者 |

---

## Execution Flow

### 1. 解析时间范围

无参数 → 今天 (00:00 ~ now)。否则按下表映射：

| 输入 | --since | --until |
|-----|---------|---------|
| `今天` / 无参数 | 今天 00:00 | now |
| `昨天` | 昨天 00:00 | 昨天 23:59 |
| `最近N天` / `last N days` | N days ago | now |
| `YYYY-MM-DD` | 该日 00:00 | 该日 23:59 |
| `YYYY-MM-DD..YYYY-MM-DD` | 起始日 00:00 | 结束日 23:59 |

**执行前先回显解析后的窗口**，例如：

```
解析时间范围：2026-05-20 00:00 ~ 2026-05-20 23:59
作者过滤：hoyn@example.com（如需全部作者请加 all）
```

### 2. 收集 git 数据

按需依次执行（默认按 `git config user.email` 过滤，参数含 `all` 则去掉 `--author`）：

```bash
# 2.1 commit 列表
git log --since="<start>" --until="<end>" \
  --author="$(git config user.email)" \
  --pretty=format:"%h | %ad | %s" --date=short

# 2.2 文件变化统计
git log --since="<start>" --until="<end>" \
  --author="$(git config user.email)" --stat

# 2.3 关键 commit 详情（仅在 subject 不足以判断功能时）
git show --stat <hash>

# 2.4 未提交改动（仅当日期范围包含今天时纳入）
git status --short
git diff --stat
# 必要时再 git diff <file>
```

### 3. 合并 + 去技术化

- 同一功能多次 commit → 合并为一条
- 纯 `chore:` / `docs:` / 依赖升级 → 合并为「日常维护」一条；若没有功能改动可省略
- 未提交改动归入「进行中」或合并到对应已完成项

### 4. 措辞规则（强约束）

| 规则 | 示例 |
|------|------|
| ≤ 30 字（中文按字符算） | 超长必须裁剪 |
| 用功能 / 用户视角 | ✅「新增日报导出功能」<br>❌「重构 ReportController」 |
| 禁用术语 | `refactor` / `Controller` / `Service` / `Provider` / `DAO` / `Interface` / 框架/包名 |
| 动词开头 | 新增 / 修复 / 优化 / 完善 / 调整 / 适配 |
| 中文标点正确 | 使用中文逗号、句号 |

### 5. 生成日报

按下方模板输出，条数随改动数量决定（不固定 5 条）。

### 6. 列出可优化项

基于本次扫到的代码 / 流程，提出 2~5 条建议，类别可包括：
- 代码层面（重复逻辑、过大文件、缺测试、未处理错误）
- 流程层面（commit 粒度、commit message 规范、未提交堆积）
- 文档层面（缺规范、缺 README、docs 与代码不一致）

---

## Output Template

```
# 工作日报 · YYYY-MM-DD（或区间）

## 今日完成
1. <功能性描述，≤30字>
2. <功能性描述，≤30字>
3. ...

## 进行中（如有未提交改动）
- <功能性描述，≤30字>

## 后续可优化
- <建议 1>
- <建议 2>
- ...

---
统计：N 次提交 / M 个文件改动 / 作者 <email>
```

---

## Notes

1. **不修改任何源代码**，纯生成报告
2. **日期解析后必须先回显**，让用户校对
3. **没有改动时**：输出「今日暂无代码提交」并提示是否查更早日期
4. **多仓库场景**：仅分析当前 cwd 下的仓库
5. **私密信息保护**：commit 中的 token / 密钥 / 内部域名不进日报
6. **优化项要可执行**，避免「建议加强代码质量」这类空话
