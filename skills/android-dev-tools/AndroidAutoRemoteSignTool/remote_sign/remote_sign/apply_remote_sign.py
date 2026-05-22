#!/usr/bin/env python3
"""
Android项目远程签名自动配置脚本
自动修改项目文件以集成远程签名功能

使用方式:
    python apply_remote_sign.py --project-path "D:/MyAndroidProject"
    python apply_remote_sign.py -p "D:/MyAndroidProject"
    python apply_remote_sign.py -p "D:/MyAndroidProject" --modules app_d,app_link
"""

import os
import sys
import shutil
import argparse
from pathlib import Path


def log(level: str, message: str):
    """输出日志"""
    prefix = {
        "INFO": "[INFO]",
        "WARN": "[WARN]",
        "ERROR": "[ERROR]",
        "SUCCESS": "[SUCCESS]"
    }
    print(f"{prefix.get(level, '[INFO]')} {message}")


def get_script_dir() -> Path:
    """获取脚本所在目录"""
    return Path(__file__).parent


def get_project_root(args_path: str = None) -> Path:
    """获取项目根目录

    Args:
        args_path: 命令行参数指定的项目路径

    Returns:
        项目根目录的 Path 对象
    """
    if args_path:
        return Path(args_path).resolve()
    # 默认行为：脚本所在目录的父目录
    return Path(__file__).parent.parent.resolve()


def create_env_example(project_root: Path) -> bool:
    """创建 .env.example 文件"""
    env_file = project_root / ".env.example"
    content = """# APK签名服务配置
# 签名服务的Bearer Token
SIGN_TOKEN=your_sign_token_here
"""
    try:
        with open(env_file, "w", encoding="utf-8") as f:
            f.write(content)
        log("SUCCESS", f"创建 {env_file.relative_to(project_root)}")
        return True
    except Exception as e:
        log("ERROR", f"创建 .env.example 失败: {e}")
        return False


def update_gitignore(project_root: Path) -> bool:
    """更新 .gitignore 文件"""
    gitignore_file = project_root / ".gitignore"

    # 需要添加的内容
    additions = [
        ".claude",
        ".vscode",
        ".env",
        "nul"
    ]

    # 需要移除的内容（原来的配置）
    removals_patterns = [
        ".idea/",
        "/.idea/caches",
        "/.idea/libraries",
        "/.idea/modules.xml",
        "/.idea/workspace.xml",
        "/.idea/navEditor.xml",
        "/.idea/assetWizardSettings.xml",
        ".idea/misc.xml",
        ".idea/deploymentTargetDropDown.xml"
    ]

    try:
        if gitignore_file.exists():
            with open(gitignore_file, "r", encoding="utf-8") as f:
                lines = f.readlines()

            # 重写 .gitignore
            new_lines = [
                "*.iml\n",
                ".gradle\n",
                ".claude\n",
                ".idea\n",
                ".vscode\n",
                "/local.properties\n",
                ".DS_Store\n",
                "/build\n",
                "/captures\n",
                ".externalNativeBuild\n",
                ".cxx\n",
                "local.properties\n",
                ".env\n",
                "nul\n"
            ]

            with open(gitignore_file, "w", encoding="utf-8") as f:
                f.writelines(new_lines)
        else:
            # 创建新的 .gitignore
            with open(gitignore_file, "w", encoding="utf-8") as f:
                f.writelines([
                    "*.iml\n",
                    ".gradle\n",
                    ".claude\n",
                    ".idea\n",
                    ".vscode\n",
                    "/local.properties\n",
                    ".DS_Store\n",
                    "/build\n",
                    "/captures\n",
                    ".externalNativeBuild\n",
                    ".cxx\n",
                    "local.properties\n",
                    ".env\n",
                    "nul\n"
                ])

        log("SUCCESS", f"更新 {gitignore_file.relative_to(project_root)}")
        return True
    except Exception as e:
        log("ERROR", f"更新 .gitignore 失败: {e}")
        return False


