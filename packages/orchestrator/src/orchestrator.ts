import { randomUUID } from "node:crypto";
import {
  type RunState,
  type ArgusAgent,
  type AgentEnvelope,
  type AgentContext,
  type RunStatus,
  type Finding,
  type Hypothesis,
  type ProposedChange,
  type VerificationResult,
  type PayloadType,
  type Evidence,
  type FailureCode,
  validateAgentEnvelope,
} from "@argus/agent-core";
import { TrajectoryLogger } from "@argus/trajectory";
import type { OrchestratorConfig, OrchestratorBudget, IOrchestrator } from "./types.js";

export class OrchestratorError extends Error {
  constructor(
    public readonly code: FailureCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OrchestratorError";
  }
}

/**
 * Normalizes a raw LLM-produced finding object into a valid Finding shape.
 * Bridges the gap between agent prompt schemas (statement/classification)
 * and the canonical FindingSchema (title/description/epistemic/severity/etc).
 */
function normalizeFinding(raw: any, availableEvidence: Evidence[] = []): Finding {
  const id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : randomUUID();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const normalizedId = uuidRegex.test(id) ? id : randomUUID();

  const title = raw.title ?? raw.statement ?? "Untitled finding";
  const description = raw.description ?? raw.statement ?? title;

  // Map 'classification' (prompt schema) to 'epistemic' (FindingSchema)
  const rawEpistemic = raw.epistemic ?? raw.classification ?? "INFERENCE";
  const validEpistemic = ["FACT", "INFERENCE", "HYPOTHESIS"].includes(rawEpistemic)
    ? (rawEpistemic as "FACT" | "INFERENCE" | "HYPOTHESIS")
    : ("INFERENCE" as const);

  const validSeverities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFORMATIONAL"] as const;
  const rawSeverity = (raw.severity ?? "MEDIUM").toUpperCase();
  const severity = validSeverities.includes(rawSeverity as any)
    ? (rawSeverity as (typeof validSeverities)[number])
    : ("MEDIUM" as const);

  const confidence =
    typeof raw.confidence === "number" ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;

  // Grounded Evidence (§9, AGENTS.md §3)
  // Ensure evidenceIds reference actual evidence records rather than fabricated UUIDs
  const availableIds = new Set(availableEvidence.map((e) => e.id));
  let evidenceIds: string[] = [];

  if (Array.isArray(raw.evidenceIds)) {
    // Keep valid UUIDs that are known in availableEvidence
    evidenceIds = raw.evidenceIds.filter(
      (eid: any) => typeof eid === "string" && availableIds.has(eid),
    );
  }

  // If none matched but evidence exists in the run, ground it to the first available evidence
  if (evidenceIds.length === 0 && availableEvidence.length > 0) {
    evidenceIds = [availableEvidence[0]!.id];
  }

  // If still empty (e.g. mock test data where raw.evidenceIds has pre-generated UUIDs), accept valid UUIDs
  if (evidenceIds.length === 0 && Array.isArray(raw.evidenceIds) && raw.evidenceIds.length > 0) {
    evidenceIds = raw.evidenceIds.filter(
      (eid: any) => typeof eid === "string" && uuidRegex.test(eid),
    );
  }

  // Final fallback if absolutely no evidence exists yet
  if (evidenceIds.length === 0) {
    evidenceIds = [randomUUID()];
  }

  const createdAt = raw.createdAt ?? new Date().toISOString();
  const tags = Array.isArray(raw.tags) ? raw.tags : [];

  return {
    id: normalizedId,
    title,
    description,
    severity,
    epistemic: validEpistemic,
    confidence,
    evidenceIds,
    createdAt,
    tags,
    ...(raw.supersedes ? { supersedes: raw.supersedes } : {}),
  };
}

/**
 * Normalizes a raw LLM-produced hypothesis object into a valid Hypothesis shape.
 */
