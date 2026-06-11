#!/usr/bin/env node
'use strict';

/**
 * stop-skill-audit.js — Stop hook, 检测层 v3
 *
 * v3 修复:
 *   - 独立游标文件 skill-audit-cursor.json, 记录每个 transcript 的已扫描位置
 *   - 只扫描游标之后的新增内容, 避免重复检测旧 Skill 调用
 *   - 检测到 Skill 后写入 state 文件 (由 post-audit-injector.js 消费)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = require('os').homedir();
const SESSION_DATA_DIR = path.join(HOME, '.claude', 'session-data');
const STATE_FILE = path.join(SESSION_DATA_DIR, 'skill-audit-state.json');
const CURSOR_FILE = path.join(SESSION_DATA_DIR, 'skill-audit-cursor.json');
const SCAN_MAX_BYTES = 2 * 1024 * 1024;

// ── 游标读写 ──────────────────────────────────────────────

function readCursors() {
  if (!fs.existsSync(CURSOR_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8')); } catch { return {}; }
}

function writeCursors(cursors) {
  try { fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursors), 'utf8'); } catch {}
}

// 清理超过 24h 未更新的游标（避免泄漏）
function pruneCursors(cursors) {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const pruned = {};
  for (const key of Object.keys(cursors)) {
    const entry = cursors[key];
    if (typeof entry === 'object' && entry.ts && (now - entry.ts) < oneDay) {
      pruned[key] = entry;
    } else if (typeof entry === 'number') {
      // 兼容旧格式（纯数字 offset），迁移为新格式
      pruned[key] = { offset: entry, ts: now };
    }
  }
  return pruned;
}

// ── Git ────────────────────────────────────────────────────

let _inGitRepo = null;
function isInGitRepo() {
  if (_inGitRepo !== null) return _inGitRepo;
  try { execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' }); _inGitRepo = true; } catch { _inGitRepo = false; }
  return _inGitRepo;
}

function getGitHead() {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim(); } catch { return ''; }
}

// ── Skill 文件搜索 ────────────────────────────────────────

function findSkillFile(skillName) {
  const candidates = [
    path.join(HOME, '.claude', 'skills', skillName + '.md'),
    path.join(HOME, '.claude', 'skills', skillName, 'SKILL.md'),
    path.join(HOME, '.claude', 'commands', skillName + '.md'),
    path.join(HOME, '.claude', 'commands', 'ecc', skillName + '.md'),
  ];
  if (skillName.startsWith('ecc:')) {
    candidates.push(path.join(HOME, '.claude', 'commands', 'ecc', skillName.slice(4) + '.md'));
  }
  for (const c of candidates) { if (fs.existsSync(c)) return c; }
  return '';
}

// ── Transcript 扫描 (仅扫描游标之后的新增内容) ───────────

function detectNewSkillInTranscript(transcriptPath, lastOffset) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;

  let stat;
  try { stat = fs.statSync(transcriptPath); } catch { return null; }

  // 无新内容
  if (stat.size <= lastOffset) return null;

  // 只读取新增部分
  const readStart = Math.min(lastOffset, stat.size);
  const readSize = Math.min(stat.size - readStart, SCAN_MAX_BYTES);
  if (readSize <= 0) return null;

  let content;
  try {
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, readStart);
    fs.closeSync(fd);
    content = buf.toString('utf8');
  } catch { return null; }

  // 从后往前扫描新增内容中的 Skill 调用
  const lines = content.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line || (line.indexOf('"name":"Skill"') === -1 && line.indexOf('"name": "Skill"') === -1)) continue;
    try {
      const entry = JSON.parse(line);
      const msgContent = entry.message && entry.message.content;
      if (Array.isArray(msgContent)) {
        for (const block of msgContent) {
          if (block.type === 'tool_use' && block.name === 'Skill' && block.input && block.input.skill) {
            return { skillName: block.input.skill };
          }
        }
      }
    } catch {}
  }

  return null;
}

// ── 主入口 ────────────────────────────────────────────────

function run(rawInput) {
  // 解析 Stop 事件
  let transcriptPath = '';
  try {
    const input = JSON.parse(rawInput);
    if (input.hook_event_name === 'Stop' && input.transcript_path) {
      transcriptPath = input.transcript_path;
    }
  } catch { return { exitCode: 0 }; }
  if (!transcriptPath) return { exitCode: 0 };

  // 读取并清理游标
  let cursors = pruneCursors(readCursors());
  const cursorEntry = cursors[transcriptPath];
  const lastOffset = (typeof cursorEntry === 'object' && cursorEntry.offset != null) ? cursorEntry.offset : 0;

  // 只扫描新增部分
  const detected = detectNewSkillInTranscript(transcriptPath, lastOffset);

  // ★ 无论是否检测到 Skill，都更新游标（不再重扫已读区域）
  const newOffset = (() => {
    try { return fs.statSync(transcriptPath).size; } catch { return lastOffset; }
  })();
  cursors[transcriptPath] = { offset: newOffset, ts: Date.now() };
  writeCursors(cursors);

  // 未检测到新 Skill → 静默
  if (!detected) return { exitCode: 0 };

  // 检测到新 Skill → 创建审计状态
  const skillFile = findSkillFile(detected.skillName);
  const preHead = isInGitRepo() ? getGitHead() : '';

  const state = {
    skill: detected.skillName,
    skillFile: skillFile,
    status: 'NOT_AUDITED',
    loopCount: 0,
    lastInjectedLoop: 0,
    preHead: preHead,
    preDiffFile: '',
    evidenceFile: '',
    timestamp: Date.now()
  };

  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write('[Hook] stop-skill-audit 写入状态文件失败: ' + err.message + '\n');
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
      if (result && result.stderr) {
        process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : result.stderr + '\n');
      }
      process.exit(Number.isInteger(result && result.exitCode) ? result.exitCode : 0);
    } catch (error) {
      process.stderr.write('[Hook] stop-skill-audit 失败: ' + error.message + '\n');
      process.exit(0);
    }
  });
} else {
  module.exports = { run };
}
