import { z } from "zod";

export const VerificationStatusSchema = z.enum([
  "verified",
  "partially_verified",
  "failed",
]);

export const VerificationStageTypeSchema = z.enum([
  "PATCH_APPLICATION",
  "SYNTAX_AST",
  "STATIC_ANALYSIS",
  "LINT",
  "TESTS",
]);

export const StageResultSchema = z.object({
  stage: VerificationStageTypeSchema,
  passed: z.boolean(),
  exitCode: z.number().int(),
  durationMs: z.number().nonnegative(),
  stdout: z.string(),
  stderr: z.string(),
  errorDetails: z.array(z.string()).default([]),
});

/**
 * Patch Verification Result Schema (§17).
 * Tool-derived verification results, never asserted by LLM.
 */
export const VerificationResultSchema = z.object({
  id: z.string().uuid(),
  patchApplied: z.boolean(),
  syntaxValid: z.boolean(),
  staticAnalysisPassed: z.boolean(),
  lintPassed: z.boolean(),
  testsPassed: z.boolean(),
  stages: z.array(StageResultSchema),
  failures: z.array(z.string()).default([]),
  overall: VerificationStatusSchema,
  verifiedAt: z.string().datetime(),
});

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type VerificationStageType = z.infer<typeof VerificationStageTypeSchema>;
export type StageResult = z.infer<typeof StageResultSchema>;
export type VerificationResult = z.infer<typeof VerificationResultSchema>;
