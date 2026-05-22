#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ensureDir,
  readFile
} = require('./utils');
const {
  getMySkillsOfficialDir,
  getMySkillsStateDir,
  getQueueDir,
  nowIso,
  safeReadJsonFile,
  slugify,
  stableId
} = require('./my-skills-state');

const VALID_CATEGORIES = ['universal', 'web', 'android', 'backend'];
const VALID_PACKAGE_TYPES = ['atom', 'cookbook', 'capability', 'router'];
const INDEX_FILES = {
  indexMarkdown: 'INDEX.md',
  indexJson: 'INDEX.json',
  errorMarkdown: 'ERROR-INDEX.md',
  errorJson: 'ERROR-INDEX.json'
};

function getOfficialPaths() {
  const officialDir = getMySkillsOfficialDir();
  const stateDir = getMySkillsStateDir();
  return {
    officialDir,
    stateDir,
    stagingDir: path.join(stateDir, 'staging'),
    manifestsDir: path.join(stateDir, 'manifests'),
    locksDir: path.join(stateDir, 'locks'),
    lockPath: path.join(stateDir, 'locks', 'write.lock'),
    indexMarkdownPath: path.join(officialDir, INDEX_FILES.indexMarkdown),
    indexJsonPath: path.join(officialDir, INDEX_FILES.indexJson),
    errorMarkdownPath: path.join(officialDir, INDEX_FILES.errorMarkdown),
    errorJsonPath: path.join(officialDir, INDEX_FILES.errorJson)
  };
}

function normalizePath(targetPath) {
  return path.resolve(String(targetPath || ''));
}

function isWithinPath(targetPath, basePath) {
  const resolvedTarget = normalizePath(targetPath);
  const resolvedBase = normalizePath(basePath);
  return resolvedTarget === resolvedBase || resolvedTarget.startsWith(`${resolvedBase}${path.sep}`);
}

function assertWithinPath(targetPath, basePath, label) {
  if (!isWithinPath(targetPath, basePath)) {
    throw new Error(`${label} must stay within ${basePath}`);
  }
  return normalizePath(targetPath);
}

function parseSimpleValue(rawValue) {
  const value = String(rawValue || '').trim();
  if (value === 'null') {
    return null;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  if (value === '[]') {
    return [];
  }
  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value);
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
    return value.slice(1, -1);
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => part.replace(/^['"]|['"]$/g, ''));
  }
  return value;
}

function parseFrontmatter(markdown) {
  const content = String(markdown || '').replace(/\r\n/g, '\n');
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { attributes: {}, body: content };
  }

  const frontmatter = match[1];
  const body = match[2];
  const lines = frontmatter.split('\n');
  const attributes = {};

  for (let index = 0; index < lines.length;) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyMatch) {
      index += 1;
      continue;
    }

    const [, key, rawValue] = keyMatch;
    if (rawValue === '>') {
      index += 1;
      const parts = [];
      while (index < lines.length && (/^\s+/.test(lines[index]) || lines[index].trim() === '')) {
        if (lines[index].trim()) {
          parts.push(lines[index].trim());
        }
        index += 1;
      }
      attributes[key] = parts.join(' ');
      continue;
    }

    if (rawValue === '') {
      const items = [];
      index += 1;
      while (index < lines.length && /^\s*-\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*-\s+/, '').trim().replace(/^['"]|['"]$/g, ''));
        index += 1;
      }
      attributes[key] = items.length > 0 ? items : null;
      continue;
    }

    attributes[key] = parseSimpleValue(rawValue);
    index += 1;
  }

  return { attributes, body };
}

