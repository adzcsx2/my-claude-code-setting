#!/usr/bin/env python3
"""
APK签名脚本 (Gradle调用版本)
用于Gradle构建后自动上传APK并获取签名后的文件
"""

import os
import sys
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path
import json


# 签名服务配置（默认值，可通过命令行参数覆盖）
SIGN_API_URL = "https://public-service.vertu.cn/android/apk/sign"


def log(level: str, message: str):
    """输出日志"""
    prefix = {
        "INFO": "[INFO]",
        "WARN": "[WARN]",
        "ERROR": "[ERROR]",
        "SUCCESS": "[SUCCESS]"
    }
    print(f"{prefix.get(level, '[INFO]')} {message}")


def sign_apk(unsigned_apk_path: str, signed_apk_path: str, token: str, sign_api_url: str = None) -> bool:
    """
    上传APK进行签名并下载签名后的文件

    Args:
        unsigned_apk_path: 未签名APK路径
        signed_apk_path: 签名后APK保存路径
        token: 签名服务Token
        sign_api_url: 签名服务URL（可选，默认使用 SIGN_API_URL）

    Returns:
        bool: 是否成功
    """
    url = sign_api_url or SIGN_API_URL
    log("INFO", "========================================")
    log("INFO", "APK签名流程开始")
    log("INFO", "========================================")

    # 验证输入文件
    unsigned_apk = Path(unsigned_apk_path)
    if not unsigned_apk.exists():
        log("ERROR", f"未签名APK文件不存在: {unsigned_apk_path}")
        return False

    file_size_mb = unsigned_apk.stat().st_size / 1024 / 1024
    log("INFO", f"未签名APK: {unsigned_apk.name} ({file_size_mb:.2f} MB)")
    log("INFO", f"签名后保存: {Path(signed_apk_path).name}")

    # 准备请求
    headers = {
        "Authorization": f"Bearer {token}"
    }

    log("INFO", f"签名服务URL: {url}")
    log("INFO", "正在上传APK...")

    try:
        # 读取APK文件
        with open(unsigned_apk, "rb") as f:
            apk_data = f.read()

        # 构建multipart/form-data请求
        boundary = "----GradleAPKSignerBoundary"
        body_parts = []

        # 添加sign字段
        body_parts.append(f"--{boundary}".encode())
        body_parts.append(b'Content-Disposition: form-data; name="sign"')
        body_parts.append(b"")
        body_parts.append(b"app")

        # 添加apk文件
        filename = unsigned_apk.name
        body_parts.append(f"--{boundary}".encode())
        body_parts.append(f'Content-Disposition: form-data; name="apk"; filename="{filename}"'.encode())
        body_parts.append(b"Content-Type: application/vnd.android.package-archive")
        body_parts.append(b"")
        body_parts.append(apk_data)

        # 结束边界
        body_parts.append(f"--{boundary}--".encode())
        body_parts.append(b"")

        # 组合请求体
        body = b"\r\n".join(body_parts)

        # 更新headers
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"

        # 发送请求
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")

        with urllib.request.urlopen(req, timeout=300) as response:
            log("INFO", "上传成功，正在下载签名后的APK...")
            content_type = response.headers.get("Content-Type", "")
            log("INFO", f"响应Content-Type: {content_type}")

            # 读取响应数据
            signed_data = response.read()

            # 检查是否是JSON响应（错误响应）
            if b"application/json" in content_type.encode() or signed_data.startswith(b"{"):
                try:
                    result = json.loads(signed_data.decode())
                    log("ERROR", f"签名服务返回错误: {json.dumps(result, indent=2, ensure_ascii=False)}")
                    return False
                except (json.JSONDecodeError, UnicodeDecodeError):
                    pass

            # 保存签名后的APK
            signed_path = Path(signed_apk_path)
            signed_path.parent.mkdir(parents=True, exist_ok=True)

            with open(signed_path, "wb") as f:
                f.write(signed_data)

            signed_size_mb = len(signed_data) / 1024 / 1024
            log("INFO", f"签名APK大小: {signed_size_mb:.2f} MB")

            log("SUCCESS", "========================================")
            log("SUCCESS", "APK签名成功!")
            log("SUCCESS", "========================================")
            return True

    except urllib.error.HTTPError as e:
        log("ERROR", f"HTTP错误: {e.code} - {e.reason}")
        try:
            error_body = e.read().decode()
            log("ERROR", f"错误详情: {error_body}")
        except (UnicodeDecodeError, OSError):
            pass
        return False

    except urllib.error.URLError as e:
        log("ERROR", f"网络错误: {e.reason}")
        return False

    except Exception as e:
        log("ERROR", f"未知错误: {type(e).__name__}: {str(e)}")
        return False


def main():
    """主函数"""
    if len(sys.argv) < 4:
        log("ERROR", "用法: python sign_apk.py <unsigned_apk> <signed_apk> <token> [sign_api_url]")
        sys.exit(1)

    unsigned_apk = sys.argv[1]
    signed_apk = sys.argv[2]
    token = sys.argv[3]
    sign_api_url = sys.argv[4] if len(sys.argv) > 4 else None

    success = sign_apk(unsigned_apk, signed_apk, token, sign_api_url)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
