#!/usr/bin/env bash
# fix-encoding.sh — Convert GBK/GB2312/legacy-encoded files to UTF-8 (no BOM)
# Usage:
#   fix-encoding.sh <file>          Convert a single file
#   fix-encoding.sh <directory>     Convert all text files in directory (recursive)
#   fix-encoding.sh --dry-run <path> Preview what would be converted

set -euo pipefail

DRY_RUN=false
TARGET=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    *)
      TARGET="$1"
      shift
      ;;
  esac
done

if [ -z "$TARGET" ]; then
  echo "Usage: fix-encoding.sh [--dry-run] <file|directory>"
  echo ""
  echo "Converts GBK/GB2312/legacy-encoded text files to UTF-8 without BOM."
  echo "Options:"
  echo "  --dry-run  Show what would be converted without making changes"
  exit 1
fi

if [ ! -e "$TARGET" ]; then
  echo "ERROR: '$TARGET' does not exist"
  exit 1
fi

# Detect encoding of a file, return normalized encoding name
detect_encoding() {
  local f="$1"
  if file --mime-encoding "$f" 2>/dev/null | head -1 | grep -q .; then
    file -b --mime-encoding "$f" 2>/dev/null | tr -d '[:space:]'
  else
    file -b -I "$f" 2>/dev/null | sed 's/.*charset=//' | tr -d '[:space:]'
  fi
}

# Check if file is a text file worth converting
is_convertible() {
  local f="$1"
  # Skip binary, images, archives
  if file -b "$f" | grep -qi 'binary\|image\|archive\|compressed\|executable\|data'; then
    return 1
  fi
  return 0
}

# Convert single file
convert_file() {
  local file="$1"
  local encoding
  encoding=$(detect_encoding "$file" | tr '[:lower:]' '[:upper:]')

  # Already good
  case "$encoding" in
    UTF-8|US-ASCII|ASCII)
      return 0
      ;;
  esac

  local iconv_from=""

  case "$encoding" in
    GBK|GB2312|GB18030|EUC-CN)
      iconv_from="GBK"
      ;;
    ISO-8859-1|LATIN1|LATIN-1)
      # NOTE: file(1) may misidentify GBK text as ISO-8859-1 because both
      # are 8-bit encodings with no distinguishing byte signatures.
      # If the converted output is garbled (Mojibake), the file is likely
      # GBK-encoded: re-run with `iconv -f GBK -t UTF-8 <file>`.
      iconv_from="LATIN1"
      ;;
    ISO-8859-*)
      iconv_from="$encoding"
      ;;
    WINDOWS-1252)
      iconv_from="CP1252"
      ;;
    WINDOWS-125*)
      iconv_from="$encoding"
      ;;
    UTF-16|UTF-16LE|UTF-16BE)
      iconv_from="UTF-16"
      ;;
    SHIFT_JIS|SJIS|SHIFT-JIS)
      iconv_from="SHIFT-JIS"
      ;;
    EUC-JP)
      iconv_from="EUC-JP"
      ;;
    *)
      echo "  SKIP: $file (unknown source encoding: $encoding)"
      return 0
      ;;
  esac

  if [ "$DRY_RUN" = true ]; then
    echo "  WOULD CONVERT: $file ($encoding -> UTF-8)"
    return 0
  fi

  echo "  CONVERT: $file ($encoding -> UTF-8)"
  iconv -f "$iconv_from" -t UTF-8 "$file" > "${file}.utf8tmp" 2>/dev/null || {
    echo "  FAILED: $file (iconv conversion error)"
    rm -f "${file}.utf8tmp"
    return 1
  }

  # Strip BOM if present
  BOM=$(head -c 3 "${file}.utf8tmp" | od -A n -t x1 | tr -d ' ')
  if [ "$BOM" = "efbbbf" ]; then
    tail -c +4 "${file}.utf8tmp" > "${file}.utf8tmp.nobom"
    mv "${file}.utf8tmp.nobom" "${file}.utf8tmp"
  fi

  mv "${file}.utf8tmp" "$file"
  return 0
}

CONVERTED=0
FAILED=0
SKIPPED=0

if [ -f "$TARGET" ]; then
  if is_convertible "$TARGET"; then
    convert_file "$TARGET"
    case $? in
      0) CONVERTED=$((CONVERTED + 1)) ;;
      *) FAILED=$((FAILED + 1)) ;;
    esac
  fi
elif [ -d "$TARGET" ]; then
  while IFS= read -r -d '' file; do
    if is_convertible "$file"; then
      convert_file "$file"
      case $? in
        0) CONVERTED=$((CONVERTED + 1)) ;;
        *) FAILED=$((FAILED + 1)) ;;
      esac
    else
      SKIPPED=$((SKIPPED + 1))
    fi
  done < <(find "$TARGET" -type f -print0 2>/dev/null)
fi

echo ""
if [ "$DRY_RUN" = true ]; then
  echo "Dry run complete."
else
  echo "Done. Converted: $CONVERTED, Failed: $FAILED"
fi
