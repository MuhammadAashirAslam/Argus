# ARGUS Multi-Agent Handoff & Coordination Ledger

This document tracks active development stages, package ownership, cross-agent handoffs, completed PRs, and next milestones.

---

## 1. Agent Ownership & Role Assignments (PRD §29)

| Role | Domain / Packages | Responsibility | Current Status | Assigned Agent |
|---|---|---|---|---|
| **Agent 1** | `packages/mcp-server/`, `packages/git/`, `packages/github/` (read) | MCP server runtime, Git & Repo inspection tools | Pending Foundation | Agent 1 (MCP) |
| **Agent 2** | `packages/config-engine/`, `rules/`, `tests/config/` | GitHub Actions & Docker debt parsers, 10 deterministic rules | Pending Foundation | Agent 2 (Config) |
| **Agent 3** | `packages/agent-core/`, `packages/orchestrator/`, `agents/*` | Canonical state machine, Zod schemas, Orchestrator loop | Scaffolding In-Progress | Agent 3 (Runtime) |
| **Agent 4** | `packages/verifier/`, `tests/verifier/` | Sandbox isolation, patch applier, multi-stage test/lint verifier | Pending Foundation | Agent 4 (Verification) |
| **Agent 5** | `apps/github-action/`, `packages/github/` (write) | GitHub Action, PR commenting, review generation, branch writer | Pending Foundation | Agent 5 (GitHub) |
| **Agent 6** | `packages/trajectory/`, `apps/dashboard/`, `benchmarks/` | Structured trajectory logger, event emitter, Benchmark suite | Pending Foundation | Agent 6 (Observability) |
| **Agent 7** | `apps/cli/`, `docs/` | Developer CLI (`argus analyze`), research documentation | Pending Foundation | Agent 7 (CLI/Docs) |
| **Integration** | Monorepo Root, CI, Turbo | Cross-package builds, strict typecheck, versioning gates | Active | Lead Integrator |

---

## 2. In-Flight Work & Pull Request Ledger

All commits must target feature branches and merge via Pull Requests into `main`. No direct pushes to `main`.

| PR # / Branch | Scope | Description | Commits Size | Status | Reviewer |
|---|---|---|---|---|---|
| `feat/repo-foundation` | Monorepo root & docs | PRD, AGENTS.md, Handoff ledger, initial tooling structure | ~100 lines/commit | Ready | User |
| `feat/agent-core-schemas` | `packages/agent-core` | Zod runtime contracts (`AgentEnvelope`, `Finding`, `Evidence`) | ~100 lines/commit | Queued | User |
| `feat/turborepo-scaffold` | Root monorepo | `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` | ~100 lines/commit | Queued | User |

---

## 3. Communication & Handoff Protocols

1. **Strict Envelope Passing**: Agents never invoke another agent directly. All messages pass through the Orchestrator via typed `AgentEnvelope` objects (§14).
2. **Deterministic Grounding**: Findings must link valid `evidenceIds` produced by real tool invocations.
3. **No Unapproved Deviations**: If an architectural ambiguity arises, document it in `handoff.md` and request user confirmation before proceeding.
4. **Bite-Sized Diffs**: Each commit must be scoped to approximately ~100 lines or one clear reviewable unit.
