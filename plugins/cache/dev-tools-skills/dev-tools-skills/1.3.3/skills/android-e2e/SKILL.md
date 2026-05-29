---
name: adt:android-e2e
description: "Android E2E visual testing — build, install, connect Midscene, execute test scenarios, and save screenshots to docs/screens/."
argument-hint: Describe the test scenario (e.g., "验证知识库空状态页面显示", "检查登录流程")
dependencies: android-device-automation
applyTo: "**/*.kt, **/AndroidManifest.xml, **/build.gradle*"
---

> **中文环境要求**
>
> 本技能运行在中文环境下，请遵循以下约定：
> - 面向用户的回复、注释、提示信息必须使用中文
> - AI 内部处理过程可以使用英文
> - 所有生成的文件必须使用 UTF-8 编码
>
> ---

# Android E2E Skill

项目级 Android E2E 视觉测试技能。依赖 `android-device-automation` 技能（来自 [midscene-skills](https://github.com/web-infra-dev/midscene-skills)）提供底层 Midscene 命令。

## 前置依赖

| 依赖 | 说明 |
|------|------|
| `android-device-automation` skill | 已通过 `npx skills add web-infra-dev/midscene-skills` 安装 |
| ADB 设备 | `adb devices` 至少有一个 `device` |
| Midscene 模型 | 默认使用 OpenRouter + Qwen3.6 Plus（见下方模型配置） |

## 模型配置

**默认模型**：OpenRouter Qwen3.6 Plus (free)，100 万上下文，多模态 VLM。

在 `~/.zshrc` 中配置以下环境变量：

```bash
# Midscene Configuration - OpenRouter Qwen3.6 Plus
export MIDSCENE_MODEL_NAME="qwen/qwen3.6-plus"
export MIDSCENE_MODEL_BASE_URL="https://openrouter.ai/api/v1"
export MIDSCENE_MODEL_API_KEY="<your-openrouter-api-key>"
export MIDSCENE_MODEL_FAMILY="qwen3.6"
```

配置后执行 `source ~/.zshrc` 使环境变量生效。

> **注意**：首次使用若未检测到以上环境变量，应主动提示用户在 `~/.zshrc` 中添加上述配置段，然后 `source ~/.zshrc`。

## 执行流程

### Step 1: 构建 App

使用项目的 Gradle 构建 App：

```bash
cd android   # 进入 Android 子项目
./gradlew assembleLocalEnvDebug
```

### Step 2: 安装到设备

```bash
adb install -r app/build/outputs/apk/localEnv/debug/*.apk
```

### Step 3: 启动 App

```bash
adb shell am start -n <package>/<launch-activity>
```

应从项目 `AndroidManifest.xml` 中获取正确的 package 和 launch activity。

### Step 4: 加载 android-device-automation Skill

通过 Skill tool 调用 `android-device-automation` skill 获取 Midscene 命令的完整说明。该 skill 提供以下命令：

| 命令 | 用法 |
|------|------|
| `connect` | `npx -y @midscene/android@1 connect` |
| `take_screenshot` | `npx -y @midscene/android@1 take_screenshot` |
| `act` | `npx -y @midscene/android@1 act --prompt "..."` |
| `assert` | `npx -y @midscene/android@1 assert --prompt "..."` |
| `launch` | `npx -y @midscene/android@1 launch --uri ...` |
| `disconnect` | `npx -y @midscene/android@1 disconnect` |

### Step 5: 执行 E2E 测试

**关键规则**（同 android-device-automation）：
1. **所有 Midscene 命令必须同步执行**，不可后台运行
2. **一次只运行一个 Midscene 命令**，等待完成后读取输出再决定下一步
3. **每个命令预留充足时间**，`act` 通常需 30-90 秒
4. **用 `assert` 做验证**，而非在 `act` 中同时执行和断言
5. **将关联操作合并到单个 `act`**，减少往返次数

标准测试序列：

```bash
# 1. Connect
npx -y @midscene/android@1 connect

# 2. Assert app launched
npx -y @midscene/android@1 assert --prompt "the app is visible on screen"

# 3. Execute test scenario
npx -y @midscene/android@1 act --prompt "<测试场景描述>"

# 4. Assert expected state
npx -y @midscene/android@1 assert --prompt "<验证条件>"

# 5. Screenshot
npx -y @midscene/android@1 take_screenshot

# 6. Disconnect
npx -y @midscene/android@1 disconnect
```

### Step 6: 保存截图到 docs/screens/

**强制要求**：所有 E2E 截图必须保存到项目 `docs/screens/` 目录。

```bash
mkdir -p docs/screens
# Midscene 输出: "Screenshot saved: /var/folders/.../screenshot-*.png"
cp <screenshot-path> docs/screens/<descriptive-name>.png
```

命名规范：`<screen-name>-<state>.png`
- `knowledge-empty-state.png`
- `knowledge-files-list.png`
- `login-success.png`

### Step 7: 报告结果

测试完成后必须主动汇报：
- 测试了什么场景
- 关键发现的 UI 状态和数据
- 截图保存路径
- 测试通过/失败的结论

## 故障排查

| 问题 | 解决方案 |
|------|---------|
| ADB not found | `brew install android-platform-tools` |
| Device not listed | 检查 USB 连接，启用 USB 调试 |
| Device "unauthorized" | 设备上接受 USB 调试授权 |
| Device "offline" | `adb kill-server && adb start-server` |
| 401 auth error | 检查 OpenRouter API Key: `echo $MIDSCENE_MODEL_API_KEY` |
| Command timeout | 唤醒设备: `adb shell input keyevent KEYCODE_WAKEUP` |
| `@midscene/android` not found | `npx -y @midscene/android@1 connect`（加 `-y` 跳过确认） |
| 多设备冲突 | `connect --deviceId <id>` 指定设备 |
