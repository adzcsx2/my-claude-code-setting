# Module Checklist Template

> This is a template file used by init skill to generate docs/checklist/modules.md when explicitly requested.
> This template only allows output of modules, packages, applications, or features that actually exist in the project.

---

# Module Checklist

> This document only records modules, responsibilities, and reusable entry points actually scanned from project configuration and source code, for reference during AI development.

## Generation Rules

- Only record modules that actually exist in settings.gradle, workspace configuration, monorepo configuration, source directories, or package lists
- For each module, only write real paths, and verifiable responsibilities and reusable entry points
- Do not fabricate template modules like common-core, shared-ui, base-service
- Do not supplement abstract layers based on industry conventions that don't exist in the project
- If a module's responsibility is unclear, only keep the path and main entry; do not fabricate descriptions
- Responsibilities and reusable entry points are optional fields; omit when reliable information is lacking

## Module List

### {MODULE_NAME}

- Path: {MODULE_PATH}
- Optional responsibility: {MODULE_ROLE}
- Optional reusable entry points:
  - {CLASS_OR_PACKAGE}

## Update Rules

- Add real responsibilities and entry points when adding new modules
- Update synchronously when modules are removed or responsibilities change
- Only write information that exists and is verifiable in the project
