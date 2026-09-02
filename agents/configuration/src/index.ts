import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext, Finding } from "@argus/agent-core";
import { LLMClient, executeLLMWithTools, type LLMMessage } from "@argus/shared";
import { createConfigTools } from "@argus/config-engine/tools.js";
import { ConfigDebtEngine } from "@argus/config-engine";

export class ConfigurationAgent implements ArgusAgent {
  public readonly id = "agent-configuration-01";
  public readonly role = "CONFIGURATION";
  private readonly llm = new LLMClient();

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    context.logger.info(`[${this.role}] Starting configuration analysis for run ${context.runId}`);
    
    const systemPrompt = `You are the ARGUS Configuration Agent.
Your objective is to analyze the repository for configuration debt, particularly in GitHub Actions and Dockerfiles.
Use the provided tools to scan the configuration files.
Once you have the debt findings, explain their impact and formulate them into standard ARGUS findings.
You MUST respond with a JSON object in the exact format:
{
  "findings": [
    {
      "id": "uuid-here",
      "statement": "Debt description and impact",
      "classification": "FACT",
      "evidenceIds": []
    }
  ],
  "configuration_analysis_complete": true
}
Do not return any conversational text, ONLY the final JSON object when you are done.
`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Please scan the repository at ${context.repository} for configuration debt.` },
    ];

    const engine = new ConfigDebtEngine();
    const tools = createConfigTools(engine);

    try {
      const response = await executeLLMWithTools(messages, {
        client: this.llm,
        model: "llama-3.1-8b-instant",
        tools,
        context: {
          workspacePath: context.repository,
          runId: context.runId,
          agentId: this.id,
        },
        maxIterations: 5,
      });

      const content = response.content.trim();
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");
      
      let payload;
      if (jsonStart !== -1 && jsonEnd !== -1) {
        payload = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
      } else {
        payload = JSON.parse(content);
      }

      return {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: this.id,
        agentRole: "CONFIGURATION",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "CONFIG_DEBT_RESULT",
        payload,
        errors: [],
      };
    } catch (err: any) {
      context.logger.error(`Configuration analysis failed: ${err.message}`);
      return {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: this.id,
        agentRole: "CONFIGURATION",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "ERROR",
        payload: null,
        errors: [{ code: "REASONING_FAILURE", message: err.message || String(err), fatal: true }],
      };
    }
  }
}
