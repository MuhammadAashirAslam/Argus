import { z } from "zod";
import { FindingSchema } from "./finding.js";
import { EvidenceSchema } from "./evidence.js";
import { VerificationResultSchema } from "./verification.js";

export const HypothesisSchema = z.object({
  id: z.string().uuid(),
  statement: z.string().min(1),
  likelihood: z.enum(["HIGH", "MEDIUM", "LOW"]),
  supportingEvidenceIds: z.array(z.string().uuid()),
  contradictingEvidenceIds: z.array(z.string().uuid()).default([]),
  resolved: z.boolean().default(false),
  resolutionNotes: z.string().optional(),
});

export const ProposedChangeSchema = z.object({
  id: z.string().uuid(),
  filePath: z.string().min(1),
  diff: z.string().min(1),
  explanation: z.string().min(1),
  targetHypothesisId: z.string().uuid().optional(),
});

export const RunStatusSchema = z.enum([
  "initializing",
  "investigating",
  "diagnosing",
  "patching",
  "verifying",
  "completed",
  "failed",
]);

export const AgentEventSchema = z.object({
  runId: z.string().min(1),
  step: z.number().int().positive(),
  agent: z.string().min(1),
  state: RunStatusSchema,
  event: z.string().min(1),
  tool: z.string().optional(),
  timestamp: z.string().datetime(),
  durationMs: z.number().nonnegative().optional(),
});

/**
 * Central Orchestrator RunState Schema (§12).
 */
export const RunStateSchema = z.object({
  runId: z.string().min(1),
  repository: z.string().min(1),
  pullRequest: z.number().int().positive().optional(),
  objective: z.string().min(1),
  relevantFiles: z.array(z.string()).default([]),
  evidence: z.array(EvidenceSchema).default([]),
  findings: z.array(FindingSchema).default([]),
  hypotheses: z.array(HypothesisSchema).default([]),
  proposedChanges: z.array(ProposedChangeSchema).default([]),
  verification: z.array(VerificationResultSchema).default([]),
  trajectory: z.array(AgentEventSchema).default([]),
  status: RunStatusSchema,
});

export type Hypothesis = z.infer<typeof HypothesisSchema>;
export type ProposedChange = z.infer<typeof ProposedChangeSchema>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type RunState = z.infer<typeof RunStateSchema>;
