#!/usr/bin/env python3
"""
Kotlin DSL (build.gradle.kts) 远程签名配置处理模块

处理使用 Kotlin DSL 的 Android 项目的 build.gradle.kts 文件修改。
由 apply_remote_sign.py 调度调用，不直接运行。
"""

import re
from pathlib import Path

from apply_remote_sign import log


# ============================================================
# 签名服务配置
# ============================================================

STAGE_SIGN_API_URL = "https://public-service.vertu.cn/android/apk"
RELEASE_SIGN_API_URL = "https://public-service.vertu.cn/android/apk"


# ============================================================
# 辅助函数
# ============================================================

def _find_block_end(text: str, start: int) -> int:
    """从 start 位置开始找到第一个 '{' 及其匹配的 '}'，返回 '}' 后一位的位置。

    Args:
        text: 完整文本
        start: 搜索起始位置

    Returns:
        '}' 后一位的位置，找不到返回 -1
    """
    brace_idx = text.find('{', start)
    if brace_idx == -1:
        return -1
    count = 0
    for i in range(brace_idx, len(text)):
        if text[i] == '{':
            count += 1
        elif text[i] == '}':
            count -= 1
            if count == 0:
                return i + 1
    return -1


def _delete_named_block(text: str, block_name: str) -> tuple:
    """删除第一个独立的 'block_name { ... }' 块（含注释行）。

    Returns:
        (new_text, was_deleted)
    """
    search_from = 0
    while True:
        idx = text.find(block_name, search_from)
        if idx == -1:
            return text, False

        before_ok = idx == 0 or not text[idx - 1].isalnum()
        after_idx = idx + len(block_name)
        after_ok = after_idx >= len(text) or not text[after_idx].isalnum()
        if not (before_ok and after_ok):
            search_from = idx + 1
            continue

        rest = text[after_idx:after_idx + 50].strip()
        if not (rest.startswith('{') or rest.startswith('(')):
            search_from = idx + 1
            continue

        block_end = _find_block_end(text, idx)
        if block_end == -1:
            return text, False

        # 向前扩展至行首
        line_start = idx
        while line_start > 0 and text[line_start - 1] in ' \t':
            line_start -= 1
        if line_start > 0 and text[line_start - 1] == '\n':
            line_start -= 1

        # 向后扩展至下一行
        trail_end = block_end
        while trail_end < len(text) and text[trail_end] in ' \t':
            trail_end += 1
        if trail_end < len(text) and text[trail_end] == '\n':
            trail_end += 1

        return text[:max(0, line_start)] + text[trail_end:], True


def _find_kts_flavors(text: str, pf_start: int, pf_end: int) -> list:
    """在 productFlavors 块中查找所有 create("name") { ... } 块。

    Returns:
        list of (name, block_start_of_create, block_end_after_closing_brace)
    """
    result = []
    pattern = re.compile(r'create\s*\(\s*"(\w+)"\s*\)')
    pos = pf_start
    while pos < pf_end:
        m = pattern.search(text, pos, pf_end)
        if not m:
            break
        name = m.group(1)
        create_start = m.start()
        # 找到 create("name") 后面的 { ... } 块
        block_end = _find_block_end(text, m.end())
        if block_end == -1 or block_end > pf_end + 10:
            pos = m.end()
            continue
        result.append((name, create_start, block_end))
        pos = block_end
    return result


def _evaluate_kts_path(path_expr: str, project_root: Path, module_name: str) -> Path:
    """尝试将 Kotlin DSL 的文件路径表达式转换为实际 Path。

    处理常见的 Gradle 变量引用如：
    - ${projectDir.parentFile.parent}/file.jks
    - ${projectDir.parent}/file.jks
    - ${projectDir}/file.jks
    - ${rootProject.projectDir}/file.jks
    """
    module_dir = project_root / module_name
    replacements = {
        "${projectDir.parentFile.parent}": str(project_root.parent),
        "${projectDir.parentFile}": str(project_root),
        "${projectDir.parent}": str(project_root),
        "${projectDir}": str(module_dir),
        "${rootProject.projectDir}": str(project_root),
    }

    resolved = path_expr
    for var, val in replacements.items():
        resolved = resolved.replace(var, val)

    return Path(resolved)


# ============================================================
# Kotlin DSL 签名任务代码模板
# ============================================================

