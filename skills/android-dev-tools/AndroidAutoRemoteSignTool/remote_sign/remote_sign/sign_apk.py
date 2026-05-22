#!/usr/bin/env python3
"""
APK V1+V2 远程签名工具 (Gradle调用版本)
======================================
合并 V1 (JAR) 和 V2 签名逻辑，通过远程 API 完成签名。
客户端只发送摘要(32字节)，服务端返回签名数据，本地组装最终 APK。

用法: python sign_apk.py <unsigned_apk> <signed_apk> <token> [base_api_url]
"""

import hashlib
import base64
import zipfile
import struct
import zlib
import io
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("[ERROR] 需要安装 requests 库: pip install requests")
    sys.exit(1)


# ============================================================
# 签名服务配置（默认值，可通过命令行参数覆盖）
# ============================================================

DEFAULT_BASE_URL = "https://public-service.vertu.cn/android/apk"
DEFAULT_SIGN_NAME = "app"


def log(level: str, message: str):
    """输出日志"""
    prefix = {
        "INFO": "[INFO]",
        "WARN": "[WARN]",
        "ERROR": "[ERROR]",
        "SUCCESS": "[SUCCESS]"
    }
    print(f"{prefix.get(level, '[INFO]')} {message}")


# ============================================================
# 常量
# ============================================================

# V2 相关
APK_SIG_BLOCK_MAGIC = b"APK Sig Block 42"
APK_SIGNATURE_SCHEME_V2_BLOCK_ID = 0x7109871a
VERITY_PADDING_BLOCK_ID = 0x42726577
SIG_ALG_RSA_PKCS1_V1_5_WITH_SHA256 = 0x0103
CHUNK_SIZE = 1024 * 1024  # 1 MB

# ZIP
EOCD_SIGNATURE = b'\x50\x4b\x05\x06'


# ============================================================
# ZIP / APK 解析工具
# ============================================================

def find_eocd(data: bytes) -> int:
    """查找 EOCD 记录偏移量。"""
    pos = len(data) - 22
    while pos >= 0:
        if data[pos:pos + 4] == EOCD_SIGNATURE:
            comment_len = struct.unpack_from('<H', data, pos + 20)[0]
            if pos + 22 + comment_len == len(data):
                return pos
        pos -= 1
    raise ValueError("EOCD not found")


def parse_eocd(data: bytes, eocd_offset: int) -> tuple:
    """解析 EOCD，返回 (cd_offset, cd_size, comment_length)。"""
    eocd = data[eocd_offset:]
    cd_size = struct.unpack('<I', eocd[12:16])[0]
    cd_offset = struct.unpack('<I', eocd[16:20])[0]
    comment_length = struct.unpack('<H', eocd[20:22])[0]
    return cd_offset, cd_size, comment_length


def get_apk_sections(apk_data: bytes) -> tuple:
    """将 APK 分为 (before_cd, cd, eocd, eocd_offset)。"""
    eocd_offset = find_eocd(apk_data)
    cd_offset, cd_size, _ = parse_eocd(apk_data, eocd_offset)
    before_cd = apk_data[:cd_offset]
    cd = apk_data[cd_offset:eocd_offset]
    eocd = apk_data[eocd_offset:]
    return before_cd, cd, eocd, eocd_offset


def _is_v1_signature_file(filename: str) -> bool:
    """判断是否为 V1 签名相关文件。"""
    upper = filename.upper()
    if upper == 'META-INF/MANIFEST.MF':
        return True
    if not upper.startswith('META-INF/'):
        return False
    basename = upper[len('META-INF/'):]
    if '/' in basename:
        return False
    for ext in ('.SF', '.RSA', '.DSA', '.EC'):
        if basename.endswith(ext):
            return True
    if basename.startswith('SIG-'):
        return True
    return False


