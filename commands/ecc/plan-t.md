---
description: Plan first (user confirms), then auto-execute with strict TDD
---

# Plan-T: Plan + TDD Auto-Execution

**🚨 关键约束**：本命令是两阶段强制管道。Phase 2 必须通过 Agent tool 真实调用 `tdd-guide` 子代理执行。绝不允许：
- 在主对话中直接编写代码
- 跳过 TDD 的 RED 阶段（测试必须先写）
- 用口头声明代替实际 Agent tool 调用
- Phase 2 未真正执行就输出总结

任何违反上述约束的执行都视为**命令失败**，必须回头重做。

---

## Plan-T 执行流程

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

### === Phase 2 START: TDD Execution ===

**前置验证（必须完成）**:
- [ ] Phase 1 用户确认已收到？
- [ ] 确认文本包含以上任一关键词？
- 如任一项为否，停止并返回 Phase 1 等待正确确认

**三无原则**（Phase 2 开始前）:
- 禁止在主对话中直接编写任何源代码
- 禁止做任何直接代码修改决定
- 禁止跳过测试而直接进入实现

**执行操作**：

通过 Agent tool 调用 `tdd-guide` 子代理，让其按计划执行：

```
Agent tool with subagent_type: "tdd-guide"
prompt: "按照以下计划执行严格 TDD: [复制 Phase 1 最终计划]. 必须遵守 RED→GREEN→IMPROVE→REPEAT 循环。80% 最小覆盖率。"
```

**TDD 强制流程**（由 tdd-guide agent 执行）：

1. **RED**: 为每个计划项写**失败测试** FIRST
2. **GREEN**: 写最小代码使测试通过
3. **IMPROVE**: 重构并保持测试绿灯
4. **REPEAT**: 循环处理所有计划项

**覆盖率要求**：
- 通用代码：≥80%
- 安全关键 / 金融逻辑：100%

**Phase 2 完成标记**：tdd-guide agent 返回后，必须看到：
- ✅ 所有测试通过（字符串 "passed" 或数字表示成功）
- ✅ 覆盖率指标 ≥ 80%
- ✅ git log 显示测试文件先提交

---

## 收尾自检报告（强制输出）

在完全结束前，输出如下表格验证两个 Phase 都被正确执行：

| Phase | 状态 | 证据 |
|-------|------|------|
| **Phase 1: Plan** | ✅/❌ | 用户确认原文 + 任务计划内容 |
| **Phase 2: TDD** | ✅/❌ | tdd-guide agent 调用 ID + 最终测试通过数 + 覆盖率 % |

**验收标准**：
- 表格中任何一项为 ❌，命令视为**失败**
- 所有项都必须为 ✅，才能输出最终总结
- 如有 ❌，补做相应 Phase 直到为 ✅

---

## 最终总结（仅在所有 Phase ✅ 后输出）

汇总：
- 实现了什么功能 / 解决了什么问题
- 最终测试结果（通过数 / 总数）+ 覆盖率 %
