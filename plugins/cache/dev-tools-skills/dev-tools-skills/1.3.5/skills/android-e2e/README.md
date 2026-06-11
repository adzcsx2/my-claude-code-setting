# /adt:android-e2e — Android E2E 视觉测试

基于 [midscene-skills](https://github.com/web-infra-dev/midscene-skills) 的`android-device-automation` 技能的 Android 项目级 E2E 测试技能。提供完整测试流程：构建 → 安装 → 连接设备 → 执行测试 → 截图保存到 `docs/screens/`。

## 快速开始

```
/adt:android-e2e 验证知识库空状态页面是否正常显示
```

AI 会自动：构建 APK → 安装到设备 → 启动 App → Midscene 连接 → 执行测试场景 → 截图保存到 `docs/screens/`。

## 前置条件

- `android-device-automation` skill 已安装（`npx skills add web-infra-dev/midscene-skills`）
- ADB 设备已连接
- Midscene 模型已配置（`~/.zshrc` 中设置 `MIDSCENE_MODEL_*`）

## 输出

- 测试结果报告
- 截图保存到 `docs/screens/`

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，请修改 SKILL.md 后运行 /dt:update-remote-plugins。
