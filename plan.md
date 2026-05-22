# 实施计划：二维码扫码后自动关闭 + 绑定后自动选择用户

## 需求重述

### 功能 1：点击放大的二维码，扫码成功后自动关闭
- 当前行为：用户点击二维码放大（lightbox），扫码成功后 lightbox 不会自动关闭，需要手动关
- 期望行为：当轮询检测到扫码成功（`status === "ready"`）时，自动关闭 lightbox

### 功能 2：授权绑定后自动选择该用户为活跃用户
- 当前行为：`Auth.confirmBind()` 绑定后提示"请前往选择用户标签页选中该用户"
- 期望行为：绑定成功后自动将该用户设为活跃用户（调用 `/api/active_user`），无需手动切换

---

## 涉及文件

| 文件 | 修改内容 |
|------|---------|
| `static/index.html` (第 464-511 行) | 暴露 lightbox `close()` 为全局函数 |
| `static/mobile.html` (同上区域) | 同 index.html 的修改 |
| `static/app.js` (第 286-329 行) | 轮询成功时关闭 lightbox + confirmBind 自动选用户 |

**后端无需修改** — `/api/auth/bind` 已返回 `open_id`，`/api/active_user` 已存在。

---

## 实施步骤

### Step 1：暴露 lightbox close 为全局函数
**文件**: `static/index.html` (第 480 行附近), `static/mobile.html`

将 IIFE 内部的 `close` 函数暴露到全局：
```javascript
// 改前：
function close() { ... }

// 改后：
function close() { ... }
window._qrLightboxClose = close;  // 暴露给 app.js
```

### Step 2：轮询成功时自动关闭 lightbox
**文件**: `static/app.js` (第 290-303 行, `_startPolling` 方法)

在 `if (res.status === "ready")` 分支内，添加关闭 lightbox 的调用：
```javascript
if (res.status === "ready") {
  clearInterval(State.pollTimer);
  // ... 现有代码 ...
  if (window._qrLightboxClose) window._qrLightboxClose();  // 新增
}
```

### Step 3：绑定后自动选择用户
**文件**: `static/app.js` (第 319-329 行, `confirmBind` 方法)

改写 `confirmBind`：
1. 用临时变量保存 bind 返回的 `open_id`
2. 绑定后调用 `/api/active_user` 设为活跃用户
3. 更新 `State.activeOpenId` 和 UI
4. 提示文案改为"绑定成功并已选中"

```javascript
async confirmBind() {
  if (!State.currentState) return;
  try {
    const res = await api("POST", "/api/auth/bind", { state: State.currentState });
    this.reset();
    await Users.refresh();
    // 自动选择该用户为活跃用户
    if (res.open_id) {
      await api("POST", "/api/active_user", { open_id: res.open_id });
      State.activeOpenId = res.open_id;
      Users._renderSelectTab();
      Users._updateNavbar();
      document.getElementById("no-user-alert").style.display = "none";
    }
    alert("绑定成功！已自动选中该用户。");
  } catch (e) {
    alert("绑定失败：" + e.message);
  }
},
```

---

## 风险评估

| 风险 | 等级 | 说明 |
|------|------|------|
| lightbox 未打开时调用 close | 低 | `close()` 内部操作都是幂等的（移除 class、清空 src），无副作用 |
| 用户快速操作导致状态不一致 | 低 | 串行 await 保证顺序 |
| mobile.html 与 index.html 一致性 | 低 | 两个文件的 lightbox IIFE 代码完全相同 |

## 复杂度：低
- 3 个文件，约 10 行代码改动
- 无后端修改，无架构变更
