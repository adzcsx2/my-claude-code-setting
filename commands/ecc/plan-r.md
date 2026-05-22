---
description: Plan first (user confirms), execute, then auto code review
---

# Plan-R: Plan + Code Review Pipeline

**🚨 关键约束**：本命令是三阶段强制管道。所有三个 Phase 都必须通过相应工具真实执行。绝不允许：
- 跳过 Phase 2 或 Phase 3
- 在主对话中直接编写代码（Phase 2 必须由主 Agent 本地执行，不通过子代理，但仍需严格按计划书执行）
- 用口头声明代替实际的 Agent tool 调用（Phase 3 审查必须通过 code-reviewer agent）
- Phase 3 未真正执行就输出总结

任何违反上述约束的执行都视为**命令失败**，必须回头重做。

---

## Plan-R 执行流程

任务: $ARGUMENTS

### === Phase 1 START: Planning ===

通过 Skill tool 调用 `/ecc:plan`：

```
Skill tool with skill: "ecc:plan", args: $ARGUMENTS
```

`ecc:plan` 技能会：
1. 重述需求
2. 识别风险
3. 生成分步计划
4. **等待用户确认**

**硬检查**: 用户确认文本必须包含以下任一关键词才能继续：
- "yes" / "确认" / "proceed" / "go ahead" / "可以" / "好的" / "同意"

如果未检测到确认，停止并要求用户明确说"确认"。

---

### === Phase 2 START: Execution ===

**前置验证（必须完成）**:
- [ ] Phase 1 用户确认已收到？
- [ ] 确认文本包含以上任一关键词？
- 如任一项为否，停止并返回 Phase 1 等待正确确认

**执行操作**：

在主 Agent 上下文中按计划书逐步执行所有实现任务。不跳过任何计划项，不做未在计划中的额外工作。

- 执行所有计划的 Phase
- 按顺序实现每一步
- 记录实现过程中遇到的任何问题
- 完成后输出"Phase 2 完成"标记

**Phase 2 完成标记**：
- ✅ 所有计划项都已实现
- ✅ git status 显示已修改的文件列表
- ✅ 本地验证通过（如有集成测试）

---

### === Phase 3 START: Code Review ===

**前置验证（必须完成）**:
- [ ] Phase 2 是否真的执行过？
- [ ] 是否有变经过的源文件（通过 git diff 可以看到）？
- 如任一项为否，停止并回到 Phase 2 重做

**执行操作**：

通过 Agent tool 调用 `code-reviewer` 子代理，审计所有变更：

```
Agent tool with subagent_type: "code-reviewer"
prompt: "审核 git diff HEAD 中的所有变更文件。检查安全性（CRITICAL）、结构（HIGH）、模式（MEDIUM）、风格（LOW）。自动修复所有 CRITICAL 问题。"
```

**代码审查覆盖范围**：
1. 运行 `git diff --name-only HEAD` 识别已修改文件
2. 逐文件审查：
   - **CRITICAL**: 安全漏洞、硬编码密钥、注入风险
   - **HIGH**: 大函数 (>50行)、深重嵌套 (>4层)、缺失错误处理
   - **MEDIUM**: 变异模式、缺失测试、复杂度问题
   - **LOW**: 命名不一致、格式问题
3. 输出结构化审查报告（含严重级别 + 文件:行号）
4. **自动修复**所有 CRITICAL 问题
5. HIGH 问题如果直接可修复则修复，否则标记

**Phase 3 完成标记**：code-reviewer agent 返回后，必须看到：
- ✅ 审查报告完成
- ✅ CRITICAL 问题已全部自动修复
- ✅ HIGH/MEDIUM/LOW 问题已分类

---

## 收尾自检报告（强制输出）

在完全结束前，输出如下表格验证三个 Phase 都被正确执行：

| Phase | 状态 | 证据 |
|-------|------|------|
| **Phase 1: Plan** | ✅/❌ | 用户确认原文 + 任务计划内容 |
| **Phase 2: Execution** | ✅/❌ | 修改的源文件列表 + 实现的功能说明 |
| **Phase 3: Review** | ✅/❌ | code-reviewer agent 调用 ID + CRITICAL 问题修复数 + 其他问题分类 |

**验收标准**：
- 表格中任何一项为 ❌，命令视为**失败**
- 所有项都必须为 ✅，才能输出最终总结
- 如有 ❌，补做相应 Phase 直到为 ✅

---

## 最终总结（仅在所有 Phase ✅ 后输出）

汇总：
- 实现了什么功能 / 解决了什么问题
- 修改的文件列表 + 主要改动说明
- 代码审查发现的问题 + 已修复项目数
- 是否有遗留的 HIGH/MEDIUM 问题需关注
