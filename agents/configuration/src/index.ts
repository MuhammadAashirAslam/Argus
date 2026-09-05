import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext, Finding } from "@argus/agent-core";
import { LLMClient, executeLLMWithTools, GROQ_MODELS, type LLMMessage } from "@argus/shared";
import { createConfigTools } from "@argus/config-engine/tools.js";
import { ConfigDebtEngine } from "@argus/config-engine";
import { getAllBuiltInRules } from "@argus/rules";

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
      "title": "Brief title of the debt finding",
      "description": "Detailed description of debt and its impact",
      "epistemic": "FACT",
      "severity": "HIGH",
      "confidence": 0.95,
      "evidenceIds": []
    }
  ],
  "configuration_analysis_complete": true
}
Do not return any conversational text, ONLY the final JSON object when you are done.
`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Please scan the repository at ${context.repository} for configuration debt.`,
      },
    ];

    const engine = new ConfigDebtEngine();
    for (const rule of getAllBuiltInRules()) {
      engine.registerRule(rule);
    }
    const tools = createConfigTools(engine);

    try {
      const response = await executeLLMWithTools(messages, {
        client: this.llm,
        model: GROQ_MODELS.FAST,
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

      let payload: any;
      if (jsonStart !== -1 && jsonEnd !== -1) {
        payload = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
      } else {
        payload = JSON.parse(content);
      }

      if (!Array.isArray(payload.evidence)) {
        payload.evidence = [];
      }
      if (response.capturedEvidence && response.capturedEvidence.length > 0) {
        payload.evidence.push(...response.capturedEvidence);
      }

      // If no tool evidence was captured but the engine can scan directly, ground findings
      if (payload.evidence.length === 0) {
        try {
          const directFindings = await engine.scanDirectory(context.repository);
          for (const df of directFindings) {
            payload.evidence.push({
              id: randomUUID(),
              type: "CONFIG_AUDIT",
              epistemic: "FACT",
              location: df.line
                ? { filePath: df.file, startLine: df.line, endLine: df.line }
                : undefined,
              payload: {
                ruleId: df.ruleId,
                title: df.title,
                evidence: df.evidence,
                recommendation: df.recommendation,
              },
              capturedAt: new Date().toISOString(),
              toolSource: `config_rule:${df.ruleId}`,
            });
          }
        } catch {
          // Continue if scan fails
        }
      }

      // Link findings to real evidence IDs
      if (Array.isArray(payload.findings) && payload.evidence.length > 0) {
        const availableEvidenceIds = payload.evidence.map((e: any) => e.id);
        for (const finding of payload.findings) {
          if (!Array.isArray(finding.evidenceIds) || finding.evidenceIds.length === 0) {
            finding.evidenceIds = [availableEvidenceIds[0]];
          }
        }
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
