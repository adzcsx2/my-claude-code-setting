#!/usr/bin/env node
'use strict';

const fs = require('fs');
const {
  appendAuditEvent,
  buildCandidateSignature,
  deleteFileIfExists,
  extractRecentTranscriptSignals,
  hasRecentAuditSignature,
  inferCategoryFromStackHint,
  inferPackageType,
  isAllowedTranscriptPath,
  listQueueArtifacts,
  mergeObserveCandidates,
  nowIso,
  safeParseJson,
  writeQueueArtifact
} = require('../lib/my-skills-state');

function createTranscriptCandidate(input) {
  const transcriptPath = typeof input.transcript_path === 'string' && input.transcript_path
    ? input.transcript_path
    : null;

  if (!transcriptPath || !fs.existsSync(transcriptPath) || !isAllowedTranscriptPath(transcriptPath)) {
    return null;
  }

  const observed = extractRecentTranscriptSignals(transcriptPath);
  if (!observed.summary || observed.signalTerms.length === 0) {
    return null;
  }

  return {
    summary: observed.summary,
    signal_terms: observed.signalTerms,
    stack_hint: observed.stackHint,
    session_ref: observed.sessionRef,
    confidence: observed.signalTerms.length >= 2 ? 'high' : 'medium',
    risk_flags: observed.redactionRisk.risk_flags,
    source: 'stop-transcript'
  };
}

function buildQueuePayload(queueName, createdAt, candidate, pendingCount, transcriptUsed) {
  const proposedCategory = inferCategoryFromStackHint(candidate.stack_hint);
  const proposedPackageType = inferPackageType(candidate.summary, candidate.signal_terms);
  const basePayload = {
    created_at: createdAt,
    summary: candidate.summary,
    signal_terms: candidate.signal_terms,
    stack_hint: candidate.stack_hint,
    session_ref: candidate.session_ref,
    signature: candidate.signature,
    confidence: candidate.confidence,
    notes: [
      `observe-only stop rollup (${pendingCount} pending hint${pendingCount === 1 ? '' : 's'})`,
      transcriptUsed ? 'transcript summary included' : 'pending-only rollup',
      'review and package manually before promotion'
    ]
  };

  if (queueName === 'quarantine') {
    return {
      kind: 'quarantine-candidate',
      ...basePayload,
      risk_flags: candidate.risk_flags
    };
  }

  return {
    kind: 'inbox-candidate',
    ...basePayload,
    source: 'realtime',
    proposed_category: proposedCategory,
    proposed_package_type: proposedPackageType,
    proposed_slug: `${proposedCategory}/${candidate.signature}`,
    quality_score: null,
    draft_status: 'needs-package-draft'
  };
}

function drainPendingArtifacts(pendingItems) {
  for (const item of pendingItems) {
    deleteFileIfExists(item.path);
  }
}

function run(raw) {
  const input = safeParseJson(raw);
  const createdAt = nowIso();
  const pendingItems = listQueueArtifacts('pending')
    .filter(item => item.payload.kind === 'pending-candidate');
  const transcriptCandidate = createTranscriptCandidate(input);

  const merged = mergeObserveCandidates([
    ...pendingItems.map(item => item.payload),
    transcriptCandidate
  ]);

  if (!merged) {
    appendAuditEvent({
      event: 'stop_observe',
      source: 'stop',
      notes: pendingItems.length > 0
        ? 'pending artifacts existed but did not produce a valid merged candidate'
        : 'no candidate signals detected'
    });
    return { exitCode: 0 };
  }

  const signature = buildCandidateSignature(merged);
  const candidate = {
    ...merged,
    signature
  };

  if (hasRecentAuditSignature(signature)) {
    drainPendingArtifacts(pendingItems);
    appendAuditEvent({
      event: 'stop_observe',
      source: 'stop',
      signature,
      notes: 'deduplicated stop-time candidate'
    });
    return { exitCode: 0 };
  }

  const queueName = candidate.risk_flags.length > 0 || candidate.confidence === 'low'
    ? 'quarantine'
    : 'inbox';
  const payload = buildQueuePayload(
    queueName,
    createdAt,
    candidate,
    pendingItems.length,
    Boolean(transcriptCandidate)
  );

  writeQueueArtifact(queueName, 'candidate', payload);
  drainPendingArtifacts(pendingItems);

  appendAuditEvent({
    event: 'candidate_hint',
    source: 'stop',
    signal_terms: candidate.signal_terms,
    confidence: candidate.confidence,
    session_ref: candidate.session_ref,
    stack_hint: candidate.stack_hint,
    risk_flags: candidate.risk_flags,
    queue: queueName,
    signature,
    notes: candidate.summary
  });

  return {
    stderr: `[Hook] my-skills emitted stop-time ${queueName} candidate`,
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
      process.stderr.write(`[Hook] my-skills stop failed: ${error.message}\n`);
      process.exit(0);
    }
  });
}

module.exports = { run };
