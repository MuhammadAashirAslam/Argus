import { z } from "zod";
import { EpistemicTypeSchema } from "./evidence.js";

export const FindingSeveritySchema = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFORMATIONAL",
]);

/**
 * Finding Schema (§10).
 * Every finding requires real grounded evidence IDs and explicit epistemic status.
 */
export const FindingSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().min(1),
  severity: FindingSeveritySchema,
  epistemic: EpistemicTypeSchema.default("INFERENCE"),
  confidence: z.number().min(0).max(1),
  evidenceIds: z.array(z.string().uuid()).min(1),
  supersedes: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
});

/**
 * Deterministic Configuration Debt Finding Schema (§15).
 */
export const DebtFindingSchema = z.object({
  ruleId: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
  evidence: z.string().min(1),
  recommendation: z.string().min(1),
});

export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type DebtFinding = z.infer<typeof DebtFindingSchema>;
