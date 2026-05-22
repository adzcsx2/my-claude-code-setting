#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  getClaudeDir,
  ensureDir,
  appendFile,
  readFile,
  stripAnsi
} = require('./utils');

const MAX_SUMMARY_CHARS = 280;
const AUDIT_SIGNATURE_SCAN_LIMIT = 200;
const ALLOWED_QUEUES = new Set(['pending', 'inbox', 'quarantine', 'backfill', 'manifests']);

const SIGNAL_PATTERNS = [
  { pattern: /\broot cause\b/i, term: 'root cause' },
  { pattern: /\bresolved\b/i, term: 'resolved' },
  { pattern: /\bfixed\b/i, term: 'fixed' },
  { pattern: /\bworks now\b/i, term: 'works now' },
  { pattern: /\bturned out\b/i, term: 'turned out' },
  { pattern: /解决了/u, term: '解决了' },
  { pattern: /修好了/u, term: '修好了' },
  { pattern: /搞定了/u, term: '搞定了' },
  { pattern: /终于/u, term: '终于' },
  { pattern: /找到原因了/u, term: '找到原因了' },
  { pattern: /根因/u, term: '根因' }
];

const REDACTION_PATTERNS = [
  { pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, placeholder: '<EMAIL>' },
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, placeholder: '<HOST>' },
  { pattern: /\b(?:\+?\d[\d()\-\s]{7,}\d)\b/g, placeholder: '<PHONE>' },
  { pattern: /\b(?:sk|rk|pk|ghp|gho|ghu|github_pat|xoxb|xoxp|AKIA)[-_A-Za-z0-9]{8,}\b/g, placeholder: '<TOKEN>' },
  { pattern: /\bBearer\s+[A-Za-z0-9._-]+\b/gi, placeholder: 'Bearer <TOKEN>' },
  { pattern: /\b(?:https?:\/\/|wss?:\/\/)\S+/gi, placeholder: '<URL>' },
  { pattern: /\/Users\/[^\s/]+\/[^\s]*/g, placeholder: '<PATH>' },
  { pattern: /[A-Za-z]:\\[^\s]*/g, placeholder: '<PATH>' }
];

const HIGH_RISK_PATTERNS = [
  { pattern: /\b(?:sk_live|rk_live|pk_live|github_pat|ghp|xoxb|xoxp)[-_A-Za-z0-9]{8,}\b/i, flag: 'secret-like-token' },
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, flag: 'secret-like-token' },
  { pattern: /\bBearer\s+[A-Za-z0-9._-]+\b/i, flag: 'secret-like-token' },
  { pattern: /\b(?:客户|甲方|项目代号|租户|客户名|公司名)[：:\s][^\s,，。;；]{2,}/u, flag: 'private-identifier' }
];

const STACK_HINTS = [
  { pattern: /\b(android|kotlin|jetpack|fragment|activity|compose)\b/i, hint: 'Android' },
  { pattern: /\b(next\.js|nextjs|react|vite|webpack|hydration|tsx|jsx)\b/i, hint: 'Web/React' },
  { pattern: /\b(node|npm|pnpm|yarn|typescript|javascript)\b/i, hint: 'Node.js/TypeScript' },
  { pattern: /\b(django|fastapi|pytest|python|pydantic)\b/i, hint: 'Python' },
  { pattern: /\b(go|golang)\b/i, hint: 'Go' },
  { pattern: /\b(spring|quarkus|maven|gradle|java)\b/i, hint: 'Java' },
  { pattern: /\b(rust|cargo)\b/i, hint: 'Rust' },
  { pattern: /\b(flutter|dart)\b/i, hint: 'Flutter/Dart' },
  { pattern: /\b(swift|swiftui|xcode|ios|macos)\b/i, hint: 'Swift/iOS' }
];

function getMySkillsStateDir() {
  return path.join(getClaudeDir(), 'state', 'my-skills');
}

function getMySkillsOfficialDir() {
  return path.join(getClaudeDir(), 'skills', 'my');
}

