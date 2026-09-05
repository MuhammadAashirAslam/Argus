import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext, Finding } from "@argus/agent-core";
import { LLMClient, executeLLMWithTools, GROQ_MODELS, type LLMMessage } from "@argus/shared";
import { GitLogTool, GitBlameTool, GitShowCommitTool } from "@argus/git";

export class HistorianAgent implements ArgusAgent {
  public readonly id = "agent-historian-01";
  public readonly role = "HISTORIAN";
  private readonly llm = new LLMClient();

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    context.logger.info(`[${this.role}] Starting history analysis for run ${context.runId}`);

    const payload = input.payload as any;
    const filesToInvestigate = payload?.relevantFiles ?? payload?.relevant_files ?? [];

    const systemPrompt = `You are the ARGUS Historian Agent.
Your objective is to analyze the git history of the provided files to find intentional patterns or recent changes that might explain the current problem.
Use the provided tools to run git blame and check recent commits on the relevant files.
Each tool response includes an "evidenceId". Every finding you declare MUST reference the real "evidenceId" of the tool output supporting it in "evidenceIds".
You MUST respond with a JSON object in the exact format:
{
  "findings": [
    {
      "title": "Brief title of the historical finding",
      "description": "File X was recently changed to do Y",
      "epistemic": "FACT",
      "severity": "MEDIUM",
      "confidence": 0.9,
      "evidenceIds": ["evidence-uuid-from-tool-call"]
    }
  ],
  "history_analysis_complete": true
}
Do not return any conversational text, ONLY the final JSON object when you are done.
`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Please analyze the history of the following files: ${JSON.stringify(filesToInvestigate)}`,
      },
    ];

    const tools = [GitLogTool, GitBlameTool, GitShowCommitTool];

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

      let resPayload: any;
      if (jsonStart !== -1 && jsonEnd !== -1) {
        resPayload = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
      } else {
        resPayload = JSON.parse(content);
      }

      if (!Array.isArray(resPayload.evidence)) {
        resPayload.evidence = [];
      }
      if (response.capturedEvidence && response.capturedEvidence.length > 0) {
        resPayload.evidence.push(...response.capturedEvidence);
      }

      // Ground findings to real evidence IDs
      if (Array.isArray(resPayload.findings) && resPayload.evidence.length > 0) {
        const availableEvidenceIds = resPayload.evidence.map((e: any) => e.id);
        for (const finding of resPayload.findings) {
          if (!Array.isArray(finding.evidenceIds) || finding.evidenceIds.length === 0) {
            finding.evidenceIds = [availableEvidenceIds[0]];
          }
        }
      }

      return {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: this.id,
        agentRole: "HISTORIAN",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "HISTORICAL_CONTEXT",
        payload: resPayload,
        errors: [],
      };
    } catch (err: any) {
      context.logger.error(`Historian analysis failed: ${err.message}`);
      return {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: this.id,
        agentRole: "HISTORIAN",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "ERROR",
        payload: null,
        errors: [{ code: "REASONING_FAILURE", message: err.message || String(err), fatal: true }],
      };
    }
  }
}
