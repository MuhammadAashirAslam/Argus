import { exec } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { VerificationResult, StageResult, VerificationStatus } from "@argus/agent-core";
import type { SandboxExecutionContext, VerificationPipelineOptions } from "./types.js";
import { validateAndApplyPatch } from "./patch.js";

const execAsync = promisify(exec);

export class VerificationRunner {
  private async executeStageCommand(
    stageName: "SYNTAX_AST" | "LINT" | "TESTS",
    command: string,
    context: SandboxExecutionContext,
  ): Promise<StageResult> {
    const start = Date.now();
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: context.workspacePath,
        timeout: context.timeoutMs,
        env: { ...process.env, ...context.environmentVariables },
      });
      return {
        stage: stageName,
        passed: true,
        exitCode: 0,
        durationMs: Date.now() - start,
        stdout,
        stderr,
        errorDetails: [],
      };
    } catch (err: any) {
      return {
        stage: stageName,
        passed: false,
        exitCode: err?.code ?? 1,
        durationMs: Date.now() - start,
        stdout: err?.stdout ?? "",
        stderr: err?.stderr ?? err?.message,
        errorDetails: [err?.message || `Stage ${stageName} failed`],
      };
    }
  }

  /**
   * Runs the full deterministic verification pipeline (§10, §17).
   */
  public async runPipeline(
    diff: string,
    context: SandboxExecutionContext,
    options: VerificationPipelineOptions = {},
  ): Promise<VerificationResult> {
    const stages: StageResult[] = [];
    const failures: string[] = [];

    // Stage 1: Patch Application
    const patchResult = await validateAndApplyPatch(diff, context);
    stages.push(patchResult);
    if (!patchResult.passed) {
      failures.push("Failed to apply candidate patch to repository");
      return {
        id: randomUUID(),
        patchApplied: false,
        syntaxValid: false,
        staticAnalysisPassed: false,
        lintPassed: false,
        testsPassed: false,
        stages,
        failures,
        overall: "failed",
        verifiedAt: new Date().toISOString(),
      };
    }

    // Stage 2: Syntax / AST (tsc --noEmit)
    let syntaxValid = true;
    if (options.runSyntaxCheck ?? true) {
      const syntaxRes = await this.executeStageCommand("SYNTAX_AST", "npx tsc --noEmit", context);
      stages.push(syntaxRes);
      if (!syntaxRes.passed) {
        syntaxValid = false;
        failures.push("TypeScript typecheck / syntax validation failed");
      }
    }

    // Stage 3: Lint (eslint)
    let lintPassed = true;
    if (options.runLint ?? true) {
      const lintCmd = options.lintCommand ?? "npx eslint . --max-warnings=0";
      const lintRes = await this.executeStageCommand("LINT", lintCmd, context);
      stages.push(lintRes);
      if (!lintRes.passed) {
        lintPassed = false;
        failures.push("Linter checks failed");
      }
    }

    // Stage 4: Tests (vitest)
    let testsPassed = true;
    if (options.runTests ?? true) {
      const testCmd = options.testCommand ?? "npx vitest run";
      const testRes = await this.executeStageCommand("TESTS", testCmd, context);
      stages.push(testRes);
      if (!testRes.passed) {
        testsPassed = false;
        failures.push("Test suite execution failed");
      }
    }

    let overall: VerificationStatus = "verified";
    if (failures.length > 0) {
      overall = syntaxValid && patchResult.passed ? "partially_verified" : "failed";
    }

    return {
      id: randomUUID(),
      patchApplied: true,
      syntaxValid,
      staticAnalysisPassed: lintPassed,
      lintPassed,
      testsPassed,
      stages,
      failures,
      overall,
      verifiedAt: new Date().toISOString(),
    };
  }
}
