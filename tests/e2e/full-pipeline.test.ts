import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Orchestrator } from "@argus/orchestrator";
import { InvestigatorAgent } from "@argus/agent-investigator";
import { AnalyzerAgent } from "@argus/agent-analyzer";
import { PatchAgent } from "@argus/agent-patch";
import { VerifierAgent } from "@argus/agent-verifier";
import { ConfigurationAgent } from "@argus/agent-configuration";
import { HistorianAgent } from "@argus/agent-historian";
import { runConfigScan } from "@argus/cli";
import { VerificationRunner } from "@argus/verifier";

const execFileAsync = promisify(execFile);

describe("ARGUS Full End-to-End Pipeline Integration Test (§5, §14)", () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env["GROQ_API_KEY"];
  let tempRepoDir = "";

  beforeEach(async () => {
    process.env["GROQ_API_KEY"] = "mock_groq_api_key";
    tempRepoDir = path.join(os.tmpdir(), "argus-e2e-" + Date.now());
    await fs.mkdir(tempRepoDir, { recursive: true });
    await fs.writeFile(path.join(tempRepoDir, "README.md"), "# Hello\n", "utf-8");

    try {
      await execFileAsync("git", ["init"], { cwd: tempRepoDir });
      await execFileAsync("git", ["config", "user.name", "ArgusTest"], { cwd: tempRepoDir });
      await execFileAsync("git", ["config", "user.email", "test@argus.local"], {
        cwd: tempRepoDir,
      });
      await execFileAsync("git", ["add", "."], { cwd: tempRepoDir });
      await execFileAsync("git", ["commit", "-m", "init commit"], { cwd: tempRepoDir });
    } catch {
      // fallback
    }

    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      const body = options?.body ? JSON.parse(String(options.body)) : {};
      const messages = body.messages ?? [];
      const systemMessage = messages.find((m: any) => m.role === "system")?.content ?? "";

      let content = "{}";
      if (systemMessage.includes("Investigator Agent")) {
        content = JSON.stringify({
          problem_summary:
            "E2E investigation discovered unpinned Dockerfile and action dependencies",
          relevant_files: ["README.md", ".github/workflows/ci.yml"],
          findings: [
            {
              id: "550e8400-e29b-41d4-a716-446655440001",
              title: "Unpinned Dockerfile base image",
              description: "Found Dockerfile using unpinned base image",
              severity: "HIGH",
              epistemic: "FACT",
              confidence: 0.95,
              evidenceIds: ["550e8400-e29b-41d4-a716-446655440000"],
              createdAt: new Date().toISOString(),
            },
          ],
          evidence: [],
          investigation_complete: true,
        });
      } else if (systemMessage.includes("Analyzer Agent")) {
        content = JSON.stringify({
          hypotheses: [
            {
              id: "550e8400-e29b-41d4-a716-446655440002",
              statement:
                "Pinning base image and action tags will resolve non-deterministic CI breaks",
              likelihood: "HIGH",
              supportingEvidenceIds: ["550e8400-e29b-41d4-a716-446655440001"],
              contradictingEvidenceIds: [],
              resolved: false,
            },
          ],
          findings: [
            {
              id: "550e8400-e29b-41d4-a716-446655440003",
              title: "Supply chain risk mitigation",
              description: "Action supply chain risk can be mitigated via SHA pinning",
              severity: "MEDIUM",
              epistemic: "INFERENCE",
              confidence: 0.85,
              evidenceIds: ["550e8400-e29b-41d4-a716-446655440001"],
              createdAt: new Date().toISOString(),
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
            id: "550e8400-e29b-41d4-a716-446655440004",
            filePath: "README.md",
            diff: "--- a/README.md\n+++ b/README.md\n@@ -1 +1 @@\n-# Hello\n+# Hello World\n",
            explanation: "Update heading in README.md",
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

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (originalKey) {
      process.env["GROQ_API_KEY"] = originalKey;
    } else {
      delete process.env["GROQ_API_KEY"];
    }
    try {
      if (tempRepoDir) {
        await fs.rm(tempRepoDir, { recursive: true, force: true });
      }
    } catch {
      // ignore
    }
  });

  it("executes full multi-agent cycle: scan -> investigate -> diagnose -> patch -> verify", async () => {
    // 1. Config Debt Scan
    const scanFindings = await runConfigScan(process.cwd());
    expect(Array.isArray(scanFindings)).toBe(true);

    // 2. Orchestrator Multi-Agent Run
    const runSpy = vi.spyOn(VerificationRunner.prototype, "runPipeline").mockResolvedValueOnce({
      id: "550e8400-e29b-41d4-a716-446655440005",
      patchApplied: true,
      syntaxValid: true,
      staticAnalysisPassed: true,
      lintPassed: true,
      testsPassed: true,
      stages: [
        {
          stage: "PATCH_APPLICATION",
          passed: true,
          exitCode: 0,
          durationMs: 10,
          stdout: "Applied patch cleanly",
          stderr: "",
          errorDetails: [],
        },
        {
          stage: "SYNTAX_AST",
          passed: true,
          exitCode: 0,
          durationMs: 50,
          stdout: "",
          stderr: "",
          errorDetails: [],
        },
        {
          stage: "STATIC_ANALYSIS",
          passed: true,
          exitCode: 0,
          durationMs: 40,
          stdout: "",
          stderr: "",
          errorDetails: [],
        },
        {
          stage: "LINT",
          passed: true,
          exitCode: 0,
          durationMs: 30,
          stdout: "",
          stderr: "",
          errorDetails: [],
        },
        {
          stage: "TESTS",
          passed: true,
          exitCode: 0,
          durationMs: 100,
          stdout: "All tests passed",
          stderr: "",
          errorDetails: [],
        },
      ],
      failures: [],
      overall: "verified",
      verifiedAt: new Date().toISOString(),
    });

    const orchestrator = new Orchestrator();
    orchestrator.registerAgent(new InvestigatorAgent());
    orchestrator.registerAgent(new AnalyzerAgent());
    orchestrator.registerAgent(new ConfigurationAgent());
    orchestrator.registerAgent(new HistorianAgent());
    orchestrator.registerAgent(new PatchAgent());
    orchestrator.registerAgent(new VerifierAgent());

    const runState = await orchestrator.executeRun({
      repository: tempRepoDir,
      objective: "Full E2E verification of pipeline with real agents",
    });

    // Verify all lifecycle stages and outputs
    expect(runState.status).toBe("completed");
    expect(runState.findings.length).toBeGreaterThan(0);
    expect(runState.hypotheses.length).toBeGreaterThan(0);
    expect(runState.trajectory.length).toBeGreaterThan(0);

    // Verify that the Patch Agent and Verifier Agent were both invoked (§4.2 #10)
    expect(runSpy).toHaveBeenCalled();
    expect(runState.proposedChanges.length).toBeGreaterThan(0);
    expect(runState.verification.length).toBeGreaterThan(0);
    expect(runState.trajectory.some((e) => e.agent === "PATCH")).toBe(true);
    expect(runState.trajectory.some((e) => e.agent === "VERIFIER")).toBe(true);

    // Verify epistemic classifications
    const classifications = runState.findings.map((f) => f.epistemic);
    expect(classifications).toContain("FACT");
  }, 30000);
});