def update_gradle_properties(project_root: Path) -> bool:
    """更新 gradle.properties 文件"""
    props_file = project_root / "gradle.properties"

    additions = """
# 解决 AGP 7.0.x 资源合并的 NullPointerException 问题
android.nonTransitiveRClass=false
android.nonFinalResIds=false
# 禁用 Gradle 缓存以避免资源合并问题
org.gradle.caching=false
# 禁用增量 AAPT2 编译
android.enableAapt2=true
android.enableIncrementalResourceProcessing=false
# 禁用资源命名空间
android.disableResourceValidation=true
"""

    try:
        content = ""
        if props_file.exists():
            with open(props_file, "r", encoding="utf-8") as f:
                content = f.read()

        # 检查是否已经包含这些配置
        if "android.nonTransitiveRClass" in content:
            log("INFO", "gradle.properties 已包含签名配置，跳过")
            return True

        # 确保文件以换行符结尾
        if content and not content.endswith("\n"):
            content += "\n"

        with open(props_file, "w", encoding="utf-8") as f:
            f.write(content + additions)

        log("SUCCESS", f"更新 {props_file.relative_to(project_root)}")
        return True
    except Exception as e:
        log("ERROR", f"更新 gradle.properties 失败: {e}")
        return False


def update_app_build_gradle(project_root: Path, module_name: str = "app") -> bool:
    """更新指定模块的 build.gradle 或 build.gradle.kts 文件

    自动检测 Groovy DSL 或 Kotlin DSL，调用对应的处理模块。

    Args:
        project_root: 项目根目录
        module_name: 模块名称，默认 "app"

    Returns:
        是否成功
    """
    kts_file = project_root / module_name / "build.gradle.kts"
    groovy_file = project_root / module_name / "build.gradle"

    if kts_file.exists():
        log("INFO", f"检测到 Kotlin DSL: {kts_file.name}")
        from apply_kts_sign import update_app_build_gradle_kts
        return update_app_build_gradle_kts(project_root, module_name)
    elif groovy_file.exists():
        log("INFO", f"检测到 Groovy DSL: {groovy_file.name}")
        from apply_groovy_sign import update_app_build_gradle_groovy
        return update_app_build_gradle_groovy(project_root, module_name)
    else:
        log("ERROR", f"未找到 {module_name}/build.gradle 或 {module_name}/build.gradle.kts")
        return False



