import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";
import { GIT_TOOL_VERSION } from "./tools.js";

const execAsync = promisify(exec);

// --- repo.read_file ---
export const RepoReadFileInputSchema = z.object({
  filePath: z.string().min(1),
});
export const RepoReadFileOutputSchema = z.object({
  content: z.string(),
  size: z.number(),
});

export const RepoReadFileTool: McpTool<z.infer<typeof RepoReadFileInputSchema>, z.infer<typeof RepoReadFileOutputSchema>> = {
  name: "repo.read_file",
  version: GIT_TOOL_VERSION,
  description: "Read the contents of a file in the repository",
  permission: "READ_ONLY",
  inputSchema: RepoReadFileInputSchema,
  outputSchema: RepoReadFileOutputSchema,

  async execute(input, context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof RepoReadFileOutputSchema>>> {
    const start = Date.now();
    try {
      const fullPath = path.resolve(context.workspacePath, input.filePath);
      if (!fullPath.startsWith(path.resolve(context.workspacePath))) {
        throw new Error("Path traversal outside workspace is forbidden");
      }
      let content = await fs.readFile(fullPath, "utf-8");
      if (content.length > 3000) {
        content = content.slice(0, 3000) + "\n... [truncated to 3000 characters]";
      }
      return {
        success: true,
        data: { content, size: content.length },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "READ_FILE_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- repo.list_files ---
export const RepoListFilesInputSchema = z.object({
  directory: z.string().optional().default("."),
});
export const RepoListFilesOutputSchema = z.object({
  files: z.array(z.string()),
});

export const RepoListFilesTool: McpTool<z.infer<typeof RepoListFilesInputSchema>, z.infer<typeof RepoListFilesOutputSchema>> = {
  name: "repo.list_files",
  version: GIT_TOOL_VERSION,
  description: "List all files in the repository (using git ls-files)",
  permission: "READ_ONLY",
  inputSchema: RepoListFilesInputSchema,
  outputSchema: RepoListFilesOutputSchema,

  async execute(input, context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof RepoListFilesOutputSchema>>> {
    const start = Date.now();
    try {
      const dir = input.directory === "." ? "" : `"${input.directory}"`;
      const { stdout } = await execAsync(`git ls-files ${dir}`, { cwd: context.workspacePath });
      let files = stdout.split("\n").filter(Boolean);
      if (files.length > 40) {
        const priority = files.filter(f => 
          f.includes(".github") || 
          f.includes("Dockerfile") || 
          f.endsWith(".yml") || 
          f.endsWith(".yaml") || 
          f.endsWith(".json")
        ).slice(0, 30);
        files = [...new Set([...priority, ...files.slice(0, 10)])];
      }
      return {
        success: true,
        data: { files },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "LIST_FILES_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- repo.search ---
export const RepoSearchInputSchema = z.object({
  query: z.string().min(1),
  regex: z.boolean().default(false),
});
export const RepoSearchOutputSchema = z.object({
  results: z.array(z.string()), // Format: "file:line_number:content"
});

export const RepoSearchTool: McpTool<z.infer<typeof RepoSearchInputSchema>, z.infer<typeof RepoSearchOutputSchema>> = {
  name: "repo.search",
  version: GIT_TOOL_VERSION,
  description: "Search the repository using git grep",
  permission: "READ_ONLY",
  inputSchema: RepoSearchInputSchema,
  outputSchema: RepoSearchOutputSchema,

  async execute(input, context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof RepoSearchOutputSchema>>> {
    const start = Date.now();
    try {
      const regexFlag = input.regex ? "-E" : "-F";
      const { stdout } = await execAsync(`git grep -n ${regexFlag} "${input.query.replace(/"/g, '\\"')}"`, { 
        cwd: context.workspacePath,
      }).catch(err => {
        // git grep returns 1 if no matches found
        if (err.code === 1) return { stdout: "" };
        throw err;
      });
      const results = stdout.split("\n").filter(Boolean);
      return {
        success: true,
        data: { results },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "SEARCH_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- repo.get_diff ---
export const RepoGetDiffInputSchema = z.object({
  base: z.string().default("HEAD"),
  target: z.string().optional(),
});
export const RepoGetDiffOutputSchema = z.object({
  diff: z.string(),
});

export const RepoGetDiffTool: McpTool<z.infer<typeof RepoGetDiffInputSchema>, z.infer<typeof RepoGetDiffOutputSchema>> = {
  name: "repo.get_diff",
  version: GIT_TOOL_VERSION,
  description: "Get the git diff between two points",
  permission: "READ_ONLY",
  inputSchema: RepoGetDiffInputSchema,
  outputSchema: RepoGetDiffOutputSchema,

  async execute(input, context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof RepoGetDiffOutputSchema>>> {
    const start = Date.now();
    try {
      const target = input.target ? ` ${input.target}` : "";
      const { stdout } = await execAsync(`git diff ${input.base}${target}`, { cwd: context.workspacePath });
      return {
        success: true,
        data: { diff: stdout },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "DIFF_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};

// --- repo.get_dependencies ---
export const RepoGetDependenciesInputSchema = z.object({
  packageJsonPath: z.string().default("package.json"),
});
export const RepoGetDependenciesOutputSchema = z.object({
  dependencies: z.record(z.string()),
  devDependencies: z.record(z.string()),
});

export const RepoGetDependenciesTool: McpTool<z.infer<typeof RepoGetDependenciesInputSchema>, z.infer<typeof RepoGetDependenciesOutputSchema>> = {
  name: "repo.get_dependencies",
  version: GIT_TOOL_VERSION,
  description: "Get dependencies from package.json",
  permission: "READ_ONLY",
  inputSchema: RepoGetDependenciesInputSchema,
  outputSchema: RepoGetDependenciesOutputSchema,

  async execute(input, context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof RepoGetDependenciesOutputSchema>>> {
    const start = Date.now();
    try {
      const fullPath = path.resolve(context.workspacePath, input.packageJsonPath);
      const content = await fs.readFile(fullPath, "utf-8");
      const pkg = JSON.parse(content);
      return {
        success: true,
        data: {
          dependencies: pkg.dependencies || {},
          devDependencies: pkg.devDependencies || {},
        },
        durationMs: Date.now() - start,
      };
    } catch (err: any) {
      return {
        success: false,
        error: { code: "DEPENDENCIES_FAILED", message: err?.message || String(err) },
        durationMs: Date.now() - start,
      };
    }
  },
};
