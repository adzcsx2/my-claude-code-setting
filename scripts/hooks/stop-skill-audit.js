#!/usr/bin/env node
'use strict';

/**
 * stop-skill-audit.js — Stop hook, 检测层 v4
 *
 * v4: session_id 隔离，多窗口并发互不干扰
 *   - 状态文件: skill-audit-state-{sessionId}.json
 *   - 证据文件: skill-audit-evidence-{sessionId}.txt (由注入器生成)
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = require('os').homedir();
const SESSION_DATA_DIR = path.join(HOME, '.claude', 'session-data');
const CURSOR_FILE = path.join(SESSION_DATA_DIR, 'skill-audit-cursor.json');
const SCAN_MAX_BYTES = 2 * 1024 * 1024;
const STALE_TTL_MS = 30 * 60 * 1000; // 30 分钟过期清理

function stateFile(sessionId) {
  return path.join(SESSION_DATA_DIR, 'skill-audit-state-' + sessionId + '.json');
}

// ── 游标读写 ──────────────────────────────────────────────

function readCursors() {
  if (!fs.existsSync(CURSOR_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(CURSOR_FILE, 'utf8')); } catch { return {}; }
}

function writeCursors(cursors) {
  try { fs.writeFileSync(CURSOR_FILE, JSON.stringify(cursors), 'utf8'); } catch {}
}

function pruneCursors(cursors) {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const pruned = {};
  for (const key of Object.keys(cursors)) {
    const entry = cursors[key];
    const ts = (typeof entry === 'object' && entry.ts) ? entry.ts : 0;
    if ((now - ts) < oneDay) pruned[key] = entry;
  }
  return pruned;
}

// ── 脏状态清理 ────────────────────────────────────────────

function cleanStaleStates(currentSessionId) {
  try {
    const files = fs.readdirSync(SESSION_DATA_DIR);
    const now = Date.now();
    for (const f of files) {
      if (!f.startsWith('skill-audit-state-') || !f.endsWith('.json')) continue;
      const sid = f.replace('skill-audit-state-', '').replace('.json', '');
      if (sid === currentSessionId) continue; // 当前 session 不清理
      const fullPath = path.join(SESSION_DATA_DIR, f);
      try {
        const stat = fs.statSync(fullPath);
        // 超过 TTL 的旧状态直接删除
        if ((now - stat.mtimeMs) > STALE_TTL_MS) {
          const oldState = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
          if (oldState.evidenceFile && fs.existsSync(oldState.evidenceFile)) {
            fs.unlinkSync(oldState.evidenceFile);
          }
          fs.unlinkSync(fullPath);
        }
      } catch {}
    }
  } catch {}
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

// ── Transcript 扫描 ───────────────────────────────────────

function detectNewSkillInTranscript(transcriptPath, lastOffset) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let stat;
  try { stat = fs.statSync(transcriptPath); } catch { return null; }
  if (stat.size <= lastOffset) return null;
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
  let sessionId = '', transcriptPath = '';
  try {
    const input = JSON.parse(rawInput);
    if (input.hook_event_name === 'Stop' && input.transcript_path) {
      transcriptPath = input.transcript_path;
      sessionId = input.session_id || '';
    }
  } catch { return { exitCode: 0 }; }
  if (!transcriptPath) return { exitCode: 0 };

  // 清理旧 session 的脏状态
  if (sessionId) cleanStaleStates(sessionId);

  // 游标
  let cursors = pruneCursors(readCursors());
  const cursorEntry = cursors[transcriptPath];
  const lastOffset = (typeof cursorEntry === 'object' && cursorEntry.offset != null) ? cursorEntry.offset : 0;

  const detected = detectNewSkillInTranscript(transcriptPath, lastOffset);

  const newOffset = (() => {
    try { return fs.statSync(transcriptPath).size; } catch { return lastOffset; }
  })();
  cursors[transcriptPath] = { offset: newOffset, ts: Date.now() };
  writeCursors(cursors);

  if (!detected) return { exitCode: 0 };

  // 检测到 Skill → 创建 session 隔离的状态文件
  const skillFile = findSkillFile(detected.skillName);
  const preHead = isInGitRepo() ? getGitHead() : '';

  const state = {
    sessionId: sessionId,
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

  const targetFile = sessionId ? stateFile(sessionId) : path.join(SESSION_DATA_DIR, 'skill-audit-state.json');
  try {
    fs.writeFileSync(targetFile, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    process.stderr.write('[Hook] stop-skill-audit 写入失败: ' + err.message + '\n');
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
