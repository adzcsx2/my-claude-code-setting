#!/usr/bin/env node
'use strict';

const {
  appendAuditEvent,
  assessRedactionRisk,
  buildCandidateSignature,
  detectSignalTerms,
  detectStackHint,
  extractToolText,
  nowIso,
  redactText,
  resolveSessionRef,
  resolveToolPath,
  safeParseJson,
  hasRecentAuditSignature,
  writeQueueArtifact
} = require('../lib/my-skills-state');

const OBSERVABLE_READ_PATH_PATTERNS = [
  /\/agent-transcripts\/.+\.jsonl$/i,
  /\/terminals\/.+\.txt$/i
];

const IGNORED_READ_PATH_PATTERNS = [
  /\/\.claude\/plans\//i,
  /\/\.claude\/skills\/my\//i,
  /\/\.claude\/state\/my-skills\//i,
  /\/\.claude\/hooks\/hooks\.json$/i
];

const BASH_COMMAND_DENYLIST = [
  /\b(?:printenv|env)\b/i,
  /\b(?:cat|less|more|head|tail)\b\s+.+(?:\.env|\.pem|\.key|\.crt|\.p12|authorized_keys)\b/i,
  /\b(?:pg_dump|mysqldump|mongodump|sqlite3)\b/i,
  /\b(?:heroku\s+config|kubectl\s+get\s+secret|aws\s+secretsmanager|op\s+read|pass\s+show)\b/i
];

function deriveConfidence(toolName, signalCount, redactionConfidence) {
  if (redactionConfidence === 'low') {
    return 'low';
  }
  if (signalCount >= 2 && toolName === 'Bash') {
    return 'high';
  }
  if (signalCount >= 1) {
    return 'medium';
  }
  return 'low';
}

function shouldObserve(input) {
  const toolName = String(input.tool_name || '').trim();
  if (toolName === 'Bash') {
    const command = String(input.tool_input?.command || '').trim();
    return !BASH_COMMAND_DENYLIST.some(pattern => pattern.test(command));
  }

  if (toolName !== 'Read' && toolName !== 'ReadFile') {
    return false;
  }

  const filePath = resolveToolPath(input);
  if (!filePath) {
    return false;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  if (IGNORED_READ_PATH_PATTERNS.some(pattern => pattern.test(normalizedPath))) {
    return false;
  }

  return OBSERVABLE_READ_PATH_PATTERNS.some(pattern => pattern.test(normalizedPath));
}

function run(raw) {
  const input = safeParseJson(raw);
  const toolName = String(input.tool_name || '').trim();
  if (!toolName) {
    return { exitCode: 0 };
  }

  if (!shouldObserve(input)) {
    return { exitCode: 0 };
  }

  const text = extractToolText(input);
  const signalTerms = detectSignalTerms(text);
  if (signalTerms.length === 0) {
    return { exitCode: 0 };
  }

  const summary = redactText(text);
  if (!summary) {
    return { exitCode: 0 };
  }

  const createdAt = nowIso();
  const stackHint = detectStackHint(text);
  const sessionRef = resolveSessionRef(input);
  const { redaction_confidence: redactionConfidence, risk_flags: riskFlags } = assessRedactionRisk(text, summary);
  const confidence = deriveConfidence(toolName, signalTerms.length, redactionConfidence);
  const signature = buildCandidateSignature({
    summary,
    signal_terms: signalTerms,
    stack_hint: stackHint
  });

  if (hasRecentAuditSignature(signature)) {
    return { exitCode: 0 };
  }

  const event = {
    event: 'candidate_hint',
    source: 'posttooluse',
    tool_name: toolName,
    signal_terms: signalTerms,
    confidence,
    session_ref: sessionRef,
    stack_hint: stackHint,
    risk_flags: riskFlags,
    signature,
    notes: summary
  };

  appendAuditEvent(event);

  if (riskFlags.length > 0 || redactionConfidence === 'low') {
    writeQueueArtifact('quarantine', 'candidate', {
      kind: 'quarantine-candidate',
      created_at: createdAt,
      source: 'posttooluse',
      summary,
      signal_terms: signalTerms,
      stack_hint: stackHint,
      session_ref: sessionRef,
      risk_flags: riskFlags.length > 0 ? riskFlags : ['redaction-confidence-low'],
      signature,
      notes: [
        `observed from ${toolName}`,
        'review required before any package draft'
      ]
    });
    return {
      stderr: `[Hook] my-skills quarantined candidate hint from ${toolName}`,
      exitCode: 0
    };
  }

  writeQueueArtifact('pending', 'candidate', {
    kind: 'pending-candidate',
    created_at: createdAt,
    source: 'posttooluse',
    tool_name: toolName,
    summary,
    signal_terms: signalTerms,
    stack_hint: stackHint,
    session_ref: sessionRef,
    confidence,
    signature
  });

  return {
    stderr: `[Hook] my-skills observed candidate hint from ${toolName}`,
    exitCode: 0
  };
}

if (require.main === module) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    raw += chunk;
  });
  process.stdin.on('end', () => {
    try {
      const result = run(raw);
      if (result && typeof result.stdout === 'string') {
        process.stdout.write(result.stdout);
      }
      if (result && typeof result.stderr === 'string') {
        process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
      }
      process.exit(Number.isInteger(result && result.exitCode) ? result.exitCode : 0);
    } catch (error) {
      process.stderr.write(`[Hook] my-skills posttooluse failed: ${error.message}\n`);
      process.exit(0);
    }
  });
}

module.exports = { run };