def _parse_cd_entries(data: bytes, cd_offset: int, num_entries: int) -> list:
    """解析 Central Directory 条目。Returns [(filename, raw_entry_bytes), ...]"""
    entries = []
    offset = cd_offset
    for _ in range(num_entries):
        sig = struct.unpack_from('<I', data, offset)[0]
        if sig != 0x02014b50:
            raise ValueError(f"Invalid CD signature at {offset}: 0x{sig:08x}")
        fname_len = struct.unpack_from('<H', data, offset + 28)[0]
        extra_len = struct.unpack_from('<H', data, offset + 30)[0]
        comment_len = struct.unpack_from('<H', data, offset + 32)[0]
        entry_size = 46 + fname_len + extra_len + comment_len
        raw = data[offset:offset + entry_size]
        filename = data[offset + 46:offset + 46 + fname_len].decode('utf-8')
        entries.append((filename, raw))
        offset += entry_size
    return entries


# ============================================================
# V1 签名: Manifest / SF 生成
# ============================================================

def _format_manifest_attr(key: str, value: str) -> bytes:
    """格式化 manifest 属性行 (72 字节行宽)。"""
    line = f"{key}: {value}".encode('utf-8')
    if len(line) <= 70:
        return line + b'\r\n'
    result = line[:70] + b'\r\n'
    rest = line[70:]
    while rest:
        chunk = rest[:69]
        rest = rest[69:]
        result += b' ' + chunk + b'\r\n'
    return result


def generate_manifest_mf(apk_data: bytes) -> tuple:
    """
    生成 MANIFEST.MF。
    Returns: (manifest_bytes, entry_names, entry_sections)
    """
    with zipfile.ZipFile(io.BytesIO(apk_data), 'r') as zf:
        entries = []
        for info in zf.infolist():
            if info.filename.endswith('/'):
                continue
            if _is_v1_signature_file(info.filename):
                continue
            data = zf.read(info.filename)
            digest = base64.b64encode(hashlib.sha256(data).digest()).decode('ascii')
            entries.append((info.filename, digest))

    entries.sort(key=lambda x: x[0])

    main_section = _format_manifest_attr('Manifest-Version', '1.0') + b'\r\n'

    entry_names = []
    entry_sections = []
    for name, digest in entries:
        section = b''
        section += _format_manifest_attr('Name', name)
        section += _format_manifest_attr('SHA-256-Digest', digest)
        section += b'\r\n'
        entry_names.append(name)
        entry_sections.append(section)

    manifest = main_section + b''.join(entry_sections)
    return manifest, entry_names, entry_sections


def generate_cert_sf(manifest_bytes: bytes, entry_names: list,
                     entry_sections: list, v2_signed: bool = True) -> bytes:
    """生成 ANDROID.SF (Signature File)。"""
    manifest_digest = base64.b64encode(
        hashlib.sha256(manifest_bytes).digest()
    ).decode('ascii')

    sf = b''
    sf += _format_manifest_attr('Signature-Version', '1.0')
    sf += _format_manifest_attr('Created-By', '1.0 (Android)')
    sf += _format_manifest_attr('SHA-256-Digest-Manifest', manifest_digest)
    if v2_signed:
        sf += _format_manifest_attr('X-Android-APK-Signed', '2')
    sf += b'\r\n'

    for name, section in zip(entry_names, entry_sections):
        section_digest = base64.b64encode(
            hashlib.sha256(section).digest()
        ).decode('ascii')
        entry_sf = b''
        entry_sf += _format_manifest_attr('Name', name)
        entry_sf += _format_manifest_attr('SHA-256-Digest', section_digest)
        entry_sf += b'\r\n'
        sf += entry_sf

    return sf


def compute_v1_digest(apk_data: bytes) -> tuple:
    """
    计算 V1 签名所需数据。
    Returns: (manifest_mf, cert_sf, sf_digest)
    """
    manifest_mf, entry_names, entry_sections = generate_manifest_mf(apk_data)
    cert_sf = generate_cert_sf(manifest_mf, entry_names, entry_sections)
    sf_digest = hashlib.sha256(cert_sf).digest()
    return manifest_mf, cert_sf, sf_digest


