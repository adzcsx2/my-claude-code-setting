---
name: dt:to-public-cloudflare
description: "Cloudflare Named Tunnel one-click setup: install cloudflared, login, configure tunnel with custom domain, auto-detect project port, push DNS route, write to global tunnel registry, and deploy management scripts (tunnel-add/start/stop/remove/list)."
argument-hint: "[--force-reset] e.g. /dt:to-public-cloudflare or /dt:to-public-cloudflare --force-reset"
---

> **中文环境要求**
>
> 本技能运行在中文环境下：
>
> - 面向用户的回复、注释、提示信息必须使用中文
> - AI 内部处理过程可以使用英文
> - 所有生成的文件必须使用 UTF-8 编码（无 BOM）
>
> ---

# to-public-cloudflare Skill

将当前项目的本地服务通过 **Cloudflare Named Tunnel** 一键暴露到公网，绑定自定义域名，生成可复用的启动脚本。

---

## 三条铁律（执行前必读）

| # | 规则 | 违反后果 |
|---|------|---------|
| 1 | **DNS 路由必须用 TUNNEL_UUID，禁用 TUNNEL_NAME** | 名称相似导致 DNS 指向错误 tunnel，公网 URL 不可用 |
| 2 | **`cloudflared tunnel route dns` 必须加 `-f`** | DNS 记录已存在时报错 1003，流程卡死 |
| 3 | **DNS 路由出问题时修复而非换子域名** | 产生孤儿 DNS 记录，域名混乱，增加清理成本 |

---

**核心命令**：`/dt:to-public-cloudflare`

参数说明：

- 无参数：按上次配置（全局注册表）自动续用，跳过已完成的步骤
- `--force-reset`：强制重新走全部配置流程（忽略缓存）

---

## 全局注册表

所有 tunnel 配置持久化到 `~/.cloudflared/tunnel-registry.json`，格式：

```json
{
  "domain": "long123456789.xyz",
  "tunnels": [
    {
      "name": "web",
      "tunnel_id": "<uuid>",
      "subdomain": "web",
      "hostname": "web.long123456789.xyz",
      "port": 4000,
      "config_file": "config-web.yml"
    }
  ]
}
```

每次执行时：

1. 读取注册表，识别当前项目目录匹配的条目（通过端口与项目服务端口对比）
2. 有匹配条目：提示"检测到已配置 tunnel：web.long123456789.xyz → 端口 4000，是否继续？"
   - y → 跳到 Step 8（更新注册表 + 提示启动命令）
   - n → 重新配置
3. 无匹配：走完整流程

安装 skill 时，`install.sh` / `install.ps1` 会自动将 tunnel 管理脚本部署到 `~/bin/`：

| 脚本 | 功能 |
|------|------|
| `tunnel-add` | 交互式添加或更新 tunnel |
| `tunnel-start [name...]` | 启动指定或全部 tunnel + 健康监测 |
| `tunnel-stop` | 停止所有 tunnel + 健康监测 |
| `tunnel-remove [name]` | 删除 tunnel |
| `tunnel-list` | 列出所有 tunnel 及状态 |

---

## 重试工具函数（贯穿全流程）

在执行网络相关命令时，统一使用以下重试逻辑：

```bash
# retry_cmd <max_attempts> <sleep_seconds> <cmd...>
retry_cmd() {
  local max=$1 sleep_sec=$2; shift 2
  local attempt=1
  while [ $attempt -le $max ]; do
    if "$@"; then return 0; fi
    echo "[重试 $attempt/$max] 命令失败，${sleep_sec}s 后重试：$*"
    sleep "$sleep_sec"
    attempt=$((attempt + 1))
    sleep_sec=$((sleep_sec * 2))  # 指数退避
  done
  echo "[错误] 重试 $max 次仍失败：$*"
  return 1
}
```

PowerShell 等效：

```powershell
function Invoke-WithRetry {
  param([int]$MaxAttempts=3, [int]$InitialSleep=2, [scriptblock]$ScriptBlock)
  $attempt = 1; $sleep = $InitialSleep
  while ($attempt -le $MaxAttempts) {
    try { & $ScriptBlock; return } catch {
      Write-Warn "[重试 $attempt/$MaxAttempts] 失败：$_，${sleep}s 后重试"
      Start-Sleep -Seconds $sleep; $attempt++; $sleep *= 2
    }
  }
  throw "[错误] 重试 $MaxAttempts 次仍失败"
}
```

---

