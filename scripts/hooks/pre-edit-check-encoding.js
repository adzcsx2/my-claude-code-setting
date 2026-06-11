#!/usr/bin/env node
// PreToolUse hook for Edit: block editing of non-UTF-8 files
// Reads tool invocation JSON from stdin, checks file encoding of the target file.
// If the file is GBK or other legacy encoding, blocks the edit.
// Writes modified JSON to stdout if allowed, exits with code 2 if blocked.

const { execSync } = require('child_process');
const fs = require('fs');

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.stdout.write(data);
    process.exit(0);
  }

  const filePath = input.tool_input?.file_path;
  if (!filePath || !fs.existsSync(filePath)) {
    // File doesn't exist yet (shouldn't happen for Edit, but be safe)
    process.stdout.write(data);
    process.exit(0);
  }

  // Sanitize file path for safe shell interpolation
  const safePath = filePath.replace(/["`$\\]/g, '\\$&');

  // Skip non-text files
  try {
    const fileType = execSync(`file -b "${safePath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();

    if (/binary|image|archive|compressed|executable|data/i.test(fileType)) {
      process.stdout.write(data);
      process.exit(0);
    }
  } catch {
    // file command failed, allow
  }

  let encoding;
  try {
    // Try Linux-style first, fall back to macOS
    encoding = execSync(
      `file -b --mime-encoding "${safePath}" 2>/dev/null || file -b -I "${safePath}" 2>/dev/null | sed 's/.*charset=//'`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    ).trim();
  } catch {
    // Cannot detect, allow
    process.stdout.write(data);
    process.exit(0);
  }

  if (!encoding) {
    process.stdout.write(data);
    process.exit(0);
  }

  const enc = encoding.toUpperCase();

  // Legacy encodings that should be blocked
  const blockedEncodings = [
    'GBK', 'GB2312', 'GB18030', 'EUC-CN',
    'SHIFT_JIS', 'SJIS', 'EUC-JP', 'ISO-2022-JP',
    'EUC-KR', 'ISO-2022-KR',
    'ISO-8859-1', 'ISO-8859-2', 'ISO-8859-3', 'ISO-8859-4',
    'ISO-8859-5', 'ISO-8859-6', 'ISO-8859-7', 'ISO-8859-8', 'ISO-8859-9',
    'ISO-8859-10', 'ISO-8859-11', 'ISO-8859-13', 'ISO-8859-14',
    'ISO-8859-15', 'ISO-8859-16',
    'LATIN1', 'LATIN-1',
    'WINDOWS-1250', 'WINDOWS-1251', 'WINDOWS-1252', 'WINDOWS-1253',
    'WINDOWS-1254', 'WINDOWS-1255', 'WINDOWS-1256', 'WINDOWS-1257',
    'WINDOWS-1258',
    'BIG5', 'BIG5-HKSCS',
    'KOI8-R', 'KOI8-U',
    'CP866', 'CP850', 'CP852', 'CP437',
    'TIS-620',
  ];

  if (blockedEncodings.includes(enc)) {
    console.error(
      `[encoding-guard] BLOCKED: ${filePath} is ${enc}-encoded. ` +
      `Convert to UTF-8 before editing.\n` +
      `  Run: iconv -f ${enc} -t UTF-8 "${filePath}" > /tmp/conv && mv /tmp/conv "${filePath}"\n` +
      `  Or:  ~/.claude/scripts/fix-encoding.sh "${filePath}"`
    );
    process.exit(2);
  }

  // Also block UTF-16 variants — they should be converted too
  if (enc === 'UTF-16' || enc === 'UTF-16LE' || enc === 'UTF-16BE') {
    console.error(
      `[encoding-guard] BLOCKED: ${filePath} is ${enc}-encoded. ` +
      `Convert to UTF-8 before editing.\n` +
      `  Run: iconv -f UTF-16 -t UTF-8 "${filePath}" > /tmp/conv && mv /tmp/conv "${filePath}"`
    );
    process.exit(2);
  }

  // Pass through: file is UTF-8, ASCII, or binary
  process.stdout.write(data);
});

process.stdin.resume();
