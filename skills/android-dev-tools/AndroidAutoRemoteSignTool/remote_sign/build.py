#!/usr/bin/env python3
"""
Gradle wrapper with auto JDK 11 configuration
Run this script instead of gradlew.bat
"""

import os
import sys
import subprocess
import platform
import re
from pathlib import Path


def ensure_debug_keystore():
    """确保 debug.keystore 存在，如果不存在则自动生成

    Returns:
        bool: True 如果 keystore 存在或成功生成，False 如果生成失败
    """
    user_home = Path.home()
    android_dir = user_home / ".android"
    keystore_file = android_dir / "debug.keystore"

    if keystore_file.exists():
        return True

    print("\n" + "=" * 50)
    print("检测到缺少 debug.keystore 文件")
    print("=" * 50)
    print(f"目标路径: {keystore_file}")
    print("正在自动生成...")

    # 确保 .android 目录存在
    android_dir.mkdir(parents=True, exist_ok=True)

    # 使用 keytool 生成 debug.keystore
    # 参数与 Android SDK 默认生成的保持一致
    keytool_cmd = [
        "keytool",
        "-genkey",
        "-v",
        "-keystore", str(keystore_file),
        "-storepass", "android",
        "-alias", "androiddebugkey",
        "-keypass", "android",
        "-keyalg", "RSA",
        "-keysize", "2048",
        "-validity", "10000",
        "-dname", "CN=Android Debug,O=Android,C=US"
    ]

    try:
        result = subprocess.run(
            keytool_cmd,
            capture_output=True,
            text=True,
            timeout=60
        )

        if result.returncode == 0:
            print(f"成功生成 debug.keystore: {keystore_file}")
            return True
        else:
            print(f"生成失败: {result.stderr}")
            return False
    except FileNotFoundError:
        print("错误: 未找到 keytool 命令")
        print("请确保已安装 JDK 并配置了 JAVA_HOME 环境变量")
        return False
    except subprocess.TimeoutExpired:
        print("错误: keytool 执行超时")
        return False
    except Exception as e:
        print(f"错误: {e}")
        return False


def get_java_version(java_path):
    """Get the major version of Java"""
    try:
        result = subprocess.run(
            [str(java_path), "-version"],
            capture_output=True,
            text=True,
            timeout=10
        )
        output = result.stderr or result.stdout

        match = re.search(r'version\s+"?(\d+)', output)
        if match:
            major = int(match.group(1))
            if major == 1:
                match = re.search(r'version\s+"1\.(\d+)', output)
                if match:
                    return int(match.group(1))
            return major
        return 0
    except Exception:
        return 0