## Step 1：检测并安装 cloudflared

```bash
command -v cloudflared
```

**未安装时按平台处理**：

| 平台        | 命令                                            | 备用                                                                                                                  |
| ----------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| macOS       | `brew install cloudflared`                      | 若无 brew → 提示安装 brew: https://brew.sh，然后重试                                                                  |
| Linux (apt) | `sudo apt-get install -y cloudflared`           | 若 apt 无此包，先添加 repo：https://pkg.cloudflare.com/index.html                                                     |
| Linux (dnf) | `sudo dnf install -y cloudflared`               | 同上                                                                                                                  |
| Windows     | `winget install --id Cloudflare.cloudflared -e` | 若无 winget，用 `choco install cloudflared`；都没有则提示手动下载：https://github.com/cloudflare/cloudflared/releases |

安装后验证：

```bash
cloudflared --version
```

输出示例：`cloudflared version 2024.x.x`。若仍失败，报错并退出。

---

## Step 2：检测登录状态

检查 cert.pem 是否存在：

```bash
# macOS/Linux
ls ~/.cloudflared/cert.pem 2>/dev/null

# Windows
Test-Path "$env:USERPROFILE\.cloudflared\cert.pem"
```

**不存在时**：

```bash
cloudflared tunnel login
```

该命令会打开浏览器，用户在 Cloudflare Dashboard 选择授权的 zone（域名）。授权完成后 `cert.pem` 自动写入。

提示用户：

```
请在浏览器中完成授权，选择你的域名（zone）。
如浏览器未自动打开，请手动访问终端显示的链接。
授权完成后，按任意键继续...
```

等待用户按键后，验证 cert.pem 是否生成（重试 3 次，间隔 2s）。

---

## Step 3：确认域名

从全局注册表读取 `domain`：

- **有缓存**：提示"当前域名是 `long.com`，是否保留？（y/n）"
  - y → 使用缓存域名
  - n → 提示重新输入
- **无缓存**：提示"请输入你在 Cloudflare 上已托管的域名（如 long.com）："

提示前置条件：

```
域名须已添加到 Cloudflare 并完成 NS 配置。
如未完成：https://dash.cloudflare.com/ → 添加站点 → 按向导修改 NS 记录
```

输入后校验格式（至少包含一个点，无协议前缀），不合法则提示重新输入。

---

## Step 4：校验授权作用域

执行：

```bash
retry_cmd 3 2 cloudflared tunnel list
```

- **成功（包括空列表）**：授权正常，继续
- **返回 401/403 或报认证错误**：提示重新登录，跳回 Step 2

---

## Step 5：输入 tunnel 名并创建

询问用户：

```
请输入 tunnel 名（英文+数字+-，如 my-app）：
```

合法性校验：只允许 `[a-z0-9-]`，不能以 `-` 开头或结尾。

**查询是否已存在**：

```bash
cloudflared tunnel list --output json 2>/dev/null | grep -q "\"name\":\"$TUNNEL_NAME\""
```

若 jq 可用，用：

```bash
cloudflared tunnel list --output json | jq -e ".[] | select(.name==\"$TUNNEL_NAME\")"
```

- **已存在**：提示"tunnel `aaa` 已存在，是否复用？（y）/ 换一个名字（n）"
  - y → 从 JSON 中读取 tunnel-id，跳到 Step 6
  - n → 重新输入
- **不存在**：
  ```bash
  retry_cmd 3 2 cloudflared tunnel create "$TUNNEL_NAME"
  ```
  解析输出中的 tunnel-id（格式 UUID），确认 `~/.cloudflared/<id>.json` 已生成。

合成完整 hostname = `<tunnel-name>.<domain>`（如 `aaa.long.com`）。

**CRITICAL**: 创建成功后，必须保存以下变量供后续步骤使用：
- `TUNNEL_ID`: 隧道 UUID（如 `5af095b0-b00c-4b19-b1af-0c16183eef39`）
- `CREDS_FILE`: credentials 文件路径（如 `~/.cloudflared/<TUNNEL_ID>.json`）
- `TUNNEL_NAME`: 隧道名称
- `HOSTNAME`: 完整域名（如 `aaa.long.com`）

**重要**: 后续所有 `cloudflared tunnel route dns` 命令必须使用 **TUNNEL_ID（UUID）**，绝不能使用 TUNNEL_NAME。因为 tunnel name 可能与其他名称相似的 tunnel 产生解析歧义，导致 DNS 路由到错误的隧道。

---

