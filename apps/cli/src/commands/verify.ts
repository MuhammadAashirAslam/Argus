import fs from "node:fs/promises";
import { VerificationRunner } from "@argus/verifier";
import type { VerificationResult } from "@argus/agent-core";

export async function runVerifyPatch(patchFilePath: string, workspacePath: string = process.cwd()): Promise<VerificationResult> {
  const diffContent = await fs.readFile(patchFilePath, "utf-8");
  const runner = new VerificationRunner();

  const result = await runner.runPipeline(diffContent, {
    workspacePath,
    timeoutMs: 30000,
  });

  return result;
}
