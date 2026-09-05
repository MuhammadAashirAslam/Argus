---
name: turborepo-monorepo
description: >-
  Turborepo monorepo orchestration patterns, package dependency boundaries, and build/test caching pipelines for ARGUS (§33). Use when creating new packages/agents, modifying cross-package imports, or configuring pipeline tasks.
---

# Turborepo Monorepo Architecture Skill

## Purpose & PRD Alignment (§33)

ARGUS is organized as a multi-package TypeScript monorepo containing `packages/` (reusable libraries) and `agents/` (agent runtimes and orchestrator).
This skill provides guidelines for dependency management, pipeline execution, and caching boundaries via Turborepo (`turbo.json`).

---

## 1. Monorepo Package Topology

```text
argus/
├── turbo.json
├── package.json
├── packages/
│   ├── agent-core/       # Base types, Zod schemas, envelope parser (depends on nothing)
│   ├── storage/          # Evidence & finding persistence (depends on agent-core)
│   ├── verification/     # Sandbox runner, test execution (depends on agent-core)
│   └── mcp-tools/        # Shared MCP tool interfaces and implementations
└── agents/
    ├── orchestrator/     # Main coordinator agent (depends on packages/*)
    ├── auditor/          # Security audit agent
    └── verifier/         # Verification agent
```

### Dependency Invariants

- `agent-core` must **never** depend on other internal packages.
- Cross-package imports must go through package names defined in `package.json` (e.g. `@argus/agent-core`), never deep relative paths (e.g., `../../packages/agent-core/src/...`).

---

## 2. Standard `turbo.json` Pipeline

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

---

## 3. Common Workflows

- Run build across all packages: `pnpm turbo run build`
- Run lint & typecheck in parallel: `pnpm turbo run lint typecheck`
- Run tests only for a specific package and its dependents: `pnpm turbo run test --filter=@argus/verification...`