function getQueueDir(queueName) {
  if (!ALLOWED_QUEUES.has(queueName)) {
    throw new Error(`Unsupported my-skills queue: ${queueName}`);
  }
  return path.join(getMySkillsStateDir(), queueName);
}

function getAuditLogPath() {
  return path.join(getMySkillsStateDir(), 'audit-log.jsonl');
}

function nowIso() {
  return new Date().toISOString();
}

function safeParseJson(raw) {
  try {
    return JSON.parse(typeof raw === 'string' ? raw : String(raw ?? ''));
  } catch {
    return {};
  }
}

function safeReadJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function stableId(seed) {
  return crypto
    .createHash('sha256')
    .update(String(seed || ''))
    .digest('hex')
    .slice(0, 24);
}

function normalizeSignalTerms(terms) {
  return Array.from(
    new Set(
      (Array.isArray(terms) ? terms : [])
        .map(term => String(term || '').trim())
        .filter(Boolean)
    )
  );
}

function buildArtifactPath(queueName, prefix, seed) {
  const nonce = typeof process.hrtime.bigint === 'function'
    ? process.hrtime.bigint().toString()
    : `${Date.now()}:${Math.random()}`;
  const id = stableId(`${prefix}:${seed}:${Date.now()}:${nonce}`);
  return path.join(getQueueDir(queueName), `${prefix}-${id}.json`);
}

function redactText(text) {
  let output = stripAnsi(String(text || ''))
    .replace(/\s+/g, ' ')
    .trim();

  if (!output) {
    return '';
  }

  for (const { pattern, placeholder } of REDACTION_PATTERNS) {
    output = output.replace(pattern, placeholder);
  }

  return output.slice(0, MAX_SUMMARY_CHARS);
}

function assessRedactionRisk(text, redactedText = redactText(text)) {
  const raw = stripAnsi(String(text || ''));
  const cleaned = String(redactedText || '');
  const riskFlags = [];
  let replacementCount = 0;

  for (const { pattern, placeholder } of REDACTION_PATTERNS) {
    const matches = raw.match(pattern);
    if (matches && matches.length > 0) {
      replacementCount += matches.length;
      if (!cleaned.includes(placeholder)) {
        riskFlags.push('redaction-mismatch');
      }
    }
  }

  for (const { pattern, flag } of HIGH_RISK_PATTERNS) {
    if (pattern.test(raw) && !riskFlags.includes(flag)) {
      riskFlags.push(flag);
    }
  }

  const confidence = riskFlags.length > 0
    ? 'low'
    : replacementCount >= 3
      ? 'medium'
      : 'high';

  return {
    redaction_confidence: confidence,
    risk_flags: riskFlags,
    replacement_count: replacementCount
  };
}

function detectSignalTerms(text) {
  const content = String(text || '');
  const found = [];
  for (const { pattern, term } of SIGNAL_PATTERNS) {
    if (pattern.test(content)) {
      found.push(term);
    }
  }
  return normalizeSignalTerms(found);
}

function detectStackHint(text) {
  const content = String(text || '');
  for (const { pattern, hint } of STACK_HINTS) {
    if (pattern.test(content)) {
      return hint;
    }
  }
  return null;
}

function inferCategoryFromStackHint(stackHint) {
  const hint = String(stackHint || '').toLowerCase();
  if (hint.includes('android')) {
    return 'android';
  }
  if (hint.includes('web') || hint.includes('react')) {
    return 'web';
  }
  if (hint.includes('python') || hint.includes('go') || hint.includes('java') || hint.includes('rust') || hint.includes('node')) {
    return 'backend';
  }
  return 'universal';
}

function inferPackageType(summary, signalTerms) {
  const combined = `${summary || ''} ${(signalTerms || []).join(' ')}`.toLowerCase();
  if (/\b(workflow|pipeline|system|architecture|bootstrap|playbook|integration|backfill)\b/.test(combined)) {
    return 'capability';
  }
  return 'atom';
}

function slugify(value, fallback = 'candidate') {
  const raw = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return raw || fallback;
}