function renderScalarValue(value) {
  if (value === null || typeof value === 'undefined') {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    return null;
  }
  const stringValue = String(value);
  if (/[:\[\]\{\},#]|^\s|\s$/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '\\"')}"`;
  }
  return stringValue;
}

function renderFrontmatter(attributes) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'string' && value.length > 72 && /\s/.test(value)) {
      lines.push(`${key}: >`);
      for (const chunk of value.split('\n').join(' ').split(/(?<=.{1,72})\s+/)) {
        if (chunk.trim()) {
          lines.push(`  ${chunk.trim()}`);
        }
      }
      continue;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${String(item)}`);
        }
      }
      continue;
    }

    lines.push(`${key}: ${renderScalarValue(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function updateFrontmatter(markdown, updates) {
  const parsed = parseFrontmatter(markdown);
  const merged = {
    ...parsed.attributes,
    ...updates
  };
  return `${renderFrontmatter(merged)}\n\n${String(parsed.body || '').replace(/^\n+/, '')}`;
}

function titleFromSlug(slug) {
  return slug
    .split('/')
    .pop()
    .split('-')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function listOfficialPackages() {
  const { officialDir } = getOfficialPaths();
  const packages = [];

  for (const category of VALID_CATEGORIES) {
    const categoryDir = path.join(officialDir, category);
    if (!fs.existsSync(categoryDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const packageDir = path.join(categoryDir, entry.name);
      const skillPath = path.join(packageDir, 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        continue;
      }

      const skillContent = readFile(skillPath);
      const parsed = parseFrontmatter(skillContent);
      packages.push({
        slug: `${category}/${entry.name}`,
        packageDir,
        skillPath,
        skillContent,
        body: parsed.body,
        ...parsed.attributes
      });
    }
  }

  return packages.sort((left, right) => left.slug.localeCompare(right.slug));
}

function extractSectionBullets(markdown, heading) {
  const content = String(markdown || '');
  const sectionRegex = new RegExp(`##\\s+${heading.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\n([\\s\\S]*?)(?:\\n##\\s+|$)`, 'i');
  const match = content.match(sectionRegex);
  if (!match) {
    return [];
  }

  return match[1]
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('- '))
    .map(line => line.replace(/^- /, '').trim())
    .filter(Boolean);
}

function normalizeTerms(terms) {
  return Array.from(
    new Set(
      (Array.isArray(terms) ? terms : [])
        .map(term => String(term || '').trim())
        .filter(Boolean)
        .slice(0, 8)
    )
  );
}

function loadExistingIndexMetadata() {
  const paths = getOfficialPaths();
  const indexJson = safeReadJsonFile(paths.indexJsonPath) || { entries: [] };
  const errorJson = safeReadJsonFile(paths.errorJsonPath) || { entries: [] };

  const indexEntriesBySlug = new Map();
  for (const entry of indexJson.entries || []) {
    if (entry && typeof entry.slug === 'string') {
      indexEntriesBySlug.set(entry.slug, entry);
    }
  }

  return {
    indexEntriesBySlug,
    errorEntries: Array.isArray(errorJson.entries) ? errorJson.entries : []
  };
}

function deriveTriggerTerms(pkg, preservedEntry) {
  if (preservedEntry && Array.isArray(preservedEntry.trigger_terms) && preservedEntry.trigger_terms.length > 0) {
    return normalizeTerms(preservedEntry.trigger_terms);
  }

  return normalizeTerms([
    ...(Array.isArray(pkg.tags) ? pkg.tags : []),
    ...extractSectionBullets(pkg.skillContent, 'When to use')
      .filter(line => line.length <= 80)
      .slice(0, 5)
  ]);
}

function buildIndexArtifacts(packages, extraMetadata = {}) {
  const existing = loadExistingIndexMetadata();
  const extraIndexEntriesBySlug = new Map();
  const extraErrorEntries = Array.isArray(extraMetadata.errorEntries) ? extraMetadata.errorEntries : [];

  for (const entry of extraMetadata.indexEntries || []) {
    if (entry && typeof entry.slug === 'string') {
      extraIndexEntriesBySlug.set(entry.slug, entry);
    }
  }

  const indexEntries = packages.map(pkg => {
    const extraEntry = extraIndexEntriesBySlug.get(pkg.slug);
    const preservedEntry = extraEntry || existing.indexEntriesBySlug.get(pkg.slug);
    return {
      slug: pkg.slug,
      category: pkg.category,
      package_type: pkg.package_type,
      description: String(pkg.description || extraEntry?.description || '').trim(),
      trigger_terms: deriveTriggerTerms(pkg, preservedEntry),
      lifecycle: pkg.lifecycle,
      source: pkg.source,
      context_tier: pkg.context_tier,
      default_read_next: typeof pkg.default_read_next === 'string' ? pkg.default_read_next : null
    };
  });

  const allowedSlugs = new Set(indexEntries.map(entry => entry.slug));
  const errorGroups = new Map();
  const combinedErrorEntries = [...existing.errorEntries, ...extraErrorEntries];

  for (const entry of combinedErrorEntries) {
    if (!entry || typeof entry.error_fingerprint !== 'string') {
      continue;
    }
    const matchedSlugs = (entry.matched_slugs || []).filter(slug => allowedSlugs.has(slug));
    if (matchedSlugs.length === 0) {
      continue;
    }

    const key = entry.error_fingerprint;
    const current = errorGroups.get(key) || {
      error_fingerprint: entry.error_fingerprint,
      normalized_keywords: [],
      matched_slugs: [],
      confidence_hint: entry.confidence_hint || 'medium'
    };
    current.normalized_keywords = normalizeTerms([
      ...current.normalized_keywords,
      ...(entry.normalized_keywords || [])
    ]);
    current.matched_slugs = Array.from(new Set([...current.matched_slugs, ...matchedSlugs])).sort();
    current.confidence_hint = entry.confidence_hint || current.confidence_hint || 'medium';
    errorGroups.set(key, current);
  }

  const errorEntries = Array.from(errorGroups.values()).sort((left, right) =>
    left.error_fingerprint.localeCompare(right.error_fingerprint)
  );

  const indexJson = JSON.stringify({
    version: 1,
    description: 'Machine-readable retrieval index for skills/my/',
    generated_at: nowIso().slice(0, 10),
    entries: indexEntries
  }, null, 2);

  const errorJson = JSON.stringify({
    version: 1,
    description: 'Machine-readable error fingerprint index for skills/my/',
    generated_at: nowIso().slice(0, 10),
    entries: errorEntries
  }, null, 2);

  const indexMarkdown = [
    '# My Skills Index',
    '',
    'Human-readable index for official packages under `skills/my/`.',
    '',
    'This file is mechanically rebuilt. Do not hand-edit rows.',
    '',
    '## Columns',
    '',
    '- `Slug` — package path identifier',
    '- `Category` — `universal | web | android | backend`',
    '- `Type` — `atom | cookbook | capability | router`',
    '- `Lifecycle` — main lifecycle state',
    '- `Source` — `realtime | backfill`',
    '- `Summary` — one-line retrieval description',
    '',
    '## Entries',
    '',
    '| Slug | Category | Type | Lifecycle | Source | Summary |',
    '|---|---|---|---|---|---|',
    ...indexEntries.map(entry =>
      `| \`${entry.slug}\` | \`${entry.category}\` | \`${entry.package_type}\` | \`${entry.lifecycle}\` | \`${entry.source}\` | ${entry.description} |`
    )
  ].join('\n');

  const errorMarkdown = [
    '# My Skills Error Index',
    '',
    'Human-readable error fingerprint index for `skills/my/`.',
    '',
    'This file is mechanically rebuilt. Do not hand-edit rows.',
    '',
    '## Columns',
    '',
    '- `Fingerprint` — normalized, redacted error signature',
    '- `Keywords` — normalized trigger keywords',
    '- `Slugs` — matching package slugs',
    '',
    '## Entries',
    '',
    '| Fingerprint | Keywords | Slugs |',
    '|---|---|---|',
    ...errorEntries.map(entry =>
      `| \`${entry.error_fingerprint}\` | \`${entry.normalized_keywords.join(', ')}\` | ${entry.matched_slugs.map(slug => `\`${slug}\``).join(', ')} |`
    )
  ].join('\n');

  return {
    indexJson,
    errorJson,
    indexMarkdown,
    errorMarkdown
  };
}

function snapshotIndexes() {
  const paths = getOfficialPaths();
  const snapshots = {};
  for (const [key, filePath] of Object.entries({
    index_json: paths.indexJsonPath,
    error_json: paths.errorJsonPath,
    index_markdown: paths.indexMarkdownPath,
    error_markdown: paths.errorMarkdownPath
  })) {
    snapshots[key] = fs.existsSync(filePath) ? readFile(filePath) : null;
  }
  return snapshots;
}

function writeIndexArtifacts(artifacts) {
  const paths = getOfficialPaths();
  fs.writeFileSync(paths.indexJsonPath, `${artifacts.indexJson}\n`, 'utf8');
  fs.writeFileSync(paths.errorJsonPath, `${artifacts.errorJson}\n`, 'utf8');
  fs.writeFileSync(paths.indexMarkdownPath, `${artifacts.indexMarkdown}\n`, 'utf8');
  fs.writeFileSync(paths.errorMarkdownPath, `${artifacts.errorMarkdown}\n`, 'utf8');
}

function acquireWriteLock(runId) {
  const { locksDir, lockPath } = getOfficialPaths();
  ensureDir(locksDir);
  let handle;
  try {
    handle = fs.openSync(lockPath, 'wx');
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }

    const existing = safeReadJsonFile(lockPath);
    const createdAt = existing && existing.created_at ? Date.parse(existing.created_at) : Number.NaN;
    const staleThresholdMs = 5 * 60 * 1000;
    if (!Number.isNaN(createdAt) && Date.now() - createdAt > staleThresholdMs) {
      fs.unlinkSync(lockPath);
      handle = fs.openSync(lockPath, 'wx');
    } else {
      throw new Error(`Write lock already held at ${lockPath}`);
    }
  }
  try {
    fs.writeFileSync(handle, JSON.stringify({
      run_id: runId,
      created_at: nowIso(),
      pid: process.pid
    }, null, 2), 'utf8');
  } catch (error) {
    try {
      fs.closeSync(handle);
    } catch {
      // best effort
    }
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // best effort
    }
    throw error;
  }
  return { handle, lockPath };
}

function releaseWriteLock(lock) {
  if (!lock) {
    return;
  }
  try {
    if (typeof lock.handle === 'number') {
      fs.closeSync(lock.handle);
    }
  } catch {
    // best effort
  }
  try {
    if (lock.lockPath && fs.existsSync(lock.lockPath)) {
      fs.unlinkSync(lock.lockPath);
    }
  } catch {
    // best effort
  }
}

function ensureSafeRelativePath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) {
    throw new Error(`Unsafe relative path: ${relativePath}`);
  }
  return normalized;
}

function resolveCandidateRef(candidateRef) {
  if (!candidateRef) {
    throw new Error('Candidate ref is required');
  }

  const inboxDir = getQueueDir('inbox');
  const quarantineDir = getQueueDir('quarantine');
  const directPath = path.resolve(candidateRef);
  if (fs.existsSync(directPath)) {
    const queue = isWithinPath(directPath, inboxDir)
      ? 'inbox'
      : isWithinPath(directPath, quarantineDir)
        ? 'quarantine'
        : null;
    if (!queue) {
      throw new Error('Candidate path must be inside inbox/ or quarantine/');
    }
    return {
      path: directPath,
      queue,
      payload: safeReadJsonFile(directPath)
    };
  }

  const partialMatches = [];
  for (const queueName of ['inbox', 'quarantine']) {
    const queueDir = getQueueDir(queueName);
    if (!fs.existsSync(queueDir)) {
      continue;
    }
    for (const artifact of fs.readdirSync(queueDir, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      if (!artifact.isFile() || !artifact.name.endsWith('.json')) {
        continue;
      }
      if (artifact.name === candidateRef) {
        const filePath = path.join(queueDir, artifact.name);
        return {
          path: filePath,
          queue: queueName,
          payload: safeReadJsonFile(filePath)
        };
      }
      if (candidateRef.length >= 8 && artifact.name.includes(candidateRef)) {
        partialMatches.push({
          path: path.join(queueDir, artifact.name),
          queue: queueName
        });
      }
    }
  }

  if (partialMatches.length === 1) {
    return {
      path: partialMatches[0].path,
      queue: partialMatches[0].queue,
      payload: safeReadJsonFile(partialMatches[0].path)
    };
  }

  if (partialMatches.length > 1) {
    throw new Error(`Candidate ref is ambiguous: ${candidateRef}`);
  }

  throw new Error(`Candidate not found: ${candidateRef}`);
}

function ensureWriteTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, String(content), 'utf8');
}

function normalizeSlug(candidate) {
  const category = VALID_CATEGORIES.includes(candidate.proposed_category)
    ? candidate.proposed_category
    : 'universal';
  const rawSlug = String(candidate.proposed_slug || '').trim();
  if (rawSlug.includes('/')) {
    const parts = rawSlug.split('/').filter(Boolean);
    if (parts.length !== 2) {
      throw new Error(`Invalid proposed_slug: ${rawSlug}`);
    }
    const [candidateCategory, candidateName] = parts;
    return `${VALID_CATEGORIES.includes(candidateCategory) ? candidateCategory : category}/${slugify(candidateName)}`;
  }
  const fallback = slugify(candidate.name || candidate.summary || stableId(JSON.stringify(candidate)));
  return `${category}/${slugify(rawSlug || fallback)}`;
}

function validateCandidateDraft(candidate, options = {}) {
  const errors = [];
  if (!candidate || typeof candidate !== 'object') {
    return ['Candidate payload is missing or invalid'];
  }

  if (!VALID_CATEGORIES.includes(candidate.proposed_category)) {
    errors.push(`Invalid proposed_category: ${candidate.proposed_category}`);
  }
  if (!VALID_PACKAGE_TYPES.includes(candidate.proposed_package_type)) {
    errors.push(`Invalid proposed_package_type: ${candidate.proposed_package_type}`);
  }
  if (!candidate.package_draft || typeof candidate.package_draft !== 'object') {
    errors.push('Candidate is observe-only and still needs package_draft content');
  }
  if (!candidate.package_draft?.skill_markdown) {
    errors.push('package_draft.skill_markdown is required');
  }
  if (candidate.proposed_package_type === 'capability' && !candidate.package_draft?.playbook_markdown) {
    errors.push('Capability promotion requires package_draft.playbook_markdown');
  }
  if (options.queue === 'quarantine' && !options.allowQuarantine) {
    errors.push('Promoting directly from quarantine requires --allow-quarantine');
  }
  if (fs.existsSync(path.join(getOfficialPaths().officialDir, normalizeSlug(candidate)))) {
    errors.push(`Official package already exists: ${normalizeSlug(candidate)}`);
  }

  return errors;
}

function buildPromotedSkillMarkdown(candidate, slug) {
  const slugName = slug.split('/').pop();
  const defaultReadNext = candidate.proposed_package_type === 'capability' || candidate.package_draft?.playbook_markdown
    ? 'PLAYBOOK.md'
    : null;

  return updateFrontmatter(candidate.package_draft.skill_markdown, {
    name: slugName,
    description: candidate.description || candidate.summary,
    category: candidate.proposed_category,
    package_type: candidate.proposed_package_type,
    load_strategy: 'progressive',
    context_tier: candidate.context_tier || (candidate.proposed_package_type === 'capability' ? 'small' : 'tiny'),
    lifecycle: 'promoted',
    quality_score: typeof candidate.quality_score === 'number' ? candidate.quality_score : null,
    source: candidate.source || 'realtime',
    source_session: candidate.session_ref || null,
    stack_hint: candidate.stack_hint || null,
    tags: Array.isArray(candidate.tags) ? candidate.tags : [],
    default_read_next: defaultReadNext,
    optional_reads: Array.isArray(candidate.optional_reads) ? candidate.optional_reads : []
  });
}

function stageCandidate(candidate, runId) {
  const { stagingDir } = getOfficialPaths();
  const slug = normalizeSlug(candidate);
  const stagingRoot = path.join(stagingDir, runId);
  const packageRelativePath = ensureSafeRelativePath(slug);
  const packageDir = path.join(stagingRoot, packageRelativePath);

  ensureDir(packageDir);

  const createdFiles = [];
  const skillMarkdown = buildPromotedSkillMarkdown(candidate, slug);
  ensureWriteTextFile(path.join(packageDir, 'SKILL.md'), `${skillMarkdown}\n`);
  createdFiles.push(path.join(packageRelativePath, 'SKILL.md'));

  if (candidate.package_draft?.playbook_markdown) {
    ensureWriteTextFile(path.join(packageDir, 'PLAYBOOK.md'), `${candidate.package_draft.playbook_markdown.trim()}\n`);
    createdFiles.push(path.join(packageRelativePath, 'PLAYBOOK.md'));
  }

  if (candidate.package_draft?.readme_zh_cn) {
    ensureWriteTextFile(path.join(packageDir, 'README.zh-CN.md'), `${candidate.package_draft.readme_zh_cn.trim()}\n`);
    createdFiles.push(path.join(packageRelativePath, 'README.zh-CN.md'));
  }

  for (const item of candidate.package_draft?.references || []) {
    const relativePath = ensureSafeRelativePath(item.path);
    ensureWriteTextFile(path.join(packageDir, relativePath), `${String(item.content || '').trim()}\n`);
    createdFiles.push(path.join(packageRelativePath, relativePath));
  }

  for (const item of candidate.package_draft?.examples || []) {
    const relativePath = ensureSafeRelativePath(item.path);
    ensureWriteTextFile(path.join(packageDir, relativePath), `${String(item.content || '').trim()}\n`);
    createdFiles.push(path.join(packageRelativePath, relativePath));
  }

  return {
    slug,
    packageRelativePath,
    packageDir,
    stagingRoot,
    createdFiles
  };
}

function finalizeStagedPackage(stageResult) {
  const { officialDir } = getOfficialPaths();
  const destinationDir = path.join(officialDir, stageResult.packageRelativePath);
  ensureDir(path.dirname(destinationDir));
  fs.renameSync(stageResult.packageDir, destinationDir);
  return destinationDir;
}

function writeManifest(manifest) {
  const { manifestsDir } = getOfficialPaths();
  ensureDir(manifestsDir);
  const manifestPath = path.join(manifestsDir, `${manifest.run_id}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
}

function restoreIndexSnapshots(snapshots) {
  const paths = getOfficialPaths();
  const mapping = {
    index_json: paths.indexJsonPath,
    error_json: paths.errorJsonPath,
    index_markdown: paths.indexMarkdownPath,
    error_markdown: paths.errorMarkdownPath
  };

  for (const [key, filePath] of Object.entries(mapping)) {
    const content = snapshots[key];
    if (typeof content === 'string') {
      fs.writeFileSync(filePath, content, 'utf8');
    } else if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

function removeDirectoryIfExists(dirPath) {
  const { officialDir, stagingDir } = getOfficialPaths();
  if (dirPath && fs.existsSync(dirPath)) {
    if (!isWithinPath(dirPath, officialDir) && !isWithinPath(dirPath, stagingDir)) {
      throw new Error(`Refusing to remove path outside my-skills roots: ${dirPath}`);
    }
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function loadManifest(manifestRef) {
  const { manifestsDir } = getOfficialPaths();
  const directPath = path.resolve(manifestRef);
  if (fs.existsSync(directPath)) {
    assertWithinPath(directPath, manifestsDir, 'Manifest path');
    return {
      path: directPath,
      manifest: safeReadJsonFile(directPath)
    };
  }

  const manifestPath = assertWithinPath(path.join(manifestsDir, `${manifestRef}.json`), manifestsDir, 'Manifest path');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestRef}`);
  }

  return {
    path: manifestPath,
    manifest: safeReadJsonFile(manifestPath)
  };
}

function buildBackfillDraft(candidate) {
  const slug = normalizeSlug(candidate);
  const slugName = slug.split('/').pop();
  const title = titleFromSlug(slug);
  const packageType = candidate.proposed_package_type;
  const defaultReadNext = packageType === 'capability' ? 'PLAYBOOK.md' : null;
  const tags = Array.from(new Set([...(candidate.tags || []), 'backfill']));
  const whenToUse = candidate.signal_terms.length > 0
    ? candidate.signal_terms.map(term => `- ${term}`)
    : ['- review the source transcript and refine trigger conditions'];

  const skillMarkdown = [
    renderFrontmatter({
      name: slugName,
      description: candidate.description || candidate.summary,
      category: candidate.proposed_category,
      package_type: packageType,
      load_strategy: 'progressive',
      context_tier: candidate.context_tier || (packageType === 'capability' ? 'small' : 'tiny'),
      lifecycle: 'candidate',
      quality_score: null,
      source: 'backfill',
      source_session: candidate.session_ref || null,
      stack_hint: candidate.stack_hint || null,
      tags,
      default_read_next: defaultReadNext,
      optional_reads: []
    }),
    '',
    `# ${title}`,
    '',
    '## When to use',
    '',
    ...whenToUse,
    '',
    '## When NOT to use',
    '',
    '- Do not use without reviewing the original backfill evidence.',
    '- Do not promote unchanged if the summary still contains private context.',
    '',
    '## Quick routing',
    '',
    '- Review the draft against current package criteria and lint rules.',
    '- Tighten the description and trigger terms before promotion.',
    '',
    '## Read next',
    '',
    defaultReadNext ? 'Read `PLAYBOOK.md`.' : 'None. This is a single-file draft.'
  ].join('\n');

  const playbookMarkdown = packageType === 'capability'
    ? [
      `# Playbook: ${title}`,
      '',
      '## Goal',
      '',
      `Turn the historical backfill signal into a reusable, redacted package for: ${candidate.summary}`,
      '',
      '## Decision path',
      '',
      '- Confirm the summary is generic enough for promotion.',
      '- Split facts into references only if the draft starts getting heavy.',
      '',
      '## Steps',
      '',
      '1. Re-open the source transcript and verify the root cause is reusable.',
      '2. Rewrite the trigger language in current, generic terms.',
      '3. Promote only after redaction and lint review pass.',
      '',
      '## Common mistakes',
      '',
      '- preserving transcript-specific identifiers',
      '- promoting before the package has a clear `When NOT to use` section',
      '',
      '## Escalate to references when',
      '',
      '- compatibility details or error tables would make the playbook too heavy'
    ].join('\n')
    : null;

  return {
    ...candidate,
    proposed_slug: slug,
    tags,
    optional_reads: [],
    package_draft: {
      skill_markdown: skillMarkdown,
      playbook_markdown: playbookMarkdown
    }
  };
}

module.exports = {
  VALID_CATEGORIES,
  VALID_PACKAGE_TYPES,
  acquireWriteLock,
  assertWithinPath,
  buildBackfillDraft,
  buildIndexArtifacts,
  buildPromotedSkillMarkdown,
  finalizeStagedPackage,
  getOfficialPaths,
  listOfficialPackages,
  loadExistingIndexMetadata,
  loadManifest,
  normalizeSlug,
  parseFrontmatter,
  renderFrontmatter,
  releaseWriteLock,
  removeDirectoryIfExists,
  resolveCandidateRef,
  restoreIndexSnapshots,
  snapshotIndexes,
  stageCandidate,
  titleFromSlug,
  updateFrontmatter,
  validateCandidateDraft,
  writeIndexArtifacts,
  writeManifest
};
