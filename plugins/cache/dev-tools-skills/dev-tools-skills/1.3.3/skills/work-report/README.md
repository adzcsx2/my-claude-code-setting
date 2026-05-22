# dt:work-report

基于 `git log` 提交记录和当前未提交改动，自动生成"老板能看懂"的中文工作日报。每条 ≤ 30 字、功能性描述、按改动数量动态决定条数。

---

## 功能

- 把 commit 翻译成产品/业务视角的描述
- 默认汇总今天的代码改动，支持自然语言日期参数
- 自动合并同功能多个 commit，过滤纯维护类提交
- 同时给出 2~5 条可执行的优化建议

## 用法

- `/dt:work-report` — 默认今天
- `/dt:work-report 昨天`
- `/dt:work-report 最近3天`
- `/dt:work-report 2026-05-18`
- `/dt:work-report 2026-05-15..2026-05-19`
- `/dt:work-report all 今天` — 不按 author 过滤
- `帮我生成今天的工作日报`

---

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，修改 SKILL.md 后运行 `/dt:update-remote-plugins`。
