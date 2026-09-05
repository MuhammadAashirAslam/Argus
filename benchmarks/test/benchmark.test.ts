import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BENCHMARK_DATASET } from "../src/cases/dataset.js";
import { runFullComparativeTrial } from "../src/runner.js";

describe("ARGUS Benchmarks & Comparative Evaluation (§26, §27)", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["GROQ_API_KEY"];

  beforeEach(() => {
    process.env["GROQ_API_KEY"] = "mock_key";
    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      const messages = body.messages ?? [];
      const systemMessage = messages.find((m: any) => m.role === "system")?.content ?? "";

      let content = JSON.stringify({
        diagnosis: "Unpinned action uses actions/checkout mutable tag (Rule CD001)",
        proposedFix: "Pin to SHA",
        confidence: 0.9,
      });

      if (systemMessage.includes("Investigator Agent")) {
        content = JSON.stringify({
          problem_summary: "Test investigation complete",
          relevant_files: [".github/workflows/ci.yml"],
          findings: [],
          evidence: [],
          investigation_complete: true,
        });
      } else if (systemMessage.includes("Configuration Agent")) {
        content = JSON.stringify({
          findings: [
            {
              id: "f-rule-cd001",
              ruleId: "CD001",
              title: "Unpinned GitHub Action",
              description: "Action uses mutable ref instead of commit SHA (CD001)",
              severity: "HIGH",
              epistemic: "FACT",
              evidenceIds: [],
            },
          ],
          configuration_analysis_complete: true,
        });
      } else if (systemMessage.includes("Historian Agent")) {
        content = JSON.stringify({
          findings: [],
          history_analysis_complete: true,
        });
      } else if (systemMessage.includes("Analyzer Agent")) {
        content = JSON.stringify({
          hypotheses: [
            {
              id: "hyp-1",
              statement: "Unpinned action allows mutable tag hijacking (CD001)",
              likelihood: "HIGH",
              supportingEvidenceIds: [],
              contradictingEvidenceIds: [],
              resolved: false,
            },
          ],
          findings: [],
          analysis_complete: true,
        });
      } else if (systemMessage.includes("Patch Agent")) {
        content = JSON.stringify({
          proposedChange: {
            id: "patch-1",
            filePath: ".github/workflows/ci.yml",
            diff: "",
            explanation: "Pin to commit SHA",
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
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
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

  it("contains 10 valid benchmark cases matching schema", () => {
    expect(BENCHMARK_DATASET.length).toBe(10);
    for (const c of BENCHMARK_DATASET) {
      expect(c.id).toMatch(/^ARGUS-BM-/);
      expect(c.relevantFiles.length).toBeGreaterThan(0);
    }
  });

  it("runs comparative trial across Baseline A, Baseline B, and ARGUS MCP", async () => {
    const testCase = BENCHMARK_DATASET[0]!;
    const trial = await runFullComparativeTrial(testCase);

    expect(trial.baselineA.configuration).toBe("BASELINE_A");
    expect(trial.baselineB.configuration).toBe("BASELINE_B");
    expect(trial.argus.configuration).toBe("ARGUS_MCP");

    // ARGUS MCP should achieve highest diagnosis accuracy and lowest false positive rate
    expect(trial.argus.diagnosisAccuracy).toBeGreaterThan(trial.baselineA.diagnosisAccuracy);
    expect(trial.argus.falsePositiveRate).toBeLessThan(trial.baselineA.falsePositiveRate);
  });
});
