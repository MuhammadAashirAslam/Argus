# Contributing to ARGUS

Thank you for contributing to ARGUS! This guide explains how to extend the platform with new configuration debt rules, MCP tools, and specialized agents while maintaining our strict guarantees for state provenance, runtime schema validation, and test reproducibility.

---

## 1. Monorepo Structure & Dependency Rules

ARGUS is managed with **pnpm workspaces** and **Turborepo**:

- Base leaf package is `@argus/agent-core` (contains Zod schemas, canonical contracts). It must have zero internal package dependencies.
- All inter-package imports must use workspace specifiers (`@argus/*`), never relative paths across package directories.
- Strict TypeScript is enabled across all packages (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).

---

## 2. Adding a New Configuration Debt Rule

Configuration rules live in `rules/github-actions/` (for CI workflows) and `rules/docker/` (for Dockerfiles).

### Step 1: Create the Rule File

```typescript
// rules/github-actions/cd006_example_rule.ts
import type { DebtRule, ParsedConfigContext } from "@argus/config-engine";
import type { DebtFinding } from "@argus/agent-core";

export const CD006_ExampleRule: DebtRule = {
  id: "CD006",
  title: "Example Rule Title",
  fileType: "GITHUB_ACTIONS",
  severity: "medium",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];
    // Evaluate context.lines or context.parsedAst
    return findings;
  },
};
```

### Step 2: Export in `rules/index.ts`

Add your new rule to `ALL_BUILT_IN_RULES` in `rules/index.ts`.

### Step 3: Write Unit Tests

Add test cases in `packages/config-engine/test/` validating positive and negative match cases.

---

## 3. Adding a New MCP Tool

1. Define the tool input and output Zod schemas in `@argus/agent-core` or locally with strict types.
2. Implement the `McpTool` interface:

```typescript
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";

export const MyNewTool: McpTool<InputType, OutputType> = {
  name: "my_domain.my_action",
  version: "1.0.0",
  description: "Clear explanation of what the tool does",
  permission: "READ_ONLY", // or 'WORKSPACE_WRITE'
  inputSchema: MyInputSchema,
  outputSchema: MyOutputSchema,
  async execute(input, context: ToolExecutionContext): Promise<McpToolResult<OutputType>> {
    // Implementation
  },
};
```

3. Register the tool in `packages/mcp-server/` and wire into relevant agent tool arrays.

---

## 4. Implementing a Specialized Agent

1. Create a package in `agents/<agent-name>/` implementing the `ArgusAgent` interface from `@argus/agent-core`:

```typescript
import type { ArgusAgent, AgentEnvelope, AgentContext } from "@argus/agent-core";

export class MyAgent implements ArgusAgent {
  public readonly id = "agent-myagent-01";
  public readonly role = "MY_ROLE";

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    // 1. Gather context via MCP tools
    // 2. Query LLM via LLMClient from @argus/shared
    // 3. Return validated AgentEnvelope
  }
}
```

2. Register the agent in `apps/cli/src/commands/analyze.ts` and `packages/orchestrator`.

---

## 5. Pre-Commit Quality Checks

Run the verification pipeline before submitting changes:

```bash
# Build all packages
pnpm build

# Run all unit tests
pnpm test

# Run E2E pipeline test
pnpm test:e2e

# Check code formatting
pnpm format:check
```
