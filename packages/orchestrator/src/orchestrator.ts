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
  validateAgentEnvelope,
} from "@argus/agent-core";
import { TrajectoryLogger } from "@argus/trajectory";
import type { OrchestratorConfig, OrchestratorBudget, IOrchestrator } from "./types.js";

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

  private createContext(
    state: RunState,
    step: number,
    budget: OrchestratorBudget,
  ): AgentContext {
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
        tool: msg.substring(0, 500)
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
    const budget: OrchestratorBudget = { ...DEFAULT_BUDGET, ...config.budget };
    const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const startTime = Date.now();

    const state: RunState = {
      runId,
      repository: config.repository,
      pullRequest: config.pullRequest,
      objective: config.objective,
      relevantFiles: [],
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
      // Check timeout function
      const checkTimeout = () => {
        if (Date.now() - startTime > budget.timeoutMs) {
          throw new Error("Orchestrator timeout exceeded.");
        }
        if (step > budget.maxSteps) {
          throw new Error("Max steps exceeded.");
        }
      };

      // --- PHASE 1: INVESTIGATION ---
      state.status = "investigating";
      checkTimeout();
      
      const invPayload = await this.dispatch(
        "INVESTIGATOR", 
        "TASK_STATUS", 
        { objective: state.objective, repository: state.repository, pullRequest: state.pullRequest }, 
        state, budget, step++
      );
      
      if (invPayload?.relevant_files && Array.isArray(invPayload.relevant_files)) {
        state.relevantFiles = [...new Set([...state.relevantFiles, ...invPayload.relevant_files])];
      }
      if (invPayload?.findings && Array.isArray(invPayload.findings)) {
        state.findings.push(...invPayload.findings);
      }

      // --- PHASE 2: CONFIGURATION & HISTORY (Parallel or sequential diagnosis gathering) ---
      state.status = "diagnosing";
      checkTimeout();
      
      if (this.agents.has("CONFIGURATION")) {
        const configPayload = await this.dispatch(
          "CONFIGURATION", 
          "DIAGNOSIS_REQUEST", 
          { relevantFiles: state.relevantFiles }, 
          state, budget, step++
        );
        if (configPayload?.findings && Array.isArray(configPayload.findings)) {
          state.findings.push(...configPayload.findings);
        }
      }

      checkTimeout();
      if (this.agents.has("HISTORIAN")) {
        const histPayload = await this.dispatch(
          "HISTORIAN", 
          "DIAGNOSIS_REQUEST", 
          { relevantFiles: state.relevantFiles }, 
          state, budget, step++
        );
        if (histPayload?.findings && Array.isArray(histPayload.findings)) {
          state.findings.push(...histPayload.findings);
        }
      }

      // --- PHASE 3: ANALYSIS ---
      checkTimeout();
      const analysisPayload = await this.dispatch(
        "ANALYZER", 
        "ANALYSIS_REQUEST", 
        { objective: state.objective, findings: state.findings }, 
        state, budget, step++
      );
      if (analysisPayload?.findings && Array.isArray(analysisPayload.findings)) {
        state.findings.push(...analysisPayload.findings);
      }
      if (analysisPayload?.hypotheses && Array.isArray(analysisPayload.hypotheses)) {
        state.hypotheses.push(...analysisPayload.hypotheses);
      }

      // --- PHASE 4: PATCH & VERIFY LOOP ---
      while (patchAttempts < budget.maxPatchAttempts && verificationAttempts < budget.maxVerificationAttempts) {
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
            previousVerification: state.verification.length > 0 ? state.verification[state.verification.length - 1] : undefined
          },
          state, budget, step++
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
          state, budget, step++
        );

        if (verPayload?.verificationResult) {
          state.verification.push(verPayload.verificationResult);
          
          if (verPayload.verificationResult.overall === "verified") {
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
    return state;
  }
}