## Step 6：检测项目启动命令与端口

在项目根目录按以下优先级侦察（从高到低），找到第一个有效端口即停止：

| 优先级 | 来源文件                                                               | 侦察方式                                  |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------- |
| 1      | `start.sh` / `start.ps1` / `run.sh`                                    | 搜索 `PORT=` / `--port`                   |
| 2      | `package.json` scripts.dev/start                                       | 搜索 `-p \d+` / `--port \d+` / `PORT=\d+` |
| 3      | `.env` / `.env.local` / `.env.development`                             | 搜索 `^PORT=\d+`                          |
| 4      | `vite.config.*` / `next.config.*`                                      | 搜索 `port:\s*\d+`                        |
| 5      | Python: `app.run(port=` / `uvicorn ... --port` / `manage.py runserver` | 搜索 `port=\d+` / `--port \d+`；默认 8000 |
| 6      | Spring Boot: `application.properties/yml`                              | 搜索 `server\.port=\d+`                   |
| 7      | Go: `ListenAndServe\(":\d+`                                            | 正则搜索                                  |
| 8      | `docker-compose.yml`                                                   | 搜索 `ports:` 中的宿主端口                |

**有侦察结果时**：

```
检测到启动命令：npm run dev
端口：3000（来源：package.json scripts.dev）
是否修改端口？直接回车保留 3000，或输入新端口号：
```

用户输入新端口时：

1. 修改原配置文件中的端口（精确替换，只改端口数字，不改其他参数）
2. 改动前展示 diff
3. 让用户确认

**无侦察结果时**：

```
未能自动检测到启动命令或端口。
请输入项目启动命令（如 npm run dev、python main.py、./start.sh）：
请输入服务监听端口（如 3000）：
```

---

## Step 7：生成 cloudflare 配置并推送路由

### 7.1 生成配置文件

写入 `~/.cloudflared/config-<tunnel-name>.yml`：

```yaml
tunnel: <tunnel-id>
credentials-file: /Users/<user>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: aaa.long.com
    service: http://localhost:3000
  - service: http_status:404
```

Windows 路径用 `\` → 写入时改为 `/`（cloudflared 在 Windows 也接受 `/`）。

### 7.2 推送 DNS CNAME

**CRITICAL — 必须使用 TUNNEL_ID (UUID) 而非 TUNNEL_NAME**：

使用 tunnel name 可能导致 DNS 路由到错误的隧道（cloudflared 可能将名称解析为其他已存在的隧道）。必须使用完整的 UUID。

```bash
# 正确：使用 UUID + -f 强制覆盖
cloudflared tunnel route dns -f "$TUNNEL_ID" "$HOSTNAME"
```

**为什么必须加 -f？** 如果该 hostname 之前配置过（即使是配置到其他 tunnel），不加 `-f` 会报错 "An A, AAAA, or CNAME record with that host already exists"。`-f` 会先删除旧记录再创建新记录。

**CRITICAL — 验证路由是否正确指向你的 tunnel**：

```bash
# 确认输出中 tunnelID= 后面是你的 TUNNEL_ID
cloudflared tunnel route dns -f "$TUNNEL_ID" "$HOSTNAME"
# 正确输出示例：
# Added CNAME wecom.long123456789.xyz which will route to this tunnel tunnelID=5af095b0-...
```

如果输出的 `tunnelID` 不是你的 `TUNNEL_ID`，说明路由到了错误的隧道。此时需要：
1. 检查 cloudflared tunnel list 确认 tunnel name 和 ID 对应关系
2. 重新用 UUID 执行 `cloudflared tunnel route dns -f <UUID> <HOSTNAME>`

**CRITICAL — 禁止创建替代子域名规避问题**：

如果 DNS 路由创建后输出显示 tunnelID 不正确（指向了错误的隧道），**禁止**换一个新子域名（如 `wecom-demo` 替代 `wecom`）来规避问题。必须先诊断根因：
1. 确认 TUNNEL_ID 是否正确
2. 用 `-f` 标志 + UUID 强制覆盖

如果需要创建多个 tunnel 映射到同一个本地服务（例如临时测试），必须先向用户说明原因并获得同意。

### 7.3 等待 DNS 生效（提示用户）

DNS CNAME 记录创建后，需要 Cloudflare DNS 传播。提示用户：

```
DNS 记录已创建：<hostname> → <tunnel-id>.cfargotunnel.com

