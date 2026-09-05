import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runConfigScan } from "../src/commands/config_scan.js";
import { formatTrajectoryTimeline } from "../src/commands/trace.js";
import { runAnalyze } from "../src/commands/analyze.js";

describe("Developer CLI Commands (§23)", () => {
  const originalFetch = globalThis.fetch;
  const originalGroqKey = process.env["GROQ_API_KEY"];

  beforeEach(() => {
    process.env["GROQ_API_KEY"] = "mock_groq_key_for_test";
    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      const messages = body.messages ?? [];
      const systemMessage = messages.find((m: any) => m.role === "system")?.content ?? "";

      let content = "{}";
      if (systemMessage.includes("Investigator Agent")) {
        content = JSON.stringify({
          problem_summary: "Test investigation complete",
          relevant_files: ["package.json"],
          findings: [],
          evidence: [],
          investigation_complete: true,
        });
      } else if (systemMessage.includes("Analyzer Agent")) {
        content = JSON.stringify({
          hypotheses: [
            {
              id: "hyp-1",
              statement: "Mock root cause identified",
              likelihood: "HIGH",
              supportingEvidenceIds: [],
              contradictingEvidenceIds: [],
              resolved: false,
            },
          ],
          findings: [],
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
            id: "patch-1",
            filePath: "package.json",
            diff: "",
            explanation: "No changes needed",
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
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20,
          },
        }),
      } as any;
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalGroqKey) {
      process.env["GROQ_API_KEY"] = originalGroqKey;
    } else {
      delete process.env["GROQ_API_KEY"];
    }
  });

  it("formats trajectory timeline correctly", () => {
    const timeline = formatTrajectoryTimeline([
      {
        runId: "run_cli_1",
        step: 1,
        agent: "INVESTIGATOR",
        state: "investigating",
        event: "agent.started",
        timestamp: new Date().toISOString(),
      },
    ]);
    expect(timeline).toContain("ARGUS EXECUTION TIMELINE");
    expect(timeline).toContain("INVESTIGATOR -> agent.started");
  });

  it("runs config scan against workspace", async () => {
    const findings = await runConfigScan(process.cwd());
    expect(Array.isArray(findings)).toBe(true);
  });

  it("runs analyze command and persists trajectory for trace command", async () => {
    const state = await runAnalyze(process.cwd());
    expect(state.status).toBe("completed");

    // Test that the persisted run can be loaded and formatted by runTrace (§23)
    const { runTrace } = await import("../src/commands/trace.js");
    const traceOutput = await runTrace(state.runId, process.cwd());
    expect(traceOutput).toContain("ARGUS EXECUTION TIMELINE");
    expect(traceOutput).toContain("INVESTIGATOR");
  });
});