def _build_signing_task_code(flavor_urls: dict) -> str:
    """生成 Kotlin DSL 版本的签名任务代码。

    Args:
        flavor_urls: flavor 名称到签名 API URL 的映射

    Returns:
        要注入到 build.gradle.kts 末尾的 Kotlin 代码字符串
    """
    # 构建 signApiUrls map
    if flavor_urls:
        map_entries = ",\n".join(
            f'    "{name}" to "{url}"'
            for name, url in flavor_urls.items()
        )
        sign_api_urls_block = f"val signApiUrls = mapOf(\n{map_entries}\n)"
    else:
        sign_api_urls_block = "val signApiUrls = emptyMap<String, String>()"

    code = '''

// ============================================
// 签名API URL配置
// ============================================
''' + sign_api_urls_block + '''
val defaultSignApiUrl = "''' + RELEASE_SIGN_API_URL + '''"

// ============================================
// 构建时间统计
// ============================================
val buildStartTime = System.currentTimeMillis()
val signedApkPaths = mutableListOf<String>()

@Suppress("DEPRECATION")
gradle.buildFinished {
    val buildEndTime = System.currentTimeMillis()
    val buildDuration = (buildEndTime - buildStartTime) / 1000.0
    logger.lifecycle("========================================")
    logger.lifecycle("构建总耗时: ${"%.2f".format(buildDuration)} 秒")
    if (signedApkPaths.isNotEmpty()) {
        logger.lifecycle("APK 输出路径:")
        signedApkPaths.forEach { path ->
            logger.lifecycle("  $path")
        }
    }
    logger.lifecycle("========================================")
}

// ============================================
// APK签名任务
// ============================================
fun loadConfigFromFile(configFile: File): Map<String, String> {
    val config = mutableMapOf<String, String>()
    if (configFile.exists()) {
        configFile.readLines().forEach { line ->
            val trimmedLine = line.trim()
            if (trimmedLine.isNotEmpty() && !trimmedLine.startsWith("#")) {
                val parts = trimmedLine.split("=", limit = 2)
                if (parts.size == 2) {
                    config[parts[0].trim()] = parts[1].trim()
                }
            }
        }
    }
    return config
}

fun getSignToken(): String {
    // 1. 尝试从项目根目录 .env 文件读取
    val rootEnvFile = file("${rootProject.projectDir}/.env")
    logger.lifecycle("[签名配置] 检查项目根目录 .env: ${rootEnvFile.absolutePath}")
    if (rootEnvFile.exists()) {
        val config = loadConfigFromFile(rootEnvFile)
        val token = config["SIGN_TOKEN"] ?: ""
        if (token.isNotEmpty()) {
            logger.lifecycle("[签名配置] 已从项目根目录 .env 文件读取 SIGN_TOKEN")
            return token
        }
        logger.warn("[签名配置] 项目根目录 .env 文件存在，但未包含 SIGN_TOKEN")
    } else {
        logger.warn("[签名配置] 项目根目录 .env 文件不存在")
    }

    // 2. 尝试从项目根目录的上级目录 .env 文件读取
    val parentEnvFile = File(rootProject.projectDir.parentFile, ".env")
    logger.lifecycle("[签名配置] 检查上级目录 .env: ${parentEnvFile.absolutePath}")
    if (parentEnvFile.exists()) {
        val config = loadConfigFromFile(parentEnvFile)
        val token = config["SIGN_TOKEN"] ?: ""
        if (token.isNotEmpty()) {
            logger.lifecycle("[签名配置] 已从上级目录 .env 文件读取 SIGN_TOKEN")
            return token
        }
        logger.warn("[签名配置] 上级目录 .env 文件存在，但未包含 SIGN_TOKEN")
    } else {
        logger.warn("[签名配置] 上级目录 .env 文件不存在")
    }

    // 3. 尝试从系统环境变量读取
    logger.lifecycle("[签名配置] 尝试从系统环境变量读取 SIGN_TOKEN")
    val envToken = System.getenv("SIGN_TOKEN")
    if (!envToken.isNullOrEmpty()) {
        logger.lifecycle("[签名配置] 已从系统环境变量读取 SIGN_TOKEN")
        return envToken
    }
    logger.warn("[签名配置] 系统环境变量中未找到 SIGN_TOKEN")

    return ""
}

afterEvaluate {
    android.applicationVariants.all {
        val variant = this
        val variantName = variant.name.replaceFirstChar { it.uppercase() }
        val signTaskName = "sign${variantName}Apk"

        val signTask = tasks.create(signTaskName) {
            group = "signing"
            description = "对${variantName} APK执行远程V1+V2签名"

            doFirst {
                val signToken = getSignToken()
                if (signToken.isEmpty()) {
                    logger.warn("SIGN_TOKEN未配置，尝试使用空token请求远程签名接口...")
                }

                // 获取当前variant对应的签名URL
                val signApiUrl = if (variant.productFlavors.isNotEmpty()) {
                    variant.productFlavors
                        .firstNotNullOfOrNull { signApiUrls[it.name] }
                        ?: defaultSignApiUrl
                } else {
                    defaultSignApiUrl
                }

                // 获取所有APK输出文件
                variant.outputs.all {
                    val unsignedApk = outputFile

                    if (unsignedApk.exists()) {
                        // 签名后的APK路径（将替换原始APK）
                        val signedApk = unsignedApk

                        // 记录签名开始时间
                        val signStartTime = System.currentTimeMillis()
                        val compileElapsedSec = "%.2f".format((signStartTime - buildStartTime) / 1000.0)

                        logger.lifecycle("========================================")
                        logger.lifecycle("开始签名APK: ${unsignedApk.name}")
                        logger.lifecycle("========================================")

                        // 使用Python脚本进行签名
                        val pythonScript = file("${rootProject.projectDir}/scripts/sign_apk.py")
                        if (!pythonScript.exists()) {
                            throw GradleException("签名脚本不存在，请确保 scripts/sign_apk.py 文件存在")
                        }

                        // 依次尝试 python 和 python3
                        val pythonCommands = listOf("python", "python3")
                        var exitCode = -1
                        val outputLines = mutableListOf<String>()
                        var usedCommand: String? = null

                        for (cmd in pythonCommands) {
                            try {
                                logger.lifecycle("尝试使用 $cmd 执行签名脚本...")
                                val pb = ProcessBuilder(
                                    cmd,
                                    pythonScript.absolutePath,
                                    unsignedApk.absolutePath,
                                    signedApk.absolutePath,
                                    signToken,
                                    signApiUrl
                                )
                                pb.redirectErrorStream(true)
                                val process = pb.start()
                                process.inputStream.bufferedReader().forEachLine { line ->
                                    logger.lifecycle(line)
                                    outputLines.add(line)
                                }
                                exitCode = process.waitFor()
                                if (exitCode == 0) {
                                    usedCommand = cmd
                                    break
                                } else {
                                    logger.warn("$cmd 执行失败(退出码: $exitCode)，尝试下一个命令...")
                                }
                            } catch (e: IOException) {
                                logger.warn("$cmd 命令不可用: ${e.message}")
                            }
                        }

                        if (exitCode != 0) {
                            logger.error("========================================")
                            logger.error("签名失败！保留未签名的 APK")
                            logger.error("已尝试的命令: ${pythonCommands.joinToString(", ")}")
                            logger.error("最后退出码: $exitCode")
                            logger.error("APK 路径: ${unsignedApk.absolutePath}")
                            logger.error("========================================")
                            // 不抛出异常，允许构建继续，保留未签名的 APK
                        } else {
                            logger.lifecycle("使用 $usedCommand 签名成功")

                            // 记录成功签名的 APK 路径
                            signedApkPaths.add(signedApk.absolutePath)

                            val signElapsedMs = System.currentTimeMillis() - signStartTime
                            val signElapsedSec = "%.2f".format(signElapsedMs / 1000.0)

                            logger.lifecycle("========================================")
                            logger.lifecycle("签名成功: ${signedApk.name}")
                            logger.lifecycle("----------------------------------------")
                            logger.lifecycle("构建类型: ${variant.buildType.name}")
                            logger.lifecycle("构建变体: ${variant.name}")
                            logger.lifecycle("版本号: ${variant.versionCode}")
                            logger.lifecycle("版本名称: ${variant.versionName}")
                            logger.lifecycle("----------------------------------------")
                            logger.lifecycle("编译耗时: ${compileElapsedSec}秒")
                            logger.lifecycle("签名耗时: ${signElapsedSec}秒")
                            logger.lifecycle("========================================")
                        }
                    }
                    true
                }
            }
        }

        tasks.findByName("assemble$variantName")?.let { assembleTask ->
            signTask.dependsOn(assembleTask)
            assembleTask.finalizedBy(signTask)
        }
    }
}
'''
    return code


