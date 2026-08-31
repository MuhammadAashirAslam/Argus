import { describe, it, expect } from "vitest";
import {
  AgentEnvelopeSchema,
  validateAgentEnvelope,
} from "../src/schemas/envelope.js";

describe("AgentEnvelopeSchema and validation", () => {
  it("validates well-formed AgentEnvelope", () => {
    const valid = {
      version: "1.0",
      envelopeId: "550e8400-e29b-41d4-a716-446655440000",
      agentId: "investigator-01",
      agentRole: "INVESTIGATOR",
      runId: "run_test_123",
      timestamp: new Date().toISOString(),
      payloadType: "INVESTIGATION_RESULT",
      payload: {
        problem_summary: "Unpinned action in workflow",
        relevant_files: [".github/workflows/ci.yml"],
      },
      errors: [],
    };

    const parsed = validateAgentEnvelope(valid);
    expect(parsed.agentId).toBe("investigator-01");
    expect(parsed.agentRole).toBe("INVESTIGATOR");
  });

  it("throws on invalid version or missing envelopeId", () => {
    const invalid = {
      version: "2.0", // Invalid version
      agentId: "investigator-01",
      agentRole: "INVESTIGATOR",
    };

    expect(() => validateAgentEnvelope(invalid)).toThrow(
      /Schema validation error for AgentEnvelope/,
    );
  });

  it("rejects unknown agent roles", () => {
    const invalid = {
      version: "1.0",
      envelopeId: "550e8400-e29b-41d4-a716-446655440000",
      agentId: "unknown-agent",
      agentRole: "UNAUTHORIZED_ROLE",
      runId: "run_test_123",
      timestamp: new Date().toISOString(),
      payloadType: "TASK_STATUS",
      payload: {},
    };

    expect(() => validateAgentEnvelope(invalid)).toThrow();
  });
});
