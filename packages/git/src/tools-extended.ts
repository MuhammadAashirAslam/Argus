import { z } from "zod";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";
import { GIT_TOOL_VERSION } from "./tools.js";

const execAsync = promisify(exec);

// --- git.show_commit ---
export const GitShowCommitInputSchema = z.object({
  hash: z.string().min(1),
});
export const GitShowCommitOutputSchema = z.object({
  content: z.string(),
});

export const GitShowCommitTool: McpTool<z.infer<typeof GitShowCommitInputSchema>, z.infer<typeof GitShowCommitOutputSchema>> = {
  name: "git.show_commit",
  version: GIT_TOOL_VERSION,
  description: "Show the details and diff of a specific commit",
  permission: "READ_ONLY",
  inputSchema: GitShowCommitInputSchema,
  outputSchema: GitShowCommitOutputSchema,

  async execute(input, context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof GitShowCommitOutputSchema>>> {
    const start = Date.now();
    try {
      const { stdout } = await execAsync(`git show ${input.hash}`, { cwd: context.workspacePath });
      return {
        success: true,
        data: { content: stdout },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "GIT_SHOW_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- git.blame ---
export const GitBlameInputSchema = z.object({
  filePath: z.string().min(1),
});
export const GitBlameOutputSchema = z.object({
  blame: z.string(),
});

export const GitBlameTool: McpTool<z.infer<typeof GitBlameInputSchema>, z.infer<typeof GitBlameOutputSchema>> = {
  name: "git.blame",
  version: GIT_TOOL_VERSION,
  description: "Show what revision and author last modified each line of a file",
  permission: "READ_ONLY",
  inputSchema: GitBlameInputSchema,
  outputSchema: GitBlameOutputSchema,

  async execute(input, context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof GitBlameOutputSchema>>> {
    const start = Date.now();
    try {
      const { stdout } = await execAsync(`git blame "${input.filePath}"`, { cwd: context.workspacePath });
      return {
        success: true,
        data: { blame: stdout },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "GIT_BLAME_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- git.diff ---
export const GitDiffInputSchema = z.object({
  args: z.string().optional().default(""),
});
export const GitDiffOutputSchema = z.object({
  diff: z.string(),
});

export const GitDiffTool: McpTool<z.infer<typeof GitDiffInputSchema>, z.infer<typeof GitDiffOutputSchema>> = {
  name: "git.diff",
  version: GIT_TOOL_VERSION,
  description: "Show changes between commits, commit and working tree, etc",
  permission: "READ_ONLY",
  inputSchema: GitDiffInputSchema,
  outputSchema: GitDiffOutputSchema,

  async execute(input, context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof GitDiffOutputSchema>>> {
    const start = Date.now();
    try {
      const args = input.args ? ` ${input.args}` : "";
      const { stdout } = await execAsync(`git diff${args}`, { cwd: context.workspacePath });
      return {
        success: true,
        data: { diff: stdout },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "GIT_DIFF_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};