def create_scripts(project_root: Path, script_dir: Path) -> bool:
    """从脚本所在目录复制运行时脚本文件到目标项目的 scripts/ 目录

    Args:
        project_root: 目标 Android 项目根目录
        script_dir: 当前脚本所在目录

    Returns:
        是否成功
    """
    scripts_dir = project_root / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)

    # 脚本文件列表（从 remote_sign/ 复制到 scripts/）
    script_files = [
        "sign_apk.py",
        "build.py"
    ]

    try:
        for script_name in script_files:
            source_file = script_dir / script_name
            target_file = scripts_dir / script_name

            if not source_file.exists():
                log("ERROR", f"源文件不存在: {source_file}")
                return False

            # 复制文件
            shutil.copy2(source_file, target_file)
            log("SUCCESS", f"复制 {script_name} 到 scripts/")

        return True
    except Exception as e:
        log("ERROR", f"创建脚本文件失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """主函数"""
    # 解析命令行参数
    parser = argparse.ArgumentParser(
        description="Android项目远程签名自动配置工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用示例:
  python apply_remote_sign.py --project-path "D:/MyAndroidProject"
  python apply_remote_sign.py -p "/home/user/android/project"
  python apply_remote_sign.py -p "/home/user/android/project" --modules app_d,app_link
  python apply_remote_sign.py --help

注意事项:
  - 目标项目必须包含 app/build.gradle 或 app/build.gradle.kts 文件
  - 自动检测 Groovy DSL (.gradle) 或 Kotlin DSL (.gradle.kts)
  - 使用 --modules 参数可为额外模块配置远程签名（如 app_d,app_link）
  - 脚本会自动创建 scripts/ 目录并复制必要的文件
  - 配置完成后需要手动创建 .env 文件并填入 SIGN_TOKEN
        """
    )
    parser.add_argument(
        "-p", "--project-path",
        type=str,
        help="Android 项目根目录的绝对路径或相对路径"
    )
    parser.add_argument(
        "-m", "--modules",
        type=str,
        default="",
        help="额外需要配置远程签名的模块名称，多个模块用逗号分隔（例如: app_d,app_link）"
    )

    args = parser.parse_args()

    print("=" * 60)
    print("Android项目远程签名自动配置工具")
    print("=" * 60)

    # 获取项目根目录
    project_root = get_project_root(args.project_path)
    log("INFO", f"目标项目路径: {project_root}")

    # 获取脚本所在目录
    script_dir = get_script_dir()

    # 检查这是否是一个有效的 Android 项目（支持 Groovy DSL 和 Kotlin DSL）
    build_gradle_path = project_root / "app" / "build.gradle"
    build_gradle_kts_path = project_root / "app" / "build.gradle.kts"
    app_exists = build_gradle_path.exists() or build_gradle_kts_path.exists()

    # 解析用户指定的模块
    extra_modules = [
        m.strip() for m in args.modules.split(",") if m.strip()
    ] if args.modules else []

    # 如果没有 app 模块且用户没有指定模块，提示用户
    if not app_exists and not extra_modules:
        log("ERROR", "未找到 app 模块")
        log("ERROR", f"未找到: {build_gradle_path} 或 {build_gradle_kts_path}")
        log("INFO", "请使用 --modules 参数指定要配置的模块，例如: --modules WidgetEngraving")
        return 1

    # 确定要处理的模块列表
    if extra_modules:
        # 用户指定了模块，只处理用户指定的模块
        all_modules = extra_modules
    else:
        # 用户没有指定，默认处理 app 模块
        all_modules = ["app"]

    # 检测第一个模块的 DSL 类型
    first_module = all_modules[0]
    first_gradle_path = project_root / first_module / "build.gradle"
    first_gradle_kts_path = project_root / first_module / "build.gradle.kts"
    if not first_gradle_path.exists() and not first_gradle_kts_path.exists():
        log("ERROR", f"未找到模块 {first_module} 的 build.gradle 文件")
        return 1

    dsl_type = "Kotlin DSL (.kts)" if first_gradle_kts_path.exists() else "Groovy DSL (.gradle)"
    log("INFO", f"检测到项目类型: {dsl_type}")

    print("\n开始配置...")

    # 1. 创建 .env.example
    print("\n[1/5] 创建 .env.example 文件...")
    if not create_env_example(project_root):
        return 1

    # 2. 更新 .gitignore
    print("\n[2/5] 更新 .gitignore 文件...")
    if not update_gitignore(project_root):
        return 1

    # 3. 更新 gradle.properties
    print("\n[3/5] 更新 gradle.properties 文件...")
    if not update_gradle_properties(project_root):
        return 1

    # 4. 更新模块的 build.gradle
    total_modules = len(all_modules)

    for idx, module_name in enumerate(all_modules, start=1):
        print(f"\n[4/5] ({idx}/{total_modules}) 更新 {module_name}/build.gradle(.kts) 文件...")
        if not update_app_build_gradle(project_root, module_name):
            log("WARN", f"模块 {module_name} 配置失败，继续处理其他模块")

    # 5. 从脚本目录复制运行时脚本到目标项目的 scripts/
    print("\n[5/5] 复制脚本文件到 scripts/ 目录...")
    if not create_scripts(project_root, script_dir):
        return 1

    print("\n" + "=" * 60)
    print("配置完成!")
    print("=" * 60)
    print(f"\n项目类型: {dsl_type}")
    print("\n" + "-" * 40)
    print("SIGN_TOKEN 读取优先级（自动依次查找）:")
    print("  1. 项目根目录 .env 文件")
    print("  2. 项目根目录的上级目录 .env 文件")
    print("  3. 系统环境变量")
    print("\n" + "-" * 40)
    print("配置 SIGN_TOKEN（三选一）:")
    print("\n  方式一：在项目根目录创建 .env 文件（推荐）")
    if os.name == 'nt':  # Windows
        print(f"    copy {project_root}\\.env.example {project_root}\\.env")
    else:  # Unix-like
        print(f"    cp {project_root}/.env.example {project_root}/.env")
    print("    # 编辑 .env 文件，填入签名服务 Token:")
    print("    SIGN_TOKEN=your_actual_token_here")
    print("\n  方式二：在上级目录创建 .env 文件（多项目共享 Token）")
    print(f"    # 在 {project_root.parent}/.env 中添加:")
    print("    SIGN_TOKEN=your_actual_token_here")
    print("\n  方式三：使用系统环境变量（适合 CI/CD 或终端命令行构建）")
    if os.name == 'nt':  # Windows
        print("    set SIGN_TOKEN=your_actual_token_here")
    else:  # Unix-like
        print("    export SIGN_TOKEN=your_actual_token_here")
    print("    # 或添加到 ~/.zshrc / ~/.bashrc 中永久生效")
    print("    # 注意：macOS 从 Dock 启动的 Android Studio 无法读取 shell 环境变量")
    print("\n" + "-" * 40)
    print("确保 Python 已安装 requests 库（在任意目录执行）:")
    print("   pip install requests")
    print("   # macOS Homebrew Python 如果报错，使用:")
    print("   pip install --break-system-packages requests")
    print("\n" + "-" * 40)
    print("构建项目（自动签名）:")
    print(f"   cd {project_root}")
    print("   python scripts/build.py assembleStageEnvDebug")
    print("\n   或在 Android Studio 中直接构建即可自动签名")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
