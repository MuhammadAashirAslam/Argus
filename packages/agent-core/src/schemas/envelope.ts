import { z } from "zod";

/**
 * Failure Taxonomy (§19, §25).
 */
export const FailureCodeSchema = z.enum([
  "CONTEXT_FAILURE",
  "TOOL_FAILURE",
  "REASONING_FAILURE",
  "PLANNING_FAILURE",
  "PATCH_FAILURE",
  "VERIFICATION_FAILURE",
  "CONFIGURATION_FAILURE",
  "SCHEMA_VALIDATION_ERROR",
  "UNSUPPORTED_REPOSITORY",
  "TIMEOUT",
  "RESOURCE_LIMIT",
]);

export const EnvelopeErrorSchema = z.object({
  code: FailureCodeSchema,
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
  fatal: z.boolean().default(false),
});

export const PayloadTypeSchema = z.enum([
  "INVESTIGATION_RESULT",
  "ANALYSIS_RESULT",
  "CONFIG_DEBT_RESULT",
  "PATCH_CANDIDATE",
  "VERIFICATION_RESULT",
  "HISTORICAL_CONTEXT",
  "TASK_STATUS",
  "ERROR",
]);

/**
 * Canonical Agent Envelope Schema (§8, §34).
 * All inter-agent communication must validate against this schema.
 */
export const AgentEnvelopeSchema = z.object({
  version: z.literal("1.0"),
  envelopeId: z.string().uuid(),
  agentId: z.string().min(1),
  agentRole: z.enum([
    "INVESTIGATOR",
    "ANALYZER",
    "CONFIGURATION",
    "HISTORIAN",
    "PATCH",
    "VERIFIER",
    "ORCHESTRATOR",
    "BASELINE_B",
  ]),
  runId: z.string().min(1),
  timestamp: z.string().datetime(),
  payloadType: PayloadTypeSchema,
  payload: z.unknown(),
  errors: z.array(EnvelopeErrorSchema).default([]),
});

export type FailureCode = z.infer<typeof FailureCodeSchema>;
export type EnvelopeError = z.infer<typeof EnvelopeErrorSchema>;
export type PayloadType = z.infer<typeof PayloadTypeSchema>;
export type AgentEnvelope = z.infer<typeof AgentEnvelopeSchema>;

/**
 * Runtime schema validator for incoming AgentEnvelopes.
 * Throws explicit descriptive error if malformed or adversarial output is encountered.
 */
export function validateAgentEnvelope(raw: unknown): AgentEnvelope {
  const result = AgentEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `[${issue.path.join(".")}] ${issue.message}`)
      .join("; ");
    throw new Error(`Schema validation error for AgentEnvelope: ${errorDetails}`);
  }
  return result.data;
}
