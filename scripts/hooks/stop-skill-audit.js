#!/usr/bin/env node
'use strict';

/**
 * stop-skill-audit.js — Stop hook, 仅负责检测 Skill 调用并创建审计状态文件
 *
 * Claude Code 限制: Stop hook 不支持 hookSpecificOutput.additionalContext。
 * 因此本 hook 只做两件事:
 *   1. 扫描 transcript 检测本轮是否使用了 Skill tool
 *   2. 如检测到 → 写入 skill-audit-state.json (NOT_AUDITED)
 *
 * 实际的审计指令注入由 post-audit-injector.js (PostToolUse hook, matcher: *) 负责。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = require('os').homedir();
const SESSION_DATA_DIR = path.join(HOME, '.claude', 'session-data');
const STATE_FILE = path.join(SESSION_DATA_DIR, 'skill-audit-state.json');
const SCAN_MAX_BYTES = 2 * 1024 * 1024;

function isInGitRepo() {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
}

function getGitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch { return ''; }
}

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
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return '';
}

function detectSkillFromTranscript(transcriptPath) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return null;
  let content;
  try {
    const stat = fs.statSync(transcriptPath);
    const start = Math.max(0, stat.size - SCAN_MAX_BYTES);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
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

function run(rawInput) {
  let transcriptPath = '';
  try {
    const input = JSON.parse(rawInput);
    if (input.hook_event_name === 'Stop' && input.transcript_path) {
      transcriptPath = input.transcript_path;
    }
  } catch { return { exitCode: 0 }; }

  if (!transcriptPath) return { exitCode: 0 };

  const detected = detectSkillFromTranscript(transcriptPath);
  if (!detected) return { exitCode: 0 };

  const skillFile = findSkillFile(detected.skillName);
  const preHead = getGitHead();

  const state = {
    skill: detected.skillName,
    skillFile: skillFile,
    status: 'NOT_AUDITED',
    loopCount: 0,
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
