import { ToolRegistry, startStdioMcpServer } from "@argus/mcp-server";
import {
  GitStatusTool,
  GitLogTool,
  GitShowCommitTool,
  GitBlameTool,
  GitDiffTool,
  RepoReadFileTool,
  RepoSearchTool,
  RepoListFilesTool,
  RepoGetDiffTool,
  RepoGetDependenciesTool,
} from "@argus/git";
import {
  GetPullRequestTool,
  GetPullRequestFilesTool,
  GetIssuesTool,
  GetCommentsTool,
  CreateReviewTool,
  CreateBranchTool,
  CreatePullRequestTool,
  CIListWorkflowsTool,
  CIGetRunsTool,
  CIGetRunTool,
  CIGetLogsTool,
  CIRunTestsTool,
  CIRunLinterTool,
} from "@argus/github";
import { ConfigDebtEngine, createConfigTools } from "@argus/config-engine";
import { ALL_BUILT_IN_RULES } from "@argus/rules";

/**
 * Builds a populated ARGUS ToolRegistry containing all standard MCP tools (§13, §14).
 */
export function buildStandardToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  // 1. Git Tools
  registry.register(GitStatusTool);
  registry.register(GitLogTool);
  registry.register(GitShowCommitTool);
  registry.register(GitBlameTool);
  registry.register(GitDiffTool);

  // 2. Repository Tools
  registry.register(RepoReadFileTool);
  registry.register(RepoSearchTool);
  registry.register(RepoListFilesTool);
  registry.register(RepoGetDiffTool);
  registry.register(RepoGetDependenciesTool);

  // 3. GitHub & CI Tools
  registry.register(GetPullRequestTool);
  registry.register(GetPullRequestFilesTool);
  registry.register(GetIssuesTool);
  registry.register(GetCommentsTool);
  registry.register(CreateReviewTool);
  registry.register(CreateBranchTool);
  registry.register(CreatePullRequestTool);
  registry.register(CIListWorkflowsTool);
  registry.register(CIGetRunsTool);
  registry.register(CIGetRunTool);
  registry.register(CIGetLogsTool);
  registry.register(CIRunTestsTool);
  registry.register(CIRunLinterTool);

  // 4. Configuration Debt Engine Tools
  const configEngine = new ConfigDebtEngine();
  for (const rule of ALL_BUILT_IN_RULES) {
    configEngine.registerRule(rule);
  }
  const configTools = createConfigTools(configEngine);
  for (const tool of configTools) {
    registry.register(tool);
  }

  return registry;
}

/**
 * Runs the ARGUS Model Context Protocol (MCP) server over stdio (§13).
 */
export async function runMcpServer(workspacePath?: string): Promise<void> {
  const registry = buildStandardToolRegistry();
  const workspace = workspacePath ? workspacePath : process.cwd();

  // Log diagnostic notice to stderr so stdout remains clean for MCP JSON-RPC protocol
  process.stderr.write(
    `[ARGUS MCP] Initializing ARGUS MCP Server over stdio (${registry.listTools().length} tools registered)...\n`,
  );
  process.stderr.write(`[ARGUS MCP] Workspace: ${workspace}\n`);

  await startStdioMcpServer(registry, {
    name: "argus-mcp-server",
    version: "0.1.0",
    defaultWorkspace: workspace,
  });

  process.stderr.write(`[ARGUS MCP] Server connected and ready to accept JSON-RPC requests.\n`);
}
