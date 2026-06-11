#!/usr/bin/env node
'use strict';

/**
 * post-auto-test-reminder.js — PostToolUse hook (matcher: *), 审计消费层
 *
 * 每次工具调用后检查是否有上一会话遗留的 unconsumed 测试委托违规审计报告。
 * 如果有，通过 additionalContext 注入警告，并标记为已消费。
 *
 * 去重: 每个 audit 文件只消费一次。
 * 清理: 超过 7 天的审计文件自动删除。
 */

const fs = require('fs');
const path = require('path');

const HOME = require('os').homedir();
const SESSION_DATA_DIR = path.join(HOME, '.claude', 'session-data');
const CONSUMED_FILE = path.join(SESSION_DATA_DIR, 'auto-test-reminder-consumed.json');
const MAX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

// ── 已消费追踪 ─────────────────────────────────────────

function readConsumed() {
  if (!fs.existsSync(CONSUMED_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(CONSUMED_FILE, 'utf8')); } catch { return []; }
}

function writeConsumed(list) {
  try {
    // 过滤掉对应审计文件已不存在的条目，防止列表无限膨胀
    var pruned = list.filter(function(entry) {
      var p = path.join(SESSION_DATA_DIR, entry);
      return fs.existsSync(p);
    });
    fs.mkdirSync(SESSION_DATA_DIR, { recursive: true });
    fs.writeFileSync(CONSUMED_FILE, JSON.stringify(pruned), 'utf8');
  } catch (_) {}
}

// ── 审计文件扫描 ──────────────────────────────────────

function findUnconsumedAudits(currentSessionId) {
  var results = [];
  try {
    if (!fs.existsSync(SESSION_DATA_DIR)) return results;
    var files = fs.readdirSync(SESSION_DATA_DIR);
    var consumed = readConsumed();
    var now = Date.now();

    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f.startsWith('auto-test-audit-') || !f.endsWith('.json')) continue;

      var fullPath = path.join(SESSION_DATA_DIR, f);
      var stat;
      try { stat = fs.statSync(fullPath); } catch (_) { continue; }

      // 清理过期文件
      if ((now - stat.mtimeMs) > MAX_RETENTION_MS) {
        try { fs.unlinkSync(fullPath); } catch (_) {}
        continue;
      }

      // 跳过当前 session
      var sid = f.replace('auto-test-audit-', '').replace('.json', '');
      if (sid === currentSessionId) continue;

      // 跳过已消费
      if (consumed.indexOf(f) !== -1) continue;

      // 读取审计报告
      var report;
      try { report = JSON.parse(fs.readFileSync(fullPath, 'utf8')); } catch (_) { continue; }

      if (report.consumed === false && report.violations && report.violations.length > 0) {
        results.push({ file: f, fullPath: fullPath, report: report });
      }
    }
  } catch (_) {}
  return results;
}

// ── 警告构建 ──────────────────────────────────────────

function buildWarning(audits) {
  var lines = [
    '='.repeat(60),
    '## [Hook] 自动测试合规警告',
    '='.repeat(60),
    '',
    '上一会话中检测到测试委托违规:',
    '',
  ];

  for (var i = 0; i < audits.length; i++) {
    var a = audits[i];
    lines.push('### 会话 ' + a.report.sessionId.slice(0, 8));
    for (var j = 0; j < a.report.violations.length; j++) {
      var v = a.report.violations[j];
      lines.push('  - [' + v.severity + '] ' + v.pattern);
      lines.push('    匹配文本: "' + v.matchedText + '"');
      if (v.wasAutomatable && v.availableTestCmd) {
        lines.push('    该测试本可自动执行: `' + v.availableTestCmd + '`');
      }
    }
    lines.push('');
  }

  lines.push('### 本次会话要求');
  lines.push('');
  lines.push('修改代码后绝不要求用户手动测试。直接调用:');
  lines.push('  node ~/.claude/scripts/auto-test-loop.js "<测试命令>"');
  lines.push('');
  lines.push('退出码 2 是预期的「需要修复」信号，不是异常。');
  lines.push('');

  return lines.join('\n');
}

// ── 主入口 ────────────────────────────────────────────

function run(rawInput) {
  var sessionId = '';
  try {
    var input = JSON.parse(rawInput);
    sessionId = input.session_id || '';
  } catch (_) { return { exitCode: 0 }; }

  if (!sessionId) return { exitCode: 0 };

  var audits = findUnconsumedAudits(sessionId);
  if (audits.length === 0) return { exitCode: 0 };

  // 标记为已消费
  var consumed = readConsumed();
  for (var i = 0; i < audits.length; i++) {
    consumed.push(audits[i].file);

    // 同时更新审计文件
    try {
      audits[i].report.consumed = true;
      fs.writeFileSync(audits[i].fullPath, JSON.stringify(audits[i].report, null, 2), 'utf8');
    } catch (_) {}
  }
  writeConsumed(consumed);

  return {
    exitCode: 0,
    additionalContext: buildWarning(audits),
  };
}

// ── Hook 入口 ───────────────────────────────

if (require.main === module) {
  var raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function(chunk) { raw += chunk; });
  process.stdin.on('end', function() {
    try {
      var result = run(raw);
      if (result && result.additionalContext) {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext: result.additionalContext,
          },
        }));
      }
      if (result && result.stderr) {
        process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : result.stderr + '\n');
      }
      process.exit(Number.isInteger(result && result.exitCode) ? result.exitCode : 0);
    } catch (error) {
      process.stderr.write('[Hook] post-auto-test-reminder 失败: ' + error.message + '\n');
      process.exit(0);
    }
  });
} else {
  module.exports = { run };
}