# ============================================================
# Kotlin DSL lint/packaging 配置代码
# ============================================================

LINT_PACKAGING_CODE = """
    // 构建配置优化
    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    packaging {
        resources {
            excludes += setOf(
                "class.dex",
                "META-INF/DEPENDENCIES", "META-INF/LICENSE", "META-INF/LICENSE.txt",
                "META-INF/license.txt", "META-INF/NOTICE", "META-INF/NOTICE.txt",
                "META-INF/notice.txt", "META-INF/ASL2.0"
            )
        }
    }
"""


# ============================================================
# 主处理函数
# ============================================================

def update_app_build_gradle_kts(project_root: Path, module_name: str = "app") -> bool:
    """更新指定模块的 build.gradle.kts 文件以集成远程签名功能。

    Args:
        project_root: 项目根目录
        module_name: 模块名称，默认 "app"

    Returns:
        是否成功
    """
    build_file = project_root / module_name / "build.gradle.kts"

    if not project_root.exists():
        log("ERROR", f"项目根目录不存在: {project_root}")
        return False

    module_dir = project_root / module_name
    if not module_dir.exists():
        log("ERROR", f"{module_name} 目录不存在: {module_dir}")
        return False

    if not build_file.exists():
        log("ERROR", f"build.gradle.kts 文件不存在: {build_file}")
        return False

    try:
        with open(build_file, "r", encoding="utf-8") as f:
            content = f.read()

        # 检查是否已配置过
        if "signApiUrls" in content and "APK签名任务" in content:
            log("INFO", "build.gradle.kts 已包含远程签名配置，但会检查并修复签名配置引用")

        # ========================================
        # Step 0: 确保必要的 import 声明
        # ========================================
        content = _ensure_imports(content)

        # ========================================
        # Step 0.5: 修复不存在的签名配置引用
        # ========================================
        content = _fix_signing_config_refs(content, project_root, module_name)

        # ========================================
        # Step 0.6: 转换 applicationId 为 project property 模式
        # ========================================
        content = _convert_application_id(content)

        # ========================================
        # Step 1: 确保 debug 签名配置存在
        # ========================================
        content = _ensure_debug_signing_config(content)

        # ========================================
        # Step 2: 添加 lint/packaging 配置
        # ========================================
        content = _add_lint_packaging(content)

        # ========================================
        # Step 3: 为所有 flavor 添加 signingConfig
        # ========================================
        content = _add_signing_config_to_flavors(content)

        # ========================================
        # Step 4: 提取 flavor 名称并生成签名任务
        # ========================================
        flavor_urls = _extract_flavor_urls(content)
        content = _inject_signing_task(content, flavor_urls)

        # 清理多余空行
        content = re.sub(r'\n{3,}', '\n\n', content)

        with open(build_file, "w", encoding="utf-8") as f:
            f.write(content)

        log("SUCCESS", f"更新 {build_file.relative_to(project_root)}")
        return True

    except FileNotFoundError:
        log("ERROR", f"文件不存在: {build_file}")
        return False
    except PermissionError:
        log("ERROR", f"没有权限写入文件: {build_file}")
        return False
    except Exception as e:
        log("ERROR", f"更新 build.gradle.kts 失败: {e}")
        import traceback
        traceback.print_exc()
        return False


