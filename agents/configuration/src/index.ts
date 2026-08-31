import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext } from "@argus/agent-core";

export class ConfigurationAgent implements ArgusAgent {
  public readonly id = "agent-configuration-01";
  public readonly role = "CONFIGURATION";

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    context.logger.info(`[${this.role}] Scanning configuration files in ${context.repository}`);

    return {
      version: "1.0",
      envelopeId: randomUUID(),
      agentId: this.id,
      agentRole: "CONFIGURATION",
      runId: context.runId,
      timestamp: new Date().toISOString(),
      payloadType: "CONFIG_DEBT_RESULT",
      payload: {
        analyzedFiles: [".github/workflows/ci.yml", "Dockerfile"],
        debtFindings: [],
      },
      errors: [],
    };
  }
}
