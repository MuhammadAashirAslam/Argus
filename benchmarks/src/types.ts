import { z } from "zod";

export const BenchmarkCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  repository: z.string().min(1),
  commitHash: z.string().min(1),
  issueDescription: z.string().min(1),
  expectedProblem: z.string().min(1),
  relevantFiles: z.array(z.string()).min(1),
  expectedDiagnosis: z.string().min(1),
  verificationRequirements: z.array(z.string()).default([]),
});

export const EvaluationMetricsSchema = z.object({
  trialId: z.string().uuid(),
  caseId: z.string(),
  configuration: z.enum(["BASELINE_A", "BASELINE_B", "ARGUS_MCP"]),
  diagnosisAccuracy: z.number().min(0).max(1),
  falsePositiveRate: z.number().min(0).max(1),
  patchSuccessRate: z.number().min(0).max(1),
  verificationPassed: z.boolean(),
  toolCallCount: z.number().int().nonnegative(),
  durationMs: z.number().nonnegative(),
  tokenUsageEstimate: z.number().int().nonnegative(),
  executedAt: z.string().datetime(),
});

export type BenchmarkCase = z.infer<typeof BenchmarkCaseSchema>;
export type EvaluationMetrics = z.infer<typeof EvaluationMetricsSchema>;