def get_local_java_home():
    """Get org.gradle.java.home from local.properties"""
    # build.py is in scripts/, so parent.parent is the project root
    project_dir = Path(__file__).parent.parent
    props_file = project_dir / "local.properties"

    if not props_file.exists():
        return None

    with open(props_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("org.gradle.java.home="):
                value = line.split("=", 1)[1].strip()
                # Unescape Windows paths
                value = value.replace("\\\\", "\\")
                return Path(value)
    return None


def get_sdk_dir():
    """Get sdk.dir from local.properties"""
    project_dir = Path(__file__).parent.parent
    props_file = project_dir / "local.properties"

    if not props_file.exists():
        return None

    with open(props_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("sdk.dir="):
                value = line.split("=", 1)[1].strip()
                # Unescape Windows paths
                value = value.replace("\\\\", "\\")
                sdk_path = Path(value)
                # 验证 SDK 路径是否存在
                if sdk_path.exists() and (sdk_path / "platforms").exists():
                    return sdk_path
    return None


def get_local_properties():
    """Get all properties from local.properties as dict"""
    project_dir = Path(__file__).parent.parent
    props_file = project_dir / "local.properties"

    if not props_file.exists():
        return {}

    props = {}
    with open(props_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                key, value = line.split("=", 1)
                props[key.strip()] = value.strip().replace("\\\\", "\\")
    return props


def find_jdk_11():
    """Search for JDK 11 in common locations"""
    user_home = Path.home()
    system = platform.system()
    jdk_paths = []

    if system == "Windows":
        program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
        program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        local_app_data = os.environ.get("LOCALAPPDATA", os.path.join(user_home, "AppData", "Local"))

        search_dirs = [
            Path(program_files) / "Java",
            Path(program_files) / "Amazon Corretto",
            Path(program_files) / "Eclipse Adoptium",
            Path(program_files) / "Semeru",
            Path(program_files) / "Microsoft",
            Path(program_files_x86) / "Java",
            Path(local_app_data) / "Android" / "Sdk" / "jbr",
            user_home / ".jdks",
        ]
        exe_name = "java.exe"
    elif system == "Darwin":
        search_dirs = [
            Path("/Library/Java/JavaVirtualMachines"),
            user_home / "Library" / "Java" / "JavaVirtualMachines",
            user_home / ".jdks",
        ]
        exe_name = "java"
    else:
        search_dirs = [
            Path("/usr/lib/jvm"),
            user_home / ".jdks",
        ]
        exe_name = "java"

    for base_dir in search_dirs:
        if not base_dir.exists():
            continue

        try:
            for item in base_dir.iterdir():
                if not item.is_dir():
                    continue

                name = item.name.lower()
                if not any(x in name for x in ["jdk-11", "jdk11", "11.0", "corretto-11", "temurin-11", "zulu-11"]):
                    continue

                jdk_dir = item
                if system == "Darwin":
                    contents_home = item / "Contents" / "Home"
                    if contents_home.exists():
                        jdk_dir = contents_home

                java_exe = jdk_dir / "bin" / exe_name
                if java_exe.exists():
                    ver = get_java_version(java_exe)
                    if ver == 11:
                        jdk_paths.append(jdk_dir)
        except Exception:
            pass

    return jdk_paths[0] if jdk_paths else None


def find_android_sdk():
    """Find Android SDK path in common locations"""
    user_home = Path.home()
    system = platform.system()

    # Check ANDROID_SDK_ROOT environment variable first
    env_sdk = os.environ.get("ANDROID_SDK_ROOT") or os.environ.get("ANDROID_HOME")
    if env_sdk and Path(env_sdk).exists():
        return Path(env_sdk)

    # Common search paths
    if system == "Windows":
        local_app_data = os.environ.get("LOCALAPPDATA", os.path.join(user_home, "AppData", "Local"))
        search_dirs = [
            Path(local_app_data) / "Android" / "Sdk",
        ]
    elif system == "Darwin":
        search_dirs = [
            user_home / "Library" / "Android" / "sdk",
        ]
    else:
        search_dirs = [
            user_home / "Android" / "Sdk",
        ]

    for sdk_dir in search_dirs:
        if sdk_dir.exists() and (sdk_dir / "platforms").exists():
            return sdk_dir

    return None


def main():
    print("=" * 50)
    print("Gradle Build with Auto JDK Configuration")
    print("=" * 50)

    # Get project root directory (scripts/parent)
    project_dir = Path(__file__).parent.parent

    # 首先确保 debug.keystore 存在
    if not ensure_debug_keystore():
        print("\n警告: 无法生成 debug.keystore，构建可能会失败")

    # 检查 local.properties 是否存在且配置了 sdk.dir
    sdk_dir = get_sdk_dir()
    if not sdk_dir:
        print("\n" + "=" * 50)
        print("ERROR: Android SDK 未配置!")
        print("=" * 50)
        print("\n请先在 Android Studio 中打开并编译此项目，Android Studio 会自动")
        print("配置 local.properties 文件。")
        print("\n或者手动配置 local.properties 文件：")
        print("  1. 在项目根目录创建 local.properties 文件")
        print("  2. 添加以下内容（根据实际路径修改）：")
        print('     sdk.dir=C\\:\\Users\\YourName\\AppData\\Local\\Android\\Sdk')
        print("\n配置完成后再运行此脚本。")
        print("=" * 50)
        return 1

    print(f"\nAndroid SDK: {sdk_dir}")

    # First, check if local.properties has configured JDK
    local_java_home = get_local_java_home()

    if local_java_home:
        # Verify the configured JDK is version 11
        ver = get_java_version(local_java_home / "bin" / "java")
        if ver == 11:
            print(f"Using configured JDK 11: {local_java_home}")
            # Set JAVA_HOME for this process
            os.environ["JAVA_HOME"] = str(local_java_home)
        else:
            print(f"\nConfigured JDK version is {ver}, resetting...")
            local_java_home = None

    if not local_java_home:
        # Check current Java version
        current_ver = get_java_version("java")
        java_home = os.environ.get("JAVA_HOME", "Unknown")

        print(f"\nCurrent Java version: {current_ver}")
        print(f"JAVA_HOME: {java_home}")
        print(f"Required: JDK 11")

        if current_ver != 11:
            print("\nSearching for JDK 11...")

            jdk11_path = find_jdk_11()

            if not jdk11_path:
                print("\n" + "=" * 50)
                print("ERROR: JDK 11 not found!")
                print("=" * 50)
                print("\nPlease install JDK 11 and configure JAVA_HOME environment variable:")
                print("\n1. Download JDK 11:")
                print("   https://docs.aws.amazon.com/corretto/latest/corretto-11-ug/downloads-list.html")
                print("\n2. Configure JAVA_HOME:")
                print("   - Set JAVA_HOME to JDK installation path")
                print("   - Add %JAVA_HOME%\\bin to PATH")
                print("\n3. Verify installation:")
                print("   java -version")
                print("=" * 50)
                return 1

            print(f"Found JDK 11 at: {jdk11_path}")
            os.environ["JAVA_HOME"] = str(jdk11_path)
        else:
            print("Java version check passed!")

    # Run Gradle with original arguments
    print("\n" + "=" * 50)
    print("Running Gradle...")
    print("=" * 50)

    # Determine gradle command
    if platform.system() == "Windows":
        gradle_cmd = project_dir / "gradlew.bat"
        args = [str(gradle_cmd)] + sys.argv[1:]
        result = subprocess.run(args, cwd=project_dir, shell=False)
    else:
        gradle_cmd = project_dir / "gradlew"
        args = [str(gradle_cmd)] + sys.argv[1:]
        result = subprocess.run(args, cwd=project_dir)

    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
