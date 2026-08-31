import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext } from "@argus/agent-core";

export class InvestigatorAgent implements ArgusAgent {
  public readonly id = "agent-investigator-01";
  public readonly role = "INVESTIGATOR";

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    context.logger.info(`[${this.role}] Starting investigation for run ${context.runId}`);

    return {
      version: "1.0",
      envelopeId: randomUUID(),
      agentId: this.id,
      agentRole: "INVESTIGATOR",
      runId: context.runId,
      timestamp: new Date().toISOString(),
      payloadType: "INVESTIGATION_RESULT",
      payload: {
        problem_summary: `Investigated objective: ${(input.payload as any)?.objective ?? "unknown"}`,
        relevant_files: ["package.json", ".github/workflows/ci.yml"],
        evidence: [],
        investigation_complete: true,
      },
      errors: [],
    };
  }
}
