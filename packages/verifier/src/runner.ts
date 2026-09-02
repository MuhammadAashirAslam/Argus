import { exec } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { VerificationResult, StageResult, VerificationStatus } from "@argus/agent-core";
import type { SandboxExecutionContext, VerificationPipelineOptions } from "./types.js";
import { validateAndApplyPatch } from "./patch.js";
import { SandboxContainer, isDockerAvailable } from "@argus/sandbox";

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
   * Supports both host execution and isolated Docker container sandbox execution (§19, §32).
   */
  public async runPipeline(
    diff: string,
    context: SandboxExecutionContext,
    options: VerificationPipelineOptions = {},
  ): Promise<VerificationResult> {
    if (options.useSandbox) {
      return this.runPipelineInDockerSandbox(diff, context, options);
    }
    return this.runPipelineOnHost(diff, context, options);
  }

  /**
   * Runs verification in an isolated fresh Docker container sandbox.
   */
  private async runPipelineInDockerSandbox(
    diff: string,
    context: SandboxExecutionContext,
    options: VerificationPipelineOptions,
  ): Promise<VerificationResult> {
    const stages: StageResult[] = [];
    const failures: string[] = [];
    const container = new SandboxContainer({
      workspacePath: context.workspacePath,
      timeoutMs: context.timeoutMs,
      environmentVariables: context.environmentVariables,
      image: options.sandboxImage,
      dockerPath: options.dockerPath,
    });

    try {
      await container.initialize();

      // Stage 1: Apply patch in container
      const startPatch = Date.now();
      const patchRes = await container.applyPatch(diff);
      const patchStage: StageResult = {
        stage: "PATCH_APPLICATION",
        passed: patchRes.passed,
        exitCode: patchRes.exitCode,
        durationMs: Date.now() - startPatch,
        stdout: patchRes.stdout,
        stderr: patchRes.stderr,
        errorDetails: patchRes.passed ? [] : [patchRes.stderr || "Patch application failed in sandbox"],
      };
      stages.push(patchStage);

      if (!patchRes.passed) {
        failures.push("Failed to apply candidate patch in Docker sandbox");
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
        const syntaxRes = await container.executeCommand("npx tsc --noEmit");
        stages.push({
          stage: "SYNTAX_AST",
          passed: syntaxRes.passed,
          exitCode: syntaxRes.exitCode,
          durationMs: syntaxRes.durationMs,
          stdout: syntaxRes.stdout,
          stderr: syntaxRes.stderr,
          errorDetails: syntaxRes.passed ? [] : [syntaxRes.stderr || "TypeScript typecheck failed in sandbox"],
        });
        if (!syntaxRes.passed) {
          syntaxValid = false;
          failures.push("TypeScript typecheck / syntax validation failed in Docker sandbox");
        }
      }

      // Stage 3: Lint
      let lintPassed = true;
      if (options.runLint ?? true) {
        const lintCmd = options.lintCommand ?? "npx eslint . --max-warnings=0";
        const lintRes = await container.executeCommand(lintCmd);
        stages.push({
          stage: "LINT",
          passed: lintRes.passed,
          exitCode: lintRes.exitCode,
          durationMs: lintRes.durationMs,
          stdout: lintRes.stdout,
          stderr: lintRes.stderr,
          errorDetails: lintRes.passed ? [] : [lintRes.stderr || "Linter checks failed in sandbox"],
        });
        if (!lintRes.passed) {
          lintPassed = false;
          failures.push("Linter checks failed in Docker sandbox");
        }
      }

      // Stage 4: Tests
      let testsPassed = true;
      if (options.runTests ?? true) {
        const testCmd = options.testCommand ?? "npx vitest run";
        const testRes = await container.executeCommand(testCmd);
        stages.push({
          stage: "TESTS",
          passed: testRes.passed,
          exitCode: testRes.exitCode,
          durationMs: testRes.durationMs,
          stdout: testRes.stdout,
          stderr: testRes.stderr,
          errorDetails: testRes.passed ? [] : [testRes.stderr || "Test suite failed in sandbox"],
        });
        if (!testRes.passed) {
          testsPassed = false;
          failures.push("Test suite execution failed in Docker sandbox");
        }
      }

      let overall: VerificationStatus = "verified";
      if (failures.length > 0) {
        overall = syntaxValid && patchStage.passed ? "partially_verified" : "failed";
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
    } finally {
      await container.destroy();
    }
  }

  /**
   * Runs verification directly on host filesystem.
   */
  private async runPipelineOnHost(
    diff: string,
    context: SandboxExecutionContext,
    options: VerificationPipelineOptions,
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
