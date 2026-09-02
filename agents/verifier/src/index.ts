import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext } from "@argus/agent-core";
import { VerificationRunner } from "@argus/verifier";

export class VerifierAgent implements ArgusAgent {
  public readonly id = "agent-verifier-01";
  public readonly role = "VERIFIER";

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    context.logger.info(`[${this.role}] Running sandbox verification for run ${context.runId}`);
    const patch = (input.payload as any)?.candidatePatch ?? "";

    const runner = new VerificationRunner();
    const result = await runner.runPipeline(patch, {
      workspacePath: context.workspacePath,
      timeoutMs: 30000,
    });

    return {
      version: "1.0",
      envelopeId: randomUUID(),
      agentId: this.id,
      agentRole: "VERIFIER",
      runId: context.runId,
      timestamp: new Date().toISOString(),
      payloadType: "VERIFICATION_RESULT",
      payload: result,
      errors: [],
    };
  }
}
