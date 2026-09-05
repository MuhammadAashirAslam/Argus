---
name: changesets-versioning
description: >-
  Multi-package and MCP tool versioning workflows using Changesets (§17, §31) for ARGUS. Use when declaring semver changes for packages, tracking tool version IDs for experiments, or managing releases.
---

# Changesets Versioning & Tool Tracking Skill

## Purpose & PRD Alignment (§17, §31)

In ARGUS:

- Every MCP tool has a distinct, traceable semver version string (§17).
- Every experiment run must record the exact version IDs of tools and packages used (§31) to guarantee reproducibility.
- Package dependencies in the monorepo must be versioned deterministically without manual errors.

---

## 1. Creating a Changeset

When modifying a package or tool interface:

1. Run the changeset CLI:
   ```sh
   pnpm changeset
   ```
2. Select the modified package(s) (e.g. `@argus/agent-core`, `@argus/mcp-tools`).
3. Select the bump type:
   - `patch`: Bug fixes, non-breaking schema tweaks (e.g. adding optional fields).
   - `minor`: New MCP tools, new schema capabilities, backwards-compatible additions.
   - `major`: Breaking changes to `AgentEnvelope`, `Finding`, or MCP tool schemas.
4. Provide a clear summary message explaining the change.

---

## 2. Versioning in MCP Tool Registrations

When registering an MCP tool in `packages/mcp-tools`, reference the package version dynamically or from a generated constant:

```typescript
import { TOOL_VERSION } from "./version.js";

export const toolDefinition = {
  name: "ast_diff_analyzer",
  version: TOOL_VERSION, // e.g. "1.2.0"
  description: "Analyzes AST changes between revisions",
  inputSchema: AstDiffInputSchema,
};
```

---

## 3. Applying Versions & Publishing

- Bump versions and update changelogs across the repo:
  ```sh
  pnpm changeset version
  ```
- Build and verify prior to publishing or committing version bumps.