# ============================================================
# 内部处理步骤
# ============================================================

_REQUIRED_IMPORTS = [
    "import java.io.File",
    "import java.io.IOException",
]


def _ensure_imports(content: str) -> str:
    """确保 build.gradle.kts 文件顶部包含必要的 import 声明。"""
    for imp in _REQUIRED_IMPORTS:
        if imp not in content:
            # 在最后一条已有 import 行之后插入
            last_import = -1
            for m in re.finditer(r'^import .+$', content, re.MULTILINE):
                last_import = m.end()
            if last_import != -1:
                content = content[:last_import] + "\n" + imp + content[last_import:]
            else:
                # 没有已有 import，则插在文件开头（plugins 之前）
                content = imp + "\n" + content
            log("INFO", f"添加 {imp}")
    return content


def _fix_signing_config_refs(content: str, project_root: Path, module_name: str) -> str:
    """检查 signingConfigs 中的 keystore 是否存在，替换不存在的引用为 debug。"""
    signingconfigs_idx = content.find("signingConfigs {")
    if signingconfigs_idx == -1:
        signingconfigs_idx = content.find("signingConfigs{")
    if signingconfigs_idx == -1:
        return content

    sc_end = _find_block_end(content, signingconfigs_idx)
    if sc_end == -1:
        return content

    sc_block = content[signingconfigs_idx:sc_end]

    # 查找所有 create("name") 块
    config_pattern = re.compile(r'create\s*\(\s*"(\w+)"\s*\)')
    for m in config_pattern.finditer(sc_block):
        config_name = m.group(1)
        if config_name == "debug":
            continue

        # 找到该配置块
        block_end = _find_block_end(sc_block, m.end())
        if block_end == -1:
            continue
        config_block = sc_block[m.start():block_end]

        # 查找 storeFile = File("path")
        storefile_match = re.search(
            r'storeFile\s*=\s*(?:File|file)\s*\(\s*"([^"]+)"\s*\)',
            config_block
        )
        if not storefile_match:
            continue

        raw_path = storefile_match.group(1)
        resolved_path = _evaluate_kts_path(raw_path, project_root, module_name)

        if not resolved_path.exists():
            # 替换所有引用: signingConfig = signingConfigs.getByName("configName")
            old_ref = f'signingConfigs.getByName("{config_name}")'
            new_ref = 'signingConfigs.getByName("debug")'
            if old_ref in content:
                content = content.replace(old_ref, new_ref)
                log("INFO", f"将签名配置引用 '{config_name}' 替换为 'debug' (keystore 不存在: {resolved_path})")

    return content