function extractToolText(input) {
  if (!input || typeof input !== 'object') {
    return '';
  }

  const parts = [];

  if (input.tool_name) {
    parts.push(String(input.tool_name));
  }

  if (input.tool_input && typeof input.tool_input === 'object') {
    for (const key of [
      'command',
      'file_path',
      'path',
      'content',
      'old_string',
      'new_string',
      'query',
      'prompt',
      'message'
    ]) {
      if (typeof input.tool_input[key] === 'string') {
        parts.push(input.tool_input[key]);
      }
    }
  }

  if (input.tool_output && typeof input.tool_output === 'object') {
    for (const key of ['output', 'stdout', 'stderr', 'content', 'result']) {
      if (typeof input.tool_output[key] === 'string') {
        parts.push(input.tool_output[key]);
      }
    }
  }

  return parts.join('\n').slice(0, 16 * 1024);
}

function resolveToolPath(input) {
  if (!input || typeof input !== 'object' || !input.tool_input || typeof input.tool_input !== 'object') {
    return null;
  }

  for (const key of ['file_path', 'path']) {
    if (typeof input.tool_input[key] === 'string' && input.tool_input[key].trim()) {
      return path.resolve(input.tool_input[key]);
    }
  }

  return null;
}

function resolveSessionRef(input = {}) {
  if (typeof input.session_ref === 'string' && input.session_ref.trim()) {
    return input.session_ref.trim().replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 120);
  }

  if (typeof input.transcript_path === 'string' && input.transcript_path.trim()) {
    return path.basename(input.transcript_path.trim(), path.extname(input.transcript_path.trim()));
  }

  if (process.env.CLAUDE_SESSION_ID && process.env.CLAUDE_SESSION_ID.trim()) {
    return process.env.CLAUDE_SESSION_ID.trim().replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 120);
  }

  return null;
}

function isAllowedTranscriptPath(candidatePath, options = {}) {
  const resolved = path.resolve(String(candidatePath || '')).replace(/\\/g, '/');
  const home = path.resolve(getClaudeDir(), '..').replace(/\\/g, '/');
  if (options.allowHomeJsonl) {
    return resolved.startsWith(`${home}/`) && resolved.endsWith('.jsonl');
  }
  return resolved.startsWith(`${home}/.cursor/projects/`)
    && resolved.includes('/agent-transcripts/')
    && resolved.endsWith('.jsonl');
}

function extractRecentTranscriptSignals(transcriptPath, options = {}) {
  if (!transcriptPath || !isAllowedTranscriptPath(transcriptPath, options) || !fs.existsSync(transcriptPath)) {
    return {
      summary: '',
      signalTerms: [],
      stackHint: null,
      sessionRef: resolveSessionRef(),
      redactionRisk: assessRedactionRisk('', '')
    };
  }

  const content = readFile(transcriptPath);
  if (!content) {
    return {
      summary: '',
      signalTerms: [],
      stackHint: null,
      sessionRef: resolveSessionRef({ transcript_path: transcriptPath }),
      redactionRisk: assessRedactionRisk('', '')
    };
  }

  const lines = content.split('\n').filter(Boolean).slice(-80);
  const collected = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const rawContent = entry.message?.content ?? entry.content;
      const text = typeof rawContent === 'string'
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map(chunk => (chunk && chunk.text) || '').join(' ')
          : '';
      if (text) {
        collected.push(text);
      }
    } catch {
      continue;
    }
  }

  const joined = collected.slice(-6).join('\n');
  const summary = redactText(joined);

  return {
    summary,
    signalTerms: detectSignalTerms(joined),
    stackHint: detectStackHint(joined),
    sessionRef: resolveSessionRef({ transcript_path: transcriptPath }),
    redactionRisk: assessRedactionRisk(joined, summary)
  };
}

function buildCandidateSignature(fields) {
  return stableId(JSON.stringify({
    summary: String(fields.summary || '').trim(),
    signal_terms: normalizeSignalTerms(fields.signal_terms || fields.signalTerms || []),
    stack_hint: fields.stack_hint || fields.stackHint || null,
    proposed_category: fields.proposed_category || null,
    proposed_package_type: fields.proposed_package_type || null
  }));
}

