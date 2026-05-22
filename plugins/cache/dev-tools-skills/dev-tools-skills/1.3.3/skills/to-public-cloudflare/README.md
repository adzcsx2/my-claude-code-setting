# dt:to-public-cloudflare

将当前项目的本地服务通过 **Cloudflare Named Tunnel** 一键暴露到公网，绑定自定义域名。安装时自动部署全局 tunnel 管理脚本。

## 使用方式

```bash
# AI 辅助创建 tunnel（在项目目录下运行）
/dt:to-public-cloudflare

# 重置配置重新走流程
/dt:to-public-cloudflare --force-reset
```

创建完成后，使用全局命令管理隧道：

```bash
# 启动所有隧道（含健康监测）
tunnel-start

# 启动指定隧道
tunnel-start web build

# 查看隧道状态
tunnel-list

# 添加新隧道（交互式）
tunnel-add

# 删除隧道
tunnel-remove myapp

# 停止所有隧道
tunnel-stop
```

## 注意事项

| # | 规则 | 说明 |
|---|------|------|
| 1 | DNS 路由必须用 UUID | `cloudflared tunnel route dns` 使用 tunnel UUID 而非 name，避免名称类似导致路由到错误隧道 |
| 2 | 必须加 `-f` 标志 | 始终使用 `--overwrite-dns` 避免"record already exists"错误 |
| 3 | 禁止换子域名规避 | DNS 路由出问题时修复现有记录，不要新建替代子域名 |
| 4 | 等待 DNS 传播 | 新 DNS 记录全球传播需 1-5 分钟，提示用户耐心等待 |

## 功能特性

- 自动检测并安装 cloudflared（支持 macOS/Linux/Windows）
- 引导 Cloudflare 账号登录与 zone 授权
- 全局注册表（`~/.cloudflared/tunnel-registry.json`），统一管理所有隧道
- 自动侦察项目启动命令与端口（支持 Node.js/Python/Go/Spring Boot/Docker 等）
- 通过 `cloudflared tunnel route dns` 自动创建 DNS CNAME，无需登录 Dashboard 手动配置
- 冲突检测：子域名重复提示更新端口，端口重复允许并提示
- 安装 skill 时自动部署管理脚本到 `~/bin/`（支持 .ps1 + .sh）
- **主动健康监测**：通过 HTTP 请求检测公网 URL 可达性，发现僵尸进程
  - 连续 3 次检测失败才触发重启，防止网络抖动误判
  - 重启后 120 秒冷却期，防止频繁重启
  - 退避机制：连续重启后检测间隔逐渐增大（最大 300 秒）
  - 本地服务未启动时跳过隧道重启
- Windows 下禁止使用 `start` 命令启动 cloudflared，一律用 PowerShell `Start-Process`

## 前置要求

| 条件                    | 说明                                    |
| ----------------------- | --------------------------------------- |
| Cloudflare 账号         | 免费账号即可                            |
| 域名已托管到 Cloudflare | https://dash.cloudflare.com/ → 添加站点 |
| 本地有可运行的服务      | 任意语言/框架                           |

## 安装的脚本

安装 skill 后，以下脚本会自动部署到 `~/bin/`：

| 脚本 | 功能 |
|------|------|
| `tunnel-add.ps1` / `.sh` | 交互式添加或更新 tunnel |
| `tunnel-start.ps1` / `.sh` | 启动指定或全部 tunnel + 健康监测 |
| `tunnel-stop.ps1` / `.sh` | 停止所有 tunnel + 健康监测 |
| `tunnel-remove.ps1` / `.sh` | 删除 tunnel（可选从 Cloudflare 端删除） |
| `tunnel-list.ps1` / `.sh` | 列出所有 tunnel 及运行状态、健康状态 |
| `tunnel-healthcheck.ps1` / `.sh` | 后台健康监测（被 tunnel-start 自动启动） |

## 示例输出

```
  ========================================
  Tunnel added!
  ========================================
  Hostname: https://myapp.long123456789.xyz
  Local:    http://localhost:3000
  Start:    tunnel-start myapp
```

## 重试机制

| 操作                     | 策略                           |
| ------------------------ | ------------------------------ |
| cloudflared 安装验证     | 3 次，指数退避                 |
| tunnel 创建 / DNS 路由   | 3 次，指数退避                 |
| 健康监测（HTTP 公网检测） | 每 60s 检测，3 次失败重启，退避到最大 300s |
| 冷却期（防止频繁重启）   | 重启后 120s 不检测             |
| 本地服务启动等待         | 最多 30s                       |
