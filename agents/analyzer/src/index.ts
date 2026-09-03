import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext, Finding, Hypothesis } from "@argus/agent-core";
import { LLMClient, executeLLMWithTools, GROQ_MODELS, type LLMMessage } from "@argus/shared";
import { RepoReadFileTool, RepoSearchTool } from "@argus/git";

export class AnalyzerAgent implements ArgusAgent {
  public readonly id = "agent-analyzer-01";
  public readonly role = "ANALYZER";
  private readonly llm = new LLMClient();

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    context.logger.info(`[${this.role}] Starting analysis for run ${context.runId}`);
    
    const payload = input.payload as any;
    const objective = payload?.objective ?? "unknown";
    const findings: Finding[] = payload?.findings ?? [];

    const systemPrompt = `You are the ARGUS Analyzer Agent.
Your objective is to analyze the investigation findings and the problem description to formulate concrete hypotheses about the root cause or required changes.
You can use the provided tools to double-check files if needed.
You MUST respond with a JSON object in the exact format:
{
  "hypotheses": [
    {
      "id": "uuid-here",
      "statement": "The bug is caused by X",
      "likelihood": "HIGH",
      "supportingEvidenceIds": [],
      "contradictingEvidenceIds": [],
      "resolved": false
    }
  ],
  "findings": [
    {
      "id": "uuid-here",
      "statement": "Inferred context",
      "classification": "INFERENCE",
      "evidenceIds": []
    }
  ],
  "analysis_complete": true
}
Do not return any conversational text, ONLY the final JSON object when you are done.
`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Objective: ${objective}\nFindings: ${JSON.stringify(findings, null, 2)}` },
    ];

    const tools = [
      RepoReadFileTool,
      RepoSearchTool,
    ];

    try {
      const response = await executeLLMWithTools(messages, {
        client: this.llm,
        model: GROQ_MODELS.LARGE,
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
      
      let resPayload: any;
      try {
        if (jsonStart !== -1 && jsonEnd !== -1) {
          resPayload = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
        } else {
          resPayload = JSON.parse(content);
        }
      } catch {
        resPayload = {
          hypotheses: [
            {
              id: randomUUID(),
              statement: content || "Analysis completed without hypothesis.",
              likelihood: "MEDIUM",
              supportingEvidenceIds: [],
              contradictingEvidenceIds: [],
              resolved: false,
            },
          ],
          findings: [],
          analysis_complete: true,
        };
      }

      return {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: this.id,
        agentRole: "ANALYZER",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "ANALYSIS_RESULT",
        payload: resPayload,
        errors: [],
      };
    } catch (err: any) {
      context.logger.error(`Analysis failed: ${err.message}`);
      return {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: this.id,
        agentRole: "ANALYZER",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "ERROR",
        payload: null,
        errors: [{ code: "REASONING_FAILURE", message: err.message || String(err), fatal: true }],
      };
    }
  }
}