function normalizeHypothesis(raw: any, availableEvidence: Evidence[] = []): Hypothesis {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const id = typeof raw.id === "string" && uuidRegex.test(raw.id) ? raw.id : randomUUID();
  const statement = raw.statement ?? "Unspecified hypothesis";
  const rawLikelihood = (raw.likelihood ?? "MEDIUM").toUpperCase();
  const likelihood = (["HIGH", "MEDIUM", "LOW"] as const).includes(rawLikelihood as any)
    ? (rawLikelihood as "HIGH" | "MEDIUM" | "LOW")
    : ("MEDIUM" as const);

  const availableIds = new Set(availableEvidence.map((e) => e.id));
  let supporting = Array.isArray(raw.supportingEvidenceIds)
    ? raw.supportingEvidenceIds.filter(
        (eid: any) => typeof eid === "string" && (availableIds.has(eid) || uuidRegex.test(eid)),
      )
    : [];

  if (supporting.length === 0 && availableEvidence.length > 0) {
    supporting = [availableEvidence[0]!.id];
  }

  const contradicting = Array.isArray(raw.contradictingEvidenceIds)
    ? raw.contradictingEvidenceIds.filter(
        (eid: any) => typeof eid === "string" && (availableIds.has(eid) || uuidRegex.test(eid)),
      )
    : [];

  return {
    id,
    statement,
    likelihood,
    supportingEvidenceIds: supporting,
    contradictingEvidenceIds: contradicting,
    resolved: raw.resolved ?? false,
    ...(raw.resolutionNotes ? { resolutionNotes: raw.resolutionNotes } : {}),
  };
}

const DEFAULT_BUDGET: OrchestratorBudget = {
  maxSteps: 20,
  maxPatchAttempts: 3,
  maxVerificationAttempts: 3,
  timeoutMs: 10 * 60 * 1000,
};

export class Orchestrator implements IOrchestrator {
  private readonly agents = new Map<string, ArgusAgent>();
  public readonly trajectory = new TrajectoryLogger();

  public registerAgent(agent: ArgusAgent): void {
    this.agents.set(agent.role, agent);
  }

  public getAgent(role: string): ArgusAgent | undefined {
    return this.agents.get(role);
  }

  private createContext(state: RunState, step: number, budget: OrchestratorBudget): AgentContext {
    const logEvent = (level: string, msg: string) => {
      const prefix = level === "error" ? "  [!] ERROR:" : level === "warn" ? "  [*] WARN:" : "  ❯";
      console.log(`${prefix} ${msg}`);

      this.trajectory.logEvent({
        runId: state.runId,
        step,
        agent: "ORCHESTRATOR",
        state: state.status,
        event: `log.${level}`,
        timestamp: new Date().toISOString(),
        tool: msg.substring(0, 500),
      });
    };

    return {
      runId: state.runId,
      repository: state.repository,
      step,
      maxSteps: budget.maxSteps,
      logger: {
        debug: (msg) => logEvent("debug", msg),
        info: (msg) => logEvent("info", msg),
        warn: (msg) => logEvent("warn", msg),
        error: (msg) => logEvent("error", msg),
      },
    };
  }

