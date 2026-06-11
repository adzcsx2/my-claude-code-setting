#!/usr/bin/env node
'use strict';

/**
 * stop-auto-test-audit.js — Stop hook, 测试委托检测层
 *
 * 会话结束时增量扫描 transcript，检测 AI 是否将本可自动执行的测试委托给用户。
 * 复用 stop-skill-audit.js 的游标 + session 隔离模式。
 *
 * 检测模式:
 *   1. 要求手动运行命令 (你/请/可以 + 运行/执行/跑 + 命令/npm/yarn...)
 *   2. 要求开新终端/窗口 (打开/开 + 终端/窗口/shell/terminal)
 *   3. 要求反馈测试结果 (告诉/反馈/让我知道 + 结果/是否成功)
 *   4. 英文测试委托 (try/run/test + and see/let me know)
 *
 * 输出: ~/.claude/session-data/auto-test-audit-{sessionId}.json
 */

const fs = require('fs');
const path = require('path');

const HOME = require('os').homedir();
const SESSION_DATA_DIR = path.join(HOME, '.claude', 'session-data');
const CURSOR_FILE = path.join(SESSION_DATA_DIR, 'auto-test-audit-cursor.json');
const SCAN_MAX_BYTES = 2 * 1024 * 1024;
const STALE_TTL_MS = 30 * 60 * 1000;

// ── session 隔离路径 ─────────────────────────────────────

function auditFile(sessionId) {
  return path.join(SESSION_DATA_DIR, 'auto-test-audit-' + sessionId + '.json');
}

// ── 游标 ──────────────────────────────────────────────

function readCursors() {
  if (!fs.existsSync(CURSOR_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8')); } catch { return {}; }
}

function writeCursors(cursors) {
  try { fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursors), 'utf8'); } catch (_) {}
}

function pruneCursors(cursors) {
  var now = Date.now();
  var oneDay = 24 * 60 * 60 * 1000;
  var pruned = {};
  for (var key of Object.keys(cursors)) {
    var entry = cursors[key];
    var ts = (typeof entry === 'object' && entry.ts) ? entry.ts : 0;
    if ((now - ts) < oneDay) pruned[key] = entry;
  }
  return pruned;
}

// ── 脏状态清理 ─────────────────────────────────────────

function cleanStaleStates(currentSessionId) {
  try {
    if (!fs.existsSync(SESSION_DATA_DIR)) return;
    var files = fs.readdirSync(SESSION_DATA_DIR);
    var now = Date.now();
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f.startsWith('auto-test-audit-') || !f.endsWith('.json')) continue;
      var sid = f.replace('auto-test-audit-', '').replace('.json', '');
      if (sid === currentSessionId) continue;
      var fullPath = path.join(SESSION_DATA_DIR, f);
      try {
        if ((now - fs.statSync(fullPath).mtimeMs) > STALE_TTL_MS) {
          fs.unlinkSync(fullPath);
        }
      } catch (_) {}
    }
  } catch (_) {}
}

// ── 测试委托检测正则 ───────────────────────────────────

var PATTERNS = [
  {
    name: '要求手动运行命令',
    severity: 'HIGH',
    regex: /(?:你|请|可以|麻烦|帮)(?:.*?)(?:运行|执行|跑一下|跑下|试试|试下)(?:.*?)(?:命令|npm|yarn|pnpm|python|go\s+test|cargo|node|make|pytest|\.\/)/i,
  },
  {
    name: '要求开新终端或窗口',
    severity: 'HIGH',
    regex: /(?:打开|开|新建?|另开)(?:一个|个)?(?:新)?(?:终端|窗口|shell|terminal|tab|命令行)/i,
  },
  {
    name: '要求反馈测试结果',
    severity: 'MEDIUM',
    regex: /(?:告诉|反馈|回复|让|通知)(?:我|一下)(?:.*?)(?:结果|情况|是否成功|能不能|有没有|可不可以|是否正常|对不对|工作)/i,
  },
  {
    name: '英文测试委托',
    severity: 'MEDIUM',
    regex: /(?:try|run|test|check)\s+(?:this|it|that)(?:\s+out)?(?:\s+and\s+(?:see|let\s+me\s+know|tell\s+me))/i,
  },
  {
    name: '试试看是否工作',
    severity: 'LOW',
    regex: /(?:试试看|试下看|试一下看).*(?:是否|能不能|会不会|可不可以|成功了)/i,
  },
];

// ── 项目可测试性审计 ───────────────────────────────────

function checkProjectTestability() {
  var cwd = process.cwd();
  var available = [];

  try {
    var pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      var pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.scripts) {
        for (var key of ['test', 'test:unit', 'test:e2e', 'e2e', 'vitest', 'jest', 'mocha']) {
          if (pkg.scripts[key]) {
            available.push({ cmd: 'npm run ' + key, source: 'package.json#' + key });
          }
        }
      }
      // 检查是否有 playwright 配置
      var playwrightConfigs = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs'];
      for (var pc = 0; pc < playwrightConfigs.length; pc++) {
        if (fs.existsSync(path.join(cwd, playwrightConfigs[pc]))) {
          if (!available.some(function(a) { return a.cmd.indexOf('playwright') !== -1; })) {
            available.push({ cmd: 'npx playwright test', source: playwrightConfigs[pc] });
          }
        }
      }
    }
  } catch (_) {}

  if (fs.existsSync(path.join(cwd, 'Makefile'))) {
    try {
      var mf = fs.readFileSync(path.join(cwd, 'Makefile'), 'utf8');
      if (/^test\s*:/m.test(mf)) {
        available.push({ cmd: 'make test', source: 'Makefile' });
      }
    } catch (_) {}
  }

  if (fs.existsSync(path.join(cwd, 'pyproject.toml'))) {
    available.push({ cmd: 'pytest', source: 'pyproject.toml' });
  }

  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    available.push({ cmd: 'cargo test', source: 'Cargo.toml' });
  }

  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    available.push({ cmd: 'go test ./...', source: 'go.mod' });
  }

  return {
    hasTestCommands: available.length > 0,
    available: available,
  };
}

