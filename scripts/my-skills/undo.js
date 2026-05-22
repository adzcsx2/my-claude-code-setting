#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  acquireWriteLock,
  loadManifest,
  releaseWriteLock,
  removeDirectoryIfExists,
  restoreIndexSnapshots
} = require('../lib/my-skills-official');
const { ensureDir } = require('../lib/utils');
const { getQueueDir, nowIso } = require('../lib/my-skills-state');

function parseArgs(argv) {
  const options = {
    dryRun: false,
    manifestRef: null
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (!options.manifestRef) {
      options.manifestRef = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!options.manifestRef) {
    throw new Error('Usage: undo.js <run-id|manifest path> [--dry-run]');
  }

  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const { path: manifestPath, manifest } = loadManifest(options.manifestRef);
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`Manifest is missing or invalid: ${options.manifestRef}`);
  }
  if (manifest.undone_at) {
    throw new Error(`Run ${manifest.run_id} was already undone at ${manifest.undone_at}`);
  }

  const summary = {
    action: 'my-skills-undo',
    dry_run: options.dryRun,
    run_id: manifest.run_id,
    created_package_dirs: manifest.created_package_dirs || [],
    candidate_restore_path: manifest.candidate_artifact?.path || null
  };

  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  }

  const undoRunId = `undo-${manifest.run_id}-${nowIso().replace(/[:.]/g, '-')}`;
  let lock = null;

  try {
    lock = acquireWriteLock(undoRunId);

    for (const dirPath of manifest.created_package_dirs || []) {
      removeDirectoryIfExists(dirPath);
    }

    if (manifest.previous_indexes) {
      restoreIndexSnapshots(manifest.previous_indexes);
    }

    if (manifest.candidate_artifact?.path && manifest.candidate_artifact?.payload) {
      const allowedQueues = [
        getQueueDir('inbox'),
        getQueueDir('quarantine')
      ];
      const candidatePath = path.resolve(manifest.candidate_artifact.path);
      if (!allowedQueues.some(queueDir => candidatePath === queueDir || candidatePath.startsWith(`${queueDir}${path.sep}`))) {
        throw new Error(`Candidate restore path is outside runtime queues: ${candidatePath}`);
      }
      if (fs.existsSync(candidatePath)) {
        throw new Error(`Refusing to overwrite existing candidate artifact: ${candidatePath}`);
      }
      ensureDir(path.dirname(candidatePath));
      fs.writeFileSync(
        candidatePath,
        JSON.stringify(manifest.candidate_artifact.payload, null, 2),
        'utf8'
      );
    }

    const updatedManifest = {
      ...manifest,
      undone_at: nowIso(),
      undo_run_id: undoRunId
    };
    fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2), 'utf8');

    process.stdout.write(`${JSON.stringify({
      ...summary,
      dry_run: false,
      undo_run_id: undoRunId
    }, null, 2)}\n`);
  } finally {
    releaseWriteLock(lock);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`[my-skills undo] ${error.message}\n`);
  process.exit(1);
}