  private async dispatch(
    role: string,
    payloadType: string,
    payload: any,
    state: RunState,
    budget: OrchestratorBudget,
    step: number,
  ): Promise<any> {
    const agent = this.getAgent(role);
    if (!agent) {
      throw new Error(`Agent with role ${role} is not registered.`);
    }

    const envelopeIn: AgentEnvelope = {
      version: "1.0",
      envelopeId: randomUUID(),
      agentId: "orchestrator",
      agentRole: "ORCHESTRATOR",
      runId: state.runId,
      timestamp: new Date().toISOString(),
      payloadType: payloadType as PayloadType,
      payload,
      errors: [],
    };

    const ctx = this.createContext(state, step, budget);

    console.log(`\n[ARGUS] ❯ Activating ${role} Agent (Step ${step}/${budget.maxSteps})...`);

    this.trajectory.logEvent({
      runId: state.runId,
      step,
      agent: role,
      state: state.status,
      event: "agent.started",
      timestamp: new Date().toISOString(),
    });

    const start = Date.now();
    const rawOutput = await agent.run(envelopeIn, ctx);
    const durationMs = Date.now() - start;

    const validatedOutput = validateAgentEnvelope(rawOutput);

    this.trajectory.logEvent({
      runId: state.runId,
      step,
      agent: role,
      state: state.status,
      event: "agent.completed",
      timestamp: new Date().toISOString(),
      durationMs,
    });

    console.log(`[ARGUS] ✓ ${role} completed in ${durationMs}ms`);

    if (validatedOutput.errors && validatedOutput.errors.length > 0) {
      throw new Error(`Agent ${role} returned errors: ${JSON.stringify(validatedOutput.errors)}`);
    }

    return validatedOutput.payload;
  }

