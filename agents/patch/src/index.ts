import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext, Finding, Hypothesis, VerificationResult } from "@argus/agent-core";
import { LLMClient, executeLLMWithTools, GROQ_MODELS, type LLMMessage } from "@argus/shared";
import { RepoReadFileTool, RepoSearchTool } from "@argus/git";

export class PatchAgent implements ArgusAgent {
  public readonly id = "agent-patch-01";
  public readonly role = "PATCH";
  private readonly llm = new LLMClient();

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    context.logger.info(`[${this.role}] Starting patch generation for run ${context.runId}`);
    
    const payload = input.payload as any;
    const objective = payload?.objective ?? "unknown";
    const findings: Finding[] = payload?.findings ?? [];
    const hypotheses: Hypothesis[] = payload?.hypotheses ?? [];
    const previousVerification: VerificationResult | undefined = payload?.previousVerification;

    let systemPrompt = `You are the ARGUS Patch Agent.
Your objective is to generate a fix for the problem based on the investigation findings and analysis hypotheses.
You MUST output your patch as a unified diff format.
You MUST respond with a JSON object in the exact format:
{
  "proposedChange": {
    "id": "uuid-here",
    "filePath": "path/to/changed/file.ts",
    "diff": "--- a/file.ts\\n+++ b/file.ts\\n@@ -1,3 +1,3 @@\\n-old\\n+new",
    "explanation": "Brief explanation of the change",
    "targetHypothesisId": "uuid-of-hypothesis-if-applicable"
  }
}
If no change is needed, or if you cannot determine a fix, return the JSON with an empty diff string.
Do not return any conversational text, ONLY the JSON object.
`;

    let userContent = `Objective: ${objective}
Findings: ${JSON.stringify(findings, null, 2)}
Hypotheses: ${JSON.stringify(hypotheses, null, 2)}
`;

    if (previousVerification && previousVerification.overall !== "verified") {
      userContent += `\nPrevious Verification Failed:\n${JSON.stringify(previousVerification, null, 2)}\nPlease adjust your patch to fix the verification errors.`;
    }

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
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
          proposedChange: {
            id: randomUUID(),
            filePath: "README.md",
            diff: "",
            explanation: content || "No modifications required.",
          },
        };
      }

      if (resPayload.proposedChange && !resPayload.proposedChange.id) {
        resPayload.proposedChange.id = randomUUID();
      }

      return {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: this.id,
        agentRole: "PATCH",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "PATCH_CANDIDATE",
        payload: resPayload,
        errors: [],
      };
    } catch (err: any) {
      context.logger.error(`Patch generation failed: ${err.message}`);
      return {
        version: "1.0",
        envelopeId: randomUUID(),
        agentId: this.id,
        agentRole: "PATCH",
        runId: context.runId,
        timestamp: new Date().toISOString(),
        payloadType: "ERROR",
        payload: null,
        errors: [{ code: "REASONING_FAILURE", message: err.message || String(err), fatal: true }],
      };
    }
  }
}