# ============================================================
# V1 签名: ZIP 注入 (原地保留 zipalign)
# ============================================================

def _build_local_file_entry(filename: str, content: bytes) -> bytes:
    """构建 local file header + data (DEFLATE, UTF-8, apksigner 时间戳)。"""
    fname_bytes = filename.encode('utf-8')
    compressed = zlib.compress(content, 6)[2:-4]  # 裸 deflate
    crc = zlib.crc32(content) & 0xffffffff

    header = struct.pack('<IHHHHHIIIHH',
        0x04034b50, 20, 0x0800, 8,
        0x0821, 0x0221,  # 2001-01-01 01:01:02
        crc, len(compressed), len(content),
        len(fname_bytes), 0,
    )
    return header + fname_bytes + compressed


def _build_cd_entry(filename: str, content: bytes,
                    local_offset: int, comp_size: int) -> bytes:
    """构建 Central Directory 条目。"""
    fname_bytes = filename.encode('utf-8')
    crc = zlib.crc32(content) & 0xffffffff

    entry = struct.pack('<IHHHHHHIIIHHHHHII',
        0x02014b50, 20, 20, 0x0800, 8,
        0x0821, 0x0221,
        crc, comp_size, len(content),
        len(fname_bytes), 0, 0, 0, 0, 0, local_offset,
    )
    return entry + fname_bytes


def _build_eocd(num_entries: int, cd_size: int, cd_offset: int,
                comment: bytes = b'') -> bytes:
    """构建 EOCD 记录。"""
    return struct.pack('<IHHHHIIH',
        0x06054b50, 0, 0,
        num_entries, num_entries,
        cd_size, cd_offset, len(comment),
    ) + comment


def add_v1_signature_to_apk(apk_data: bytes, manifest_mf: bytes,
                            cert_sf: bytes, cert_rsa: bytes,
                            signer_name: str = 'ANDROID') -> bytes:
    """将 V1 签名文件注入 APK (原地注入，保留 zipalign)。"""
    eocd_offset = find_eocd(apk_data)
    eocd = apk_data[eocd_offset:]
    num_entries = struct.unpack_from('<H', eocd, 8)[0]
    cd_offset = struct.unpack_from('<I', eocd, 16)[0]
    comment_len = struct.unpack_from('<H', eocd, 20)[0]
    comment = eocd[22:22 + comment_len]

    before_cd = apk_data[:cd_offset]
    cd_entries = _parse_cd_entries(apk_data, cd_offset, num_entries)
    filtered = [(fn, raw) for fn, raw in cd_entries if not _is_v1_signature_file(fn)]

    new_files = [
        (f'META-INF/{signer_name}.SF', cert_sf),
        (f'META-INF/{signer_name}.RSA', cert_rsa),
        ('META-INF/MANIFEST.MF', manifest_mf),
    ]

    new_local_data = b''
    new_cd_entries_bytes = []
    offset = len(before_cd)

    for fname, content in new_files:
        local_entry = _build_local_file_entry(fname, content)
        local_header_size = 30 + len(fname.encode('utf-8'))
        comp_size = len(local_entry) - local_header_size
        cd_entry = _build_cd_entry(fname, content, offset, comp_size)
        new_cd_entries_bytes.append(cd_entry)
        new_local_data += local_entry
        offset += len(local_entry)

    new_cd = b''.join(raw for _, raw in filtered) + b''.join(new_cd_entries_bytes)
    new_num_entries = len(filtered) + len(new_files)
    new_cd_offset = len(before_cd) + len(new_local_data)
    new_eocd = _build_eocd(new_num_entries, len(new_cd), new_cd_offset, comment)

    return before_cd + new_local_data + new_cd + new_eocd


# ============================================================
# V2 签名: 内容摘要计算
# ============================================================