def _convert_application_id(content: str) -> str:
    """将 applicationId 转换为 project property 模式。

    检查是否已使用 project property 模式，如未使用则转换。
    Kotlin DSL 格式:
        if (project.hasProperty("applicationId")) {
            applicationId = project.property("applicationId") as String
        } else {
            applicationId = "com.xxx.xxx"
        }
    """
    # 检查是否已使用 project property 模式
    if 'project.hasProperty("applicationId")' in content or "project.hasProperty('applicationId')" in content:
        log("INFO", "applicationId 已使用 project property 模式，跳过")
        return content

    # 查找 applicationId = "com.xxx.xxx" 或 applicationId = 'com.xxx.xxx'
    app_id_match = re.search(r'applicationId\s*=\s*["\']([^"\']+)["\']', content)
    if app_id_match:
        current_app_id = app_id_match.group(1)
        old_pattern = f'applicationId = "{current_app_id}"'
        old_pattern_single = f"applicationId = '{current_app_id}'"
        new_pattern = f'''if (project.hasProperty("applicationId")) {{
            applicationId = project.property("applicationId") as String
        }} else {{
            applicationId = "{current_app_id}"
        }}'''

        if old_pattern in content:
            content = content.replace(old_pattern, new_pattern)
            log("INFO", f"已将 applicationId 转换为 project property 模式 (默认值: {current_app_id})")
        elif old_pattern_single in content:
            content = content.replace(old_pattern_single, new_pattern)
            log("INFO", f"已将 applicationId 转换为 project property 模式 (默认值: {current_app_id})")
    else:
        log("INFO", "未找到 applicationId 配置，跳过")

    return content


def _ensure_debug_signing_config(content: str) -> str:
    """替换整个 signingConfigs 块为只使用系统 debug.keystore。"""
    android_idx = content.find("android {")
    if android_idx == -1:
        android_idx = content.find("android{")
    if android_idx == -1:
        log("ERROR", "未找到 android 块")
        return content

    # 先删除旧的签名配置注释
    content = re.sub(r'\n?[ \t]*//\s*签名信息[^\n]*\n', '\n', content)

    signingconfigs_idx = content.find("signingConfigs {", android_idx)
    if signingconfigs_idx == -1:
        signingconfigs_idx = content.find("signingConfigs{", android_idx)

    # 新的 signingConfigs 块（只包含系统 debug.keystore）
    new_signingconfigs = '''    //签名信息（使用系统默认 debug.keystore）
    signingConfigs {
        getByName("debug") {
            storeFile = File(System.getProperty("user.home") + "/.android/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }'''

    if signingconfigs_idx != -1:
        # 找到 signingConfigs 块的结束位置
        sc_end = _find_block_end(content, signingconfigs_idx)
        if sc_end == -1:
            return content

        # 替换整个 signingConfigs 块
        content = content[:signingconfigs_idx] + new_signingconfigs + content[sc_end:]
        log("INFO", "已替换 signingConfigs 块为系统 debug.keystore 配置")
    else:
        # 如果没有 signingConfigs 块，在 android 块内添加
        # 找到 defaultConfig 块后添加
        defaultconfig_idx = content.find("defaultConfig {", android_idx)
        if defaultconfig_idx == -1:
            defaultconfig_idx = content.find("defaultConfig{", android_idx)

        if defaultconfig_idx != -1:
            dc_end = _find_block_end(content, defaultconfig_idx)
            if dc_end != -1:
                content = content[:dc_end] + "\n" + new_signingconfigs + content[dc_end:]
                log("INFO", "已添加 signingConfigs 块（系统 debug.keystore 配置）")

    return content


