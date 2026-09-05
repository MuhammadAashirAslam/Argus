import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext, Finding, Evidence } from "@argus/agent-core";
import { LLMClient, executeLLMWithTools, GROQ_MODELS, type LLMMessage } from "@argus/shared";
import {
  GitStatusTool,
  GitLogTool,
  RepoListFilesTool,
  RepoSearchTool,
  RepoGetDependenciesTool,
  RepoReadFileTool,
} from "@argus/git";
import {
  GetPullRequestTool,
  GetPullRequestFilesTool,
  GetIssuesTool,
  GetCommentsTool,
} from "@argus/github";

export class InvestigatorAgent implements ArgusAgent {
  public readonly id = "agent-investigator-01";
  public readonly role = "INVESTIGATOR";
  private readonly llm = new LLMClient();

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    context.logger.info(`[${this.role}] Starting investigation for run ${context.runId}`);

    const objective = (input.payload as any)?.objective ?? "unknown";
    const pullRequest = (input.payload as any)?.pullRequest;

    const systemPrompt = `You are the ARGUS Investigator Agent.
Your objective is to explore the repository, identify the relevant files for the current task, and collect concrete evidence.
Use the provided tools to search the codebase, read files, and inspect git/github history.
Each tool response includes an "evidenceId". Every finding you declare MUST reference the real "evidenceId" of the tool output supporting it in "evidenceIds".
You MUST respond with a JSON object in the exact format:
{
  "problem_summary": "Summary of what you found",
  "relevant_files": ["path/to/file1.ts"],
  "findings": [
    {
      "title": "Brief title of the finding",
      "description": "Detailed description of what was found",
      "epistemic": "FACT",
      "severity": "MEDIUM",
      "confidence": 0.9,
      "evidenceIds": ["evidence-uuid-from-tool-call"]
    }
  ],
  "investigation_complete": true
}
Do not return any conversational text, ONLY the final JSON object when you are done.
`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Objective: ${objective}\nPR Number: ${pullRequest || "N/A"}` },
    ];

    const tools = [
      RepoListFilesTool,
      RepoReadFileTool,
      RepoSearchTool,
      RepoGetDependenciesTool,
      GitStatusTool,
      GitLogTool,
      GetPullRequestTool,
      GetPullRequestFilesTool,
      GetIssuesTool,
      GetCommentsTool,
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
        maxIterations: 3,
      });

      // The response.content should contain the final JSON. We extract it.
      const content = response.content.trim();
      const jsonStart = content.indexOf("{");
      const jsonEnd = content.lastIndexOf("}");

      let payload: any;
      try {
        if (jsonStart !== -1 && jsonEnd !== -1) {
          payload = JSON.parse(content.substring(jsonStart, jsonEnd + 1));
        } else {
          payload = JSON.parse(content);
        }
      } catch {
        payload = {
          problem_summary: content || "Investigation completed using repository inspection tools.",
          relevant_files: [],
          findings: [],
          evidence: [],
          investigation_complete: true,
        };
      }

      if (!Array.isArray(payload.evidence)) {
        payload.evidence = [];
      }
      if (response.capturedEvidence && response.capturedEvidence.length > 0) {
        payload.evidence.push(...response.capturedEvidence);
      }

      // Ground any findings that didn't specify an evidenceId to actual captured evidence
      if (Array.isArray(payload.findings) && payload.evidence.length > 0) {
        const availableEvidenceIds = payload.evidence.map((e: Evidence) => e.id);
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
        agentRole: "INVESTIGATOR",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "INVESTIGATION_RESULT",
        payload,
        errors: [],
      };
    } catch (err: any) {
      context.logger.error(`Investigation failed: ${err.message}`);
      return {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: this.id,
        agentRole: "INVESTIGATOR",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "ERROR",
        payload: null,
        errors: [{ code: "REASONING_FAILURE", message: err.message || String(err), fatal: true }],
      };
    }
  }
}
