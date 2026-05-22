#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  buildBackfillDraft
} = require('../lib/my-skills-official');
const {
  extractRecentTranscriptSignals,
  inferCategoryFromStackHint,
  inferPackageType,
  nowIso,
  slugify,
  writeQueueArtifact
} = require('../lib/my-skills-state');
const { ensureDir } = require('../lib/utils');

function parseArgs(argv) {
  const options = {
    source: path.join(os.homedir(), '.cursor', 'projects', 'empty-window', 'agent-transcripts'),
    limit: null,
    from: null,
    to: null,
    dryRun: true,
    writeQueue: false,
    queue: 'inbox'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') {
      if (!argv[index + 1]) {
        throw new Error('--source requires a path');
      }
      options.source = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--limit') {
      if (!argv[index + 1]) {
        throw new Error('--limit requires a value');
      }
      options.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--from') {
      if (!argv[index + 1]) {
        throw new Error('--from requires a YYYY-MM-DD value');
      }
      options.from = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--to') {
      if (!argv[index + 1]) {
        throw new Error('--to requires a YYYY-MM-DD value');
      }
      options.to = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--write-queue') {
      options.writeQueue = true;
      options.dryRun = false;
      continue;
    }
    if (arg === '--queue') {
      if (!argv[index + 1]) {
        throw new Error('--queue requires inbox or quarantine');
      }
      options.queue = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.limit && !options.from && !options.to) {
    throw new Error('Backfill requires --limit or a --from/--to date range');
  }
  if (options.limit !== null && (!Number.isFinite(options.limit) || options.limit <= 0)) {
    throw new Error('--limit must be a positive number');
  }
  if (options.from && !/^\d{4}-\d{2}-\d{2}$/.test(options.from)) {
    throw new Error('--from must be YYYY-MM-DD');
  }
  if (options.to && !/^\d{4}-\d{2}-\d{2}$/.test(options.to)) {
    throw new Error('--to must be YYYY-MM-DD');
  }

  if (!['inbox', 'quarantine'].includes(options.queue)) {
    throw new Error('--queue must be inbox or quarantine');
  }

  return options;
}

function validateSourcePath(sourcePath) {
  const resolved = path.resolve(sourcePath);
  const home = path.resolve(os.homedir());
  if (!(resolved === home || resolved.startsWith(`${home}${path.sep}`))) {
    throw new Error('--source must stay within the current home directory');
  }
  return resolved;
}

