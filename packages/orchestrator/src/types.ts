import type { ArgusAgent, RunState } from "@argus/agent-core";

/**
 * Execution limits to prevent runaway loops (§20).
 */
export interface OrchestratorBudget {
  maxSteps: number; // default: 20
  maxPatchAttempts: number; // default: 3
  maxVerificationAttempts: number; // default: 3
  timeoutMs: number; // default: 10 * 60 * 1000 (10 mins)
}

export interface OrchestratorConfig {
  repository: string;
  pullRequest?: number;
  objective: string;
  budget?: Partial<OrchestratorBudget>;
}

export interface IOrchestrator {
  registerAgent(agent: ArgusAgent): void;
  executeRun(config: OrchestratorConfig): Promise<RunState>;
}
