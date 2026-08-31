import type { AgentEnvelope } from "../schemas/envelope.js";

export interface AgentLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface AgentContext {
  runId: string;
  repository: string;
  step: number;
  maxSteps: number;
  logger: AgentLogger;
  abortSignal?: AbortSignal;
}

/**
 * Canonical ArgusAgent interface (§34).
 * Every agent in the multi-agent system implements this interface.
 * Agents communicate exclusively through the Orchestrator.
 */
export interface ArgusAgent {
  readonly id: string;
  readonly role: string;
  run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope>;
}
