import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";

const execFileAsync = promisify(execFile);

export const GIT_TOOL_VERSION = "1.0.0";

// --- git.status ---
export const GitStatusInputSchema = z.object({});
export const GitStatusOutputSchema = z.object({
  branch: z.string(),
  clean: z.boolean(),
  modifiedFiles: z.array(z.string()),
  untrackedFiles: z.array(z.string()),
});

export const GitStatusTool: McpTool<
  z.infer<typeof GitStatusInputSchema>,
  z.infer<typeof GitStatusOutputSchema>
> = {
  name: "git.status",
  version: GIT_TOOL_VERSION,
  description: "Get the current git working tree status and branch",
  permission: "READ_ONLY",
  inputSchema: GitStatusInputSchema,
  outputSchema: GitStatusOutputSchema,

  async execute(
    _input,
    context: ToolExecutionContext,
  ): Promise<McpToolResult<z.infer<typeof GitStatusOutputSchema>>> {
    const start = Date.now();
    try {
      const { stdout } = await execFileAsync("git", ["status", "--porcelain=v1", "-b"], {
        cwd: context.workspacePath,
      });
      const lines = stdout.split("\n").filter(Boolean);
      const branchLine = lines[0] ?? "";
      const branch = branchLine.replace(/^##\s*/, "").split("...")[0] ?? "unknown";

      const modifiedFiles: string[] = [];
      const untrackedFiles: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!;
        if (line.startsWith("??")) {
          untrackedFiles.push(line.slice(3).trim());
        } else {
          modifiedFiles.push(line.slice(3).trim());
        }
      }

      return {
        success: true,
        data: {
          branch,
          clean: modifiedFiles.length === 0 && untrackedFiles.length === 0,
          modifiedFiles,
          untrackedFiles,
        },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "GIT_STATUS_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- git.log ---
export const GitLogInputSchema = z.object({
  maxCount: z.number().int().positive().default(10),
  filePath: z.string().optional(),
});
export const GitLogOutputSchema = z.object({
  commits: z.array(
    z.object({
      hash: z.string(),
      author: z.string(),
      date: z.string(),
      message: z.string(),
    }),
  ),
});

export const GitLogTool: McpTool<
  z.infer<typeof GitLogInputSchema>,
  z.infer<typeof GitLogOutputSchema>
> = {
  name: "git.log",
  version: GIT_TOOL_VERSION,
  description: "Inspect commit history for repository or a specific file",
  permission: "READ_ONLY",
  inputSchema: GitLogInputSchema,
  outputSchema: GitLogOutputSchema,

  async execute(
    input,
    context: ToolExecutionContext,
  ): Promise<McpToolResult<z.infer<typeof GitLogOutputSchema>>> {
    const start = Date.now();
    try {
      const gitArgs = ["log", "-n", String(input.maxCount), "--format=%H|%an|%ad|%s", "--date=iso"];
      if (input.filePath) {
        gitArgs.push("--", input.filePath);
      }
      const { stdout } = await execFileAsync("git", gitArgs, { cwd: context.workspacePath });

      const commits = stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash = "", author = "", date = "", message = ""] = line.split("|");
          return { hash, author, date, message };
        });

      return {
        success: true,
        data: { commits },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "GIT_LOG_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};