def compute_content_digest_sha256(before_cd: bytes, cd: bytes, eocd: bytes) -> bytes:
    """计算 APK V2 内容摘要 (分块 SHA-256)。"""
    eocd_modified = eocd[:16] + struct.pack('<I', len(before_cd)) + eocd[20:]

    chunks = []
    for section in [before_cd, cd, eocd_modified]:
        offset = 0
        while offset < len(section):
            end = min(offset + CHUNK_SIZE, len(section))
            chunks.append(section[offset:end])
            offset = end

    chunk_count = len(chunks)
    chunk_digests = b''
    for chunk in chunks:
        h = hashlib.sha256()
        h.update(b'\xa5')
        h.update(struct.pack('<I', len(chunk)))
        h.update(chunk)
        chunk_digests += h.digest()

    h = hashlib.sha256()
    h.update(b'\x5a')
    h.update(struct.pack('<I', chunk_count))
    h.update(chunk_digests)
    return h.digest()


def compute_apk_digest(apk_data: bytes) -> tuple:
    """
    计算 APK V2 内容摘要。
    Returns: (content_digest, before_cd, cd, eocd)
    """
    before_cd, cd, eocd, _ = get_apk_sections(apk_data)
    content_digest = compute_content_digest_sha256(before_cd, cd, eocd)
    return content_digest, before_cd, cd, eocd


# ============================================================
# V2 签名: 数据结构构建
# ============================================================

def length_prefixed(data: bytes) -> bytes:
    """uint32 小端长度前缀。"""
    return struct.pack('<I', len(data)) + data


def encode_length_prefixed_elements(elements: list) -> bytes:
    return b''.join(length_prefixed(e) for e in elements)


def encode_pairs(pairs: list) -> bytes:
    result = b''
    for alg_id, value in pairs:
        pair_size = 4 + 4 + len(value)
        result += struct.pack('<I', pair_size)
        result += struct.pack('<I', alg_id)
        result += struct.pack('<I', len(value))
        result += value
    return result


def build_signed_data(content_digest: bytes, sig_alg_id: int, cert_der: bytes) -> bytes:
    encoded_digests = encode_pairs([(sig_alg_id, content_digest)])
    encoded_certs = encode_length_prefixed_elements([cert_der])
    return encode_length_prefixed_elements([encoded_digests, encoded_certs, b''])


def build_signer_block(signed_data: bytes, sig_alg_id: int,
                       signature: bytes, public_key_der: bytes) -> bytes:
    encoded_sigs = encode_pairs([(sig_alg_id, signature)])
    return encode_length_prefixed_elements([signed_data, encoded_sigs, public_key_der])


def build_v2_block_value(signer_blocks: list) -> bytes:
    inner = encode_length_prefixed_elements(signer_blocks)
    return length_prefixed(inner)


def build_apk_signing_block(pairs: list, before_cd_len: int = 0) -> bytes:
    """构建 APK Signing Block (含 Verity Padding)。"""
    pairs_bytes = b''
    for pair_id, value in pairs:
        pair_size = 4 + len(value)
        pairs_bytes += struct.pack('<Q', pair_size)
        pairs_bytes += struct.pack('<I', pair_id)
        pairs_bytes += value

    if before_cd_len > 0:
        base = before_cd_len + 8 + len(pairs_bytes) + 12 + 8 + 16
        padding_needed = (4096 - (base % 4096)) % 4096
        padding_value = b'\x00' * padding_needed
        pair_size = 4 + len(padding_value)
        pairs_bytes += struct.pack('<Q', pair_size)
        pairs_bytes += struct.pack('<I', VERITY_PADDING_BLOCK_ID)
        pairs_bytes += padding_value

    block_size = len(pairs_bytes) + 8 + 16
    block = struct.pack('<Q', block_size)
    block += pairs_bytes
    block += struct.pack('<Q', block_size)
    block += APK_SIG_BLOCK_MAGIC
    return block


def assemble_apk(before_cd: bytes, cd: bytes, eocd: bytes,
                 signing_block: bytes) -> bytes:
    """将各区段和签名块组装成最终 APK。"""
    new_cd_offset = len(before_cd) + len(signing_block)
    new_eocd = eocd[:16] + struct.pack('<I', new_cd_offset) + eocd[20:]
    return before_cd + signing_block + cd + new_eocd