Cloudflare DNS 是全球分布式系统，新记录通常 1-5 分钟内在全球生效。
如果你现在访问 https://<hostname> 可能暂时无法解析，
这是正常现象，请稍等片刻再试。

我们将在启动 tunnel 后自动验证连接状态。
```

### 7.4 解析验证（可选，非阻塞）

```bash
# 验证 DNS 是否开始解析（新记录可能返回空）
dig +short "$HOSTNAME" CNAME 2>&1
# 如果返回空，说明 DNS 尚在传播中，继续后续步骤即可
```

---

## Step 8：写入注册表 + 提示启动

不再生成 per-project 的 `start-public.sh` / `start-public.ps1`，改为写入全局注册表，由全局管理脚本统一启动和监控。

### 8.1 初始化注册表

注册表文件 `~/.cloudflared/tunnel-registry.json` 可能不存在（首次使用时）。写入前必须检查并初始化：

```bash
REGISTRY_FILE="$HOME/.cloudflared/tunnel-registry.json"
if [ ! -f "$REGISTRY_FILE" ]; then
  echo '{"domain":"","tunnels":[]}' > "$REGISTRY_FILE"
fi
```

### 8.2 更新注册表

```bash
# bash (Python 替代 jq，兼容性更好)
python3 -c "
import json
with open('$REGISTRY_FILE') as f:
    reg = json.load(f)
reg['domain'] = '$DOMAIN'
reg['tunnels'] = [t for t in reg.get('tunnels', []) if t['name'] != '$TUNNEL_NAME']
reg['tunnels'].append({
    'name': '$TUNNEL_NAME',
    'tunnel_id': '$TUNNEL_ID',
    'subdomain': '$TUNNEL_NAME',
    'hostname': '$HOSTNAME',
    'port': $PORT,
    'config_file': 'config-${TUNNEL_NAME}.yml'
})
with open('$REGISTRY_FILE', 'w') as f:
    json.dump(reg, f, indent=2, ensure_ascii=False)
"
```

若无 Python，优先使用 jq（参考原版命令），再不行用 node。

### 8.3 冲突检测

| 场景 | 处理 |
|------|------|
| 子域名已存在于注册表 | 提示"web 已指向 4000 端口，是否更新为新端口？"→ 更新 config + 注册表 |
| 端口与其他 tunnel 相同 | 允许（正常需求），提示"注意：build 也使用端口 3000" |
| Cloudflare 端同名 tunnel | 复用，跳过创建 |

---

## Step 9：启动 Tunnel 并验证连接

启动 tunnel 后，必须等待 Cloudflare edge 建立连接，然后验证公网可达性。

### 9.1 启动 tunnel

```bash
# 后台启动
nohup cloudflared tunnel --config ~/.cloudflared/config-<name>.yml run > /tmp/tunnel-<name>.log 2>&1 &
TUNNEL_PID=$!
sleep 3
```

### 9.2 验证 tunnel ↔ Cloudflare edge 连接

```bash
cloudflared tunnel info "$TUNNEL_ID"
```

关键检查项：
- **必须有活跃连接**：输出中应有 "CONNECTOR ID" 行，如果没有 `active connection` 则 tunnel 未成功连接
- 如果显示 "does not have any active connection"：等待 5s 后重试（最多 3 次），若仍失败则检查 `/tmp/tunnel-<name>.log`

### 9.3 验证公网 URL

```bash
curl -s -o /dev/null -w "%{http_code}" https://<hostname>/ 2>&1
```

预期结果：
- `200` — 一切正常
- `000` 或超时 — DNS 尚在传播中，提示用户等待 1-5 分钟
- `530` + "error code: 1033" — tunnel 进程未连接到 Cloudflare edge，检查 tunnel 状态

### 9.4 提示用户

```
Tunnel 启动成功！Cloudflare edge 连接已建立。

公网地址: https://<hostname>
本地服务: http://localhost:<port>

