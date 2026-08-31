import { z } from "zod";

export const PermissionLevelSchema = z.enum(["READ_ONLY", "WRITE_WORKSPACE", "EXECUTE_SANDBOX"]);

export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

export interface ToolExecutionContext {
  runId: string;
  agentId: string;
  workspacePath: string;
  timeoutMs?: number;
}

export interface McpToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface McpToolResult<TOutput> {
  success: boolean;
  data?: TOutput;
  error?: McpToolError;
  durationMs: number;
}

/**
 * Canonical MCP Tool Contract (§14, §17).
 * All tools must declare exact semver versioning and typed Zod schemas.
 */
export interface McpTool<TInput = any, TOutput = any> {
  readonly name: string;
  readonly version: string; // e.g. "1.0.0"
  readonly description: string;
  readonly permission: PermissionLevel;
  readonly inputSchema: z.ZodType<TInput, any, any>;
  readonly outputSchema: z.ZodType<TOutput, any, any>;

  execute(input: TInput, context: ToolExecutionContext): Promise<McpToolResult<TOutput>>;
}
