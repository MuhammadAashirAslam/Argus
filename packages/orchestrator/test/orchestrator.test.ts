import { describe, it, expect, vi } from "vitest";
import { Orchestrator } from "../src/orchestrator.js";
import type { ArgusAgent, AgentEnvelope } from "@argus/agent-core";
import { randomUUID } from "node:crypto";

function createMockAgent(role: string, payloadType: string, payload: any): ArgusAgent {
  return {
    id: randomUUID(),
    role,
    run: vi.fn().mockResolvedValue({
      version: "1.0",
      envelopeId: randomUUID(),
      agentId: "mock",
      agentRole: role,
      runId: "test",
      timestamp: new Date().toISOString(),
      payloadType: payloadType as any,
      payload,
    } as AgentEnvelope),
  };
}

describe("Orchestrator state machine", () => {
  it("executes the full investigation and patching loop", async () => {
    const orchestrator = new Orchestrator();

    const investigator = createMockAgent("INVESTIGATOR", "INVESTIGATION_RESULT", {
      relevant_files: ["file.ts"],
      findings: [],
    });
    const analyzer = createMockAgent("ANALYZER", "ANALYSIS_RESULT", {
      hypotheses: [],
      findings: [],
    });
    const patcher = createMockAgent("PATCH", "PATCH_CANDIDATE", {
      proposedChange: { diff: "some patch", explanation: "fix" },
    });
    const verifier = createMockAgent("VERIFIER", "VERIFICATION_RESULT", {
      verificationResult: { overall: "verified", stages: [] },
    });

    orchestrator.registerAgent(investigator);
    orchestrator.registerAgent(analyzer);
    orchestrator.registerAgent(patcher);
    orchestrator.registerAgent(verifier);

    const runState = await orchestrator.executeRun({
      repository: "test/repo",
      objective: "Fix bug",
    });
    if (runState.status !== "completed") {
      console.error(JSON.stringify(runState.trajectory, null, 2));
    }
    expect(runState.status).toBe("completed");
    expect(runState.relevantFiles).toContain("file.ts");
    expect(investigator.run).toHaveBeenCalled();
    expect(analyzer.run).toHaveBeenCalled();
    expect(patcher.run).toHaveBeenCalled();
    expect(verifier.run).toHaveBeenCalled();
  });

  it("handles verification failure by looping back to patch", async () => {
    const orchestrator = new Orchestrator();

    const patcher = {
      id: "patcher",
      role: "PATCH",
      run: vi.fn().mockResolvedValue({
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: "mock",
        agentRole: "PATCH",
        runId: "test",
        timestamp: new Date().toISOString(),
        payloadType: "PATCH_CANDIDATE",
        payload: { proposedChange: { diff: "bad patch", explanation: "fix" } },
      } as AgentEnvelope),
    };

    let verifyCount = 0;
    const verifier = {
      id: "verifier",
      role: "VERIFIER",
      run: vi.fn().mockImplementation(async () => {
        verifyCount++;
        return {
          version: "1.0",
          envelopeId: randomUUID(),
          agentId: "mock",
          agentRole: "VERIFIER",
          runId: "test",
          timestamp: new Date().toISOString(),
          payloadType: "VERIFICATION_RESULT",
          payload: {
            verificationResult: {
              overall: verifyCount >= 2 ? "verified" : "failed", // fails first time, succeeds second
              stages: [],
            },
          },
        };
      }),
    };

    orchestrator.registerAgent(
      createMockAgent("INVESTIGATOR", "INVESTIGATION_RESULT", { relevant_files: [], findings: [] }),
    );
    orchestrator.registerAgent(
      createMockAgent("ANALYZER", "ANALYSIS_RESULT", { hypotheses: [], findings: [] }),
    );
    orchestrator.registerAgent(patcher);
    orchestrator.registerAgent(verifier);

    const runState = await orchestrator.executeRun({
      repository: "test/repo",
      objective: "Fix bug",
    });

    expect(patcher.run).toHaveBeenCalledTimes(2);
    expect(verifier.run).toHaveBeenCalledTimes(2);
    expect(runState.status).toBe("completed");
  });
});