注意：如果是新创建的 DNS 记录，Cloudflare 全球 DNS 传播可能需要 1-5 分钟。
如果暂时打不开，请稍等片刻后重试。
```

---

## Step 10：重试保障总结

| 操作                                  | 重试策略                                 |
| ------------------------------------- | ---------------------------------------- |
| `cloudflared --version` 安装验证      | 最多 3 次，间隔 2s                       |
| `cloudflared tunnel list`（授权校验） | 最多 3 次，间隔 2s（指数退避）           |
| `cloudflared tunnel create`           | 最多 3 次，间隔 2s（指数退避）           |
| `cloudflared tunnel route dns`（-f + UUID） | 最多 3 次，间隔 3s（指数退避）     |
| 端口等待（本地服务就绪）              | 最多 60 次 × 0.5s = 30s                  |
| Tunnel edge 连接等待                  | 最多 3 次 × 5s = 15s                     |
| DNS 传播等待                          | 提示用户等待 1-5 分钟，不需要轮询阻塞    |

**健康监测**（由全局 `tunnel-healthcheck` 脚本负责）：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 检测间隔 | 60s | 正常情况下的检查周期 |
| 失败阈值 | 3 次 | 连续失败次数才触发重启 |
| 冷却期 | 120s | 重启后不检测的时间 |
| 最大退避 | 300s | 连续重启后的最大检测间隔 |

---

## 完成提示

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  配置完成！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  公网地址：https://aaa.long.com
  本地服务：http://localhost:3000

  启动隧道：
    tunnel-start aaa

  管理命令：
    tunnel-list        查看所有隧道状态
    tunnel-add         添加新隧道
    tunnel-remove aaa  删除隧道
    tunnel-stop        停止所有隧道

  提示：
  - 首次启动需要 Cloudflare edge 建立连接，可能需要 10-30s
  - 新 DNS 记录全球传播约需 1-5 分钟，暂时打不开属正常现象
  - 健康监测自动运行，日志：~/tmp/tunnel-healthcheck.log
  - 管理 tunnel：https://dash.cloudflare.com/
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 注意事项

1. **域名必须已托管到 Cloudflare**（NS 记录已指向 Cloudflare）才能用 `tunnel route dns` 自动创建 CNAME
2. `cert.pem` 是账户级凭证，一个账户只需 `tunnel login` 一次
3. 每个 tunnel 对应一个 credentials JSON 文件，请勿删除 `~/.cloudflared/<id>.json`
4. 配置文件生成在 `~/.cloudflared/config-<name>.yml`，由全局管理脚本统一管理；项目无需生成启动脚本
5. **项目目录 `.bat` 包装脚本**：如果用户需要在项目目录放 `.bat` 文件方便双击启动/停止，**必须委托给全局 PowerShell 脚本**，禁止在 bat 内自行启动 cloudflared。正确模板：
   ```bat
   :: tunnel-start.bat（放在项目目录，双击即启动全部隧道 + 健康监测）
   @echo off
   chcp 65001 >nul
   echo.
   powershell -ExecutionPolicy Bypass -NoProfile -File "%USERPROFILE%\bin\tunnel-start.ps1" %*
   echo.
   pause

   :: tunnel-stop.bat（放在项目目录，双击即停止全部隧道 + 监测）
   @echo off
   chcp 65001 >nul
   echo.
   powershell -ExecutionPolicy Bypass -NoProfile -File "%USERPROFILE%\bin\tunnel-stop.ps1" %*
   echo.
   pause
   ```
   这样 bat 文件只做薄包装，所有逻辑（进程管理、健康监测、自动重启）都由全局脚本统一处理。
6. Windows 用户首次运行 ps1 可能需要：`Set-ExecutionPolicy -Scope Process RemoteSigned`
7. tunnel 名在 Cloudflare 账户内全局唯一，同名 tunnel 不能重复创建

---

## Windows 常见陷阱与最佳实践

### 陷阱 1：`start` 命令在 .bat 中不可靠（必须避免）

Windows `.bat` 文件中用 `start` 后台启动 cloudflared **会失败**：

```bat
:: 错误写法 —— 进程会立即退出，报 "The system cannot find the file <title>"
start "cloudflared-build" /min cloudflared.exe tunnel --config "config.yml" run
```

**原因**：`start` 的第一个带引号参数会被当作窗口标题，但在某些环境（MSYS2/Git Bash/某些 CMD 版本）下，`start` 会将标题误解为要执行的可执行文件名，导致进程立即退出。

**正确做法（首选）**：委托给全局 `tunnel-start.ps1` 脚本（自带进程去重 + 健康监测）：

```bat
:: 最佳写法 —— 委托给全局管理脚本
powershell -ExecutionPolicy Bypass -NoProfile -File "%USERPROFILE%\bin\tunnel-start.ps1"
```

**正确做法（备选）**：如果确实需要在 .bat 中直接启动单个 cloudflared，通过 PowerShell `Start-Process`：

```bat
:: 备选写法 —— 单独启动（无健康监测）
powershell -Command "Start-Process -FilePath 'cloudflared.exe' -ArgumentList 'tunnel','--config','%USERPROFILE%\.cloudflared\config.yml','run' -WindowStyle Minimized"
```

**重要**：生成任何 Windows 启动脚本（.bat 或 .ps1）时，**禁止使用 `start` 命令启动 cloudflared**，一律用 PowerShell `Start-Process` 或委托给全局管理脚本。

### 陷阱 2：进程唯一性 —— 防止重复启动

多次执行启动脚本会产生多个 cloudflared 进程，导致：
- 重复的 tunnel 连接（浪费资源）
- Cloudflare 返回 1033 错误（连接冲突）
- stop 时残留孤儿进程

**启动前必须检查**（按命令行参数匹配，而非窗口标题）：

```bat
:: .bat 中检查唯一性
powershell -Command "Get-CimInstance Win32_Process -Filter \"name='cloudflared.exe'\" | Where-Object {$_.CommandLine -like '*config-build*'} | Select-Object -First 1" 2>nul | findstr /i "cloudflared" >nul 2>&1
if %errorlevel% equ 0 (
    echo   [SKIP] tunnel already running
) else (
    powershell -Command "Start-Process -FilePath 'cloudflared.exe' -ArgumentList 'tunnel','--config','config.yml','run' -WindowStyle Minimized"
)
```

```powershell
# .ps1 中检查唯一性
$existing = Get-CimInstance Win32_Process -Filter "name='cloudflared.exe'" |
    Where-Object { $_.CommandLine -like "*$ConfigFile*" }