def _add_lint_packaging(content: str) -> str:
    """在 android 块中添加 lint 和 packaging 配置。"""
    # 先删除已存在的相关块
    for block_name in ['lint', 'packaging']:
        deleted_count = 0
        while True:
            content, deleted = _delete_named_block(content, block_name)
            if not deleted:
                break
            deleted_count += 1
        if deleted_count > 0:
            log("INFO", f"已清理 {deleted_count} 个 {block_name} 块")

    # 删除之前运行留下的注释
    content = re.sub(r'\n?\s*// 构建配置优化[^\n]*', '', content)

    # 清理多余空行
    content = re.sub(r'\n{3,}', '\n\n', content)

    # 找到 android 块
    android_idx = content.find("android {")
    if android_idx == -1:
        android_idx = content.find("android{")
    if android_idx == -1:
        log("ERROR", "未找到 android 块")
        return content

    # 找到合适的插入点 (buildFeatures / signingConfigs / android 块末尾之前)
    insert_block_name = "android"
    insert_idx = android_idx

    for candidate in ["buildFeatures {", "buildFeatures{", "signingConfigs {", "signingConfigs{"]:
        candidate_idx = content.find(candidate, android_idx)
        if candidate_idx != -1:
            insert_block_name = candidate.split()[0] if ' ' in candidate else candidate.rstrip('{')
            insert_idx = candidate_idx
            break

    log("INFO", f"使用 '{insert_block_name}' 块作为 lint/packaging 插入位置")

    vb_end = _find_block_end(content, insert_idx)
    if vb_end == -1:
        log("ERROR", f"无法找到 '{insert_block_name}' 块的结束位置")
        return content

    # 确保插入位置在 android 块内部
    android_end = _find_block_end(content, android_idx)
    if android_end != -1 and vb_end >= android_end:
        vb_end = android_end - 1
        while vb_end > android_idx and content[vb_end - 1] in ' \t\n':
            vb_end -= 1
        vb_end += 1

    content = content[:vb_end] + LINT_PACKAGING_CODE + content[vb_end:]
    return content


def _add_signing_config_to_flavors(content: str) -> str:
    """为所有 productFlavors 添加 signingConfig = signingConfigs.getByName("debug")。

    这是为了解决 Android Studio 无法直接运行某些 variant 的问题。
    原因：AGP 在某些 flavor 组合下无法正确继承 buildTypes 的签名配置。

    Args:
        content: build.gradle.kts 文件内容

    Returns:
        修改后的内容
    """
    android_idx = content.find("android {")
    if android_idx == -1:
        android_idx = content.find("android{")
    if android_idx == -1:
        return content

    pf_idx = content.find("productFlavors {", android_idx)
    if pf_idx == -1:
        pf_idx = content.find("productFlavors{", android_idx)
    if pf_idx == -1:
        return content

    pf_end = _find_block_end(content, pf_idx)
    if pf_end == -1:
        return content

    flavors = _find_kts_flavors(content, pf_idx, pf_end)

    # 从后往前处理每个 flavor，避免位置偏移
    for name, block_start, block_end in reversed(flavors):
        flavor_content = content[block_start:block_end]

        # 检查是否已有 signingConfig
        if "signingConfig" in flavor_content:
            continue

        # 找到 dimension 行之后插入 signingConfig
        dimension_match = re.search(r'dimension\s*=\s*["\'][^"\']+["\']', flavor_content)
        if dimension_match:
            insert_pos = block_start + dimension_match.end()
            signing_code = '\n            signingConfig = signingConfigs.getByName("debug")'
            content = content[:insert_pos] + signing_code + content[insert_pos:]
            log("INFO", f"为 flavor {name} 添加 signingConfig")
        else:
            # 没有 dimension 行，在 create 块的 { 后第一个换行处插入
            first_brace = content.find("{", block_start)
            if first_brace != -1 and first_brace < block_end:
                first_newline = content.find("\n", first_brace)
                if first_newline != -1 and first_newline < block_end:
                    signing_code = '\n            signingConfig = signingConfigs.getByName("debug")'
                    content = content[:first_newline + 1] + signing_code + content[first_newline + 1:]
                    log("INFO", f"为 flavor {name} 添加 signingConfig")

    return content


