import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import type { StageResult } from "@argus/agent-core";
import type { SandboxExecutionContext } from "./types.js";

const execAsync = promisify(exec);

export async function validateAndApplyPatch(
  diffContent: string,
  context: SandboxExecutionContext,
): Promise<StageResult> {
  const startTime = Date.now();
  const tempPatchPath = path.join(context.workspacePath, `.patch_${Date.now()}.diff`);

  try {
    await fs.writeFile(tempPatchPath, diffContent, "utf-8");

    // 1. Dry run validation
    try {
      await execAsync(`git apply --check "${tempPatchPath}"`, {
        cwd: context.workspacePath,
        timeout: context.timeoutMs,
      });
    } catch (checkErr: any) {
      return {
        stage: "PATCH_APPLICATION",
        passed: false,
        exitCode: checkErr?.code ?? 1,
        durationMs: Date.now() - startTime,
        stdout: checkErr?.stdout ?? "",
        stderr: checkErr?.stderr ?? "Git patch failed validation checks",
        errorDetails: [checkErr?.message || "Invalid or conflicting git diff"],
      };
    }

    // 2. Real application
    const { stdout, stderr } = await execAsync(`git apply "${tempPatchPath}"`, {
      cwd: context.workspacePath,
      timeout: context.timeoutMs,
    });

    return {
      stage: "PATCH_APPLICATION",
      passed: true,
      exitCode: 0,
      durationMs: Date.now() - startTime,
      stdout,
      stderr,
      errorDetails: [],
    };
  } catch (err: any) {
    return {
      stage: "PATCH_APPLICATION",
      passed: false,
      exitCode: 1,
      durationMs: Date.now() - startTime,
      stdout: "",
      stderr: err?.message || String(err),
      errorDetails: [err?.message || "Failed to apply patch"],
    };
  } finally {
    try {
      await fs.unlink(tempPatchPath);
    } catch {
      // Ignore cleanup error
    }
  }
}

/**
 * Reverts an applied patch from the host workspace using git apply --reverse (§5.6, §19).
 */
export async function rollbackPatch(
  diffContent: string,
  context: SandboxExecutionContext,
): Promise<boolean> {
  const tempPatchPath = path.join(context.workspacePath, `.rollback_${Date.now()}.diff`);
  try {
    await fs.writeFile(tempPatchPath, diffContent, "utf-8");
    await execAsync(`git apply --reverse "${tempPatchPath}"`, {
      cwd: context.workspacePath,
      timeout: context.timeoutMs,
    });
    return true;
  } catch {
    return false;
  } finally {
    try {
      await fs.unlink(tempPatchPath);
    } catch {
      // Ignore cleanup error
    }
  }
}
