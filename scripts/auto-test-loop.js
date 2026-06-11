#!/usr/bin/env node
'use strict';

/**
 * auto-test-loop.js — 核心测试协调器
 *
 * 调用方式: node ~/.claude/scripts/auto-test-loop.js "<测试命令>" [max_retries=3]
 * 示例:     node ~/.claude/scripts/auto-test-loop.js "npm test"
 *           node ~/.claude/scripts/auto-test-loop.js "pytest" 5
 *
 * 退出码协议:
 *   0 — 测试通过
 *   2 — 测试失败，还有重试机会（请读取 stdout 中的报告，修复代码后重新调用）
 *   1 — 达到最大重试次数或脚本内部错误
 *
 * 状态文件: ~/.claude/session-data/auto-test-state-{pwdHash}.json
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// ── 配置 ──────────────────────────────────────────────────

const HOME = os.homedir();
const SESSION_DATA_DIR = path.join(HOME, '.claude', 'session-data');
const MAX_BUFFER = 10 * 1024 * 1024;   // 10MB
const TIMEOUT_MS = 300000;              // 5 分钟
const MAX_OUTPUT_LINES = 500;           // stdout/stderr 截断行数
const MAX_DIFF_LINES = 200;             // git diff 截断行数
const STALE_TTL_MS = 24 * 60 * 60 * 1000; // 状态文件过期时间 24h

// ── 参数解析 ──────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('用法: node auto-test-loop.js "<测试命令>" [max_retries=3]');
  process.exit(1);
}

const testCommand = args[0];
const maxRetries = Math.max(1, Math.min(10, parseInt(args[1], 10) || 3));

// ── 状态文件路径 ──────────────────────────────────────────

function getPwdHash() {
  return crypto.createHash('md5').update(process.cwd()).digest('hex').slice(0, 12);
}

function getStateFile() {
  const pwdHash = getPwdHash();
  return path.join(SESSION_DATA_DIR, 'auto-test-state-' + pwdHash + '.json');
}

// ── 状态读写 ──────────────────────────────────────────────

function readState() {
  const f = getStateFile();
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}

function writeState(state) {
  const f = getStateFile();
  try {
    fs.mkdirSync(SESSION_DATA_DIR, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.error('无法写入状态文件: ' + err.message);
  }
}

function deleteState() {
  const f = getStateFile();
  try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
}

// ── 过期状态清理 ──────────────────────────────────────────

function cleanStaleStates() {
  try {
    if (!fs.existsSync(SESSION_DATA_DIR)) return;
    const files = fs.readdirSync(SESSION_DATA_DIR);
    const now = Date.now();
    for (const f of files) {
      if (!f.startsWith('auto-test-state-') || !f.endsWith('.json')) continue;
      const fullPath = path.join(SESSION_DATA_DIR, f);
      try {
        if ((now - fs.statSync(fullPath).mtimeMs) > STALE_TTL_MS) {
          fs.unlinkSync(fullPath);
        }
      } catch (_) {}
    }
  } catch (_) {}
}

// ── 输出截断 ──────────────────────────────────────────────

function truncateLines(text, maxLines) {
  if (!text) return '';
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  return lines.slice(0, maxLines).join('\n')
    + '\n\n... (输出已截断，共 ' + lines.length + ' 行，显示前 ' + maxLines + ' 行)';
}

// ── Git ───────────────────────────────────────────────────

function runGit(args) {
  return new Promise(function(resolve) {
    exec('git ' + args.join(' '), {
      timeout: 10000,
      maxBuffer: 2 * 1024 * 1024,
      cwd: process.cwd(),
    }, function(err, stdout) {
      resolve(err ? '' : (stdout || ''));
    });
  });
}

async function collectGitInfo() {
  const diffStat = await runGit(['diff', '--stat']);
  const diffFull = await runGit(['diff', '--', '.', ':!*.lock', ':!package-lock.json']);
  const statusShort = await runGit(['status', '--short']);

  return {
    diffStat: diffStat.trim() || '(无变更或无 git 仓库)',
    diffSummary: truncateLines(diffFull, MAX_DIFF_LINES),
    untrackedFiles: statusShort
      .split('\n')
      .filter(function(l) { return l.startsWith('??'); })
      .map(function(l) { return l.slice(3).trim(); }),
  };
}

// ── 执行测试 ──────────────────────────────────────────────

function runTest(cmd) {
  return new Promise(function(resolve) {
    const startTime = Date.now();
    exec(cmd, {
      timeout: TIMEOUT_MS,
      maxBuffer: MAX_BUFFER,
      cwd: process.cwd(),
      env: Object.assign({}, process.env, { FORCE_COLOR: '0', CI: 'true' }),
    }, function(err, stdout, stderr) {
      const duration = Date.now() - startTime;
      const exitCode = err ? (err.code || 1) : 0;
      const killed = err && err.killed;
      const signal = err ? (err.signal || null) : null;

      resolve({
        exitCode: exitCode,
        killed: killed,
        signal: signal,
        durationMs: duration,
        stdout: truncateLines(stdout || '', MAX_OUTPUT_LINES),
        stderr: truncateLines(stderr || '', MAX_OUTPUT_LINES),
      });
    });
  });
}

// ── 报告构建 ──────────────────────────────────────────────

function buildSuccessReport(state) {
  return {
    round: state.round,
    maxRetries: state.maxRetries,
    status: 'PASSED',
    testCommand: state.testCommand,
    message: '测试全部通过',
    durationMs: state.history[state.history.length - 1]
      ? state.history[state.history.length - 1].durationMs : 0,
  };
}

function buildFailureReport(state, testResult, gitInfo) {
  const out = testResult.stdout + '\n' + testResult.stderr;

  return {
    round: state.round,
    maxRetries: state.maxRetries,
    status: 'FAILED',
    testCommand: state.testCommand,
    testExitCode: testResult.exitCode,
    killed: testResult.killed || false,
    signal: testResult.signal || null,
    durationMs: testResult.durationMs,
    testOutput: out.trim() || '(无输出)',
    diffStat: gitInfo.diffStat,
    diffSummary: gitInfo.diffSummary,
    untrackedFiles: gitInfo.untrackedFiles,
    history: state.history.map(function(h) {
      return { round: h.round, exitCode: h.exitCode, killed: h.killed, durationMs: h.durationMs };
    }),
  };
}

function buildFinalReport(state, testResult, gitInfo) {
  var report = buildFailureReport(state, testResult, gitInfo);
  report.status = 'EXHAUSTED';
  report.message = '已达最大重试次数 (' + state.maxRetries + ' 轮)，测试仍未通过';
  return report;
}

// ── 主流程 ────────────────────────────────────────────────

async function main() {
  cleanStaleStates();

  var state = readState();

  if (state) {
    // 如果测试命令发生变化，视为新的 loop
    if (state.testCommand !== testCommand) {
      deleteState();
      state = null;
    }
  }

  if (state) {
    // 延续已有的 loop
    if (state.status === 'PASSED') {
      // 上次已通过，但状态文件未清理 — 清理并返回成功
      deleteState();
      console.log(JSON.stringify({ status: 'PASSED', message: '测试已通过（清除旧状态）' }, null, 2));
      process.exit(0);
    }

    if (state.round >= state.maxRetries) {
      console.error('状态异常: 轮次已超上限但仍在循环中');
      process.exit(1);
    }

    state.round += 1;
  } else {
    // 新的 loop
    state = {
      testCommand: testCommand,
      maxRetries: maxRetries,
      round: 1,
      history: [],
      status: 'IN_PROGRESS',
      pwd: process.cwd(),
      createdAt: Date.now(),
    };
  }

  // ── 执行测试 ──────────────────────────────────────────

  var testResult = await runTest(testCommand);

  // 记录本轮
  state.history.push({
    round: state.round,
    exitCode: testResult.exitCode,
    killed: testResult.killed,
    signal: testResult.signal,
    durationMs: testResult.durationMs,
    timestamp: Date.now(),
  });

  // ── 测试通过 ──────────────────────────────────────────

  if (testResult.exitCode === 0 && !testResult.killed) {
    state.status = 'PASSED';
    var successReport = buildSuccessReport(state);
    console.log(JSON.stringify(successReport, null, 2));
    deleteState();
    process.exit(0);
  }

  // ── 测试失败 ──────────────────────────────────────────

  var gitInfo = await collectGitInfo();
  state.status = 'FAILED';
  writeState(state);

  if (state.round >= state.maxRetries) {
    var finalReport = buildFinalReport(state, testResult, gitInfo);
    console.log(JSON.stringify(finalReport, null, 2));
    deleteState();
    process.exit(1);
  }

  var failureReport = buildFailureReport(state, testResult, gitInfo);
  console.log(JSON.stringify(failureReport, null, 2));
  process.exit(2);
}

main().catch(function(err) {
  console.log(JSON.stringify({
    status: 'INTERNAL_ERROR',
    message: '脚本内部错误: ' + err.message,
  }, null, 2));
  process.exit(1);
});
