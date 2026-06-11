#!/usr/bin/env bash
# encoding-guard.sh — PostToolUse hook for encoding enforcement
# Called after Write/Edit operations to verify and fix file encoding.
# Usage: encoding-guard.sh <file_path>
# Exit 0: file is UTF-8 (no BOM) or was auto-fixed
# Exit 1: warning (non-critical encoding issue — legacy encoding detected)

set -euo pipefail

FILE_PATH="$1"

if [ ! -f "$FILE_PATH" ]; then
  exit 0
fi

# Skip binary files
if file -b "$FILE_PATH" | grep -qi 'binary\|image\|archive\|compressed\|executable'; then
  exit 0
fi

# Get MIME encoding (cross-platform: Linux uses --mime-encoding, macOS uses -I)
if command -v file &>/dev/null; then
  ENCODING=$(file -b --mime-encoding "$FILE_PATH" 2>/dev/null | tr -d '[:space:]')
  if [ -z "$ENCODING" ]; then
    ENCODING=$(file -b -I "$FILE_PATH" 2>/dev/null | sed 's/.*charset=//' | tr -d '[:space:]')
  fi
else
  echo "[encoding-guard] WARNING: 'file' command not found, skipping encoding check"
  exit 1
fi

# Normalize encoding name
ENCODING=$(echo "$ENCODING" | tr '[:lower:]' '[:upper:]')

case "$ENCODING" in
  UTF-8|US-ASCII|ASCII|BINARY)
    # Check for BOM bytes at start of file
    BOM=$(head -c 3 "$FILE_PATH" | od -A n -t x1 | tr -d ' ')
    if [ "$BOM" = "efbbbf" ]; then
      echo "[encoding-guard] FIXED: Stripped UTF-8 BOM from $(basename "$FILE_PATH")"
      tail -c +4 "$FILE_PATH" > "${FILE_PATH}.nobom"
      mv "${FILE_PATH}.nobom" "$FILE_PATH"
    fi
    exit 0
    ;;
  UTF-16|UTF-16LE|UTF-16BE)
    echo "[encoding-guard] WARNING: $(basename "$FILE_PATH") is $ENCODING. Convert to UTF-8: iconv -f UTF-16 -t UTF-8 '$FILE_PATH' > /tmp/conv && mv /tmp/conv '$FILE_PATH'"
    exit 1
    ;;
  ISO-8859-*|LATIN*|WINDOWS-125*)
    echo "[encoding-guard] WARNING: $(basename "$FILE_PATH") is $ENCODING (legacy). Convert to UTF-8: iconv -f $ENCODING -t UTF-8 '$FILE_PATH' > /tmp/conv && mv /tmp/conv '$FILE_PATH'"
    exit 1
    ;;
  GBK|GB2312|GB18030|EUC-CN|GB*)
    echo "[encoding-guard] WARNING: $(basename "$FILE_PATH") is GBK/GB-encoded! DO NOT edit until converted."
    echo "  Run: ~/.claude/scripts/fix-encoding.sh '$FILE_PATH'"
    echo "  Or:  iconv -f GBK -t UTF-8 '$FILE_PATH' > /tmp/conv && mv /tmp/conv '$FILE_PATH'"
    exit 1
    ;;
  SHIFT_JIS|EUC-JP|ISO-2022-JP|SJIS)
    echo "[encoding-guard] WARNING: $(basename "$FILE_PATH") is $ENCODING. Convert to UTF-8 before editing."
    echo "  Run: iconv -f $ENCODING -t UTF-8 '$FILE_PATH' > /tmp/conv && mv /tmp/conv '$FILE_PATH'"
    exit 1
    ;;
  *)
    echo "[encoding-guard] WARNING: $(basename "$FILE_PATH") has unexpected encoding '$ENCODING'."
    echo "  Run: file -I '$FILE_PATH' for details"
    exit 1
    ;;
esac
