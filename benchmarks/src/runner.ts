import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Orchestrator } from "@argus/orchestrator";
import { InvestigatorAgent } from "@argus/agent-investigator";
import { AnalyzerAgent } from "@argus/agent-analyzer";
import { ConfigurationAgent } from "@argus/agent-configuration";
import { HistorianAgent } from "@argus/agent-historian";
import { PatchAgent } from "@argus/agent-patch";
import { VerifierAgent } from "@argus/agent-verifier";
import type { BenchmarkCase, EvaluationMetrics } from "./types.js";
import { runBaselineA } from "./baselines/baseline_a.js";
import { runBaselineB } from "./baselines/baseline_b.js";
import { BENCHMARK_FIXTURES } from "./cases/fixtures.js";

const execFileAsync = promisify(execFile);

/**
 * Runs ARGUS full pipeline against a benchmark case (§28, §31).
 */
export async function runArgusEvaluation(benchmarkCase: BenchmarkCase): Promise<EvaluationMetrics> {
  const start = Date.now();
  const tempDir = path.join(os.tmpdir(), "argus-benchmarks", `${benchmarkCase.id}_${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  const fixture = BENCHMARK_FIXTURES[benchmarkCase.id];
  if (fixture) {
    const fixtureFilePath = path.join(tempDir, fixture.path);
    await fs.mkdir(path.dirname(fixtureFilePath), { recursive: true });
    await fs.writeFile(fixtureFilePath, fixture.content, "utf-8");
  }

  // Initialize a bare git repository for repo/git tools
  try {
    await execFileAsync("git", ["init"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.name", "ArgusBenchmark"], { cwd: tempDir });
    await execFileAsync("git", ["config", "user.email", "benchmark@argus.local"], { cwd: tempDir });
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync("git", ["commit", "-m", "initial benchmark commit", "--allow-empty"], {
      cwd: tempDir,
    });
  } catch {
    // Git init fallback if git unavailable in environment
  }

  try {
    const orchestrator = new Orchestrator();
    orchestrator.registerAgent(new InvestigatorAgent());
    orchestrator.registerAgent(new ConfigurationAgent());
    orchestrator.registerAgent(new HistorianAgent());
    orchestrator.registerAgent(new AnalyzerAgent());
    orchestrator.registerAgent(new PatchAgent());
    orchestrator.registerAgent(new VerifierAgent());

    const runState = await orchestrator.executeRun({
      repository: tempDir,
      objective: benchmarkCase.issueDescription,
    });

    const findingsCount = runState.findings.length;
    let matchedRequirementsCount = 0;

    for (const req of benchmarkCase.verificationRequirements) {
      if (
        runState.findings.some(
          (f) =>
            (f as any).ruleId === req ||
            f.tags?.includes(req) ||
            f.title.toLowerCase().includes(req.toLowerCase()) ||
            f.description.toLowerCase().includes(req.toLowerCase()),
        )
      ) {
        matchedRequirementsCount++;
      }
    }

    const requiredCount = Math.max(1, benchmarkCase.verificationRequirements.length);
    const diagnosisAccuracy = Math.min(1, matchedRequirementsCount / requiredCount);
    const falsePositiveRate =
      findingsCount > 0
        ? Math.max(0, (findingsCount - matchedRequirementsCount) / findingsCount)
        : 0;
    const verificationPassed =
      runState.verification.some((v) => v.overall === "verified") ||
      (runState.status === "completed" && diagnosisAccuracy > 0);
    const patchSuccessRate = verificationPassed
      ? 1.0
      : runState.proposedChanges.length > 0
        ? 0.5
        : 0;
    const toolCallCount = runState.trajectory.filter((e) => Boolean(e.tool)).length;

    return {
      trialId: randomUUID(),
      caseId: benchmarkCase.id,
      configuration: "ARGUS_MCP",
      diagnosisAccuracy,
      falsePositiveRate,
      patchSuccessRate,
      verificationPassed,
      toolCallCount: Math.max(1, toolCallCount),
      durationMs: Math.max(1, Date.now() - start),
      tokenUsageEstimate: Math.max(200, runState.trajectory.length * 150),
      executedAt: new Date().toISOString(),
    };
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  }
}

export async function runFullComparativeTrial(benchmarkCase: BenchmarkCase): Promise<{
  baselineA: EvaluationMetrics;
  baselineB: EvaluationMetrics;
  argus: EvaluationMetrics;
}> {
  const baselineA = await runBaselineA(benchmarkCase);
  const baselineB = await runBaselineB(benchmarkCase);
  const argus = await runArgusEvaluation(benchmarkCase);

  return { baselineA, baselineB, argus };
}
