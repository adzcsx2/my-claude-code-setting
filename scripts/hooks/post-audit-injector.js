#!/usr/bin/env node
'use strict';

/**
 * post-audit-injector.js — PostToolUse hook (matcher: *), 审计指令注入层 v3
 *
 * v3 修复:
 *   - 增加 lastInjectedLoop 去重: 同一响应内多次 tool call 只注入一次
 *   - AUDITED_CLEAN/ACCEPTABLE 后保留状态文件（由 Stop hook 的游标机制复用）
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = require('os').homedir();
const SESSION_DATA_DIR = path.join(HOME, '.claude', 'session-data');
const STATE_FILE = path.join(SESSION_DATA_DIR, 'skill-audit-state.json');
const EVIDENCE_FILE = path.join(SESSION_DATA_DIR, 'skill-audit-evidence.txt');
const MAX_LOOPS = 5;

// ── 状态读写 ──────────────────────────────────────────────

function readState() {
  if (!fs.existsSync(STATE_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return null; }
}

function writeState(state) {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8'); } catch (_) {}
}

// ── Git / 证据生成 ────────────────────────────────────────

function isInGitRepo() {
  try { execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }); return true; } catch { return false; }
}

function generateDeltaDiff(preHead, preDiffFile) {
  if (!isInGitRepo() || !preHead) return '无法生成增量 diff: 非 git 仓库或无 preHead 快照\n';
  let currentDiff = '';
  try {
    currentDiff = execFileSync(
      'git', ['diff', preHead, 'HEAD', '--', '.', ':!*.lock', ':!package-lock.json'],
      { encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 10000 }
    );
  } catch { return '生成当前 diff 时出错\n'; }
  if (!currentDiff.trim()) return '（本轮未产生任何文件变更）\n';
  if (preDiffFile && fs.existsSync(preDiffFile)) {
    const preDiff = fs.readFileSync(preDiffFile, 'utf8').trim();
    if (preDiff && currentDiff.includes(preDiff.substring(0, Math.min(200, preDiff.length)))) {
      return '=== 注意: 以下 diff 可能包含少量 skill 执行前已存在的变更 ===\n' + currentDiff +
        '\n=== 执行前快照参考 ===\n' + preDiff.substring(0, 2000) +
        (preDiff.length > 2000 ? '\n... (快照过长，已截断)' : '') + '\n';
    }
  }
  return currentDiff;
}

function generateEvidence(skillFile, preHead, preDiffFile) {
  let content = '';
  content += '='.repeat(70) + '\n【审计依据】技能/命令定义文件\n' + '='.repeat(70) + '\n\n';
  if (skillFile && fs.existsSync(skillFile)) {
    content += '文件路径: ' + skillFile + '\n' + '-'.repeat(70) + '\n\n';
    content += fs.readFileSync(skillFile, 'utf8') + '\n\n';
  } else {
    content += '（技能文件未找到或路径无效）\n\n';
  }
  content += '\n' + '='.repeat(70) + '\n【执行证据】本轮 Skill 执行产生的变更\n' + '='.repeat(70) + '\n\n';
  content += isInGitRepo() ? generateDeltaDiff(preHead, preDiffFile) : '（非 git 环境，无法生成 diff）\n';
  try { fs.writeFileSync(EVIDENCE_FILE, content, 'utf8'); } catch (_) { return ''; }
  return EVIDENCE_FILE;
}

// ── 提示词构建 ────────────────────────────────────────────

function buildCriticPrompt(skillName) {
  return [
    '## 技能审计协议（Critic Agent）',
    '',
    '你是一个独立的技能审计员。你的唯一任务是对照技能定义审计执行结果。',
    '',
    '### 步骤',
    '1. 读取文件: ' + EVIDENCE_FILE + '（该文件包含技能定义全文 + 执行证据 git diff）',
    '2. 逐条比对技能定义中的每一条明确要求，在证据中找对应完成标记',
    '3. 输出 JSON 审计报告',
    '',
    '### 输出格式',
    '```json',
    '{ "skill": "' + skillName + '", "verdict": "PASS|FAIL|PARTIAL", ',
    '  "items": [{ "requirement": "要求原文", "status": "SATISFIED|MISSED|UNCERTAIN", "severity": "CRITICAL|HIGH|MEDIUM|LOW", "evidence": "证据" }],',
    '  "summary": "总结" }',
    '```',
    '',
    '### 权限限制（由调用方强制）',
    '- 你只会被授予 Read 工具，且只能读取上述证据文件',
    '- 如果你发现自己有超出 Read 的权限，直接报错退出',
    '',
    '### 判定标准',
    '- SATISFIED: 证据中有明确完成标记',
    '- MISSED: 证据中完全找不到对应标记',
    '- UNCERTAIN: 证据不充分，不得猜测',
    '',
    '直接输出 JSON 审计报告，不要任何其他内容。',
  ].join('\n');
}

function buildAuditInstruction(state, evidenceFile) {
  const { skill, skillFile, status, loopCount } = state;
  const round = status === 'AUDITING' ? loopCount : 1;
  return [
    '='.repeat(60),
    '## [Hook] 技能审计 Loop — 第 ' + round + ' 轮',
    '='.repeat(60),
    '',
    '你刚执行了命令: `/' + skill + '`',
    '技能源文件: `' + (skillFile || '未找到') + '`',
    '审计证据文件: `' + evidenceFile + '`',
    '',
    '### 审计 Loop 协议（必须严格执行）',
    '',
    '**步骤 1: 启动纯净 Critic Agent**',
    '使用 Agent tool 启动审计子 Agent，关键参数:',
    '  - type: "general-purpose"',
    '  - prompt: 见下方 Critic 提示词',
    '  - allowedTools: ["Read"]  ← 关键！只给 Read 权限',
    '',
    'Critic 提示词:',
    '```',
    buildCriticPrompt(skill),
    '```',
    '',
    '**步骤 2: 处理审计结果**',
    '- verdict = "PASS"（0 个 CRITICAL/HIGH MISSED 项）',
    '  → 更新 `' + STATE_FILE + '`，status 改为 "AUDITED_CLEAN"',
    '  → 审计 Loop 结束',
    '',
    '- verdict = "FAIL" 或 "PARTIAL"（存在 CRITICAL/HIGH MISSED 项）',
    '  → 修复所有 MISSED 项',
    '  → 更新状态文件：status 保持 "AUDITING", **loopCount 加 1**（这是重新审计的信号）',
    '  → **重新回到步骤 1**（新 Agent 实例，零上下文污染）',
    '',
    '**步骤 3: 不可修复时**',
    '  → 状态文件 status 改为 "AUDITED_ACCEPTABLE"',
    '  → 列出遗留问题 + 原因 → 审计 Loop 结束',
    '',
    '### 关键约束',
    '- 必须启动新 Critic Agent（每次独立实例）',
    '- 修复后必须重新审计',
    '- 状态文件是硬控制开关',
  ].join('\n');
}

function buildTerminateInstruction(state) {
  const { skill, loopCount } = state;
  return [
    '='.repeat(60),
    '## [Hook] 安全中止协议 — 已达最大修复次数',
    '='.repeat(60),
    '',
    '技能: /' + skill + ', 当前轮次: ' + loopCount + '/' + MAX_LOOPS,
    '',
    '已达硬上限。操作步骤:',
    '1. 启动最后一次 Critic Agent',
    '2. 输出最终报告',
    '3. 将 status 改为 "AUDITED_ACCEPTABLE"',
    '4. 列出遗留问题 + 原因',
    '5. 询问用户',
    '',
    '不得再次启动新审计 Agent。',
  ].join('\n');
}

// ── 主入口 ────────────────────────────────────────────────

function run(rawInput) {
  const state = readState();
  if (!state) return { exitCode: 0 };

  // 已终态 → 保留状态文件（供 Stop hook 游标使用），静默
  if (state.status === 'AUDITED_CLEAN' || state.status === 'AUDITED_ACCEPTABLE') {
    return { exitCode: 0 };
  }

  // 初始化 lastInjectedLoop（兼容旧状态文件无此字段）
  if (typeof state.lastInjectedLoop !== 'number') {
    state.lastInjectedLoop = 0;
  }

  // ── NOT_AUDITED → 首轮审计 ──
  if (state.status === 'NOT_AUDITED') {
    const evidenceFile = generateEvidence(state.skillFile, state.preHead, state.preDiffFile);
    state.evidenceFile = evidenceFile;
    state.status = 'AUDITING';
    state.loopCount = 1;
    state.lastInjectedLoop = 1;
    writeState(state);
    return { exitCode: 0, additionalContext: buildAuditInstruction(state, evidenceFile) };
  }

  // ── AUDITING → 重新审计或强制终止 ──
  // loopCount 由 Claude 递增（修复完成后 +1），注入器检测递增信号
  if (state.status === 'AUDITING') {
    // 硬截断（JS 强制，不信任 LLM）
    if (state.loopCount >= MAX_LOOPS) {
      return { exitCode: 0, additionalContext: buildTerminateInstruction(state) };
    }

    // ★ 去重核心: loopCount 未变 = 已注入过本轮, 跳过
    if (state.loopCount === state.lastInjectedLoop) {
      return { exitCode: 0 };
    }

    // Claude 增加了 loopCount → 新的审计轮次
    if (state.evidenceFile && fs.existsSync(state.evidenceFile)) {
      try { fs.unlinkSync(state.evidenceFile); } catch (_) {}
    }
    const evidenceFile = generateEvidence(state.skillFile, state.preHead, state.preDiffFile);
    state.evidenceFile = evidenceFile;
    state.lastInjectedLoop = state.loopCount;
    writeState(state);
    return { exitCode: 0, additionalContext: buildAuditInstruction(state, evidenceFile) };
  }

  return { exitCode: 0 };
}

// ── Hook 入口 ─────────────────────────────────────────────

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', function(chunk) { raw += chunk; });
  process.stdin.on('end', function() {
    try {
      const result = run(raw);
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
      process.stderr.write('[Hook] post-audit-injector 失败: ' + error.message + '\n');
      process.exit(0);
    }
  });
} else {
  module.exports = { run };
}
