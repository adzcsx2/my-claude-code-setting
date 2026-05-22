#!/usr/bin/env python3
"""
Groovy DSL (build.gradle) 远程签名配置处理模块

处理使用 Groovy DSL 的 Android 项目的 build.gradle 文件修改。
由 apply_remote_sign.py 调度调用，不直接运行。
"""

import re
from pathlib import Path

from apply_remote_sign import log


def update_app_build_gradle_groovy(project_root: Path, module_name: str = "app") -> bool:
    """更新指定模块的 build.gradle 文件

    Args:
        project_root: 项目根目录
        module_name: 模块名称，默认 "app"

    Returns:
        是否成功
    """
    build_file = project_root / module_name / "build.gradle"

    # 检查项目根目录是否存在
    if not project_root.exists():
        log("ERROR", f"项目根目录不存在: {project_root}")
        return False

    # 检查模块目录是否存在
    module_dir = project_root / module_name
    if not module_dir.exists():
        log("ERROR", f"{module_name} 目录不存在: {module_dir}")
        return False

    # 检查 build.gradle 文件是否存在
    if not build_file.exists():
        log("ERROR", f"build.gradle 文件不存在: {build_file}")
        return False

    # 签名服务基础URL（直接内联到 flavor ext 块中，避免变量作用域问题）
    # 新版签名脚本使用基础URL + /handleSignV1 和 /handleSignV2
    STAGE_SIGN_API_URL_VALUE = "https://public-service.vertu.cn/android/apk"
    RELEASE_SIGN_API_URL_VALUE = "https://public-service.vertu.cn/android/apk"

    # lintOptions 配置
    lint_options_code = """
    // 解决 AGP 7.0.x 资源合并的 NullPointerException 问题
    lintOptions {
        checkReleaseBuilds false
        abortOnError false
    }

    // 添加 AAPT 选项以解决资源合并问题
    aaptOptions {
        noCompress "tflite"
        ignoreAssetsPattern "!.svn:!.git:.*:!CVS:!thumbs.db:!picasa.ini:!*.scc:*~"
        cruncherEnabled = false
    }

    packagingOptions {
        exclude 'class.dex'
        resources {
            excludes += ['META-INF/DEPENDENCIES', 'META-INF/LICENSE', 'META-INF/LICENSE.txt', 'META-INF/license.txt', 'META-INF/NOTICE', 'META-INF/NOTICE.txt', 'META-INF/notice.txt', 'META-INF/ASL2.0']
        }
    }
"""

    # flavor 中添加 signApiUrl（直接内联URL字符串）
    flavor_sign_url_stage = """            ext {
                signApiUrl = "%(stage_url)s"
            }
"""

    flavor_sign_url_release = """            ext {
                signApiUrl = "%(release_url)s"
            }
"""

    # buildType 修改
    build_type_release_sign = """            signingConfig signingConfigs.debug
"""

    build_type_debug_sign = """            signingConfig signingConfigs.debug
"""

    # 签名任务代码
    signing_task_code = """

// ============================================
// 构建时间统计
// ============================================
def buildStartTime = System.currentTimeMillis()

// 存储成功签名的 APK 路径
def signedApkPaths = []

gradle.buildFinished { buildResult ->
    def buildEndTime = System.currentTimeMillis()
    def buildDuration = (buildEndTime - buildStartTime) / 1000
    logger.lifecycle("========================================")
    logger.lifecycle("构建总耗时: " + String.format("%.2f", buildDuration) + " 秒")
    if (!signedApkPaths.isEmpty()) {
        logger.lifecycle("APK 输出路径:")
        signedApkPaths.each { path ->
            logger.lifecycle("  " + path)
        }
    }
    logger.lifecycle("========================================")
}

// ============================================
// APK签名任务
// ============================================
// 从指定文件读取键值对配置
def loadConfigFromFile(File configFile) {
    def config = [:]
    if (configFile.exists()) {
        configFile.eachLine { line ->
            def trimmedLine = line.trim()
            if (!trimmedLine.isEmpty() && !trimmedLine.startsWith("#")) {
                def (key, value) = trimmedLine.split('=', 2)
                if (key && value) {
                    config[key.trim()] = value.trim()
                }
            }
        }
    }
    return config
}

// 获取签名Token（优先级：项目根目录.env > 上级目录.env > 系统环境变量）
def getSignToken() {
    // 1. 尝试从项目根目录 .env 文件读取
    def rootEnvFile = file("${rootProject.projectDir}/.env")
    logger.lifecycle("[签名配置] 检查项目根目录 .env: ${rootEnvFile.absolutePath}")
    if (rootEnvFile.exists()) {
        def config = loadConfigFromFile(rootEnvFile)
        def token = config.get("SIGN_TOKEN", "")
        if (!token.isEmpty()) {
            logger.lifecycle("[签名配置] 已从项目根目录 .env 文件读取 SIGN_TOKEN")
            return token
        }
        logger.warn("[签名配置] 项目根目录 .env 文件存在，但未包含 SIGN_TOKEN")
    } else {
        logger.warn("[签名配置] 项目根目录 .env 文件不存在")
    }

    // 2. 尝试从项目根目录的上级目录 .env 文件读取
    def parentEnvFile = new File(rootProject.projectDir.parentFile, ".env")
    logger.lifecycle("[签名配置] 检查上级目录 .env: ${parentEnvFile.absolutePath}")
    if (parentEnvFile.exists()) {
        def config = loadConfigFromFile(parentEnvFile)
        def token = config.get("SIGN_TOKEN", "")
        if (!token.isEmpty()) {
            logger.lifecycle("[签名配置] 已从上级目录 .env 文件读取 SIGN_TOKEN")
            return token
        }
        logger.warn("[签名配置] 上级目录 .env 文件存在，但未包含 SIGN_TOKEN")
    } else {
        logger.warn("[签名配置] 上级目录 .env 文件不存在")
    }

    // 3. 尝试从系统环境变量读取
    logger.lifecycle("[签名配置] 尝试从系统环境变量读取 SIGN_TOKEN")
    def envToken = System.getenv("SIGN_TOKEN")
    if (envToken != null && !envToken.isEmpty()) {
        logger.lifecycle("[签名配置] 已从系统环境变量读取 SIGN_TOKEN")
        return envToken
    }
    logger.warn("[签名配置] 系统环境变量中未找到 SIGN_TOKEN")

    return ""
}


afterEvaluate {
    // 获取所有构建变体的输出
    android.applicationVariants.all { variant ->
        def variantName = variant.name.capitalize()
        def signTaskName = "sign${variantName}Apk"

        // 创建签名任务
        task "${signTaskName}"() {
            group = "signing"
            description = "对${variantName} APK执行远程V1+V2签名"

            doFirst {
                def signToken = getSignToken()
                if (signToken.isEmpty()) {
                    logger.warn("SIGN_TOKEN未配置，尝试使用空token请求远程签名接口...")
                }

                // 获取当前variant对应的签名URL
                def signApiUrl = variant.productFlavors.get(0).ext.get("signApiUrl")

                // 获取所有APK输出文件
                variant.outputs.all { output ->
                    def unsignedApk = output.outputFile

                    if (unsignedApk != null && unsignedApk.exists()) {
                        // 签名后的APK路径（将替换原始APK）
                        def signedApk = unsignedApk

                        // 记录签名开始时间（用于计算编译耗时）
                        def signStartTime = System.currentTimeMillis()
                        // 编译耗时 = 签名开始时间 - 构建开始时间
                        def compileElapsedSec = String.format("%.2f", (signStartTime - buildStartTime) / 1000.0)

                        logger.lifecycle("========================================")
                        logger.lifecycle("开始签名APK: ${unsignedApk.name}")
                        logger.lifecycle("========================================")

                        // 使用Python脚本进行签名
                        def pythonScript = file("${rootProject.projectDir}/scripts/sign_apk.py")
                        if (!pythonScript.exists()) {
                            logger.error("签名脚本不存在: ${pythonScript}")
                            throw new GradleException("签名脚本不存在，请确保 scripts/sign_apk.py 文件存在")
                        }

                        // 执行Python签名脚本的辅助函数
                        def runPythonSign = { String pythonCmd ->
                            def pb = new ProcessBuilder(
                                    pythonCmd,
                                    pythonScript.absolutePath,
                                    unsignedApk.absolutePath,
                                    signedApk.absolutePath,
                                    signToken,
                                    signApiUrl
                            )
                            pb.redirectErrorStream(true)
                            return pb.start()
                        }

                        // 收集进程输出的辅助函数
                        def collectOutput = { Process proc ->
                            def lines = []
                            def reader = new BufferedReader(new InputStreamReader(proc.inputStream))
                            String l
                            while ((l = reader.readLine()) != null) {
                                logger.lifecycle(l)
                                lines.add(l)
                            }
                            return lines
                        }

                        // 依次尝试 python 和 python3
                        def pythonCommands = ["python", "python3"]
                        def process = null
                        def outputLines = []
                        def exitCode = -1
                        def usedCommand = null

                        for (cmd in pythonCommands) {
                            try {
                                logger.lifecycle("尝试使用 ${cmd} 执行签名脚本...")
                                process = runPythonSign(cmd)
                                outputLines = collectOutput(process)
                                exitCode = process.waitFor()
                                if (exitCode == 0) {
                                    usedCommand = cmd
                                    break
                                } else {
                                    logger.warn("${cmd} 执行失败(退出码: ${exitCode})，尝试下一个命令...")
                                }
                            } catch (IOException e) {
                                logger.warn("${cmd} 命令不可用: ${e.message}")
                            }
                        }

                        if (exitCode != 0) {
                            logger.error("========================================")
                            logger.error("签名失败！保留未签名的 APK")
                            logger.error("已尝试的命令: ${pythonCommands.join(', ')}")
                            logger.error("最后退出码: ${exitCode}")
                            logger.error("APK 路径: ${unsignedApk.absolutePath}")
                            logger.error("========================================")
                            // 不抛出异常，允许构建继续，保留未签名的 APK
                            return
                        }

                        logger.lifecycle("使用 ${usedCommand} 签名成功")

                        // 记录成功签名的 APK 路径
                        signedApkPaths.add(signedApk.absolutePath)

                        def signElapsedMs = System.currentTimeMillis() - signStartTime
                        def signElapsedSec = String.format("%.2f", signElapsedMs / 1000.0)

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
            }

            // 任务在assemble任务后执行
            def assembleTaskRef = tasks.findByName("assemble${variantName}")
            def signTask = tasks.findByName(signTaskName)
            if (assembleTaskRef && signTask) {
                signTask.dependsOn assembleTaskRef
                assembleTaskRef.finalizedBy signTask
            }
        }
    }
}
"""

    try:
        # 尝试以 UTF-8 读取文件，如果失败则尝试其他编码
        try:
            with open(build_file, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            log("INFO", "UTF-8 编码读取失败，尝试使用系统默认编码")
            with open(build_file, "r", encoding="gbk", errors="ignore") as f:
                content = f.read()

        # 检查是否已经配置过远程签名
        if "signApiUrl" in content and "APK签名任务" in content:
            log("INFO", "app/build.gradle 已包含远程签名配置，但会检查并修复签名配置引用")
            # 不跳过，继续处理签名配置引用

        # 0. 预处理：检查并替换不存在的签名配置引用
        # 查找常见的签名配置引用（如 signingConfig signingConfigs.vertu）
        # 如果对应的 keystore 文件不存在，替换为 debug
        problematic_refs = [
            "signingConfig signingConfigs.vertu",
            "signingConfig signingConfigs.release",
        ]
        replaced = False
        for ref in problematic_refs:
            if ref in content:
                # 简单检查：如果包含相对路径或不存在的常见keystore名称，则替换
                # 查找该配置的 keystore
                import re
                # 在 signingConfigs 块中查找对应的配置
                signingconfigs_idx = content.find("signingConfigs {")
                if signingconfigs_idx != -1:
                    # 提取 signingConfigs 块
                    sc_end = 0
                    brace_count = 0
                    start_found = False
                    for i in range(signingconfigs_idx, min(signingconfigs_idx + 2000, len(content))):
                        if content[i] == '{':
                            start_found = True
                            brace_count += 1
                        elif content[i] == '}':
                            brace_count -= 1
                            if start_found and brace_count == 0:
                                sc_end = i + 1
                                break

                    signingconfigs_block = content[signingconfigs_idx:sc_end]
                    # 尝试提取 keystore 路径
                    # 简单方法：查找 storeFile file(...) 或 storeFile file('...')
                    storefile_matches = list(re.finditer(r'storeFile\s+file\s*\((["\']?)([^"\'()]+)', signingconfigs_block))
                    if storefile_matches:
                        for match in storefile_matches:
                            keystore = match.group(2).strip('\'"')
                            # 处理相对路径
                            if "../" in keystore:
                                # 检查文件是否存在
                                full_path = project_root / keystore
                                if not full_path.exists():
                                    # 替换引用
                                    content = content.replace(ref, "signingConfig signingConfigs.debug")
                                    log("INFO", f"将签名配置引用 '{ref}' 替换为 'debug' (keystore 不存在)")
                                    replaced = True
                                    break
                        if replaced:
                            break

        if replaced:
            log("SUCCESS", "已修复签名配置引用")

        # 1. 删除旧的顶层 APK签名配置 ext 块（如果存在）
        import re
        old_sign_config_pattern = r'\n*// =+\n// APK签名配置\n// =+\n\next\s*\{[^}]*?(?:STAGE_SIGN_API_URL|RELEASE_SIGN_API_URL)[^}]*?\}\s*'
        content = re.sub(old_sign_config_pattern, '\n', content, flags=re.DOTALL)

        # 1.5. 处理 applicationId：转换为 project property 模式
        # 检查是否已使用 project property 模式
        if 'project.hasProperty("applicationId")' in content or "project.hasProperty('applicationId')" in content:
            log("INFO", "applicationId 已使用 project property 模式，跳过")
        elif 'applicationId' in content:
            # 提取当前 applicationId 值并转换为 project property 模式
            # 匹配格式: applicationId "com.xxx.xxx" 或 applicationId 'com.xxx.xxx'
            app_id_match = re.search(r'applicationId\s+["\']([^"\']+)["\']', content)
            if app_id_match:
                current_app_id = app_id_match.group(1)
                old_pattern = f'applicationId "{current_app_id}"'
                new_pattern = f'''if (project.hasProperty("applicationId")) {{
            applicationId project.property('applicationId')
        }} else {{
            applicationId "{current_app_id}"
        }}'''
                # 也处理单引号情况
                old_pattern_single = f"applicationId '{current_app_id}'"
                if old_pattern in content:
                    content = content.replace(old_pattern, new_pattern)
                    log("INFO", f"已将 applicationId 转换为 project property 模式 (默认值: {current_app_id})")
                elif old_pattern_single in content:
                    content = content.replace(old_pattern_single, new_pattern)
                    log("INFO", f"已将 applicationId 转换为 project property 模式 (默认值: {current_app_id})")
        else:
            log("INFO", "未找到 applicationId 配置，跳过")

        # 2. 在 android { 块中合适位置添加 lintOptions 等配置
        android_idx = content.find("android {")
        if android_idx == -1:
            log("ERROR", "未找到 android 块")
            return False

        # 辅助函数：使用大括号计数找到块的结束位置
        def find_block_end_pos(text, start):
            """从 start 位置开始找到第一个 '{' 及其匹配的 '}'，返回 '}' 后的位置"""
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

        # 辅助函数：删除一个命名块（如 lintOptions { ... }），使用正确的大括号匹配
        def delete_named_block(text, block_name):
            """删除第一个独立的 'block_name { ... }' 块，返回 (新文本, 是否删除)"""
            search_from = 0
            while True:
                idx = text.find(block_name, search_from)
                if idx == -1:
                    return text, False
                # 确保是独立的块名（不是单词的一部分）
                before_ok = (idx == 0 or not text[idx - 1].isalnum())
                after_idx = idx + len(block_name)
                after_ok = (after_idx >= len(text) or not text[after_idx].isalnum())
                if not (before_ok and after_ok):
                    search_from = idx + 1
                    continue
                # 确保后面跟着 {（可能有空白）
                rest = text[after_idx:after_idx + 30].strip()
                if not rest.startswith('{'):
                    search_from = idx + 1
                    continue
                # 使用大括号计数找到块结束
                block_end = find_block_end_pos(text, idx)
                if block_end == -1:
                    return text, False
                # 向前扩展：删除前面的空白到行首
                line_start = idx
                while line_start > 0 and text[line_start - 1] in ' \t':
                    line_start -= 1
                if line_start > 0 and text[line_start - 1] == '\n':
                    line_start -= 1
                # 向后扩展：删除尾部空白和换行
                trail_end = block_end
                while trail_end < len(text) and text[trail_end] in ' \t':
                    trail_end += 1
                if trail_end < len(text) and text[trail_end] == '\n':
                    trail_end += 1
                text = text[:max(0, line_start)] + text[trail_end:]
                return text, True

        # 删除所有已存在的 lintOptions、aaptOptions、packagingOptions 块
        # （包括原始文件中的和之前工具运行插入的，无论在 android 块内外）
        for block_name in ['lintOptions', 'aaptOptions', 'packagingOptions']:
            deleted_count = 0
            while True:
                content, deleted = delete_named_block(content, block_name)
                if not deleted:
                    break
                deleted_count += 1
            if deleted_count > 0:
                log("INFO", f"已清理 {deleted_count} 个 {block_name} 块")

        # 删除之前运行留下的标记注释
        content = re.sub(r'\n?\s*// 解决 AGP 7\.0\.x[^\n]*', '', content)
        content = re.sub(r'\n?\s*// 添加 AAPT 选项[^\n]*', '', content)

        # 删除空的嵌套 android {} 块（删除 lintOptions 后可能留下空壳）
        content = re.sub(r'\n?\s*android\s*\{\s*\}', '', content)

        # 清理多余的空行
        content = re.sub(r'\n{3,}', '\n\n', content)

        # 重新查找 android 块位置（内容已变化）
        android_idx = content.find("android {")
        if android_idx == -1:
            log("ERROR", "清理后未找到 android 块")
            return False

        # 找到 buildFeatures（或其他合适块）作为插入点
        buildfeatures_idx = content.find("buildFeatures {", android_idx)
        signingconfigs_idx = content.find("signingConfigs {", android_idx)

        if buildfeatures_idx != -1:
            insert_block_name = "buildFeatures"
            insert_idx = buildfeatures_idx
        elif signingconfigs_idx != -1:
            insert_block_name = "signingConfigs"
            insert_idx = signingconfigs_idx
        else:
            insert_block_name = "android"
            insert_idx = android_idx

        log("INFO", f"使用 '{insert_block_name}' 块作为 lintOptions 插入位置")

        # 找到插入块的结束位置
        vb_end = find_block_end_pos(content, insert_idx)
        if vb_end == -1:
            log("ERROR", f"无法找到 '{insert_block_name}' 块的结束位置")
            return False

        # 确保插入位置在 android 块内部
        android_end = find_block_end_pos(content, android_idx)
        if android_end != -1 and vb_end >= android_end:
            # 插入点超出 android 块，改为在 android 块结束前插入
            vb_end = android_end - 1
            while vb_end > android_idx and content[vb_end - 1] in ' \t\n':
                vb_end -= 1
            vb_end += 1  # 保留位置在最后一个非空白字符后

        # 在插入点后插入 lintOptions/aaptOptions/packagingOptions
        content = content[:vb_end] + lint_options_code + content[vb_end:]

        # 3. 替换整个 signingConfigs 块为只使用系统 debug.keystore
        # 先删除旧的签名配置注释（如 "//签名信息"）
        content = re.sub(r'\n?[ \t]*//\s*签名信息[^\n]*\n', '\n', content)

        signingconfigs_idx = content.find("signingConfigs {", android_idx)
        if signingconfigs_idx != -1:
            # 找到 signingConfigs 块的结束位置
            brace_count = 0
            start_found = False
            sc_end = 0
            for i in range(signingconfigs_idx, len(content)):
                if content[i] == '{':
                    start_found = True
                    brace_count += 1
                elif content[i] == '}':
                    brace_count -= 1
                    if start_found and brace_count == 0:
                        sc_end = i + 1
                        break

            # 替换整个 signingConfigs 块为只包含系统 debug.keystore 的配置
            new_signingconfigs = """    //签名信息（使用系统默认 debug.keystore）
    signingConfigs {
        debug {
            storeFile file("${System.getProperty('user.home')}/.android/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }"""
            content = content[:signingconfigs_idx] + new_signingconfigs + content[sc_end:]
            log("INFO", "已替换 signingConfigs 块为系统 debug.keystore 配置")
        else:
            # 如果没有 signingConfigs 块，在 android 块内添加
            # 找到合适的位置（通常在 defaultConfig 之后）
            defaultconfig_end = content.find("defaultConfig {", android_idx)
            if defaultconfig_end != -1:
                # 找到 defaultConfig 块的结束位置
                brace_count = 0
                start_found = False
                dc_end = 0
                for i in range(defaultconfig_end, len(content)):
                    if content[i] == '{':
                        start_found = True
                        brace_count += 1
                    elif content[i] == '}':
                        brace_count -= 1
                        if start_found and brace_count == 0:
                            dc_end = i + 1
                            break

                new_signingconfigs = """

    //签名信息（使用系统默认 debug.keystore）
    signingConfigs {
        debug {
            storeFile file("${System.getProperty('user.home')}/.android/debug.keystore")
            storePassword "android"
            keyAlias "androiddebugkey"
            keyPassword "android"
        }
    }"""
                content = content[:dc_end] + new_signingconfigs + content[dc_end:]
                log("INFO", "已添加 signingConfigs 块（系统 debug.keystore 配置）")

        # 4. 在 buildType 中添加 signingConfig（通用处理）

        # 4. 在 buildType 中添加 signingConfig（通用处理）
        # 找到 buildTypes 块
        buildtypes_idx = content.find("buildTypes {", android_idx)
        if buildtypes_idx != -1:
            # 找到 buildTypes 块的结束位置
            brace_count = 0
            start_found = False
            bts_end = 0
            for i in range(buildtypes_idx, len(content)):
                if content[i] == '{':
                    start_found = True
                    brace_count += 1
                elif content[i] == '}':
                    brace_count -= 1
                    if start_found and brace_count == 0:
                        bts_end = i + 1
                        break

            # 在 buildTypes 块内查找各个 buildType
            # 常见的 buildType 名称
            common_buildtypes = ["release", "debug"]
            for bt_name in common_buildtypes:
                bt_pattern = f"{bt_name} {{"
                bt_idx = content.find(bt_pattern, buildtypes_idx)
                if bt_idx != -1 and bt_idx < bts_end:
                    # 找到 buildType 块的结束位置
                    brace_count = 0
                    start_found = False
                    bt_end = 0
                    for i in range(bt_idx, len(content)):
                        if content[i] == '{':
                            start_found = True
                            brace_count += 1
                        elif content[i] == '}':
                            brace_count -= 1
                            if start_found and brace_count == 0:
                                bt_end = i + 1
                                break

                    bt_content = content[bt_idx:bt_end]

                    # 先删除旧的 signingConfig 行，再添加新的
                    if "signingConfig" in bt_content:
                        # 删除旧的 signingConfig 行
                        import re
                        # 匹配 signingConfig 行（包括行首空白，避免残留空白导致缩进错乱）
                        old_signconfig_pattern = r'[ \t]*signingConfig\s+[^\n]+\n'
                        new_bt_content = re.sub(old_signconfig_pattern, '', bt_content)
                        if new_bt_content != bt_content:
                            log("INFO", f"删除 buildType {bt_name} 中旧的 signingConfig 代码")
                            content = content[:bt_idx] + new_bt_content + content[bt_end:]
                            # 重新计算 bt_end
                            for i in range(bt_idx, len(content)):
                                if content[i] == '{':
                                    start_found = True
                                    brace_count += 1
                                elif content[i] == '}':
                                    brace_count -= 1
                                    if start_found and brace_count == 0:
                                        bt_end = i + 1
                                        break

                    # 添加 signingConfig
                    # 找到第一行内容后插入
                    first_brace = content.find("{", bt_idx) + 1
                    # 找到第一个换行符
                    first_newline = content.find("\n", first_brace)
                    if first_newline != -1 and first_newline < bt_end:
                        indent = "            "
                        content = content[:first_newline + 1] + indent + f"signingConfig signingConfigs.debug\n" + content[first_newline + 1:]

        # 4.5 修复所有 signingConfig 引用（productFlavors 中可能有其他签名配置引用）
        # 替换所有非 debug 的签名配置引用为 debug
        # 例如：signingConfig signingConfigs.royole -> signingConfig signingConfigs.debug
        all_signconfig_pattern = r'signingConfig\s+signingConfigs\.(\w+)'
        def replace_signconfig(match):
            config_name = match.group(1)
            if config_name != 'debug':
                log("INFO", f"将 signingConfigs.{config_name} 替换为 signingConfigs.debug")
                return 'signingConfig signingConfigs.debug'
            return match.group(0)
        content = re.sub(all_signconfig_pattern, replace_signconfig, content)

        # 5. 在所有 flavor 中添加 signApiUrl（通用处理）
        # 查找 productFlavors 块
        productflavors_idx = content.find("productFlavors {", android_idx)
        if productflavors_idx != -1:
            # 找到 productFlavors 块的结束位置
            brace_count = 0
            start_found = False
            pf_end = 0
            for i in range(productflavors_idx, len(content)):
                if content[i] == '{':
                    start_found = True
                    brace_count += 1
                elif content[i] == '}':
                    brace_count -= 1
                    if start_found and brace_count == 0:
                        pf_end = i + 1
                        break

            # 使用深度跟踪解析器，只查找 productFlavors 块内第一层级的 flavor 块
            # 避免匹配到 if/else/try/finally 等嵌套关键词
            import re

            def find_top_level_flavors(text, pf_start_idx, pf_end_idx):
                """在 productFlavors 块中查找第一层级的 flavor 块

                只找直接位于 productFlavors { } 内的 "identifierName {" 块，
                不会误匹配嵌套在 if/else 或其他子块中的关键词。

                Returns:
                    list of (name, block_start, block_end):
                    - name: flavor 名称
                    - block_start: flavor 名称在 text 中的起始位置
                    - block_end: flavor 右大括号 } 在 text 中的位置（指向 } 本身）
                """
                result = []
                # 找到 productFlavors 的开始 {
                idx = pf_start_idx
                while idx < pf_end_idx and text[idx] != '{':
                    idx += 1
                if idx >= pf_end_idx:
                    return result
                idx += 1  # 跳过 {

                while idx < pf_end_idx:
                    # 跳过空白字符
                    while idx < pf_end_idx and text[idx] in ' \t\n\r':
                        idx += 1
                    if idx >= pf_end_idx or text[idx] == '}':
                        break  # productFlavors 块结束

                    # 跳过单行注释
                    if idx + 1 < pf_end_idx and text[idx] == '/' and text[idx + 1] == '/':
                        while idx < pf_end_idx and text[idx] != '\n':
                            idx += 1
                        continue

                    # 跳过多行注释
                    if idx + 1 < pf_end_idx and text[idx] == '/' and text[idx + 1] == '*':
                        idx += 2
                        while idx + 1 < pf_end_idx and not (text[idx] == '*' and text[idx + 1] == '/'):
                            idx += 1
                        idx += 2
                        continue

                    # 尝试读取标识符
                    if text[idx].isalpha() or text[idx] == '_':
                        name_start = idx
                        while idx < pf_end_idx and (text[idx].isalnum() or text[idx] == '_'):
                            idx += 1
                        name = text[name_start:idx]

                        # 跳过空白
                        while idx < pf_end_idx and text[idx] in ' \t\n\r':
                            idx += 1

                        if idx < pf_end_idx and text[idx] == '{':
                            # 这是一个块，使用计数器找到其完整结束位置
                            bc = 1
                            idx += 1  # 跳过 {
                            while idx < pf_end_idx and bc > 0:
                                if text[idx] == '{':
                                    bc += 1
                                elif text[idx] == '}':
                                    bc -= 1
                                idx += 1
                            block_end = idx  # idx 在 } 后一位

                            # 排除非 flavor 的关键词
                            if name not in ['flavorDimensions', 'dimension']:
                                result.append((name, name_start, block_end - 1))  # block_end - 1 指向 }
                        else:
                            # 不是块，跳到行尾
                            while idx < pf_end_idx and text[idx] != '\n':
                                idx += 1
                    else:
                        # 非标识符字符，跳到下一行
                        while idx < pf_end_idx and text[idx] != '\n':
                            idx += 1
                        if idx < pf_end_idx:
                            idx += 1

                return result

            flavors_info = find_top_level_flavors(content, productflavors_idx, pf_end)
            log("INFO", f"找到的 flavor 块: {[f[0] for f in flavors_info]}")

            # 从后往前处理每个 flavor，避免位置偏移
            for flavor_name, flavor_start, flavor_end in reversed(flavors_info):
                # flavor_end 指向 flavor 块的 } 位置

                # 先删除旧的 signApiUrl 代码
                flavor_content = content[flavor_start:flavor_end]
                if "signApiUrl" in flavor_content:
                    # 删除所有旧的 ext { signApiUrl = ... } 块
                    # 匹配有无 project. 前缀的两种格式
                    # 注意：不能用尾部 \s* ，否则会吃掉下一行（闭合大括号）的缩进
                    old_ext_pattern = r'\n?[ \t]*ext\s*\{[^}]*?signApiUrl[^}]*?\}[ \t]*'
                    new_flavor_content = re.sub(old_ext_pattern, '', flavor_content, flags=re.DOTALL)
                    if new_flavor_content != flavor_content:
                        content = content[:flavor_start] + new_flavor_content + content[flavor_end:]
                        # 重新计算 flavor_end
                        diff = len(new_flavor_content) - len(flavor_content)
                        flavor_end += diff
                        log("INFO", f"删除 flavor {flavor_name} 中旧的 signApiUrl 代码")

                # 检查并添加 signingConfig signingConfigs.debug（如果不存在）
                # 这是为了解决 Android Studio 无法直接运行某些 variant 的问题
                # 原因：AGP 在某些 flavor 组合下无法正确继承 buildTypes 的签名配置
                flavor_content = content[flavor_start:flavor_end]
                if "signingConfig" not in flavor_content:
                    # 找到 dimension 行之后插入 signingConfig
                    dimension_match = re.search(r'dimension\s+["\'][^"\']+["\']', flavor_content)
                    if dimension_match:
                        # 在 dimension 行后插入
                        insert_pos = flavor_start + dimension_match.end()
                        signing_code = f'\n            signingConfig signingConfigs.debug'
                        content = content[:insert_pos] + signing_code + content[insert_pos:]
                        flavor_end += len(signing_code)
                        log("INFO", f"为 flavor {flavor_name} 添加 signingConfig signingConfigs.debug")
                    else:
                        # 没有 dimension 行，在 flavor 块开头的 { 后插入
                        first_brace = content.find("{", flavor_start)
                        if first_brace != -1 and first_brace < flavor_end:
                            first_newline = content.find("\n", first_brace)
                            if first_newline != -1 and first_newline < flavor_end:
                                signing_code = f'\n            signingConfig signingConfigs.debug'
                                content = content[:first_newline + 1] + signing_code + content[first_newline + 1:]
                                flavor_end += len(signing_code)
                                log("INFO", f"为 flavor {flavor_name} 添加 signingConfig signingConfigs.debug")

                # 根据 flavor 名称判断使用哪个 URL（直接内联URL字符串）
                if "debug" in flavor_name.lower() or "stage" in flavor_name.lower():
                    url_code = f'\n            ext {{\n                signApiUrl = "{STAGE_SIGN_API_URL_VALUE}"\n            }}\n'
                else:
                    url_code = f'\n            ext {{\n                signApiUrl = "{RELEASE_SIGN_API_URL_VALUE}"\n            }}\n'

                # 在 flavor 块的 } 所在行之前插入，保留 } 的缩进
                # 找到 flavor_end 所在行的起始位置
                line_start = flavor_end
                while line_start > 0 and content[line_start - 1] != '\n':
                    line_start -= 1
                content = content[:line_start] + url_code + content[line_start:]

        # 7. 在文件末尾添加签名任务代码（先删除旧代码，再添加新代码）
        # 查找并删除旧的构建时间统计和签名任务代码块
        import re
        if "APK签名任务" in content and ("def loadEnvConfig()" in content or "def loadConfigFromFile(" in content or "def getSignToken()" in content):
            # 先删除构建时间统计代码（如果存在）
            build_time_start = content.find("// ============================================\n// 构建时间统计")
            if build_time_start != -1:
                # 找到 gradle.buildFinished 块的结束位置
                build_finished_start = content.find("gradle.buildFinished", build_time_start)
                if build_finished_start != -1:
                    # 找到 buildFinished 块的结束大括号
                    brace_count = 0
                    start_found = False
                    for i in range(build_finished_start, len(content)):
                        if content[i] == '{':
                            start_found = True
                            brace_count += 1
                        elif content[i] == '}':
                            brace_count -= 1
                            if start_found and brace_count == 0:
                                # 找到 buildFinished 块结束位置
                                build_time_end = i + 1
                                # 跳过后续的空行
                                while build_time_end < len(content) and content[build_time_end] in '\n\r ':
                                    build_time_end += 1
                                log("INFO", "删除旧的构建时间统计代码")
                                content = content[:build_time_start] + content[build_time_end:]
                                break

            # 删除旧的签名任务代码块
            sign_task_start = content.find("// ============================================\n// APK签名任务")
            if sign_task_start != -1:
                # 从开始位置向后查找，找到代码块的结束
                # 签名任务代码包含 afterEvaluate 块，需要找到匹配的结束大括号
                brace_count = 0
                start_found = False
                search_from = content.find("afterEvaluate", sign_task_start)
                if search_from != -1:
                    for i in range(search_from, len(content)):
                        if content[i] == '{':
                            start_found = True
                            brace_count += 1
                        elif content[i] == '}':
                            brace_count -= 1
                            if start_found and brace_count == 0:
                                # 找到代码块结束位置
                                sign_task_end = i + 1
                                # 查找下一个非空行，确定完整结束位置
                                while sign_task_end < len(content) and content[sign_task_end] in '\n\r ':
                                    sign_task_end += 1
                                log("INFO", "删除旧的签名任务代码")
                                content = content[:sign_task_start] + content[sign_task_end:]
                                break

        # 在 dependencies 块后添加新代码
        dependencies_idx = content.find("dependencies {")
        if dependencies_idx == -1:
            # 直接在文件末尾添加
            if content.rstrip().endswith("}"):
                # 在最后一个 } 前插入
                last_brace = content.rfind("}")
                content = content[:last_brace] + "\n}" + signing_task_code
            else:
                content += signing_task_code
        else:
            # 找到 dependencies 块的结束
            brace_count = 0
            start_found = False
            dep_end = 0
            for i in range(dependencies_idx, len(content)):
                if content[i] == '{':
                    start_found = True
                    brace_count += 1
                elif content[i] == '}':
                    brace_count -= 1
                    if start_found and brace_count == 0:
                        dep_end = i + 1
                        break

            if dep_end > 0:
                content = content[:dep_end] + signing_task_code + content[dep_end:]

        # 写回文件
        with open(build_file, "w", encoding="utf-8") as f:
            f.write(content)

        log("SUCCESS", f"更新 {build_file.relative_to(project_root)}")
        return True

    except FileNotFoundError as e:
        log("ERROR", f"文件不存在: {build_file}")
        return False
    except PermissionError as e:
        log("ERROR", f"没有权限写入文件: {build_file}")
        return False
    except Exception as e:
        log("ERROR", f"更新 app/build.gradle 失败: {e}")
        import traceback
        traceback.print_exc()
        return False

