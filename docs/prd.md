# ARGUS: An MCP-Native Framework for Reliable Agentic Software Engineering

**Project Type:** Open-source research prototype  
**Primary Language:** TypeScript  
**Runtime:** Node.js  
**Architecture:** Modular multi-agent system  
**Protocol:** Model Context Protocol (MCP)  
**Primary Platform:** GitHub  
**Primary Objective:** Research and demonstrate reliable, observable, tool-using AI agents for software engineering  

---

# 1. Executive Summary

ARGUS is an open-source, MCP-native agentic software engineering platform designed to enable autonomous AI agents to investigate, diagnose, modify, and verify software repositories.

ARGUS treats a software repository as an interactive environment rather than simply a collection of files.

An agent can access:
* source code
* Git history
* pull requests
* issues
* dependencies
* CI/CD workflows
* CI logs
* Dockerfiles
* tests
* linters
* configuration files

through structured MCP tools.

The system decomposes software engineering work into specialized agent responsibilities while maintaining a central execution state and verification layer.

The core execution model is:
```text
OBSERVE
   ↓
INVESTIGATE
   ↓
DIAGNOSE
   ↓
PLAN
   ↓
MODIFY
   ↓
VERIFY
   ↓
REPORT
```

ARGUS specifically focuses on **reliability**.

The LLM should never be treated as the source of truth for repository state, test results, syntax correctness, or configuration-rule violations. Deterministic tools provide evidence. Agents reason over that evidence. The verification engine determines whether generated changes actually succeed.

---

# 2. Research Motivation

LLM-based software engineering agents are increasingly capable of modifying repositories, debugging failures, and interacting with development tools.

However, several problems remain:
1. Agents frequently lack sufficient repository context.
2. Tool selection may be inefficient or incorrect.
3. Generated patches may be syntactically valid but semantically incorrect.
4. CI/CD configuration is often ignored during code analysis.
5. Configuration debt can accumulate independently of application code.
6. Autonomous agent failures are difficult to diagnose.
7. LLM claims may contradict actual execution results.

ARGUS investigates whether an architecture combining:
* MCP-based tool access
* specialized agents
* deterministic static analysis
* automated verification
* structured execution traces

can improve the reliability of software engineering agents.

---

# 3. Primary Research Question

> **Can structured MCP-based access to repository and CI/CD tools, combined with deterministic verification, improve the reliability of autonomous LLM-based software engineering agents?**

---

# 4. Secondary Research Questions

### RQ1
Does dynamic repository context improve PR diagnosis compared with providing only a Git diff?

### RQ2
Does access to CI execution results improve root-cause analysis?

### RQ3
How frequently can an autonomous agent generate patches that pass automated verification?

### RQ4
What configuration-debt patterns are most prevalent in analyzed repositories?

### RQ5
What are the most common failure modes during multi-step agent execution?

### RQ6
Does deterministic verification reduce incorrect LLM-generated modifications?

---

# 5. System Architecture

```text
                         ┌─────────────────────┐
                         │       GitHub        │
                         │                     │
                         │ PRs / Issues / CI   │
                         │ Repository / Git    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                     ┌──────────────────────────┐
                     │       ARGUS MCP          │
                     │         Server           │
                     ├──────────────────────────┤
                     │ Repository Tools         │
                     │ GitHub Tools             │
                     │ CI/CD Tools              │
                     │ Configuration Tools      │
                     └────────────┬─────────────┘
                                  │
                                  ▼
                 ┌────────────────────────────────┐
                 │       ARGUS Orchestrator       │
                 └───────────────┬────────────────┘
                                 │
              ┌──────────────────┼──────────────────┐
              │                  │                  │
              ▼                  ▼                  ▼
        Investigator         Analyzer           Historian
           Agent               Agent               Agent
              │                  │                  │
              └──────────────────┼──────────────────┘
                                 │
                                 ▼
                         Diagnosis / Plan
                                 │
                                 ▼
                           Patch Agent
                                 │
                                 ▼
                      ┌────────────────────┐
                      │ Verification Engine│
                      ├────────────────────┤
                      │ Syntax / AST       │
                      │ Static Analysis    │
                      │ Lint               │
                      │ Tests              │
                      └─────────┬──────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
                 SUCCESS                  FAILURE
                    │                       │
                    ▼                       ▼
             GitHub Review          Re-investigation
             / Patch PR                  / Report
```

---

# 6. Multi-Agent Architecture

The system uses **specialized agents**, not one giant autonomous prompt.

