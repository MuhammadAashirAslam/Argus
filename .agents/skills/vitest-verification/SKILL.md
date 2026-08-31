---
name: vitest-verification
description: >-
  Vitest testing conventions and verification runner workflows for ARGUS packages and the Verification Agent sandbox. Use when writing tests, debugging unit/integration tests, or configuring language-specific verification stages (§7.6, §35).
---

# Vitest Testing & Verification Runner Skill

## Purpose & PRD Alignment (§7.6, §21, §35)
Vitest serves two critical roles in ARGUS:
1. **Internal Unit & Integration Tests**: Testing ARGUS packages (`agent-core`, `orchestrator`, `storage`, `mcp-tools`).
2. **Verification Agent Engine**: Running sandboxed test suites against target repositories in the verification pipeline stage to validate findings and test fixes (§7.6, §35).

---

## 1. Internal Package Test Conventions

- Use `.test.ts` or `.spec.ts` colocated next to source code or inside `test/`.
- Test files must run fast, support concurrent execution, and isolate external side effects with mocks.

### Example Vitest Test for Envelope Validation

```typescript
import { describe, it, expect } from "vitest";
import { AgentEnvelopeSchema } from "../src/schemas/envelope.js";

describe("AgentEnvelopeSchema", () => {
  it("successfully parses valid envelope", () => {
    const valid = {
      version: "1.0",
      agentId: "agent-security-1",
      agentRole: "SECURITY_AUDITOR",
      conversationId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      timestamp: new Date().toISOString(),
      payloadType: "FINDING",
      payload: { test: true },
    };
    const parsed = AgentEnvelopeSchema.parse(valid);
    expect(parsed.agentId).toBe("agent-security-1");
  });

  it("rejects invalid UUID or malformed payload", () => {
    const invalid = {
      version: "1.0",
      agentId: "agent-1",
      conversationId: "invalid-uuid",
    };
    expect(() => AgentEnvelopeSchema.parse(invalid)).toThrow();
  });
});
```

---

## 2. Verification Sandbox Test Execution (§35)

When the Verification Agent executes tests inside an isolated sandbox against a target repository:
1. Generate test harness isolated in a temporary directory or container.
2. Execute Vitest with JSON reporter: `npx vitest run --reporter=json --outputFile=test-results.json`.
3. Ingest the JSON output and construct `Evidence` objects with `type: "TEST_OUTPUT"`.
4. Capture stdout, stderr, execution time, and exit code.

---

## 3. Recommended Commands

- Run all package tests: `pnpm turbo run test` or `npx vitest`
- Run single test file: `npx vitest run path/to/file.test.ts`
- Run with coverage: `npx vitest run --coverage`
