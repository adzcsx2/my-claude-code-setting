#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  acquireWriteLock,
  buildIndexArtifacts,
  finalizeStagedPackage,
  getOfficialPaths,
  listOfficialPackages,
  normalizeSlug,
  releaseWriteLock,
  removeDirectoryIfExists,
  resolveCandidateRef,
  restoreIndexSnapshots,
  snapshotIndexes,
  stageCandidate,
  validateCandidateDraft,
  writeIndexArtifacts,
  writeManifest
} = require('../lib/my-skills-official');
const { nowIso } = require('../lib/my-skills-state');

function parseArgs(argv) {
  const options = {
    dryRun: false,
    allowQuarantine: false,
    candidateRef: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--allow-quarantine') {
      options.allowQuarantine = true;
      continue;
    }
    if (!options.candidateRef) {
      options.candidateRef = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.candidateRef) {
    throw new Error('Usage: promote.js <candidate path|id> [--dry-run] [--allow-quarantine]');
  }

  return options;
}

function buildExtraMetadata(candidate, slug) {
  const triggerTerms = Array.isArray(candidate.trigger_terms) && candidate.trigger_terms.length > 0
    ? candidate.trigger_terms
    : Array.isArray(candidate.signal_terms)
      ? candidate.signal_terms
      : [];

  const errorEntries = (candidate.error_fingerprints || []).map(entry => {
    if (typeof entry === 'string') {
      return {
        error_fingerprint: entry,
        normalized_keywords: triggerTerms,
        matched_slugs: [slug],
        confidence_hint: 'medium'
      };
    }
    return {
      error_fingerprint: entry.error_fingerprint,
      normalized_keywords: Array.isArray(entry.normalized_keywords) ? entry.normalized_keywords : triggerTerms,
      matched_slugs: [slug],
      confidence_hint: entry.confidence_hint || 'medium'
    };
  }).filter(entry => entry.error_fingerprint);

  return {
    indexEntries: [
      {
        slug,
        description: candidate.description || candidate.summary,
        trigger_terms: triggerTerms
      }
    ],
    errorEntries
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const resolved = resolveCandidateRef(options.candidateRef);
  const candidate = resolved.payload;
  const slug = normalizeSlug(candidate);
  const validationErrors = validateCandidateDraft(candidate, {
    queue: resolved.queue,
    allowQuarantine: options.allowQuarantine
  });

  const plan = {
    candidate_path: resolved.path,
    queue: resolved.queue,
    slug,
    official_target: path.join(getOfficialPaths().officialDir, slug),
    validation: validationErrors.length === 0 ? ['ok'] : validationErrors
  };

  if (options.dryRun || validationErrors.length > 0) {
    process.stdout.write(`${JSON.stringify({
      action: 'my-skills-promote',
      dry_run: true,
      ...plan
    }, null, 2)}\n`);
    process.exit(validationErrors.length > 0 ? 1 : 0);
  }

  const runId = `promote-${nowIso().replace(/[:.]/g, '-')}-${slug.split('/').pop()}`;
  let lock = null;
  let stageResult = null;
  let finalDir = null;
  let previousIndexes = null;

  try {
    lock = acquireWriteLock(runId);
    previousIndexes = snapshotIndexes();
    stageResult = stageCandidate(candidate, runId);
    finalDir = finalizeStagedPackage(stageResult);

    const artifacts = buildIndexArtifacts(
      listOfficialPackages(),
      buildExtraMetadata(candidate, slug)
    );
    writeIndexArtifacts(artifacts);

    const manifest = {
      run_id: runId,
      created_at: nowIso(),
      operation: 'promote',
      slug,
      candidate_artifact: {
        path: resolved.path,
        queue: resolved.queue,
        payload: candidate
      },
      created_package_dirs: [finalDir],
      created_files: stageResult.createdFiles,
      previous_indexes: previousIndexes,
      commit: null
    };

    const manifestPath = writeManifest(manifest);
    if (resolved.path && fs.existsSync(resolved.path)) {
      fs.unlinkSync(resolved.path);
    }
    removeDirectoryIfExists(stageResult.stagingRoot);

    process.stdout.write(`${JSON.stringify({
      action: 'my-skills-promote',
      dry_run: false,
      run_id: runId,
      slug,
      official_target: finalDir,
      manifest: manifestPath
    }, null, 2)}\n`);
  } catch (error) {
    if (previousIndexes) {
      restoreIndexSnapshots(previousIndexes);
    }
    if (finalDir) {
      removeDirectoryIfExists(finalDir);
    }
    if (stageResult && stageResult.stagingRoot) {
      removeDirectoryIfExists(stageResult.stagingRoot);
    }
    throw error;
  } finally {
    releaseWriteLock(lock);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`[my-skills promote] ${error.message}\n`);
  process.exit(1);
}
