import { z } from "zod";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";
import { GITHUB_TOOL_VERSION } from "./types.js";

async function githubFetch(path: string): Promise<any> {
  const token = process.env["GITHUB_TOKEN"];
  const headers: Record<string, string> = {
    "User-Agent": "ARGUS-Agent/1.0",
    Accept: "application/vnd.github.v3+json",
  };
  if (token) headers["Authorization"] = `token ${token}`;

  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API responded with status ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

// --- ci.list_workflows ---
export const CIListWorkflowsInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
});
export const CIListWorkflowsOutputSchema = z.object({
  workflows: z.array(z.object({
    id: z.number(),
    name: z.string(),
    path: z.string(),
    state: z.string(),
  })),
});

export const CIListWorkflowsTool: McpTool<z.infer<typeof CIListWorkflowsInputSchema>, z.infer<typeof CIListWorkflowsOutputSchema>> = {
  name: "ci.list_workflows",
  version: GITHUB_TOOL_VERSION,
  description: "List GitHub Actions workflows for a repository",
  permission: "READ_ONLY",
  inputSchema: CIListWorkflowsInputSchema,
  outputSchema: CIListWorkflowsOutputSchema,

  async execute(input, _context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof CIListWorkflowsOutputSchema>>> {
    const start = Date.now();
    try {
      const json = await githubFetch(`/repos/${input.owner}/${input.repo}/actions/workflows`);
      return { success: true, data: { workflows: json.workflows || [] }, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: { code: "CI_WORKFLOWS_FAILED", message: err?.message || String(err) }, durationMs: Date.now() - start };
    }
  },
};

// --- ci.get_runs ---
export const CIGetRunsInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  workflowId: z.number().optional(),
});
export const CIGetRunsOutputSchema = z.object({
  runs: z.array(z.object({
    id: z.number(),
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    headSha: z.string(),
    htmlUrl: z.string(),
  })),
});

export const CIGetRunsTool: McpTool<z.infer<typeof CIGetRunsInputSchema>, z.infer<typeof CIGetRunsOutputSchema>> = {
  name: "ci.get_runs",
  version: GITHUB_TOOL_VERSION,
  description: "Get recent GitHub Actions workflow runs",
  permission: "READ_ONLY",
  inputSchema: CIGetRunsInputSchema,
  outputSchema: CIGetRunsOutputSchema,

  async execute(input, _context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof CIGetRunsOutputSchema>>> {
    const start = Date.now();
    try {
      const path = input.workflowId 
        ? `/repos/${input.owner}/${input.repo}/actions/workflows/${input.workflowId}/runs`
        : `/repos/${input.owner}/${input.repo}/actions/runs`;
      const json = await githubFetch(path);
      const runs = (json.workflow_runs || []).map((r: any) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        conclusion: r.conclusion,
        headSha: r.head_sha,
        htmlUrl: r.html_url,
      }));
      return { success: true, data: { runs }, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: { code: "CI_RUNS_FAILED", message: err?.message || String(err) }, durationMs: Date.now() - start };
    }
  },
};

// --- ci.get_run ---
export const CIGetRunInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  runId: z.number(),
});
export const CIGetRunOutputSchema = z.object({
  id: z.number(),
  status: z.string(),
  conclusion: z.string().nullable(),
  jobs: z.array(z.object({
    id: z.number(),
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
  })),
});

export const CIGetRunTool: McpTool<z.infer<typeof CIGetRunInputSchema>, z.infer<typeof CIGetRunOutputSchema>> = {
  name: "ci.get_run",
  version: GITHUB_TOOL_VERSION,
  description: "Get details and jobs of a specific workflow run",
  permission: "READ_ONLY",
  inputSchema: CIGetRunInputSchema,
  outputSchema: CIGetRunOutputSchema,

  async execute(input, _context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof CIGetRunOutputSchema>>> {
    const start = Date.now();
    try {
      const [runData, jobsData] = await Promise.all([
        githubFetch(`/repos/${input.owner}/${input.repo}/actions/runs/${input.runId}`),
        githubFetch(`/repos/${input.owner}/${input.repo}/actions/runs/${input.runId}/jobs`)
      ]);
      return { 
        success: true, 
        data: { 
          id: runData.id,
          status: runData.status,
          conclusion: runData.conclusion,
          jobs: (jobsData.jobs || []).map((j: any) => ({
            id: j.id,
            name: j.name,
            status: j.status,
            conclusion: j.conclusion,
          })),
        }, 
        durationMs: Date.now() - start 
      };
    } catch (err: any) {
      return { success: false, error: { code: "CI_RUN_FAILED", message: err?.message || String(err) }, durationMs: Date.now() - start };
    }
  },
};

// --- ci.get_logs ---
export const CIGetLogsInputSchema = z.object({
  owner: z.string().min(1),
  repo: z.string().min(1),
  jobId: z.number(),
});
export const CIGetLogsOutputSchema = z.object({
  logs: z.string(),
});

export const CIGetLogsTool: McpTool<z.infer<typeof CIGetLogsInputSchema>, z.infer<typeof CIGetLogsOutputSchema>> = {
  name: "ci.get_logs",
  version: GITHUB_TOOL_VERSION,
  description: "Get logs for a specific workflow job",
  permission: "READ_ONLY",
  inputSchema: CIGetLogsInputSchema,
  outputSchema: CIGetLogsOutputSchema,

  async execute(input, _context: ToolExecutionContext): Promise<McpToolResult<z.infer<typeof CIGetLogsOutputSchema>>> {
    const start = Date.now();
    try {
      const token = process.env["GITHUB_TOKEN"];
      const headers: Record<string, string> = {
        "User-Agent": "ARGUS-Agent/1.0",
      };
      if (token) headers["Authorization"] = `token ${token}`;

      const res = await fetch(`https://api.github.com/repos/${input.owner}/${input.repo}/actions/jobs/${input.jobId}/logs`, {
        headers,
        redirect: "follow", // GitHub logs redirect to an S3 bucket URL
      });
      
      if (!res.ok) {
        throw new Error(`GitHub API responded with status ${res.status}: ${res.statusText}`);
      }
      
      const text = await res.text();
      return { success: true, data: { logs: text }, durationMs: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: { code: "CI_LOGS_FAILED", message: err?.message || String(err) }, durationMs: Date.now() - start };
    }
  },
};
