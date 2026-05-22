---
name: adt:android-fold-adapter
description: "Diagnose and fix Android foldable screen adaptation issues — Activity recreation, state loss, fragment reference invalidation, and layout breakage on fold/unfold."
argument-hint: Describe the foldable screen issue (e.g., "搜索页折叠后内容消失", "详情页展开后按钮无响应")
applyTo: "**/*.kt, **/*.java, **/AndroidManifest.xml"
---

> **中文环境要求**
>
> 本技能运行在中文环境下，请遵循以下约定：
> - 面向用户的回复、注释、提示信息必须使用中文
> - AI 内部处理过程可以使用英文
> - 所有生成的文件必须使用 UTF-8 编码
>
> ---

# Android Foldable Screen Adapter

Fix issues caused by foldable screen fold/unfold events. These events trigger configuration changes (`screenSize`, `smallestScreenSize`, `screenLayout`) that destroy and recreate Activities unless handled.

## Self-Update Mechanism

This skill supports automatic updates. When solving a new foldable screen issue:
1. Apply the fix using the patterns below
2. If the fix involves a new pattern not covered here, update this SKILL.md file
3. Add the new issue to "Known Issues Archive" section
4. Run `/adt:update-remote-plugins` to sync changes

## Diagnosis Workflow

### Step 1: Identify the Affected Activity

1. Determine which Activity exhibits the issue.
2. Read the `AndroidManifest.xml` entry for that Activity.
3. Check whether `android:configChanges` includes foldable-relevant values:
   - `screenSize`
   - `smallestScreenSize`
   - `screenLayout`
4. Compare with other Activities in the same project that already work on foldable screens — use them as reference for the correct `configChanges` value.

### Step 2: Analyze State Loss

If the Activity **lacks** `configChanges`, it gets destroyed and recreated on fold/unfold. Check for:

- **UI visibility state loss**: Does `onCreate` reset visibility of containers based on `intent.action` without checking `savedInstanceState`? This causes search results, loaded content, or navigation state to disappear.
- **Data field reset**: Are fields like search keywords, page numbers, or filter selections reset to defaults on recreation?
- **Fragment reference invalidation**: If the Activity holds `WeakReference` or `SparseArray` references to Fragments (common with `ViewPager2` + `FragmentStateAdapter`), these references become stale after recreation because `FragmentStateAdapter` restores Fragments via `FragmentManager` without calling `createFragment()`.

### Step 3: Check Click/Event Handler Failures

After Activity recreation:
- Fragment references in the Activity may be empty → `forEach` on the reference collection does nothing → button clicks appear to have no effect.
- The Fragment itself may have a lock mechanism (e.g., `searchLock`) that prevents re-entry but never gets reset.
- `lifecycleScope` coroutines launched before destruction may have been cancelled, and new ones aren't started.

## Fix Patterns

### Pattern A: Prevent Recreation via Manifest (Primary Fix)

Add `android:configChanges` to the Activity in `AndroidManifest.xml`:

```xml
<activity
    android:name=".ui.YourActivity"
    android:configChanges="orientation|keyboardHidden|screenSize|smallestScreenSize|density|screenLayout"
    ... />
```

Copy the exact `configChanges` value from other Activities in the same project that already handle foldable screens (e.g., `HomeActivity`, `WebActivity`).

### Pattern B: Save and Restore State (Defensive Fallback)

Even with Pattern A, add state saving as a fallback (system can still kill the Activity in low-memory situations):

```kotlin
override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    outState.putString(KEY_SEARCH_CONTENT, contentSearch)
    outState.putBoolean(KEY_HAS_RESULTS, binding.container.visibility == View.VISIBLE)
}

override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    val restored = savedInstanceState?.getBoolean(KEY_HAS_RESULTS, false) == true
    if (restored) {
        // Restore UI state from savedInstanceState
        contentSearch = savedInstanceState?.getString(KEY_SEARCH_CONTENT, "") ?: ""
        binding.container.visibility = View.VISIBLE
        // ...
    } else {
        // Normal intent-based initialization
    }
}
```

### Pattern C: Fix Fragment References (Critical for ViewPager2)

Never rely on a manually maintained `SparseArray<WeakReference<Fragment>>` to find Fragments after recreation. Use `FragmentManager` instead:

```kotlin
// BAD: stale after recreation
fragments.forEach { key, value ->
    value.get()?.doSomething()
}

// GOOD: always finds current Fragment instances
supportFragmentManager.fragments
    .filterIsInstance<YourFragment>()
    .forEach { it.doSomething() }
```

For `FragmentStateAdapter` hosted in Activity, Fragments are in `supportFragmentManager`.
For `FragmentStateAdapter` hosted in Fragment, Fragments are in that Fragment's `childFragmentManager`.

## Checklist

Before marking the fix complete, verify:

- [ ] `AndroidManifest.xml`: Target Activity has `configChanges` with `screenSize|smallestScreenSize|screenLayout`
- [ ] `onSaveInstanceState`: Key UI state and data fields are saved
- [ ] `onCreate`: `savedInstanceState` is checked before `intent.action` to restore state
- [ ] Fragment references: Use `FragmentManager.fragments` instead of manual collections
- [ ] No stale locks: Verify that locks (e.g., `searchLock`) are properly reset on recreation
- [ ] Build passes: `./gradlew :module:assembleDebug`

## Known Issues Archive

### Issue #1: Search Page — Fold/Unfold Causes Content Loss + Button Unresponsive

**Symptoms**: After searching on the search page, folding/unfolding the screen causes search results to disappear. After re-searching, subsequent search button clicks have no effect.

**Root Cause**: `SearchActivity` lacked `configChanges` → Activity recreated → `onCreate` hid the results container → `fragments` SparseArray emptied → `search()` method's `forEach` iterated over nothing.

**Fix Applied**: Pattern A + B + C (all three). Files changed:
- `AndroidManifest.xml` — added `configChanges`
- `SearchActivity.kt` — added `onSaveInstanceState`/restore + replaced `fragments.forEach` with `supportFragmentManager.fragments.filterIsInstance<SearchFragment>()`

---

### Issue #2: Desktop Widget — pm clear After Fold/Unfold Shows "Unable To Load Widget"

**Symptoms**: After placing the widget on the launcher, running `adb shell pm clear com.vertu.personalizationwidget`, then folding or unfolding the device causes the launcher widget to show "无法加载微件" and become non-clickable.

**Root Cause**: The widget provider rebuilt fallback data after `pm clear`, but logo rendering still relied on `FileProvider` URIs pointing to app-private files under `files/logos`. During launcher host rebind on fold/unfold, those file-backed URIs could become stale or invalid after the app data clear, causing the host to fail while applying `RemoteViews`.

**Fix Applied**: Restore default widget state synchronously after `pm clear`, ensure built-in logo assets are recreated if missing, and replace `setImageViewUri(...)` with `setImageViewBitmap(...)` so widget rendering no longer depends on app-private file URIs surviving host-side rebinds. Files changed:
- `WidgetEngraving/src/main/java/com/vertu/personalizationwidget/EngravingAppWidgetProvider.kt` — persist fallback widget entity, restore built-in logos, replace URI-based logo rendering with bitmap-based rendering

---

<!-- Add new issues below this line following the same format -->
