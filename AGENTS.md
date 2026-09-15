# AGENTS.md

This document outlines architectural invariants, code conventions, and operational guidelines for AI coding agents and open-source contributors working in the **ARGUS** repository.

ARGUS's core design principle is **reliability through grounding**: repository state, findings, and verification results must originate from real, deterministic tool execution rather than unverified LLM assertions.

---

## 1. Core Architectural Invariants

1. **Canonical Schema Contracts (`@argus/agent-core`)**:
   All inter-agent communication, findings, evidence objects, and execution states are governed by canonical Zod schemas:
   - `AgentEnvelope` (§8): Canonical envelope exchanged between agents and the Orchestrator.
   - `Evidence` (§9): Grounded records produced by real tool execution or sandbox observation.
   - `Finding` (§10): Epistemic observations citing real `evidenceIds`.
   - `Hypothesis` (§11): Diagnostic statements classified as `FACT`, `INFERENCE`, or `HYPOTHESIS`.
   - `RunState` (§12): Central append-only state tracking an analysis run.
   - `VerificationResult` (§17, §19): Multi-stage command exit codes and diagnostics.

2. **Append-Only State**:
   Never mutate `RunState`, `Finding`, or `Evidence` objects in place. Findings are refined by creating a new `Finding` with `supersedes: <findingId>`.

3. **Grounded Evidence Required**:
   Every `Finding` must reference valid `evidenceIds` produced by deterministic tool calls or sandbox results. Never synthesize synthetic evidence records.

4. **Orchestrator-Centric Coordination**:
   Specialized agents do not invoke each other directly. The central `Orchestrator` (`packages/orchestrator`) manages state transitions, step budgets (max 20 steps), and verification retry loops.

5. **Runtime Schema Validation**:
   TypeScript types alone do not protect against malformed LLM outputs. All agent inputs, envelopes, and tool parameters must pass runtime Zod parsing (`safeParse`).

6. **Strict TypeScript**:
   The monorepo enforces strict TypeScript compilation across all packages (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).

---

## 2. Monorepo Domain Structure & Boundaries

ARGUS is managed as a pnpm workspace orchestrated by Turborepo (`turbo.json`):

| Domain / Package Path     | Scope & Responsibilities                                                                                 |
| :------------------------ | :------------------------------------------------------------------------------------------------------- |
| `packages/agent-core/`    | Base leaf package. Canonical Zod schemas, contracts, and failure taxonomy. Zero internal dependencies.   |
| `packages/mcp-server/`    | Standard Model Context Protocol (MCP) server runtime, tool registry, and stdio JSON-RPC transport.       |
| `packages/git/`           | Local Git and repository inspection MCP tools (`git.status`, `git.diff`, `repo.read_file`, etc.).        |
| `packages/github/`        | GitHub REST client, Pull Request read/write tools, and CI execution tools.                               |
| `packages/config-engine/` | AST and line-based parser engine for GitHub Actions workflows and Dockerfiles.                           |
| `rules/`                  | Deterministic configuration debt rules (CD001–CD005 for GitHub Actions, CD101–CD105 for Docker).         |
| `packages/orchestrator/`  | Central state machine, execution loop, and budget enforcement.                                           |
| `packages/verifier/`      | Staged verification pipeline (`tsc` → ESLint → Vitest) with automatic stash/rollback.                    |
| `packages/sandbox/`       | Isolated Docker container lifecycle management (`node:20-alpine`) for safe patch verification.           |
| `packages/shared/`        | Groq LLM client, model fallback, prompt builders, and OpenAI function calling adapters.                  |
| `packages/trajectory/`    | Structured, secret-redacted event logging for run replay and audit trails.                               |
| `agents/*`                | Specialized role agents (`investigator`, `analyzer`, `configuration`, `historian`, `patch`, `verifier`). |
| `apps/cli/`               | Developer CLI (`argus analyze`, `argus verify`, `argus config scan`, `argus mcp`, `argus trace`).        |
| `apps/github-action/`     | GitHub Action entrypoint for automated PR review and CI integration.                                     |
| `benchmarks/`             | Comparative evaluation dataset and benchmark runner (Baseline A, Baseline B, ARGUS MCP).                 |

### Dependency Rules (§33)

- Inter-package imports must always use workspace specifiers (`@argus/*`), never relative paths (`../../`).
- `packages/agent-core` must remain free of dependencies on any other `@argus/*` packages.

---

## 3. Verification & Sandbox Guarantees

1. **Command Exit Codes**:
   A verification step is only marked passed if the underlying process (`tsc`, `eslint`, `vitest`) exits with status code `0`. LLM self-evaluation cannot pass verification.
2. **Rollback on Failure**:
   Host-mode patch verification must never leave target repositories dirty. Working trees must be restored on failed or aborted verification attempts.
3. **Container Isolation**:
   When `--sandbox` is enabled, verification must run in a freshly spawned Docker container with resource limits, guaranteeing zero host environment mutation.

---

## 4. Security & Failure Classification

1. **Pre-Log Secret Redaction**:
   All tokens (`ghp_`, `gho_`, `Bearer`, API keys) must be sanitized before payloads are logged into trajectories or error envelopes.
2. **Defensive Shell Invocation**:
   All Git and CLI commands must execute via parameter arrays (`execFile`) rather than string interpolation, preventing command and shell injection vulnerabilities.
3. **Canonical Failure Taxonomy**:
   Failures must be classified using the canonical error codes defined in `@argus/agent-core` (e.g., `SANDBOX_TIMEOUT`, `UNSUPPORTED_REPOSITORY`, `SCHEMA_VALIDATION_ERROR`).

---

## 5. Development Workflow & Skills

Reference guides for repository maintenance and contribution are located in `.agents/skills/`:

- **[`zod-schema-validation`](file:///.agents/skills/zod-schema-validation/SKILL.md)**: Zod schemas, envelope validation, and safe parsing.
- **[`vitest-verification`](file:///.agents/skills/vitest-verification/SKILL.md)**: Vitest suite patterns and sandbox runner execution.
- **[`typescript-eslint-quality`](file:///.agents/skills/typescript-eslint-quality/SKILL.md)**: Strict typing and ESLint rules.
- **[`turborepo-monorepo`](file:///.agents/skills/turborepo-monorepo/SKILL.md)**: Monorepo layout, pipeline caching, and task dependencies.
- **[`changesets-versioning`](file:///.agents/skills/changesets-versioning/SKILL.md)**: Package and MCP tool semver management.
- **[`git-hooks-hygiene`](file:///.agents/skills/git-hooks-hygiene/SKILL.md)**: Husky hooks, pre-commit formatting, and conventional commits.
