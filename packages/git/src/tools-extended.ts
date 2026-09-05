import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";
import { GIT_TOOL_VERSION } from "./tools.js";

const execFileAsync = promisify(execFile);

// --- git.show_commit ---
export const GitShowCommitInputSchema = z.object({
  hash: z.string().min(1),
});
export const GitShowCommitOutputSchema = z.object({
  content: z.string(),
});

export const GitShowCommitTool: McpTool<
  z.infer<typeof GitShowCommitInputSchema>,
  z.infer<typeof GitShowCommitOutputSchema>
> = {
  name: "git.show_commit",
  version: GIT_TOOL_VERSION,
  description: "Show the details and diff of a specific commit",
  permission: "READ_ONLY",
  inputSchema: GitShowCommitInputSchema,
  outputSchema: GitShowCommitOutputSchema,

  async execute(
    input,
    context: ToolExecutionContext,
  ): Promise<McpToolResult<z.infer<typeof GitShowCommitOutputSchema>>> {
    const start = Date.now();
    try {
      if (!/^[a-zA-Z0-9_.~^/-]+$/.test(input.hash)) {
        throw new Error("Invalid commit hash or reference format");
      }
      const { stdout } = await execFileAsync("git", ["show", input.hash], {
        cwd: context.workspacePath,
      });
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

export const GitBlameTool: McpTool<
  z.infer<typeof GitBlameInputSchema>,
  z.infer<typeof GitBlameOutputSchema>
> = {
  name: "git.blame",
  version: GIT_TOOL_VERSION,
  description: "Show what revision and author last modified each line of a file",
  permission: "READ_ONLY",
  inputSchema: GitBlameInputSchema,
  outputSchema: GitBlameOutputSchema,

  async execute(
    input,
    context: ToolExecutionContext,
  ): Promise<McpToolResult<z.infer<typeof GitBlameOutputSchema>>> {
    const start = Date.now();
    try {
      const { stdout } = await execFileAsync("git", ["blame", input.filePath], {
        cwd: context.workspacePath,
      });
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
  target: z.string().optional(),
  cached: z.boolean().optional(),
  filePath: z.string().optional(),
});
export const GitDiffOutputSchema = z.object({
  diff: z.string(),
});

export const GitDiffTool: McpTool<
  z.infer<typeof GitDiffInputSchema>,
  z.infer<typeof GitDiffOutputSchema>
> = {
  name: "git.diff",
  version: GIT_TOOL_VERSION,
  description: "Show changes between commits, commit and working tree, etc",
  permission: "READ_ONLY",
  inputSchema: GitDiffInputSchema,
  outputSchema: GitDiffOutputSchema,

  async execute(
    input,
    context: ToolExecutionContext,
  ): Promise<McpToolResult<z.infer<typeof GitDiffOutputSchema>>> {
    const start = Date.now();
    try {
      const gitArgs = ["diff"];
      if (input.cached) gitArgs.push("--cached");
      if (input.target && /^[a-zA-Z0-9_.~^/-]+$/.test(input.target)) {
        gitArgs.push(input.target);
      }
      if (input.filePath) {
        gitArgs.push("--", input.filePath);
      }
      if (input.args && !input.target && !input.filePath) {
        const tokens = input.args.trim().split(/\s+/).filter(Boolean);
        for (const t of tokens) {
          if (!/^[a-zA-Z0-9_.~^/=-]+$/.test(t)) {
            throw new Error(`Unsafe character in git diff argument: ${t}`);
          }
          gitArgs.push(t);
        }
      }

      const { stdout } = await execFileAsync("git", gitArgs, { cwd: context.workspacePath });
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
