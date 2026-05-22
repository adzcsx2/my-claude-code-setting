# Dependency Checklist Template

> This is a template file used by init skill to generate docs/checklist/dependencies.md when explicitly requested.
> This template only allows output of dependencies actually parsed from build files, package manager files, or lock files.

---

# Dependency Checklist

> This document only records third-party dependencies actually used in the project, for reference during AI development.

## Generation Rules

- Only record dependencies parsed from real files like build.gradle, build.gradle.kts, pom.xml, package.json, pnpm-lock.yaml, yarn.lock, pyproject.toml, requirements.txt, pubspec.yaml, Cargo.toml, etc.
- Dependency categories are optional; only output a category when verified dependencies exist under it
- Libraries not detected should not appear in the document
- Do not write speculative content like recommendations, alternatives, or "consider using"
- If version cannot be reliably extracted, only record library name and usage
- Do not keep empty categories or placeholder example rows for document completeness

## Dependency List

Optional category templates, only kept when real dependencies are detected:

### {CATEGORY_NAME}

| Dependency | Version | Usage |
|------------|---------|-------|
| {LIB_NAME} | {VERSION} | {USAGE} |

## Update Rules

- Update when adding new dependencies
- Clean up promptly when removing dependencies
- Only keep libraries that actually exist in the project
