import { randomUUID } from "node:crypto";
import {
  type RunState,
  type ArgusAgent,
  type AgentEnvelope,
  type AgentContext,
  type RunStatus,
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

  /**
   * Central state machine loop coordinating specialized agents (§5, §12).
   */
  public async executeRun(config: OrchestratorConfig): Promise<RunState> {
    const budget: OrchestratorBudget = { ...DEFAULT_BUDGET, ...config.budget };
    const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;

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
      status: "investigating",
    };

    let currentStep = 1;

    // Step 1: Dispatch to Investigator Agent
    const investigator = this.agents.get("INVESTIGATOR");
    if (investigator) {
      const envelopeIn: AgentEnvelope = {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: "orchestrator",
        agentRole: "ORCHESTRATOR",
        runId,
        timestamp: new Date().toISOString(),
        payloadType: "TASK_STATUS",
        payload: { objective: config.objective, repository: config.repository },
        errors: [],
      };

      const ctx: AgentContext = {
        runId,
        repository: config.repository,
        step: currentStep++,
        maxSteps: budget.maxSteps,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
      };

      this.trajectory.logEvent({
        runId,
        step: ctx.step,
        agent: "INVESTIGATOR",
        state: "investigating",
        event: "agent.started",
        timestamp: new Date().toISOString(),
      });

      const rawOutput = await investigator.run(envelopeIn, ctx);
      const validatedOutput = validateAgentEnvelope(rawOutput);

      if (validatedOutput.payloadType === "INVESTIGATION_RESULT") {
        const p = validatedOutput.payload as any;
        if (Array.isArray(p?.relevant_files)) {
          state.relevantFiles.push(...p.relevant_files);
        }
      }

      this.trajectory.logEvent({
        runId,
        step: ctx.step,
        agent: "INVESTIGATOR",
        state: "investigating",
        event: "agent.completed",
        timestamp: new Date().toISOString(),
      });
    }

    state.status = "completed";
    state.trajectory = this.trajectory.getEvents();
    return state;
  }
}