function readAuditEvents(limit = AUDIT_SIGNATURE_SCAN_LIMIT) {
  const logPath = getAuditLogPath();
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const stats = fs.statSync(logPath);
  if (!stats.size) {
    return [];
  }

  const bytesToRead = Math.min(stats.size, 128 * 1024);
  const buffer = Buffer.alloc(bytesToRead);
  const handle = fs.openSync(logPath, 'r');
  try {
    fs.readSync(handle, buffer, 0, bytesToRead, stats.size - bytesToRead);
  } finally {
    fs.closeSync(handle);
  }

  const content = buffer.toString('utf8');
  return content
    .split('\n')
    .filter(Boolean)
    .slice(-limit)
    .map(line => safeParseJson(line))
    .filter(entry => entry && typeof entry === 'object');
}

function hasRecentAuditSignature(signature) {
  if (!signature) {
    return false;
  }

  return readAuditEvents().some(entry => entry.signature === signature);
}

function appendAuditEvent(event) {
  ensureDir(getMySkillsStateDir());
  const record = {
    ts: nowIso(),
    ...event
  };
  appendFile(getAuditLogPath(), `${JSON.stringify(record)}\n`);
}

function writeQueueArtifact(queueName, prefix, payload) {
  const dirPath = getQueueDir(queueName);
  ensureDir(dirPath);
  const filePath = buildArtifactPath(queueName, prefix, JSON.stringify(payload));
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return filePath;
}

function listQueueArtifacts(queueName) {
  const dirPath = getQueueDir(queueName);
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const filePath = path.join(dirPath, name);
      return {
        path: filePath,
        payload: safeReadJsonFile(filePath)
      };
    })
    .filter(item => item.payload && typeof item.payload === 'object');
}

function deleteFileIfExists(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Best effort cleanup only.
  }
}

function mergeObserveCandidates(candidates) {
  const valid = (Array.isArray(candidates) ? candidates : [])
    .filter(candidate => candidate && typeof candidate === 'object')
    .filter(candidate => typeof candidate.summary === 'string' && candidate.summary.trim());

  if (valid.length === 0) {
    return null;
  }

  const signalTerms = normalizeSignalTerms(valid.flatMap(candidate => candidate.signal_terms || candidate.signalTerms || []));
  const summaries = valid.map(candidate => String(candidate.summary || '').trim()).filter(Boolean);
  const summary = summaries.sort((left, right) => right.length - left.length)[0].slice(0, MAX_SUMMARY_CHARS);
  const riskFlags = Array.from(new Set(valid.flatMap(candidate => candidate.risk_flags || candidate.riskFlags || [])));
  const stackHint = valid.map(candidate => candidate.stack_hint || candidate.stackHint).find(Boolean) || detectStackHint(summary);
  const sessionRef = valid.map(candidate => candidate.session_ref || candidate.sessionRef).find(Boolean) || resolveSessionRef();
  const confidence = valid.some(candidate => candidate.confidence === 'high')
    ? 'high'
    : valid.some(candidate => candidate.confidence === 'medium')
      ? 'medium'
      : signalTerms.length > 0
        ? 'medium'
        : 'low';

  return {
    summary,
    signal_terms: signalTerms,
    risk_flags: riskFlags,
    stack_hint: stackHint,
    session_ref: sessionRef,
    confidence
  };
}

module.exports = {
  MAX_SUMMARY_CHARS,
  appendAuditEvent,
  assessRedactionRisk,
  buildCandidateSignature,
  deleteFileIfExists,
  detectSignalTerms,
  detectStackHint,
  extractRecentTranscriptSignals,
  extractToolText,
  getAuditLogPath,
  getMySkillsOfficialDir,
  getMySkillsStateDir,
  getQueueDir,
  hasRecentAuditSignature,
  inferCategoryFromStackHint,
  inferPackageType,
  isAllowedTranscriptPath,
  listQueueArtifacts,
  mergeObserveCandidates,
  normalizeSignalTerms,
  nowIso,
  readAuditEvents,
  redactText,
  resolveSessionRef,
  resolveToolPath,
  safeParseJson,
  safeReadJsonFile,
  slugify,
  stableId,
  writeQueueArtifact
};
