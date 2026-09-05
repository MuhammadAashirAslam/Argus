import type { McpTool, ToolExecutionContext, McpToolResult } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, McpTool<any, any>>();

  /**
   * Register a tool with semver tracking (§17).
   */
  public register(tool: McpTool<any, any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered in registry.`);
    }
    this.tools.set(tool.name, tool);
  }

  public get(name: string): McpTool<any, any> | undefined {
    return this.tools.get(name);
  }

  public listTools(): Array<{
    name: string;
    version: string;
    description: string;
    permission: string;
  }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      version: t.version,
      description: t.description,
      permission: t.permission,
    }));
  }

  /**
   * Execute tool with runtime input validation and defensive error boundary.
   */
  public async executeTool(
    name: string,
    rawInput: unknown,
    context: ToolExecutionContext,
  ): Promise<McpToolResult<unknown>> {
    const startTime = Date.now();
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Tool '${name}' is not registered in MCP Server`,
        },
        durationMs: Date.now() - startTime,
      };
    }

    // Runtime input schema validation
    const parsedInput = tool.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      return {
        success: false,
        error: {
          code: "INVALID_TOOL_INPUT",
          message: `Input validation failed for tool '${name}': ${parsedInput.error.message}`,
        },
        durationMs: Date.now() - startTime,
      };
    }

    try {
      return await tool.execute(parsedInput.data, context);
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: "TOOL_EXECUTION_ERROR",
          message: err?.message || String(err),
        },
        durationMs: Date.now() - startTime,
      };
    }
  }
}
