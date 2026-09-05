# AGENTS.md

This file tells any agent (human or AI) how to work inside the ARGUS repository. Read it before touching code. If something here conflicts with a package-local README, this file wins for cross-cutting concerns (commits, ownership, contracts); the package README wins for package-internal detail.

ARGUS's central claim is that repository state, evidence, and verification results must be traceable and reproducible — not asserted by an LLM. That principle applies recursively to how this repository itself is built and how its history is recorded. An agent's commits are part of the project's own evidence trail. Treat them that way.

---

## 1. Before You Write Any Code

1. **Identify Package Ownership**: Confirm your task matches the ownership boundaries in §18/§29 of the PRD (`docs/prd.md`). Do not implement functionality belonging to another package's owner without an explicit cross-package agreement recorded in `handoff.md` or a PR description.
2. **Read Canonical Contracts**: Review canonical shapes before writing anything that touches them: `AgentEnvelope` (§8), `Evidence` (§9), `Finding` (§10), `Hypothesis` (§11), and `RunState` (§12). These are load-bearing. Do not invent parallel shapes for the same concepts.
3. **Use the `ArgusAgent` Interface (§34)**: Check `packages/agent-core/` before writing a new agent. Every agent implements:
   ```typescript
   run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope>
   ```
   Nothing talks to another agent directly — all inter-agent communication flows through the Orchestrator (§14).
4. **Never Deviate Without Prior Approval**: Do not invent new architectural layers, change package layouts, or add dependencies without first proposing the change and obtaining explicit user approval.

---

## 2. Package Ownership (PRD §18, §29)

| Package / Domain                                                | Owner             | Scope                                                                                                                    |
| --------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `packages/mcp-server/`, `packages/repository/`, `packages/git/` | Agent 1           | MCP server runtime, repo/Git read tools, tool versioning. Does **not** own GitHub write orchestration.                   |
| `packages/config-engine/`, `rules/`, `tests/config/`            | Agent 2           | Rule engine, parsers (GitHub Actions, Dockerfile), 10 debt rules, rule versioning & tests.                               |
| `packages/agent-core/`, `packages/orchestrator/`, `agents/*`    | Agent 3           | Shared agent lifecycle, state transitions, budget enforcement, handoff validation; agent-specific prompts and reasoning. |
| `packages/verifier/`, `packages/sandbox/`, `tests/verifier/`    | Agent 4           | Patch application, Docker sandbox, static analysis, lint, tests.                                                         |
| `packages/github/`, `apps/github-action/`, `.github/`           | Agent 5           | GitHub write operations, branch/PR creation, review generation, GitHub Actions. Consumes Agent 1's tool interfaces.      |
| `packages/trajectory/`, `apps/dashboard/`, `benchmarks/`        | Agent 6           | Benchmark runner, baseline implementations (Baseline A/B), trial protocol, metrics, trajectory logger.                   |
| `apps/cli/`, `docs/`                                            | Agent 7           | CLI (`argus analyze`), developer and research documentation.                                                             |
| Monorepo Root & Coordination                                    | Integration Agent | Cross-package builds, CI pipeline, Turborepo boundary validation.                                                        |

If a task spans two packages, state so explicitly in `handoff.md` and tag both owners.

---

## 3. Working with Canonical State & Schema Invariants

- **Append-Only State**: Never mutate `RunState`, `Finding`, `Hypothesis`, or `Evidence` objects in place (§5.3, §10, §11). To revise a finding, create a new one with `supersedes: <findingId>` and preserve the original.
- **Orchestrator-Only Transitions**: Only the Orchestrator performs `RunState` transitions (§5.5, §14). Agents must return an `AgentEnvelope` for the Orchestrator to validate and apply.
- **Grounded Evidence Required**: Every `Finding` requires real `evidenceIds` (§9). An LLM assertion is not evidence. Never synthesize an `Evidence` record without an actual tool call or sandbox observation.
- **Epistemic Classification**: Classify every analytical statement explicitly as `FACT`, `INFERENCE`, or `HYPOTHESIS` (§5.2). Never classify inferences as facts.
- **Conflict Resolution (§13)**: Preserve both sides, never delete prior evidence, and construct a reconciliation finding. Never use last-write-wins.
- **Runtime Schema Validation (§8, §14)**: TypeScript compile-time interfaces alone do not protect against malformed or adversarial LLM outputs. All agent envelopes, findings, and tool payloads must pass runtime Zod schemas in `packages/agent-core`.
- **Strict TypeScript**: The entire codebase must compile with zero errors under strict mode (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).

---

## 4. Monorepo Topology, Tooling & Versioning

