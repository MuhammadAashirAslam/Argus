import { z } from "zod";

/**
 * Epistemic classification for statements (§5.2).
 */
export const EpistemicTypeSchema = z.enum(["FACT", "INFERENCE", "HYPOTHESIS"]);

export const EvidenceTypeSchema = z.enum([
  "AST_DIFF",
  "LOG_TRACE",
  "TEST_OUTPUT",
  "STATIC_ANALYSIS",
  "SOURCE_SNIPPET",
  "GIT_HISTORY",
  "CONFIG_AUDIT",
]);

export const SourceLocationSchema = z.object({
  filePath: z.string().min(1),
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
});

/**
 * Grounded Evidence contract (§9).
 * Real evidence generated from deterministic tool execution or sandbox observation.
 */
export const EvidenceSchema = z.object({
  id: z.string().uuid(),
  type: EvidenceTypeSchema,
  epistemic: EpistemicTypeSchema.default("FACT"),
  location: SourceLocationSchema.optional(),
  payload: z.record(z.unknown()),
  capturedAt: z.string().datetime(),
  toolSource: z.string().min(1),
});

export type EpistemicType = z.infer<typeof EpistemicTypeSchema>;
export type EvidenceType = z.infer<typeof EvidenceTypeSchema>;
export type SourceLocation = z.infer<typeof SourceLocationSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
