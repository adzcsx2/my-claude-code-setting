---
name: dt:update-remote-plugins
description: "Update the dev-tools-skills remote source of truth: audit changed skills, refresh generated README files and marketplace metadata, verify install scripts can refresh local Claude cache correctly, then commit and push."
origin: dev-tools-skills
---

> 中文环境要求
>
> - 面向用户的回复、注释、提示信息必须使用中文
> - 所有生成或更新的文档必须使用 UTF-8 编码

# Update Remote Plugins

用于维护 dev-tools-skills 单插件仓库的发布闭环：更新 skill 内容、同步文档与配置、验证安装脚本、提交并推送到远程，然后通过 install 脚本把最新版本同步回本地 Claude。

## Trigger

```text
/dt:update-remote-plugins
```

## When to Use

- 修改了任意 skill 的 SKILL.md、README.md 或参考资料
- 新增、删除、重命名 skill
- 更新 .claude-plugin/plugin.json 或 marketplace.json
- 需要确保 install.sh 和 install.ps1 仍然能把最新远程版本正确同步到本地 Claude

## Core Principle

远程仓库是唯一事实源。

- 配置、文档、注册信息先在仓库内更新并提交到远程
- 本地 Claude 缓存不手动直接修补
- 本地刷新必须通过 install.sh 或 install.ps1 完成
- install 前必须先清理旧缓存、旧注册和旧 marketplace 目录，避免继续命中历史版本

## Required Workflow

### 1. Pull Latest

开始前先同步远程，避免基于过期状态发版：

```bash
git fetch origin
git pull --rebase
```

### 2. Audit Changed Skills

识别本次变更涉及的 skill：

```bash
git diff --name-only HEAD -- skills/
```

至少检查这些内容：

- SKILL.md 的触发词、描述、工作流是否仍与仓库事实一致
- README.md 是否仍能代表该 skill 的真实用途
- 引用 `/dt:update-remote-plugins`、安装命令、版本号的文案是否需要同步

### 3. Refresh Generated Docs

README.md 必须与各自 SKILL.md 保持一致。

对发生变化的 skill：

- 更新技能标题
- 更新一句话描述
- 更新功能列表
- 更新用法示例
- 更新“文档由 SKILL.md 生成”的尾注

如果 skill 被新增、删除或重命名，还要同步更新：

- 根目录 README.md
- 根目录 README_EN.md
- .claude-plugin/marketplace.json
- .claude-plugin/plugin.json（如有技能列表或版本变化）

### 4. Update Marketplace Metadata

必须保证下面两个文件一致：

- .claude-plugin/plugin.json
- .claude-plugin/marketplace.json

强制要求：

- version 使用 semver
- plugin.json 必须保留 `skills: ["./skills/"]`
- marketplace.json 中 plugins[0].version 必须与 plugin.json.version 一致
- marketplace.json 中 skill 列表必须与仓库中的实际 skill 目录一致

### 5. Validate Install Scripts Before Push

这是本 skill 的关键步骤，不能跳过。

必须验证 install.sh 和 install.ps1 的安装策略满足以下条件：

- 版本号从当前仓库 .claude-plugin/plugin.json 读取，不能写死旧版本
- 安装前会清理旧缓存
- 安装前会清理旧 installed_plugins 注册
- 安装前会清理旧 known_marketplaces 注册
- 安装前会清理旧 marketplace 目录，确保重新拉取或重新复制最新内容
- 所有创建、删除、写入路径都以 `~/.claude` 或 `CLAUDE_DIR` 为根
- 路径不存在时先创建
- 路径不存在时卸载逻辑不会报错
- 本地缓存路径最终指向当前最新版本目录

如果脚本不满足以上条件，必须先修脚本，再继续后续步骤。

### 6. Commit And Push

完成配置、文档和脚本更新后：

```bash
git add skills/ .claude-plugin/ README.md README_EN.md install.sh install.ps1 uninstall.sh uninstall.ps1
git commit -m "feat: 更新远程插件同步流程"
git push
```

如果 push 被拒绝，先 rebase 再继续。

### 7. Refresh Local Via Install (强制执行)

**这是必须执行的最后一步，不得跳过。**

推送远程后，本地只通过安装脚本刷新。install 脚本已内置自动检测逻辑，会根据当前环境中的 Claude Code 和 VS Code Copilot 安装状态自动选择安装目标。

macOS / Linux:

```bash
./install.sh --all
```

Windows PowerShell:

```powershell
.\install.ps1 -All
```

安装脚本会自动：
- 检测 `~/.claude/` 是否存在 → 安装 Claude Code skills
- 检测 VS Code prompts 目录是否存在 → 安装 Copilot prompts
- 都有则都安装，都没有则跳过

**执行要求**：
- 必须在 push 成功后立即执行 install 脚本
- 不得以"用户可以手动执行"为由跳过此步骤
- 必须在输出中确认缓存已刷新到最新版本

## Acceptance Criteria

只有同时满足下面条件，才算完成：

1. 受影响 skill 的 SKILL.md 与 README.md 已同步
2. README.md、README_EN.md、plugin.json、marketplace.json 已同步
3. install.sh 与 install.ps1 不再依赖写死版本
4. install 会先清理旧缓存和旧注册，再安装最新版本
5. uninstall 在目标不存在时也能安全退出
6. 所有路径都落在 Claude 根目录下
7. 远程已提交并推送
8. **本地缓存已通过 install 脚本强制刷新到最新版本**
9. 在输出中确认缓存刷新完成

## Troubleshooting

### 安装后仍加载旧 skill

根因通常是以下之一：

- install 脚本写死了旧版本号
- installed_plugins.json 仍指向旧版本目录
- cache 下仍保留旧版本目录且未清理
- marketplace 目录未刷新，仍是旧内容

处理方式：

```bash
./uninstall.sh
./install.sh --all
```

### plugin 不生效

重点检查：

- ~/.claude/settings.json
- ~/.claude/plugins/known_marketplaces.json
- ~/.claude/plugins/installed_plugins.json
- ~/.claude/plugins/cache/dev-tools-skills/
- ~/.claude/plugins/marketplaces/dev-tools-skills/

## Notes

1. 不要把本地缓存当事实源
2. 不要直接手动修补 ~/.claude/plugins/cache 中的 skill 内容
3. 必须先修仓库，再通过 install 回流本地
4. README.md 由 SKILL.md 驱动，二者必须保持一致