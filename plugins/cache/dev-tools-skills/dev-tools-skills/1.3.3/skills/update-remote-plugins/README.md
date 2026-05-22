# dt:update-remote-plugins

维护 dev-tools-skills 的远程事实源：审计 skill 变更、同步 README 与 marketplace 配置、验证 install 脚本能清旧缓存并安装最新版本，然后提交推送，**强制刷新本地缓存**。

---

## 功能

- 审计受影响 skill 的 SKILL.md 与 README.md 是否一致
- 同步 README.md、README_EN.md、plugin.json、marketplace.json
- 校验 install.sh 与 install.ps1 是否先清理旧缓存和旧注册，再安装最新版本
- 提交并推送远程，然后通过 install 脚本**强制刷新本地 Claude 缓存**

## 用法

```text
/dt:update-remote-plugins
```

---

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，修改 SKILL.md 后运行 /dt:update-remote-plugins。
