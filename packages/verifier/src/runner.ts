import { exec } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { VerificationResult, StageResult, VerificationStatus } from "@argus/agent-core";
import type { SandboxExecutionContext, VerificationPipelineOptions } from "./types.js";
import { validateAndApplyPatch, rollbackPatch } from "./patch.js";
import { SandboxContainer, isDockerAvailable } from "@argus/sandbox";

const execAsync = promisify(exec);

export class VerificationRunner {
  private async executeStageCommand(
    stageName: "SYNTAX_AST" | "STATIC_ANALYSIS" | "LINT" | "TESTS",
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
      try {
        await container.initialize();
      } catch (initErr: any) {
        stages.push({
          stage: "PATCH_APPLICATION",
          passed: false,
          exitCode: 1,
          durationMs: 0,
          stdout: "",
          stderr: initErr?.message || String(initErr),
          errorDetails: [
            `Sandbox container initialization failed: ${initErr?.message || String(initErr)}`,
          ],
        });
        failures.push("Sandbox container initialization failed");
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
        errorDetails: patchRes.passed
          ? []
          : [patchRes.stderr || "Patch application failed in sandbox"],
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

      // Stage 2: Syntax / AST check
      let syntaxValid = true;
      if (options.runSyntaxCheck ?? true) {
        const syntaxCmd = options.syntaxCheckCommand ?? "npx tsc --noEmit";
        const syntaxRes = await container.executeCommand(syntaxCmd);
        stages.push({
          stage: "SYNTAX_AST",
          passed: syntaxRes.passed,
          exitCode: syntaxRes.exitCode,
          durationMs: syntaxRes.durationMs,
          stdout: syntaxRes.stdout,
          stderr: syntaxRes.stderr,
          errorDetails: syntaxRes.passed
            ? []
            : [syntaxRes.stderr || "Syntax/AST validation failed in sandbox"],
        });
        if (!syntaxRes.passed) {
          syntaxValid = false;
          failures.push("Syntax/AST validation failed in Docker sandbox");
        }
      }

      // Stage 3: Static Analysis (§21, §35)
      let staticAnalysisPassed = true;
      if (options.runStaticAnalysis ?? true) {
        const staticCmd = options.staticAnalysisCommand ?? "npx tsc --noEmit";
        const staticRes = await container.executeCommand(staticCmd);
        stages.push({
          stage: "STATIC_ANALYSIS",
          passed: staticRes.passed,
          exitCode: staticRes.exitCode,
          durationMs: staticRes.durationMs,
          stdout: staticRes.stdout,
          stderr: staticRes.stderr,
          errorDetails: staticRes.passed
            ? []
            : [staticRes.stderr || "Static analysis stage failed in sandbox"],
        });
        if (!staticRes.passed) {
          staticAnalysisPassed = false;
          failures.push("Static analysis typecheck failed in Docker sandbox");
        }
      }

      // Stage 4: Lint
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

      // Stage 5: Tests
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
        staticAnalysisPassed,
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

    let overall: VerificationStatus = "failed";
    let syntaxValid = true;
    let staticAnalysisPassed = true;
    let lintPassed = true;
    let testsPassed = true;

    try {
      // Stage 2: Syntax / AST validation
      if (options.runSyntaxCheck ?? true) {
        const syntaxCmd = options.syntaxCheckCommand ?? "npx tsc --noEmit";
        const syntaxRes = await this.executeStageCommand("SYNTAX_AST", syntaxCmd, context);
        stages.push(syntaxRes);
        if (!syntaxRes.passed) {
          syntaxValid = false;
          failures.push("Syntax/AST validation failed");
        }
      }

      // Stage 3: Static Analysis (§21, §35)
      if (options.runStaticAnalysis ?? true) {
        const staticCmd = options.staticAnalysisCommand ?? "npx tsc --noEmit";
        const staticRes = await this.executeStageCommand("STATIC_ANALYSIS", staticCmd, context);
        stages.push(staticRes);
        if (!staticRes.passed) {
          staticAnalysisPassed = false;
          failures.push("Static analysis typecheck failed");
        }
      }

      // Stage 4: Lint (eslint)
      if (options.runLint ?? true) {
        const lintCmd = options.lintCommand ?? "npx eslint . --max-warnings=0";
        const lintRes = await this.executeStageCommand("LINT", lintCmd, context);
        stages.push(lintRes);
        if (!lintRes.passed) {
          lintPassed = false;
          failures.push("Linter checks failed");
        }
      }

      // Stage 5: Tests (vitest)
      if (options.runTests ?? true) {
        const testCmd = options.testCommand ?? "npx vitest run";
        const testRes = await this.executeStageCommand("TESTS", testCmd, context);
        stages.push(testRes);
        if (!testRes.passed) {
          testsPassed = false;
          failures.push("Test suite execution failed");
        }
      }

      overall = "verified";
      if (failures.length > 0) {
        overall = syntaxValid && patchResult.passed ? "partially_verified" : "failed";
      }

      return {
        id: randomUUID(),
        patchApplied: true,
        syntaxValid,
        staticAnalysisPassed,
        lintPassed,
        testsPassed,
        stages,
        failures,
        overall,
        verifiedAt: new Date().toISOString(),
      };
    } finally {
      // Host Safety Guarantee (§5.6, §19):
      // Always roll back candidate patch if verification failed or threw an error,
      // preventing patch N+1 from compounding corruption onto unverified patch N.
      if (overall !== "verified") {
        await rollbackPatch(diff, context);
      }
    }
  }
}
