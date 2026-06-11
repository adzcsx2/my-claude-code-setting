# adt:android-fold-adapter

诊断和修复 Android 折叠屏适配问题，包括 Activity 重建、状态丢失、Fragment 引用失效、以及折叠/展开时的布局异常。

---

## 功能

- 诊断折叠屏折叠/展开事件触发的配置变更问题（`screenSize`、`smallestScreenSize`、`screenLayout`）
- 分析 Activity 重建导致的 UI 可见性状态丢失
- 检测数据字段重置、Fragment 引用失效、事件处理器失效等问题
- 提供三种修复模式：Manifest configChanges 配置（主修复）、状态保存与恢复（防御性兜底）、Fragment 引用修复（ViewPager2 关键）
- 支持自动更新：发现新模式时会更新 SKILL.md 并记录到已知问题归档
- 提供修复前的验证 Checklist

## 用法

```
/adt:android-fold-adapter 描述折叠屏问题
```

参数示例：
- `/adt:android-fold-adapter 搜索页折叠后内容消失`
- `/adt:android-fold-adapter 详情页展开后按钮无响应`

> 本文档由 SKILL.md 自动生成，请勿手动编辑。如需更新，修改 SKILL.md 后运行 `/adt:update-remote-plugins`。
