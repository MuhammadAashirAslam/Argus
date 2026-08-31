import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "../src/registry.js";
import type { McpTool, ToolExecutionContext } from "../src/types.js";

describe("ToolRegistry", () => {
  const dummyTool: McpTool<{ name: string }, { greeting: string }> = {
    name: "test.greet",
    version: "1.0.0",
    description: "Greets the user",
    permission: "READ_ONLY",
    inputSchema: z.object({ name: z.string().min(1) }),
    outputSchema: z.object({ greeting: z.string() }),
    async execute(input) {
      return {
        success: true,
        data: { greeting: `Hello, ${input.name}!` },
        durationMs: 5,
      };
    },
  };

  it("registers and lists tools", () => {
    const registry = new ToolRegistry();
    registry.register(dummyTool);
    const list = registry.listTools();
    expect(list.length).toBe(1);
    expect(list[0]?.name).toBe("test.greet");
  });

  it("executes registered tool with valid input", async () => {
    const registry = new ToolRegistry();
    registry.register(dummyTool);

    const ctx: ToolExecutionContext = {
      runId: "run_test_1",
      agentId: "agent_1",
      workspacePath: process.cwd(),
    };

    const res = await registry.executeTool("test.greet", { name: "ARGUS" }, ctx);
    expect(res.success).toBe(true);
    expect(res.data).toEqual({ greeting: "Hello, ARGUS!" });
  });

  it("rejects execution on invalid input schema", async () => {
    const registry = new ToolRegistry();
    registry.register(dummyTool);

    const ctx: ToolExecutionContext = {
      runId: "run_test_1",
      agentId: "agent_1",
      workspacePath: process.cwd(),
    };

    const res = await registry.executeTool("test.greet", { name: "" }, ctx);
    expect(res.success).toBe(false);
    expect(res.error?.code).toBe("INVALID_TOOL_INPUT");
  });
});
