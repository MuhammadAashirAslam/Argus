import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Orchestrator } from "../../packages/orchestrator/src/index.js";
import { InvestigatorAgent } from "../../agents/investigator/src/index.js";
import { AnalyzerAgent } from "../../agents/analyzer/src/index.js";
import { PatchAgent } from "../../agents/patch/src/index.js";
import { VerifierAgent } from "../../agents/verifier/src/index.js";
import { ConfigurationAgent } from "../../agents/configuration/src/index.js";
import { HistorianAgent } from "../../agents/historian/src/index.js";
import { runConfigScan } from "../../apps/cli/src/commands/config_scan.js";

describe("ARGUS Full End-to-End Pipeline Integration Test (§5, §14)", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["GROQ_API_KEY"];

  beforeEach(() => {
    process.env["GROQ_API_KEY"] = "mock_groq_api_key";
    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      const messages = body.messages ?? [];
      const systemMessage = messages.find((m: any) => m.role === "system")?.content ?? "";

      let content = "{}";
      if (systemMessage.includes("Investigator Agent")) {
        content = JSON.stringify({
          problem_summary: "E2E investigation discovered unpinned Dockerfile and action dependencies",
          relevant_files: ["Dockerfile", ".github/workflows/ci.yml"],
          findings: [
            {
              id: "f-e2e-1",
              statement: "Found Dockerfile using unpinned base image",
              classification: "FACT",
              evidenceIds: [],
            },
          ],
          evidence: [],
          investigation_complete: true,
        });
      } else if (systemMessage.includes("Analyzer Agent")) {
        content = JSON.stringify({
          hypotheses: [
            {
              id: "hyp-e2e-1",
              statement: "Pinning base image and action tags will resolve non-deterministic CI breaks",
              likelihood: "HIGH",
              supportingEvidenceIds: ["f-e2e-1"],
              contradictingEvidenceIds: [],
              resolved: false,
            },
          ],
          findings: [
            {
              id: "f-e2e-2",
              statement: "Action supply chain risk can be mitigated via SHA pinning",
              classification: "INFERENCE",
              evidenceIds: [],
            },
          ],
          analysis_complete: true,
        });
      } else if (systemMessage.includes("Configuration Agent")) {
        content = JSON.stringify({
          findings: [],
          configuration_analysis_complete: true,
        });
      } else if (systemMessage.includes("Historian Agent")) {
        content = JSON.stringify({
          findings: [],
          history_analysis_complete: true,
        });
      } else if (systemMessage.includes("Patch Agent")) {
        content = JSON.stringify({
          proposedChange: {
            id: "patch-e2e-1",
            filePath: "Dockerfile",
            diff: "",
            explanation: "Pin Dockerfile to node:20-alpine",
          },
        });
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content,
                tool_calls: undefined,
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 50,
            completion_tokens: 50,
            total_tokens: 100,
          },
        }),
      } as any;
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalKey) {
      process.env["GROQ_API_KEY"] = originalKey;
    } else {
      delete process.env["GROQ_API_KEY"];
    }
  });

  it("executes full multi-agent cycle: scan -> investigate -> diagnose -> patch -> verify", async () => {
    // 1. Config Debt Scan
    const scanFindings = await runConfigScan(process.cwd());
    expect(Array.isArray(scanFindings)).toBe(true);

    // 2. Orchestrator Multi-Agent Run
    const orchestrator = new Orchestrator();
    orchestrator.registerAgent(new InvestigatorAgent());
    orchestrator.registerAgent(new AnalyzerAgent());
    orchestrator.registerAgent(new ConfigurationAgent());
    orchestrator.registerAgent(new HistorianAgent());
    orchestrator.registerAgent(new PatchAgent());
    orchestrator.registerAgent(new VerifierAgent());

    const runState = await orchestrator.executeRun({
      repository: process.cwd(),
      objective: "Full E2E verification of pipeline with real agents",
    });

    // Verify all lifecycle stages and outputs
    expect(runState.status).toBe("completed");
    expect(runState.findings.length).toBeGreaterThan(0);
    expect(runState.hypotheses.length).toBeGreaterThan(0);
    expect(runState.trajectory.length).toBeGreaterThan(0);

    // Verify epistemic classifications
    const classifications = runState.findings.map((f) => f.classification);
    expect(classifications).toContain("FACT");
  });
});