## 6.1 Investigator Agent
### Responsibility
Understand the task and gather relevant repository context.
### Inputs
* PR metadata
* issue description
* Git diff
### Tools
```text
repo.read_file
repo.search
repo.get_diff
github.get_pull_request
github.get_issues
github.get_comments
repo.get_dependencies
```
### Output
```json
{
  "problem_summary": "...",
  "relevant_files": [],
  "evidence": [],
  "investigation_complete": true
}
```

---

# 7. Analyzer Agent
Responsible for analyzing deterministic findings and contextualizing them.

### Inputs
* Investigator output
* static-analysis results
* CI failures
* repository context

### Responsibilities
* correlate findings
* identify likely root cause
* prioritize issues
* identify relationships between code and configuration

The Analyzer must distinguish:
```text
OBSERVED FACT
INFERENCE
HYPOTHESIS
```
Never present an inference as an observed fact.

---

# 8. Configuration Agent
Responsible for configuration debt.

### Supported initial formats:
```text
GitHub Actions YAML
Dockerfile
```
### Future:
```text
Kubernetes
Terraform
```
The Configuration Agent consumes deterministic analyzer results and explains their impact. It does NOT determine whether a static-analysis rule triggered.

---

# 9. Patch Agent
Responsible for generating candidate modifications.

### Inputs:
```text
diagnosis
relevant files
repository conventions
verification requirements
```
### Outputs:
```text
candidate patch
explanation
expected behavior
verification plan
```
The Patch Agent cannot directly merge or deploy changes.

---

# 10. Verification Agent
The Verification Agent coordinates deterministic verification.

### Pipeline:
```text
Candidate Patch
      ↓
Patch Application
      ↓
Syntax / AST
      ↓
Static Analysis
      ↓
Lint
      ↓
Tests
      ↓
Result
```
The actual verification results must come from tools, not from the LLM.

---

# 11. Historian / Context Agent
This agent is responsible for repository history and developer context.

### Tools & Inspection:
```text
git log
git blame
previous PRs
issues
commit messages
documentation
```
### Purpose:
Determine whether a suspicious implementation is intentional or accidental.

---

# 12. Orchestrator
The Orchestrator controls the entire execution.

### Responsibilities:
* assign tasks
* maintain state
* prevent conflicting modifications
* enforce agent limits
* collect outputs
* invoke verification
* handle failures
* produce final report

### Central RunState:
```typescript
interface RunState {
  runId: string;
  repository: string;
  pullRequest?: number;
  objective: string;
  relevantFiles: string[];
  findings: Finding[];
  hypotheses: Hypothesis[];
  proposedChanges: Change[];
  verification: VerificationResult[];
  trajectory: AgentEvent[];
  status:
    | "initializing"
    | "investigating"
    | "diagnosing"
    | "patching"
    | "verifying"
    | "completed"
    | "failed";
}
```

---

# 13. MCP Server
The MCP server is the primary interface between ARGUS and the software development environment.

## Repository Tools
```text
repo.read_file
repo.search
repo.list_files
repo.get_diff
repo.get_dependencies
```

## Git Tools
```text
git.log
git.show_commit
git.blame
git.status
git.diff
```

## GitHub Tools
```text
github.get_pull_request
github.get_pull_request_files
github.get_comments
github.get_issues
github.create_review
github.create_branch
github.create_pull_request
```

## CI Tools
```text
ci.list_workflows
ci.get_runs
ci.get_run
ci.get_logs
ci.run_tests
ci.run_linter
```

## Configuration Tools
```text
config.analyze_github_actions
config.analyze_dockerfile
```

---

# 14. MCP Tool Contract
Every tool must have:
* name
* description
* typed input schema
* typed output schema
* error schema
* permission requirements

Never expose raw authentication credentials through tool output.

---

# 15. Configuration Debt Engine
The first implementation contains at least **10 deterministic rules**.

## GitHub Actions
* `CD001` — Unpinned Action
* `CD002` — Floating Dependency
* `CD003` — Hardcoded Sensitive Configuration
* `CD004` — Duplicated Workflow Logic
* `CD005` — Excessive Workflow Complexity

## Docker
* `CD101` — Floating Base Image
* `CD102` — Unspecified Base Image Version
* `CD103` — Excessive Image Layers
* `CD104` — Inefficient Package Installation
* `CD105` — Unnecessary Root Execution

```typescript
interface DebtFinding {
  ruleId: string;
  title: string;
  severity: "low" | "medium" | "high";
  file: string;
  line?: number;
  evidence: string;
  recommendation: string;
}
```