// ── Transcript 扫描 ────────────────────────────────

function extractAssistantMessages(content) {
  // 从 transcript JSONL 中提取 assistant 角色的文本消息
  var messages = [];
  var lines = content.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    // 尝试解析每一行为 JSON
    try {
      var entry = JSON.parse(line);
      // assistant 消息
      if (entry.role === 'assistant' || (entry.message && entry.message.role === 'assistant')) {
        var msg = entry.message || entry;
        var msgContent = msg.content;
        if (Array.isArray(msgContent)) {
          // 提取 text 类型的 block
          for (var j = 0; j < msgContent.length; j++) {
            var block = msgContent[j];
            if (block.type === 'text' && block.text) {
              messages.push(block.text);
            }
          }
        } else if (typeof msgContent === 'string') {
          messages.push(msgContent);
        }
      }
    } catch (_) {
      // 跳过非 JSON 行
    }
  }
  return messages;
}

function detectViolations(assistantTexts) {
  var violations = [];
  for (var t = 0; t < assistantTexts.length; t++) {
    var text = assistantTexts[t];
    for (var p = 0; p < PATTERNS.length; p++) {
      var pattern = PATTERNS[p];
      var match = text.match(pattern.regex);
      if (match) {
        // 提取匹配位置周围的上下文 (前后各 40 字符)
        var idx = match.index;
        var start = Math.max(0, idx - 40);
        var end = Math.min(text.length, idx + match[0].length + 40);
        var context = text.slice(start, end);
        if (start > 0) context = '...' + context;
        if (end < text.length) context = context + '...';

        violations.push({
          pattern: pattern.name,
          severity: pattern.severity,
          matchedText: context,
        });
      }
    }
  }
  return violations;
}

// ── 主入口 ───────────────────────────────────────────

function run(rawInput) {
  var sessionId = '';
  var transcriptPath = '';

  try {
    var input = JSON.parse(rawInput);
    if (input.hook_event_name === 'Stop' && input.transcript_path) {
      transcriptPath = input.transcript_path;
      sessionId = input.session_id || '';
    }
  } catch (_) { return { exitCode: 0 }; }

  if (!transcriptPath || !sessionId) return { exitCode: 0 };

  // 清理旧 session
  cleanStaleStates(sessionId);

  // 游标
  var cursors = pruneCursors(readCursors());
  var cursorEntry = cursors[transcriptPath];
  var lastOffset = (typeof cursorEntry === 'object' && cursorEntry.offset != null) ? cursorEntry.offset : 0;

  // 读取增量
  var stat;
  try { stat = fs.statSync(transcriptPath); } catch (_) { return { exitCode: 0 }; }
  if (stat.size <= lastOffset) return { exitCode: 0 };

  var readStart = lastOffset;
  var readSize = Math.min(stat.size - readStart, SCAN_MAX_BYTES);
  if (readSize <= 0) return { exitCode: 0 };

  var content;
  try {
    var fd = fs.openSync(transcriptPath, 'r');
    var buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, readStart);
    fs.closeSync(fd);
    content = buf.toString('utf8');
  } catch (_) { return { exitCode: 0 }; }

  // 更新游标
  var newOffset = stat.size;
  cursors[transcriptPath] = { offset: newOffset, ts: Date.now() };
  writeCursors(cursors);

  // 扫描 assistant 消息
  var assistantTexts = extractAssistantMessages(content);
  if (assistantTexts.length === 0) return { exitCode: 0 };

  // 检测违规
  var violations = detectViolations(assistantTexts);

  // 审计可测试性
  var testability = checkProjectTestability();

  // 标记哪些违规本可自动执行
  for (var v = 0; v < violations.length; v++) {
    violations[v].wasAutomatable = testability.hasTestCommands;
    if (testability.hasTestCommands && testability.available.length > 0) {
      violations[v].availableTestCmd = testability.available[0].cmd;
    }
  }

  // 始终写入审计报告（即使没有违规，记录可测试性）
  var report = {
    sessionId: sessionId,
    timestamp: Date.now(),
    pwd: process.cwd(),
    violations: violations,
    testability: testability,
    consumed: false,
  };

  var targetFile = auditFile(sessionId);
  try {
    fs.mkdirSync(SESSION_DATA_DIR, { recursive: true });
    fs.writeFileSync(targetFile, JSON.stringify(report, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write('[Hook] stop-auto-test-audit 写入失败: ' + err.message + '\n');
  }

  return { exitCode: 0 };
}

// ── Hook 入口 ─────────────────────────────────────────

if (require.main === module) {
  var raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function(chunk) { raw += chunk; });
  process.stdin.on('end', function() {
    try {
      var result = run(raw);
      if (result && result.stderr) {
        process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : result.stderr + '\n');
      }
      process.exit(Number.isInteger(result && result.exitCode) ? result.exitCode : 0);
    } catch (error) {
      process.stderr.write('[Hook] stop-auto-test-audit 失败: ' + error.message + '\n');
      process.exit(0);
    }
  });
} else {
  module.exports = { run };
}
