import fs from "node:fs/promises";
import { VerificationRunner, isDockerAvailable } from "@argus/verifier";
import type { VerificationResult } from "@argus/agent-core";

export interface VerifyPatchOptions {
  workspacePath?: string;
  useSandbox?: boolean;
  timeoutMs?: number;
}

export async function runVerifyPatch(
  patchFilePath: string,
  options: VerifyPatchOptions = {},
): Promise<VerificationResult> {
  const diffContent = await fs.readFile(patchFilePath, "utf-8");
  const runner = new VerificationRunner();

  const result = await runner.runPipeline(
    diffContent,
    {
      workspacePath: options.workspacePath ?? process.cwd(),
      timeoutMs: options.timeoutMs ?? 60000,
    },
    {
      useSandbox:
        options.useSandbox !== undefined ? Boolean(options.useSandbox) : await isDockerAvailable(),
    },
  );

  return result;
}
