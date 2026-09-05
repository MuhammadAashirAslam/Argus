import { randomUUID } from "node:crypto";
import type { ArgusAgent, AgentEnvelope, AgentContext } from "@argus/agent-core";
import { VerificationRunner, isDockerAvailable } from "@argus/verifier";

export class VerifierAgent implements ArgusAgent {
  public readonly id = "agent-verifier-01";
  public readonly role = "VERIFIER";

  public async run(input: AgentEnvelope, context: AgentContext): Promise<AgentEnvelope> {
    context.logger.info(`[${this.role}] Running verification for run ${context.runId}`);
    const payload = input.payload as any;
    const patch = payload?.change?.diff ?? payload?.candidatePatch ?? "";
    const useSandbox =
      payload?.useSandbox !== undefined ? Boolean(payload.useSandbox) : await isDockerAvailable();

    const runner = new VerificationRunner();
    const result = await runner.runPipeline(
      patch,
      {
        workspacePath: context.repository,
        timeoutMs: payload?.timeoutMs ?? 120000,
      },
      {
        useSandbox,
        syntaxCheckCommand: payload?.syntaxCheckCommand,
        staticAnalysisCommand: payload?.staticAnalysisCommand,
        lintCommand: payload?.lintCommand,
        testCommand: payload?.testCommand,
        runSyntaxCheck: payload?.runSyntaxCheck,
        runStaticAnalysis: payload?.runStaticAnalysis,
        runLint: payload?.runLint,
        runTests: payload?.runTests,
      },
    );

    return {
      version: "1.0",
      envelopeId: randomUUID(),
      agentId: this.id,
      agentRole: "VERIFIER",
      runId: context.runId,
      timestamp: new Date().toISOString(),
      payloadType: "VERIFICATION_RESULT",
      payload: {
        verificationResult: result,
      },
      errors: [],
    };
  }
}
