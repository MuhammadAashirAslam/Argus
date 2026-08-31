import { describe, it, expect } from "vitest";
import { GitStatusTool, GitLogTool, GIT_TOOL_VERSION } from "../src/tools.js";
import type { ToolExecutionContext } from "@argus/mcp-server";

describe("Git Tools", () => {
  const ctx: ToolExecutionContext = {
    runId: "run_test_git",
    agentId: "agent_git_1",
    workspacePath: process.cwd(),
  };

  it("declares exact semver version (§17)", () => {
    expect(GitStatusTool.version).toBe("1.0.0");
    expect(GitLogTool.version).toBe(GIT_TOOL_VERSION);
  });

  it("executes git.status in repository", async () => {
    const res = await GitStatusTool.execute({}, ctx);
    expect(res.success).toBe(true);
    expect(typeof res.data?.branch).toBe("string");
  });

  it("executes git.log with maxCount limit", async () => {
    const res = await GitLogTool.execute({ maxCount: 2 }, ctx);
    expect(res.success).toBe(true);
    expect(Array.isArray(res.data?.commits)).toBe(true);
    expect(res.data?.commits.length).toBeGreaterThanOrEqual(1);
  });
});
