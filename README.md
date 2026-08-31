# ARGUS

> **An MCP-Native Framework for Reliable Agentic Software Engineering**

ARGUS is an open-source research platform designed to enable autonomous AI agents to investigate, diagnose, modify, and verify software repositories using the Model Context Protocol (MCP) and deterministic verification pipelines.

---

## 🏛 Core Architecture

ARGUS decomposes software engineering into specialized agents orchestrated through typed contracts:

* **Investigator Agent**: Gathers repository context, diffs, issues, and dependencies via MCP tools.
* **Analyzer Agent**: Correlates static analysis findings and CI failures to diagnose root causes (`FACT` vs `INFERENCE` vs `HYPOTHESIS`).
* **Configuration Agent**: Detects configuration debt across GitHub Actions and Dockerfiles using deterministic rules.
* **Patch Agent**: Generates candidate code modifications based on structured diagnosis.
* **Verification Agent**: Executes sandboxed verification (AST, lint, test execution) to ensure patches actually succeed.
* **Historian Agent**: Inspects repository git history and commit intent.
* **Orchestrator**: Maintains central `RunState`, validates `AgentEnvelope` boundaries, and records execution trajectories.

---

## 📁 Repository Structure

```text
argus/
├── apps/
│   ├── cli/            # Developer CLI (argus analyze)
│   └── dashboard/      # Web-based observability dashboard
├── packages/
│   ├── agent-core/     # Canonical schemas (Zod), AgentEnvelope, contracts
│   ├── orchestrator/   # Central coordination state machine
│   ├── mcp-server/     # MCP server implementation
│   ├── github/         # GitHub API client & PR tools
│   ├── git/            # Git inspection tools
│   ├── config-engine/  # Deterministic configuration debt rule engine
│   ├── verifier/       # Sandbox patch application and verification runner
│   └── trajectory/     # Structured event logging and audit trails
├── agents/             # Role-specialized agents (Investigator, Analyzer, etc.)
├── rules/              # Deterministic debt rules (GitHub Actions, Docker)
├── benchmarks/         # 10–30 real-world benchmark evaluation cases
└── docs/               # Architecture, research papers, and PRD
```

---

## 📜 Development & Governance

Please consult [AGENTS.md](./AGENTS.md) and [docs/prd.md](./docs/prd.md) for full architecture standards, package ownership, runtime schema validation rules, and git hygiene policies.