- **Dependency Invariants (§33)**: `packages/agent-core` is the base leaf package (zero internal dependencies). All inter-package imports must use workspace specifiers (`@argus/*`), never relative directory traversals.
- **Build & Pipeline Orchestration**: Turborepo (`turbo.json`) manages the task pipeline (`build`, `test`, `lint`, `typecheck`) with cached execution boundaries.
- **Tool Versioning (§17, §31)**: Every MCP tool must have an exact semver version string. Breaking schema changes require a major version bump. Experiment reproducibility (§31) requires exact tool versions recorded per trial.
- **Changesets Versioning**: Manage multi-package version bumps and changelog generation using Changesets.

---

## 5. Verification & Sandbox Guarantees

- **Execution-Based Verification**: Verification results must originate from real tool execution in the sandbox, never from LLM self-reports (§5.6, §7.6). A step marked "passed" without a command exit code is a critical bug.
- **Fresh Sandboxes**: Verification runs must execute in fresh containers per attempt (§19, §32). Never reuse containers across attempts.
- **Target Repository Verification Stages (§21, §35)**:
  - **Syntax / Static Analysis**: Executed via `tsc --noEmit`.
  - **Lint Stage**: Executed via ESLint / `@typescript-eslint`.
  - **Test Stage**: Executed via Vitest test runners inside the sandbox.
- **Unsupported Environments**: If repository dependencies cannot be safely installed in the sandbox environment, classify as `UNSUPPORTED_REPOSITORY` (§25) — do not loosen sandbox constraints.

---

## 6. Failure Handling & Security

- **Specific Failure Classification**: Use the taxonomy in §25 (e.g., `UNSUPPORTED_REPOSITORY`, `SANDBOX_TIMEOUT`, `SCHEMA_VALIDATION_ERROR`). Avoid defaulting to generic categories.
- **Explicit Error Envelopes**: Report failures via `AgentEnvelope.errors` (§8, §34). Never swallow errors or return success status on partial completions.
- **Pre-Log Secret Redaction (§24)**: Redact API keys, tokens, and sensitive data _before_ payloads enter the persisted trajectory log.

---

## 7. Commits, PRs, Branching & Git Hygiene

Commit history is part of ARGUS's evidence trail. Treat it with the same rigor as finding records:

- **No Direct Pushes to `main`**: All changes MUST be committed on dedicated feature branches (e.g., `feat/agent-core-schemas`, `feat/mcp-repo-tools`) and submitted as Pull Requests into `main`.
- **Bite-Sized Reviewable Commits (~100 Lines)**: Keep each commit small, atomic, and focused (approx. 100 lines per commit) so each unit of work is readily reviewable.
- **Strict Timestamp Integrity**: **Never rewrite commit timestamps, author dates, or committer dates.** No backdating, no spreading commits across artificial date ranges, and no `GIT_AUTHOR_DATE` / `GIT_COMMITTER_DATE` overrides. Push work with its true historical timestamp.
- **Descriptive & Conventional Messages**: Use conventional commit prefixes (`feat:`, `fix:`, `test:`, `refactor:`, `chore:`) referencing relevant `Finding`, `ruleId`, or PRD milestone sections.
- **Pre-Commit Quality Gates**: Husky and `lint-staged` mechanically enforce linting, formatting (Prettier), and `tsc --noEmit` before commits land.
- **Contract Impact Awareness**: Flag PRs modifying `packages/agent-core/` canonical contracts, as they affect all downstream agents in `agents/*`.

---

## 8. Available Workspace Skills

Specialized workflow guides are located in `.agents/skills/`:

- **[`zod-schema-validation`](file:///.agents/skills/zod-schema-validation/SKILL.md)**: Zod schemas, envelope boundaries, and safe parsing.
- **[`vitest-verification`](file:///.agents/skills/vitest-verification/SKILL.md)**: Vitest suite setup and sandbox verification runner engine (§7.6, §35).
- **[`typescript-eslint-quality`](file:///.agents/skills/typescript-eslint-quality/SKILL.md)**: Strict typing, ESLint rules, and Verification Agent static analysis stages (§21).
- **[`turborepo-monorepo`](file:///.agents/skills/turborepo-monorepo/SKILL.md)**: Monorepo layout, dependency graphs, and caching pipelines (§33).
- **[`changesets-versioning`](file:///.agents/skills/changesets-versioning/SKILL.md)**: Multi-package and MCP tool semver tracking for experiments (§17, §31).
- **[`git-hooks-hygiene`](file:///.agents/skills/git-hooks-hygiene/SKILL.md)**: Husky hooks, `lint-staged`, and commit standards.

---

## 9. When in Doubt

If a task requires deciding something the PRD does not cover, make the smallest decision consistent with §5 (Design Principles) and document the rationale in `handoff.md` and the PR description. Always ask the user before deviating from canonical requirements.
