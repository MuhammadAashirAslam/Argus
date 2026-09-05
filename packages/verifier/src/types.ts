import type { VerificationResult, StageResult } from "@argus/agent-core";

export interface SandboxExecutionContext {
  workspacePath: string;
  timeoutMs: number;
  environmentVariables?: Record<string, string>;
}

export interface VerificationPipelineOptions {
  runSyntaxCheck?: boolean;
  runStaticAnalysis?: boolean;
  runLint?: boolean;
  runTests?: boolean;
  syntaxCheckCommand?: string;
  staticAnalysisCommand?: string;
  testCommand?: string;
  lintCommand?: string;
  useSandbox?: boolean;
  sandboxImage?: string;
  dockerPath?: string;
}

export interface IVerifierService {
  applyPatch(diff: string, context: SandboxExecutionContext): Promise<StageResult>;
  runVerificationPipeline(
    diff: string,
    context: SandboxExecutionContext,
    options?: VerificationPipelineOptions,
  ): Promise<VerificationResult>;
}
