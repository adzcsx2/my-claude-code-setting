'use strict';

const fs = require('fs');
const path = require('path');

const { writeInstallState } = require('../install-state');
const { filterMcpConfig, parseDisabledMcpServers } = require('../mcp-config');

function readJsonObject(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Failed to parse ${label} at ${filePath}: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid ${label} at ${filePath}: expected a JSON object`);
  }

  return parsed;
}

function cloneJsonValue(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function deepMergeJson(baseValue, patchValue) {
  if (!isPlainObject(baseValue) || !isPlainObject(patchValue)) {
    return cloneJsonValue(patchValue);
  }

  const merged = { ...baseValue };
  for (const [key, value] of Object.entries(patchValue)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = deepMergeJson(merged[key], value);
    } else {
      merged[key] = cloneJsonValue(value);
    }
  }
  return merged;
}

function formatJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function replacePluginRootPlaceholders(value, pluginRoot) {
  if (!pluginRoot) {
    return value;
  }

  if (typeof value === 'string') {
    return value.split('${CLAUDE_PLUGIN_ROOT}').join(pluginRoot);
  }

  if (Array.isArray(value)) {
    return value.map(item => replacePluginRootPlaceholders(item, pluginRoot));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        replacePluginRootPlaceholders(nestedValue, pluginRoot),
      ])
    );
  }

  return value;
}

function findHooksSourcePath(plan, hooksDestinationPath) {
  const operation = plan.operations.find(item => item.destinationPath === hooksDestinationPath);
  return operation ? operation.sourcePath : null;
}

function isMcpConfigPath(filePath) {
  const basename = path.basename(String(filePath || ''));
  return basename === '.mcp.json' || basename === 'mcp.json';
}

function buildResolvedClaudeHooks(plan) {
  if (!plan.adapter || (plan.adapter.target !== 'claude' && plan.adapter.target !== 'claude-project')) {
    return null;
  }

  const pluginRoot = plan.targetRoot;
  const hooksDestinationPath = path.join(plan.targetRoot, 'hooks', 'hooks.json');
  const hooksSourcePath = findHooksSourcePath(plan, hooksDestinationPath) || hooksDestinationPath;
  if (!fs.existsSync(hooksSourcePath)) {
    return null;
  }

  const hooksConfig = readJsonObject(hooksSourcePath, 'hooks config');
  const resolvedHooks = replacePluginRootPlaceholders(hooksConfig.hooks, pluginRoot);
  if (!resolvedHooks || typeof resolvedHooks !== 'object' || Array.isArray(resolvedHooks)) {
    throw new Error(`Invalid hooks config at ${hooksSourcePath}: expected "hooks" to be a JSON object`);
  }

  return {
    hooksDestinationPath,
    resolvedHooksConfig: {
      ...hooksConfig,
      hooks: resolvedHooks,
    },
  };
}

/**
 * Collect a directory and its ancestors up to maxDepth levels.
 * Starting from the directory itself (not its parent).
 */
function collectSelfAndParentDirs(dirs, maxDepth) {
  const result = new Set();
  for (const dir of dirs) {
    let current = dir;
    for (let i = 0; i <= maxDepth; i += 1) {
      if (result.has(current)) {
        break;
      }
      result.add(current);
      current = path.dirname(current);
    }
  }
  return result;
}

/**
 * Remove stale managed files from the destination that are no longer
 * present in the new install plan.
 *
 * Uses two complementary strategies:
 * 1. State-based: compares old install-state operations with the new plan
 * 2. Scan-based: scans managed namespace directories on disk for files not
 *    in the new plan (handles the case where install-state was already
 *    updated without cleaning up stale files)
 */
function cleanupStaleManagedFiles(plan) {
  const removedFiles = [];
  const removedDirs = [];

  const newManagedOps = plan.operations.filter(
    op => op.kind === 'copy-file' && op.ownership === 'managed'
  );
  const newDestPaths = new Set(newManagedOps.map(op => op.destinationPath));

  // Strategy 1: state-based cleanup (compare with old install-state)
  const stateResult = cleanupFromOldState(plan, newDestPaths);
  removedFiles.push(...stateResult.removedFiles);
  const candidateDirsFromState = stateResult.candidateDirs;

  // Strategy 2: scan-based cleanup (find orphaned files on disk)
  const scanResult = cleanupOrphanedFiles(plan, newManagedOps, newDestPaths);
  removedFiles.push(...scanResult.removedFiles);
  removedDirs.push(...scanResult.removedDirs);

  // Merge candidate dirs from both strategies
  const allCandidateDirs = new Set([
    ...candidateDirsFromState,
    ...scanResult.candidateDirs,
  ]);

  // Remove empty directories (up to 3 levels deep)
  const parentDirs = collectSelfAndParentDirs(allCandidateDirs, 3);
  const allNewDirs = collectSelfAndParentDirs(newDestPaths, 3);

  for (const dir of parentDirs) {
    if (allNewDirs.has(dir)) {
      continue;
    }

    if (!fs.existsSync(dir)) {
      continue;
    }

    try {
      const entries = fs.readdirSync(dir);
      if (entries.length === 0) {
        fs.rmdirSync(dir);
        removedDirs.push(dir);
      }
    } catch (_err) {
      // Non-critical: skip dirs that cannot be removed
    }
  }

  return { removedFiles, removedDirs };
}

/**
 * State-based cleanup: remove files recorded in old install-state
 * that are no longer in the new plan.
 */
function cleanupFromOldState(plan, newDestPaths) {
  const removedFiles = [];
  const candidateDirs = new Set();

  if (!plan.installStatePath) {
    return { removedFiles, candidateDirs };
  }

  let oldState;
  try {
    oldState = JSON.parse(fs.readFileSync(plan.installStatePath, 'utf8'));
  } catch (_err) {
    return { removedFiles, candidateDirs };
  }

  if (!oldState || !Array.isArray(oldState.operations)) {
    return { removedFiles, candidateDirs };
  }

  const oldManagedOps = oldState.operations.filter(
    op => op.kind === 'copy-file' && op.ownership === 'managed' && op.destinationPath
  );

  for (const op of oldManagedOps) {
    const dest = op.destinationPath;

    if (newDestPaths.has(dest)) {
      continue;
    }

    if (!op.sourceRelativePath) {
      continue;
    }

    if (!fs.existsSync(dest)) {
      continue;
    }

    try {
      fs.rmSync(dest, { force: true });
      removedFiles.push(dest);
      candidateDirs.add(path.dirname(dest));
    } catch (_err) {
      // Non-critical: skip files that cannot be removed
    }
  }

  return { removedFiles, candidateDirs };
}

/**
 * Scan-based cleanup: find files on disk in managed namespace directories
 * that have no matching operation in the new plan and no corresponding
 * source file in the repo.
 */
function cleanupOrphanedFiles(plan, newManagedOps, newDestPaths) {
  const removedFiles = [];
  const removedDirs = [];
  const candidateDirs = new Set();

  // Identify managed namespace directories — directories under the
  // target root that are fully owned by ECC (e.g. commands/ecc/,
  // skills/ecc/, rules/ecc/).
  const managedNsDirs = new Set();
  for (const op of newManagedOps) {
    const dest = op.destinationPath;
    // Walk up from the file to find the managed namespace root.
    // A managed namespace dir is one whose name is 'ecc' and whose
    // parent is a known top-level category (commands, skills, rules).
    let current = path.dirname(dest);
    while (current && current !== plan.targetRoot && current !== path.dirname(current)) {
      const name = path.basename(current);
      const parent = path.dirname(current);
      const parentName = path.basename(parent);
      const knownCategories = new Set(['commands', 'skills', 'rules']);
      if (name === 'ecc' && knownCategories.has(parentName)) {
        managedNsDirs.add(current);
        break;
      }
      current = parent;
    }
  }

  // Scan each managed namespace directory for orphaned files
  for (const nsDir of managedNsDirs) {
    if (!fs.existsSync(nsDir)) {
      continue;
    }
    scanAndRemoveOrphans(nsDir, newDestPaths, removedFiles, removedDirs, candidateDirs);
  }

  return { removedFiles, removedDirs, candidateDirs };
}

function scanAndRemoveOrphans(dir, keepPaths, removedFiles, removedDirs, candidateDirs) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return false;
  }

  let hasKeptContent = false;

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const childHasContent = scanAndRemoveOrphans(fullPath, keepPaths, removedFiles, removedDirs, candidateDirs);
      if (!childHasContent && !keepPaths.has(fullPath)) {
        try {
          fs.rmdirSync(fullPath);
          removedDirs.push(fullPath);
          candidateDirs.add(path.dirname(fullPath));
        } catch (_err) {
          hasKeptContent = true;
        }
      } else {
        hasKeptContent = true;
      }
    } else if (entry.isFile()) {
      if (!keepPaths.has(fullPath)) {
        try {
          fs.rmSync(fullPath, { force: true });
          removedFiles.push(fullPath);
          candidateDirs.add(path.dirname(fullPath));
        } catch (_err) {
          hasKeptContent = true;
        }
      } else {
        hasKeptContent = true;
      }
    }
  }

  return hasKeptContent;
}

function applyInstallPlan(plan) {
  const resolvedClaudeHooksPlan = buildResolvedClaudeHooks(plan);
  const disabledServers = parseDisabledMcpServers(process.env.ECC_DISABLED_MCPS);

  const cleanupResult = cleanupStaleManagedFiles(plan);
  if (cleanupResult.removedFiles.length > 0 || cleanupResult.removedDirs.length > 0) {
    const removedPaths = [...cleanupResult.removedFiles, ...cleanupResult.removedDirs];
    console.log(`[ECC] Cleaned up ${removedPaths.length} stale managed file(s):`);
    for (const p of removedPaths) {
      console.log(`[ECC]   Removed ${p}`);
    }
  }

  for (const operation of plan.operations) {
    fs.mkdirSync(path.dirname(operation.destinationPath), { recursive: true });

    if (operation.kind === 'merge-json') {
      const payload = cloneJsonValue(operation.mergePayload);
      if (payload === undefined) {
        throw new Error(`Missing merge payload for ${operation.destinationPath}`);
      }

      const filteredPayload = (
        isMcpConfigPath(operation.destinationPath) && disabledServers.length > 0
      )
        ? filterMcpConfig(payload, disabledServers).config
        : payload;

      const currentValue = fs.existsSync(operation.destinationPath)
        ? readJsonObject(operation.destinationPath, 'existing JSON config')
        : {};
      const mergedValue = deepMergeJson(currentValue, filteredPayload);
      fs.writeFileSync(operation.destinationPath, formatJson(mergedValue), 'utf8');
      continue;
    }

    if (operation.kind === 'copy-file' && isMcpConfigPath(operation.destinationPath) && disabledServers.length > 0) {
      const sourceConfig = readJsonObject(operation.sourcePath, 'MCP config');
      const filteredConfig = filterMcpConfig(sourceConfig, disabledServers).config;
      fs.writeFileSync(operation.destinationPath, formatJson(filteredConfig), 'utf8');
      continue;
    }

    fs.copyFileSync(operation.sourcePath, operation.destinationPath);
  }

  if (resolvedClaudeHooksPlan) {
    fs.mkdirSync(path.dirname(resolvedClaudeHooksPlan.hooksDestinationPath), { recursive: true });
    fs.writeFileSync(
      resolvedClaudeHooksPlan.hooksDestinationPath,
      JSON.stringify(resolvedClaudeHooksPlan.resolvedHooksConfig, null, 2) + '\n',
      'utf8'
    );
  }

  writeInstallState(plan.installStatePath, plan.statePreview);

  return {
    ...plan,
    applied: true,
  };
}

module.exports = {
  applyInstallPlan,
  cleanupStaleManagedFiles,
};