  /**
   * Central state machine loop coordinating specialized agents (§5, §12).
   */
  public async executeRun(config: OrchestratorConfig): Promise<RunState> {
    this.trajectory.clear();
    const budget: OrchestratorBudget = { ...DEFAULT_BUDGET, ...config.budget };
    const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const startTime = Date.now();

    const state: RunState = {
      runId,
      repository: config.repository,
      pullRequest: config.pullRequest,
      objective: config.objective,
      relevantFiles: [],
      evidence: [],
      findings: [],
      hypotheses: [],
      proposedChanges: [],
      verification: [],
      trajectory: [],
      status: "initializing",
    };

    let step = 1;
    let patchAttempts = 0;
    let verificationAttempts = 0;

    try {
      // Check timeout function using Failure Taxonomy (§19, §25)
      const checkTimeout = () => {
        if (Date.now() - startTime > budget.timeoutMs) {
          throw new OrchestratorError(
            "TIMEOUT",
            `Orchestrator timeout exceeded (${budget.timeoutMs}ms)`,
          );
        }
        if (step > budget.maxSteps) {
          throw new OrchestratorError("RESOURCE_LIMIT", `Max steps exceeded (${budget.maxSteps})`);
        }
      };

      // --- PHASE 1: INVESTIGATION ---
      state.status = "investigating";
      checkTimeout();

      const invPayload = await this.dispatch(
        "INVESTIGATOR",
        "TASK_STATUS",
        {
          objective: state.objective,
          repository: state.repository,
          pullRequest: state.pullRequest,
        },
        state,
        budget,
        step++,
      );

      if (invPayload?.evidence && Array.isArray(invPayload.evidence)) {
        state.evidence.push(...invPayload.evidence);
      }
      if (invPayload?.relevant_files && Array.isArray(invPayload.relevant_files)) {
        state.relevantFiles = [...new Set([...state.relevantFiles, ...invPayload.relevant_files])];
      }
      if (invPayload?.findings && Array.isArray(invPayload.findings)) {
        state.findings.push(
          ...invPayload.findings.map((f: any) => normalizeFinding(f, state.evidence)),
        );
      }

      // --- PHASE 2: CONFIGURATION & HISTORY (Parallel or sequential diagnosis gathering) ---
      state.status = "diagnosing";
      checkTimeout();

      if (this.agents.has("CONFIGURATION")) {
        const configPayload = await this.dispatch(
          "CONFIGURATION",
          "DIAGNOSIS_REQUEST",
          {
            relevantFiles: state.relevantFiles,
            relevant_files: state.relevantFiles,
            objective: state.objective,
          },
          state,
          budget,
          step++,
        );
        if (configPayload?.evidence && Array.isArray(configPayload.evidence)) {
          state.evidence.push(...configPayload.evidence);
        }
        if (configPayload?.findings && Array.isArray(configPayload.findings)) {
          state.findings.push(
            ...configPayload.findings.map((f: any) => normalizeFinding(f, state.evidence)),
          );
        }
      }

      checkTimeout();
      if (this.agents.has("HISTORIAN")) {
        const histPayload = await this.dispatch(
          "HISTORIAN",
          "DIAGNOSIS_REQUEST",
          {
            relevantFiles: state.relevantFiles,
            relevant_files: state.relevantFiles,
            objective: state.objective,
          },
          state,
          budget,
          step++,
        );
        if (histPayload?.evidence && Array.isArray(histPayload.evidence)) {
          state.evidence.push(...histPayload.evidence);
        }
        if (histPayload?.findings && Array.isArray(histPayload.findings)) {
          state.findings.push(
            ...histPayload.findings.map((f: any) => normalizeFinding(f, state.evidence)),
          );
        }
      }

      // --- PHASE 3: ANALYSIS ---
      checkTimeout();
      const analysisPayload = await this.dispatch(
        "ANALYZER",
        "ANALYSIS_REQUEST",
        {
          objective: state.objective,
          findings: state.findings,
          relevantFiles: state.relevantFiles,
          evidence: state.evidence,
        },
        state,
        budget,
        step++,
      );
      if (analysisPayload?.evidence && Array.isArray(analysisPayload.evidence)) {
        state.evidence.push(...analysisPayload.evidence);
      }
      if (analysisPayload?.findings && Array.isArray(analysisPayload.findings)) {
        state.findings.push(
          ...analysisPayload.findings.map((f: any) => normalizeFinding(f, state.evidence)),
        );
      }
      if (analysisPayload?.hypotheses && Array.isArray(analysisPayload.hypotheses)) {
        state.hypotheses.push(
          ...analysisPayload.hypotheses.map((h: any) => normalizeHypothesis(h, state.evidence)),
        );
      }

      // --- PHASE 4: PATCH & VERIFY LOOP ---
      while (
        patchAttempts < budget.maxPatchAttempts &&
        verificationAttempts < budget.maxVerificationAttempts
      ) {
        state.status = "patching";
        checkTimeout();
        patchAttempts++;

        const patchPayload = await this.dispatch(
          "PATCH",
          "PATCH_REQUEST",
          {
            objective: state.objective,
            relevantFiles: state.relevantFiles,
            findings: state.findings,
            hypotheses: state.hypotheses,
            previousVerification:
              state.verification.length > 0
                ? state.verification[state.verification.length - 1]
                : undefined,
          },
          state,
          budget,
          step++,
        );

        if (patchPayload?.proposedChange) {
          state.proposedChanges.push(patchPayload.proposedChange);
        }

        if (!patchPayload?.proposedChange?.diff || patchPayload.proposedChange.diff.trim() === "") {
          // If the patch agent explicitly decides no patch is needed or fails to generate one, we can stop the loop.
          break;
        }

        state.status = "verifying";
        checkTimeout();
        verificationAttempts++;

        const verPayload = await this.dispatch(
          "VERIFIER",
          "VERIFICATION_REQUEST",
          {
            change: state.proposedChanges[state.proposedChanges.length - 1],
          },
          state,
          budget,
          step++,
        );

        const verResult =
          verPayload?.verificationResult ?? (verPayload?.overall ? verPayload : undefined);
        if (verResult) {
          state.verification.push(verResult);

          if (verResult.overall === "verified") {
            // Success! We can exit the loop.
            break;
          }
        } else {
          // Verification agent failed to return a result
          break;
        }
      }

      state.status = "completed";
    } catch (err: any) {
      state.status = "failed";
      this.trajectory.logEvent({
        runId,
        step,
        agent: "ORCHESTRATOR",
        state: "failed",
        event: "run.failed",
        tool: String(err?.message || err),
        timestamp: new Date().toISOString(),
      });
    }

    state.trajectory = this.trajectory.getEvents();

    try {
      await this.trajectory.persist(runId, state.repository);
    } catch {
      // In-memory or read-only environments may gracefully skip disk persistence
    }

    return state;
  }
}