---

# 16. Static Analysis Architecture
```text
Configuration File
       ↓
Parser
       ↓
Normalized Representation
       ↓
Rule Engine
       ↓
Findings
```
Rules must be deterministic, independently testable, explainable, and versioned.

---

# 17. Patch Verification
Every generated patch follows:
```text
Generate → Validate Diff → Apply → Parse → Static Analysis → Lint → Tests → Evaluate
```

```typescript
interface VerificationResult {
  patchApplied: boolean;
  syntaxValid: boolean;
  staticAnalysisPassed: boolean;
  lintPassed: boolean;
  testsPassed: boolean;
  failures: string[];
  overall: "verified" | "partially_verified" | "failed";
}
```

---

# 18. Agent Trajectory & Observability
Every execution must be observable.
```json
{
  "runId": "run_123",
  "step": 7,
  "agent": "investigator",
  "state": "investigating",
  "event": "tool.called",
  "tool": "repo.read_file",
  "timestamp": "...",
  "durationMs": 132
}
```
Sensitive information must be redacted before persistence.

---

# 19. Failure Taxonomy
Classify failures specifically:
* `CONTEXT_FAILURE`
* `TOOL_FAILURE`
* `REASONING_FAILURE`
* `PLANNING_FAILURE`
* `PATCH_FAILURE`
* `VERIFICATION_FAILURE`
* `CONFIGURATION_FAILURE`
* `TIMEOUT`
* `RESOURCE_LIMIT`

---

# 20. Agent Limits
* Maximum investigation steps: 20
* Maximum patch attempts: 3
* Maximum verification attempts: 3
* Maximum execution time: 10 minutes

---

# 21. Human-in-the-Loop
Default mode: `ANALYSIS_ONLY`. ARGUS never automatically merges generated changes.

---

# 22. Security Model
* Least-privilege GitHub tokens
* No token exposure to LLM
* Sandbox test execution
* Restricted filesystem access
* Pre-log secret redaction
* Explicit permission for repository writes
* Complete audit trail

---

# 23. CLI
Primary developer interface:
```bash
argus analyze --repo owner/repository --pr 42
argus analyze --repo ./local-repository
argus config scan .
argus verify ./patch.diff
argus trace run_123
```

---

# 24. GitHub Action
Reusable GitHub Action for automated pull request review and analysis.

---

# 25. Dashboard (Optional MVP)
Timeline, run status, agent event streams, and verification results.

---

# 26. Benchmark
`benchmarks/` containing 10–30 real-world open-source cases.

---

# 27. Evaluation
Compare Baseline A (PR + Diff), Baseline B (PR + Diff + Selected Context), and ARGUS (Dynamic MCP Tools).

---

# 28. Repository Structure
```text
argus/
├── apps/
│   ├── cli/
│   └── dashboard/
├── packages/
│   ├── agent-core/
│   ├── orchestrator/
│   ├── mcp-server/
│   ├── github/
│   ├── git/
│   ├── analyzer/
│   ├── config-engine/
│   ├── verifier/
│   ├── trajectory/
│   └── shared/
├── agents/
│   ├── investigator/
│   ├── analyzer/
│   ├── configuration/
│   ├── historian/
│   ├── patch/
│   └── verifier/
├── rules/
│   ├── github-actions/
│   └── docker/
├── benchmarks/
├── examples/
├── tests/
├── docs/
├── AGENTS.md
├── README.md
├── CONTRIBUTING.md
└── package.json
```

---

# 29. Multi-Agent Development Strategy
* **Agent 1 (MCP Infrastructure)**: `packages/mcp-server/`, `packages/github/`, `packages/git/`
* **Agent 2 (Configuration Analysis)**: `packages/config-engine/`, `rules/`, `tests/config/`
* **Agent 3 (Agent Runtime)**: `packages/agent-core/`, `packages/orchestrator/`, `agents/`
* **Agent 4 (Verification)**: `packages/verifier/`, `tests/verifier/`
* **Agent 5 (GitHub Integration)**: `apps/github-action/`, `packages/github/`
* **Agent 6 (Observability & Baseline)**: `packages/trajectory/`, `apps/dashboard/`, `benchmarks/`
* **Agent 7 (CLI & Research Documentation)**: `apps/cli/`, `docs/`
* **Integration Agent**: Monorepo build, CI, and cross-package validation.

---

# 30. Definition of Done
All items in §31 of the PRD completed and verified under strict TypeScript, deterministic tests, and zero sandbox escapes.
