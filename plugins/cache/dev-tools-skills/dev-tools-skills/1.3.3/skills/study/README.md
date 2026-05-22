# dt:study

把已确认并修复的 skill 问题回写到工作区源 skill，沉淀为短规则与可复用流程，不直接修改缓存。

---

## 功能

- 回写工作区源 skill，优先直接修改当前工作区中的源 SKILL 文件
- 拒绝缓存与绝对路径，不依赖 `~/.claude` 副本或本机固定目录
- 单次只处理一个根因，保持规则短、明确、可执行
- 当 skill 的对外说明发生变化时，按需同步对应 README

## 用法

- `/dt:study`
- `/study update-docs-flutter`
- `把这次已确认并修复的问题整理回对应 source skill，规则写短一点`

---

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，修改 SKILL.md 后运行 `/dt:update-remote-plugins`。
