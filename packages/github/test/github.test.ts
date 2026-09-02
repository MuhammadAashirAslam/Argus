import { describe, it, expect } from "vitest";
import { GetPullRequestTool, GetIssuesTool } from "../src/tools_read.js";
import { CreateReviewTool } from "../src/tools_write.js";
import { GITHUB_TOOL_VERSION } from "../src/types.js";
import type { ToolExecutionContext } from "@argus/mcp-server";

describe("GitHub Tools", () => {
  const ctx: ToolExecutionContext = {
    runId: "run_test_github",
    agentId: "agent_github_1",
    workspacePath: process.cwd(),
  };

  it("declares exact semver tool version (§17)", () => {
    expect(GetPullRequestTool.version).toBe(GITHUB_TOOL_VERSION);
    expect(CreateReviewTool.version).toBe("1.0.0");
  });

  it("validates input schema for get_pull_request", async () => {
    const invalidInput = { owner: "", repo: "", pullNumber: -1 };
    const parseResult = GetPullRequestTool.inputSchema.safeParse(invalidInput);
    expect(parseResult.success).toBe(false);
  });

  it("requires GITHUB_TOKEN for write review tool", async () => {
    const originalToken = process.env["GITHUB_TOKEN"];
    delete process.env["GITHUB_TOKEN"];

    const res = await CreateReviewTool.execute(
      {
        owner: "MuhammadAashirAslam",
        repo: "Argus",
        pullNumber: 1,
        body: "Automated analysis review",
        event: "COMMENT",
      },
      ctx,
    );

    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("AUTH_REQUIRED");

    if (originalToken) {
      process.env["GITHUB_TOKEN"] = originalToken;
    }
  });
});
