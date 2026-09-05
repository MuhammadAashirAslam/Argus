---
name: zod-schema-validation
description: >-
  Runtime schema validation patterns using Zod for ARGUS agent envelopes, findings, evidence objects, and MCP tool input/output boundaries. Use when designing, implementing, or validating data contracts and defensive boundaries across agents and orchestrators.
---

# Zod Schema Validation Skill (ARGUS Contracts & Envelope Integrity)

## Purpose & PRD Alignment (§8, §14)

In ARGUS, agents exchange structured payloads (`AgentEnvelope`, `Finding`, `Evidence`, `ToolCallRequest`). TypeScript interfaces only exist at compile time. At runtime, LLM outputs and external inputs can be malformed, corrupted, or adversarial.
This skill defines the runtime validation requirements and schema patterns using **Zod** in `packages/agent-core`.

---

## 1. Core Schema Invariants

Every agent message that enters the orchestrator must pass through strict Zod schema validation before processing:

```typescript
import { z } from "zod";

// Severity & confidence enums
export const FindingSeveritySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"]);

export const ConfidenceScoreSchema = z.number().min(0).max(1);

// Evidence schema
export const EvidenceSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["AST_DIFF", "LOG_TRACE", "TEST_OUTPUT", "STATIC_ANALYSIS", "SOURCE_SNIPPET"]),
  location: z.object({
    filePath: z.string().min(1),
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
  }),
  payload: z.record(z.unknown()),
  capturedAt: z.string().datetime(),
});

// Finding schema
export const FindingSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: FindingSeveritySchema,
  confidence: ConfidenceScoreSchema,
  evidences: z.array(EvidenceSchema).min(1),
  tags: z.array(z.string()).default([]),
});

// Agent Envelope schema
export const AgentEnvelopeSchema = z.object({
  version: z.literal("1.0"),
  agentId: z.string().min(1),
  agentRole: z.string().min(1),
  conversationId: z.string().uuid(),
  timestamp: z.string().datetime(),
  payloadType: z.enum(["FINDING", "VERIFICATION_REQUEST", "TASK_STATUS", "ERROR"]),
  payload: z.unknown(),
  signature: z.string().optional(),
});

export type AgentEnvelope = z.infer<typeof AgentEnvelopeSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
```

---

## 2. Safe Parsing & Validation Workflow

Always validate untrusted agent output using `.safeParse()` to avoid unhandled runtime panics:

```typescript
export function validateAgentEnvelope(raw: unknown): AgentEnvelope {
  const result = AgentEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `[${issue.path.join(".")}] ${issue.message}`)
      .join(", ");
    throw new Error(`AgentEnvelope validation failed: ${errorDetails}`);
  }
  return result.data;
}
```

---

## 3. Implementation Checklist for Agents & Packages

- [ ] Do **not** cast raw agent output with `as Finding` or `as AgentEnvelope`.
- [ ] Export both the Zod schema (`*Schema`) and the inferred TypeScript type (`export type * = z.infer<typeof *Schema>`).
- [ ] Place all shared schemas in `packages/agent-core/src/schemas/`.
- [ ] Validate MCP tool inputs and outputs using Zod schemas at tool handler entry points.