function collectTranscriptFiles(sourcePath) {
  const resolved = validateSourcePath(sourcePath);
  const stats = fs.statSync(resolved);
  if (stats.isFile()) {
    if (!resolved.endsWith('.jsonl')) {
      throw new Error('--source file must be a .jsonl transcript');
    }
    return [resolved];
  }

  return fs.readdirSync(resolved, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map(entry => {
      const filePath = path.join(resolved, entry.name);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .map(item => item.filePath);
}

function withinDateRange(filePath, options) {
  const mtime = fs.statSync(filePath).mtime;
  const localDate = [
    mtime.getFullYear(),
    String(mtime.getMonth() + 1).padStart(2, '0'),
    String(mtime.getDate()).padStart(2, '0')
  ].join('-');
  if (options.from && localDate < options.from) {
    return false;
  }
  if (options.to && localDate > options.to) {
    return false;
  }
  return true;
}

function buildCandidateFromTranscript(transcriptPath) {
  const observed = extractRecentTranscriptSignals(transcriptPath, { allowHomeJsonl: true });
  if (!observed.summary || observed.signalTerms.length === 0) {
    return null;
  }

  const proposedCategory = inferCategoryFromStackHint(observed.stackHint);
  const proposedPackageType = inferPackageType(observed.summary, observed.signalTerms);
  const transcriptStem = path.basename(transcriptPath, '.jsonl');
  const slugStem = slugify(observed.signalTerms.slice(0, 2).join('-') || transcriptStem);
  const draft = buildBackfillDraft({
    created_at: nowIso(),
    source: 'backfill',
    session_ref: observed.sessionRef,
    summary: observed.summary,
    description: observed.summary,
    proposed_category: proposedCategory,
    proposed_package_type: proposedPackageType,
    proposed_slug: `${proposedCategory}/${slugStem}`,
    signal_terms: observed.signalTerms,
    trigger_terms: observed.signalTerms,
    error_fingerprints: [],
    stack_hint: observed.stackHint,
    context_tier: proposedPackageType === 'capability' ? 'small' : 'tiny',
    quality_score: null,
    tags: ['backfill'],
    risk_flags: observed.redactionRisk.risk_flags,
    transcript_path: transcriptPath
  });

  return draft;
}

function writeReport(report) {
  const reportDir = path.join(os.homedir(), '.claude', 'state', 'my-skills', 'backfill');
  ensureDir(reportDir);
  const reportPath = path.join(
    reportDir,
    `backfill-${nowIso().replace(/[:.]/g, '-')}.json`
  );
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  return reportPath;
}

function enqueueCandidate(candidate, preferredQueue) {
  const queueName = candidate.risk_flags.length > 0 ? 'quarantine' : preferredQueue;
  const payload = queueName === 'quarantine'
    ? {
      kind: 'quarantine-candidate',
      created_at: candidate.created_at,
      source: 'backfill',
      summary: candidate.summary,
      signal_terms: candidate.signal_terms,
      stack_hint: candidate.stack_hint,
      session_ref: candidate.session_ref,
      risk_flags: candidate.risk_flags,
      proposed_category: candidate.proposed_category,
      proposed_package_type: candidate.proposed_package_type,
      proposed_slug: candidate.proposed_slug,
      trigger_terms: candidate.trigger_terms,
      error_fingerprints: candidate.error_fingerprints,
      package_draft: candidate.package_draft,
      tags: candidate.tags,
      notes: [
        `historical backfill source: ${path.basename(candidate.transcript_path)}`,
        'review required before promotion'
      ]
    }
    : {
      kind: 'inbox-candidate',
      created_at: candidate.created_at,
      source: 'backfill',
      summary: candidate.summary,
      signal_terms: candidate.signal_terms,
      stack_hint: candidate.stack_hint,
      session_ref: candidate.session_ref,
      proposed_category: candidate.proposed_category,
      proposed_package_type: candidate.proposed_package_type,
      proposed_slug: candidate.proposed_slug,
      trigger_terms: candidate.trigger_terms,
      error_fingerprints: candidate.error_fingerprints,
      quality_score: candidate.quality_score,
      package_draft: candidate.package_draft,
      tags: candidate.tags,
      notes: [
        `historical backfill source: ${path.basename(candidate.transcript_path)}`,
        'review required before promotion'
      ]
    };

  return {
    queue: queueName,
    artifactPath: writeQueueArtifact(queueName, 'candidate', payload)
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const transcripts = collectTranscriptFiles(options.source)
    .filter(filePath => withinDateRange(filePath, options))
    .slice(0, options.limit || Number.MAX_SAFE_INTEGER);

  const candidates = transcripts
    .map(buildCandidateFromTranscript)
    .filter(Boolean);

  const queued = [];
  if (options.writeQueue) {
    for (const candidate of candidates) {
      queued.push(enqueueCandidate(candidate, options.queue));
    }
  }

  const report = {
    action: 'my-skills-backfill',
    created_at: nowIso(),
    dry_run: !options.writeQueue,
    source: path.resolve(options.source),
    inputs_scanned: transcripts.length,
    candidates_found: candidates.length,
    queued,
    candidates: candidates.map(candidate => ({
      proposed_slug: candidate.proposed_slug,
      summary: candidate.summary,
      signal_terms: candidate.signal_terms,
      stack_hint: candidate.stack_hint,
      risk_flags: candidate.risk_flags,
      transcript_path: candidate.transcript_path
    }))
  };

  const reportPath = writeReport(report);
  process.stdout.write(`${JSON.stringify({
    ...report,
    report_path: reportPath
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[my-skills backfill] ${error.message}\n`);
  process.exit(1);
}