def assemble_signed_apk_from_remote(apk_data: bytes, sign_package: dict) -> bytes:
    """使用服务端返回的签名包组装 V2 签名 APK。"""
    before_cd, cd, eocd, _ = get_apk_sections(apk_data)

    signer_block = build_signer_block(
        sign_package['signed_data'],
        sign_package['sig_alg_id'],
        sign_package['signature'],
        sign_package['public_key'],
    )

    v2_value = build_v2_block_value([signer_block])
    signing_block = build_apk_signing_block(
        [(APK_SIGNATURE_SCHEME_V2_BLOCK_ID, v2_value)],
        before_cd_len=len(before_cd),
    )

    return assemble_apk(before_cd, cd, eocd, signing_block)


# ============================================================
# 远程 API 请求
# ============================================================

def request_v1_sign(sf_digest: bytes, token: str, base_url: str, sign_name: str) -> bytes:
    """
    请求 V1 签名。
    POST handleSignV1, form-data: sign=<sign_name>, sf_digest=<hex>
    返回: ANDROID.RSA 二进制 (DER)
    """
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{base_url}/handleSignV1"
    log("INFO", f"请求 V1 签名: {url}")
    log("INFO", f"sf_digest: {sf_digest.hex()}")

    resp = requests.post(url, headers=headers, data={
        'sign': sign_name,
        'sf_digest': sf_digest.hex(),
    }, timeout=60)

    if resp.status_code != 200:
        raise RuntimeError(f"V1 签名请求失败: HTTP {resp.status_code}\n{resp.text[:500]}")

    # 尝试 JSON 响应
    try:
        result = resp.json()
        data = result.get('data', result)
        if 'cert_rsa' in data:
            cert_rsa = bytes.fromhex(data['cert_rsa'])
            log("INFO", f"ANDROID.RSA: {len(cert_rsa)} 字节")
            return cert_rsa
    except Exception:
        pass

    # 直接返回二进制
    log("INFO", f"ANDROID.RSA: {len(resp.content)} 字节")
    return resp.content


def request_v2_sign(content_digest: bytes, token: str, base_url: str, sign_name: str) -> dict:
    """
    请求 V2 签名。
    POST handleSignV2, form-data: sign=<sign_name>, digest=<hex>
    返回: 签名包 dict
    """
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{base_url}/handleSignV2"
    log("INFO", f"请求 V2 签名: {url}")
    log("INFO", f"digest: {content_digest.hex()}")

    resp = requests.post(url, headers=headers, data={
        'sign': sign_name,
        'digest': content_digest.hex(),
    }, timeout=60)

    if resp.status_code != 200:
        raise RuntimeError(f"V2 签名请求失败: HTTP {resp.status_code}\n{resp.text[:500]}")

    result = resp.json()
    if result.get('code') != 200:
        raise RuntimeError(f"V2 签名业务错误: {result}")

    data = result['data']
    sign_package = {
        'signed_data': bytes.fromhex(data['signed_data']),
        'signature': bytes.fromhex(data['signature']),
        'certificate': bytes.fromhex(data['certificate']),
        'public_key': bytes.fromhex(data['public_key']),
        'sig_alg_id': data['sig_alg_id'],
    }

    total = sum(len(v) for v in sign_package.values() if isinstance(v, bytes))
    log("INFO", f"签名包: {total:,} 字节")
    return sign_package


# ============================================================
# 主流程
# ============================================================