if ($existing) {
    Write-Host "[SKIP] tunnel already running (PID: $($existing.ProcessId))"
} else {
    Start-Process cloudflared -ArgumentList "tunnel","--config",$ConfigFile,"run" -WindowStyle Minimized
}
```

### 陷阱 3：停止 tunnel 要按命令行精确匹配

用窗口标题 `taskkill /FI "WINDOWTITLE eq ..."` 不可靠（`Start-Process` 不设置窗口标题）。正确做法：

```bat
:: 按 command line 匹配杀进程
powershell -Command "Get-CimInstance Win32_Process -Filter \"name='cloudflared.exe'\" | Where-Object {$_.CommandLine -like '*config-web*' -or $_.CommandLine -like '*config-build*'} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
```

### 多 tunnel 管理

当一台机器跑多个 tunnel 时，统一使用全局管理脚本，无需手动编辑配置：

```bash
# 添加隧道（交互式：输入子域名+端口，自动创建 tunnel+config+DNS）
tunnel-add

# 启动所有已注册的隧道 + 健康监测
tunnel-start

# 启动指定隧道
tunnel-start web build

# 查看所有隧道状态（进程、健康）
tunnel-list

# 停止所有隧道
tunnel-stop

# 删除一个隧道（可选是否从 Cloudflare 端删除）
tunnel-remove myapp
```

所有配置存储在 `~/.cloudflared/tunnel-registry.json`，管理脚本从注册表读取 tunnel 列表。

### 与本地服务集成

对于多服务的工作空间（如 WebWorkplace），推荐分离架构：

| 脚本 | 职责 |
|------|------|
| `start-all` | 只启动本地 PM2 服务 |
| `tunnel-start` | 启动所有隧道 + 健康监测 |
| `stop-all` | 停止一切（PM2 + 隧道 + 监测） |

在 `stop-all` 中，可以加入调用 `tunnel-stop` 来确保隧道也被停止。

### 诊断命令

当 tunnel 无法访问时，按以下顺序排查：

```bash
# 1. 检查 tunnel 是否有活跃连接（最关键）
cloudflared tunnel info <tunnel-id-or-name>
# "does not have any active connection" = tunnel 进程没在跑

# 2. 检查本地服务是否在监听
netstat -ano | grep ":<port> " | grep LISTEN

# 3. 本地直接 curl 测试
curl -s -o /dev/null -w "%{http_code}" http://localhost:<port>/

# 4. 通过域名 curl 测试
curl -s -o /dev/null -w "%{http_code}" https://<hostname>/
# 返回 530 + "error code: 1033" = tunnel 进程未连接到 Cloudflare edge

# 5. 检查是否有 cloudflared 进程在跑
powershell -Command "Get-CimInstance Win32_Process -Filter \"name='cloudflared.exe'\" | Select-Object ProcessId, CommandLine | Format-List"

# 6. 前台运行看详细日志（调试用）
cloudflared.exe tunnel --config "config.yml" run
```
