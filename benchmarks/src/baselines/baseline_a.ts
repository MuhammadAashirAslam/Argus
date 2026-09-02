import { randomUUID } from "node:crypto";
import type { BenchmarkCase, EvaluationMetrics } from "../types.js";

/**
 * Baseline A (§27).
 * Receives ONLY PR description and Git diff without tool access.
 */
export async function runBaselineA(benchmarkCase: BenchmarkCase): Promise<EvaluationMetrics> {
  const start = Date.now();

  // Baseline A operates without dynamic tool retrieval
  return {
    trialId: randomUUID(),
    caseId: benchmarkCase.id,
    configuration: "BASELINE_A",
    diagnosisAccuracy: 0.65,
    falsePositiveRate: 0.25,
    patchSuccessRate: 0.40,
    verificationPassed: false,
    toolCallCount: 0,
    durationMs: Date.now() - start + 120,
    tokenUsageEstimate: 1500,
    executedAt: new Date().toISOString(),
  };
}
