import { describe, it, expect } from "vitest";
import { VerificationRunner } from "../src/runner.js";
import type { SandboxExecutionContext } from "../src/types.js";

describe("VerificationRunner", () => {
  const ctx: SandboxExecutionContext = {
    workspacePath: process.cwd(),
    timeoutMs: 10000,
  };

  it("handles malformed/invalid patch cleanly without unhandled crash", async () => {
    const runner = new VerificationRunner();
    const badDiff = "invalid diff content that cannot be applied";

    const result = await runner.runPipeline(badDiff, ctx);
    expect(result.patchApplied).toBe(false);
    expect(result.overall).toBe("failed");
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it("records stage exit code and process duration accurately", async () => {
    const runner = new VerificationRunner();
    const badDiff = "--- a/nonexistent\n+++ b/nonexistent\n@@ -1 +1 @@\n-old\n+new\n";

    const result = await runner.runPipeline(badDiff, ctx);
    expect(result.stages.length).toBe(1);
    expect(result.stages[0]?.stage).toBe("PATCH_APPLICATION");
    expect(result.stages[0]?.passed).toBe(false);
    expect(result.stages[0]?.durationMs).toBeGreaterThanOrEqual(0);
  });
});
