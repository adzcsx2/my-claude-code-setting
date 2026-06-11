#!/usr/bin/env node
// PreToolUse hook for Write: strip BOM from content before writing
// Reads tool invocation JSON from stdin, strips BOM from tool_input.content,
// writes modified JSON to stdout.

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    // Not valid JSON, pass through
    process.stdout.write(data);
    process.exit(0);
  }

  const content = input.tool_input?.content;
  if (typeof content === 'string' && content.length > 0) {
    // Check for BOM: U+FEFF (Unicode). After stdin.setEncoding('utf8'),
    // the raw UTF-8 BOM bytes (EF BB BF) are always decoded to U+FEFF,
    // so a single codepoint check covers both cases.
    if (content.charCodeAt(0) === 0xFEFF) {
      input.tool_input.content = content.slice(1);
      console.error('[encoding-guard] Stripped BOM (U+FEFF) from content');
    }
    process.stdout.write(JSON.stringify(input));
  } else {
    process.stdout.write(data);
  }
});
