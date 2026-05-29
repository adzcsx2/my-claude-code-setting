# Playbook: Kotlin Companion Object Duplicate Class

## Goal

Fix kapt `duplicate class` errors caused by multiple `companion object`
declarations in a single Kotlin class, with a single minimal change.

## Root cause

Kotlin syntax allows declaring **multiple** `companion object` blocks in
the same class — the compiler does not reject it at parse time. Each
`companion object` generates a JVM `Companion` nested class. With kapt
involved, this produces duplicate `.class` files, and the build fails.

This is a Kotlin language quirk: the spec says only one companion object
is allowed, but the parser does not enforce it consistently. The error
only surfaces when kapt (or another annotation processor) writes class
files.

## Decision path

- If kapt error is `duplicate class` and the duplicate names look like
  `Foo$Companion` -> this is the companion object problem
- If there are exactly two companion objects -> the second one was
  likely added by accident (bad merge, copy-paste)
- If there are more than two -> same fix, merge all into one

## Steps

1. Find the failing file from kapt error output (class name gives the
   Kotlin file).
2. Search for `companion object` in that file.
3. If there are 2+ companion object blocks, merge all members (val,
   fun, const) into the **first** companion object, delete the others.
4. Run the same kapt task that failed to verify the fix.
5. Run a full assemble to confirm the fix is complete.

## Example

### Before (bad)

```kotlin
class IpfsActivity : AppCompatActivity() {

    companion object {
        const val TAG = "IpfsActivity"
        fun shouldShowFab(): Boolean = true
    }

    // ... many lines of code ...

    companion object {
        fun shouldShowFab(): Boolean = false
    }
}
```

### After (good)

```kotlin
class IpfsActivity : AppCompatActivity() {

    companion object {
        const val TAG = "IpfsActivity"
        fun shouldShowFab(): Boolean = true
        fun shouldShowFab(): Boolean = false
    }

    // ... many lines of code ...
}
```

## Common mistakes

- Using `@JvmStatic` on both companion object members with the same name
  (this is a separate issue — the functions must have unique JVM names).
- Assuming kapt errors are always dependency conflicts — check the source
  file first when the commit diff is small.
- Deleting the wrong companion object — always keep the first one
  (it usually has more members) and merge into it.

## Verification commands

```bash
# Re-run the failing kapt task
./gradlew clean :app:kaptDebugEnvDebugKotlin

# Full assemble
./gradlew assembleDebugEnvDebug
```

## Related real-world case

- Project: VBOX Android (vbox-android)
- Bad commit: `0a34ca3` — "将知识库模块集成到主应用"
- File: `IpfsActivity.kt`
- Symptom: `duplicate class` during `:app:kaptDebugEnvDebugKotlin`
- Root cause: Second `companion object` introduced, containing
  `shouldShowFab()`
- Fix: Merged `shouldShowFab()` into the existing top-level
  `companion object`, deleted the bottom one
- Outcome: kapt passed, full assemble succeeded