def _extract_flavor_urls(content: str) -> dict:
    """从 productFlavors 块中提取 flavor 名称并生成 URL 映射。

    Returns:
        dict: flavor 名称 -> 签名 API URL
    """
    android_idx = content.find("android {")
    if android_idx == -1:
        android_idx = content.find("android{")
    if android_idx == -1:
        return {}

    pf_idx = content.find("productFlavors {", android_idx)
    if pf_idx == -1:
        pf_idx = content.find("productFlavors{", android_idx)
    if pf_idx == -1:
        return {}

    pf_end = _find_block_end(content, pf_idx)
    if pf_end == -1:
        return {}

    flavors = _find_kts_flavors(content, pf_idx, pf_end)
    flavor_urls = {}
    for name, _, _ in flavors:
        # 根据名称判断 URL
        lower_name = name.lower()
        if "debug" in lower_name or "stage" in lower_name:
            flavor_urls[name] = STAGE_SIGN_API_URL
        else:
            flavor_urls[name] = RELEASE_SIGN_API_URL

    if flavor_urls:
        log("INFO", f"检测到 flavor URL 映射: {flavor_urls}")

    return flavor_urls


def _inject_signing_task(content: str, flavor_urls: dict) -> str:
    """将签名任务代码注入到 build.gradle.kts 文件末尾。"""
    # 先删除旧的签名任务代码（如果存在）
    if "APK签名任务" in content and ("fun getSignToken()" in content or "fun loadConfigFromFile(" in content):
        # 删除构建时间统计代码
        build_time_marker = "// ============================================\n// 构建时间统计"
        build_time_start = content.find(build_time_marker)
        if build_time_start == -1:
            build_time_marker = "// ============================================\n// 签名API URL配置"
            build_time_start = content.find(build_time_marker)

        if build_time_start != -1:
            # 找到 gradle.buildFinished 块结束
            bf_start = content.find("gradle.buildFinished", build_time_start)
            if bf_start != -1:
                bf_end = _find_block_end(content, bf_start)
                if bf_end != -1:
                    # 跳过后续空行
                    while bf_end < len(content) and content[bf_end] in '\n\r ':
                        bf_end += 1
                    log("INFO", "删除旧的构建时间统计代码")
                    content = content[:build_time_start] + content[bf_end:]

        # 删除旧的签名任务代码块 (从 signApiUrls 或 APK签名任务 开始)
        for marker in ["val signApiUrls", "// ============================================\n// APK签名任务"]:
            sign_start = content.find(marker)
            if sign_start != -1:
                # 找到 afterEvaluate 块结束
                ae_start = content.find("afterEvaluate", sign_start)
                if ae_start != -1:
                    ae_end = _find_block_end(content, ae_start)
                    if ae_end != -1:
                        while ae_end < len(content) and content[ae_end] in '\n\r ':
                            ae_end += 1
                        log("INFO", "删除旧的签名任务代码")
                        content = content[:sign_start] + content[ae_end:]
                        break

    # 生成新的签名任务代码
    signing_task_code = _build_signing_task_code(flavor_urls)

    # 找到 dependencies 块后插入
    dependencies_idx = content.find("dependencies {")
    if dependencies_idx == -1:
        dependencies_idx = content.find("dependencies{")

    if dependencies_idx != -1:
        dep_end = _find_block_end(content, dependencies_idx)
        if dep_end > 0:
            content = content[:dep_end] + signing_task_code + content[dep_end:]
        else:
            content += signing_task_code
    else:
        content += signing_task_code

    return content