def sign_apk(unsigned_apk_path: str, signed_apk_path: str, token: str,
             base_api_url: str = None, sign_name: str = None) -> bool:
    """
    对 APK 执行远程 V1+V2 签名

    Args:
        unsigned_apk_path: 未签名APK路径
        signed_apk_path: 签名后APK保存路径
        token: 签名服务Token
        base_api_url: 签名服务基础URL（可选，默认使用 DEFAULT_BASE_URL）
        sign_name: 签名名称（可选，默认使用 DEFAULT_SIGN_NAME）

    Returns:
        bool: 是否成功
    """
    url = base_api_url or DEFAULT_BASE_URL
    name = sign_name or DEFAULT_SIGN_NAME

    log("INFO", "========================================")
    log("INFO", "APK V1+V2 远程签名流程开始")
    log("INFO", "========================================")

    # 验证输入文件
    unsigned_apk = Path(unsigned_apk_path)
    if not unsigned_apk.exists():
        log("ERROR", f"未签名APK文件不存在: {unsigned_apk_path}")
        return False

    file_size_mb = unsigned_apk.stat().st_size / 1024 / 1024
    log("INFO", f"未签名APK: {unsigned_apk.name} ({file_size_mb:.2f} MB)")
    log("INFO", f"签名后保存: {Path(signed_apk_path).name}")
    log("INFO", f"签名服务URL: {url}")

    try:
        with open(unsigned_apk_path, 'rb') as f:
            apk_data = f.read()
        log("INFO", f"APK大小: {len(apk_data):,} 字节")

        # ---- V1 签名 ----
        log("INFO", "[V1] 计算摘要...")
        manifest_mf, cert_sf, sf_digest = compute_v1_digest(apk_data)
        log("INFO", f"MANIFEST.MF: {len(manifest_mf):,} 字节")
        log("INFO", f"ANDROID.SF: {len(cert_sf):,} 字节")
        log("INFO", f"SF digest: {sf_digest.hex()}")

        log("INFO", "[V1] 请求远程签名...")
        cert_rsa = request_v1_sign(sf_digest, token, url, name)

        log("INFO", "[V1] 注入签名文件...")
        apk_v1 = add_v1_signature_to_apk(apk_data, manifest_mf, cert_sf, cert_rsa)
        log("INFO", f"V1 签名后: {len(apk_v1):,} 字节")

        # ---- V2 签名 ----
        log("INFO", "[V2] 计算摘要...")
        content_digest, _, _, _ = compute_apk_digest(apk_v1)
        log("INFO", f"Content digest: {content_digest.hex()}")

        log("INFO", "[V2] 请求远程签名...")
        sign_package = request_v2_sign(content_digest, token, url, name)

        log("INFO", "[V2] 组装签名 APK...")
        apk_final = assemble_signed_apk_from_remote(apk_v1, sign_package)
        log("INFO", f"最终大小: {len(apk_final):,} 字节")

        # ---- 写入 ----
        signed_path = Path(signed_apk_path)
        signed_path.parent.mkdir(parents=True, exist_ok=True)
        with open(signed_path, 'wb') as f:
            f.write(apk_final)

        signed_size_mb = len(apk_final) / 1024 / 1024
        log("INFO", f"签名APK大小: {signed_size_mb:.2f} MB")

        log("SUCCESS", "========================================")
        log("SUCCESS", "APK V1+V2 签名成功!")
        log("SUCCESS", "========================================")
        return True

    except requests.exceptions.ConnectionError as e:
        log("ERROR", f"网络连接错误: {e}")
        return False

    except requests.exceptions.Timeout as e:
        log("ERROR", f"请求超时: {e}")
        return False

    except RuntimeError as e:
        log("ERROR", f"签名错误: {e}")
        return False

    except Exception as e:
        log("ERROR", f"未知错误: {type(e).__name__}: {str(e)}")
        return False


def main():
    """主函数"""
    if len(sys.argv) < 4:
        log("ERROR", "用法: python sign_apk.py <unsigned_apk> <signed_apk> <token> [base_api_url]")
        sys.exit(1)

    unsigned_apk = sys.argv[1]
    signed_apk = sys.argv[2]
    token = sys.argv[3]
    base_api_url = sys.argv[4] if len(sys.argv) > 4 else None

    success = sign_apk(unsigned_apk, signed_apk, token, base_api_url)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
