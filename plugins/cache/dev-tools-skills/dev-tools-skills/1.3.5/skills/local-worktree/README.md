# dt:local-worktree

针对一个已 clone 的原仓库创建隔离的本地开发 worktree：把原仓库路径作为参数传入，在其**同级目录**生成独立 `local` 分支 worktree（`remote-<x>`→`local-<x>`，否则 `local-<repo>`），在里面执行 `dt:init` 并审计重写 README，保证所有初始化产物（CLAUDE.md、.ai/、.claude/、/docs）不污染原分支、不会被 push，合并业务代码时只带走真实源码白名单。

---

## 功能

- 刚 clone 原始仓库，想用 AI 全面初始化但不污染任何远程分支
- 需要一个「AI 沙盒分支」：在里面跑 `dt:init`、审计、重写 README、加规则
- 团队仓库不允许提交 `CLAUDE.md` / `.ai/` / `.claude/` 等 AI 上下文文件
- 本地随便改配置（如 `@Value` / 端口 / mock），合并回去时只带业务代码
- 需要可重复执行的「只同步源码白名单」合并脚本

## 用法

- `/dt:local-worktree /Users/hoyn/Documents/小园长/bim-cloud-manage/remote-bim-cloud-manage` - 在 `bim-cloud-manage/` 下生成 `local-bim-cloud-manage` worktree 并完成全部初始化
- `/dt:local-worktree /path/to/remote-myproj --branch local` - 指定分支名
- `/dt:local-worktree /path/to/remote-myproj --worktree-dir /tmp/sandbox` - 显式指定 worktree 目录
- `/dt:local-worktree /path/to/remote-myproj --dry-run` - 仅预览推断结果与白名单，不落盘

## 行为说明

- 第一个参数是原仓库路径；worktree 默认创建在原仓库**同级目录**，命名 `remote-<x>`→`local-<x>`，否则 `local-<repo>`
- **Stale worktree 自动恢复**：如果之前的 local worktree 目录被手动删除（如 `rm -rf`），重新执行时会自动执行 `git worktree prune` 清理失效的 git 注册记录，然后正常重建 worktree，无需任何手动干预
- 用 `git -C <repo> worktree add -b local` 创建独立分支与工作目录，初始化产物只活在 local 分支
- 在 worktree 内调用 `dt:init` 生成 CLAUDE.md / AGENT.md / Copilot 配置 / .ai/skills / docs，并审计重写 README
- 在 CLAUDE.md 写死 push-ban 铁律，并生成 Claude PreToolUse hook（`prevent-push.sh`）拦截一切 `git push`
- 合并回主分支用跨目录白名单 checkout 脚本（`merge-from-local.sh`），从 worktree 目录把白名单文件直接同步到原始仓库目录，无需切换分支，显式排除 CLAUDE.md / .ai/ / .claude/ / .codegraph/ / docs / README 等初始化产物
- 业务白名单由审计项目后自动推断（源码模块 + 构建文件 + 运行资源），并向用户确认
- 全程不 push；初始化产物靠合并白名单排除，而非 .gitignore，因此 worktree 切换不丢上下文

---

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，修改 SKILL.md 后运行 `/dt:update-remote-plugins`。
