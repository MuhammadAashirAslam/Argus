import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import type { McpTool, ToolExecutionContext, McpToolResult } from "@argus/mcp-server";
import { ConfigDebtEngine } from "./engine.js";
import { DebtFindingSchema } from "@argus/agent-core";
// We need rules to be registered, but this package shouldn't depend on rules/ package directly to avoid circular dependency.
// Instead, the Orchestrator or the CLI should register rules into the engine.
// Wait, `tools.ts` will need a shared Engine instance, or it will create a new one. Let's just allow passing the engine.
// Actually, MCP Tools are static definitions. Let's instantiate a global engine or require it to be configured.

export const CONFIG_TOOL_VERSION = "1.0.0";

export const ConfigAnalyzeInputSchema = z.object({
  directory: z.string().default("."),
});
export const ConfigAnalyzeOutputSchema = z.object({
  findings: z.array(DebtFindingSchema),
});

// Since the tools need an engine with rules registered, we can create a factory function.
export function createConfigTools(engine: ConfigDebtEngine): McpTool[] {
  const analyzeGithubActions: McpTool<
    z.infer<typeof ConfigAnalyzeInputSchema>,
    z.infer<typeof ConfigAnalyzeOutputSchema>
  > = {
    name: "config.analyze_github_actions",
    version: CONFIG_TOOL_VERSION,
    description: "Analyze GitHub Actions workflows for configuration debt",
    permission: "READ_ONLY",
    inputSchema: ConfigAnalyzeInputSchema,
    outputSchema: ConfigAnalyzeOutputSchema,

    async execute(
      input,
      context: ToolExecutionContext,
    ): Promise<McpToolResult<z.infer<typeof ConfigAnalyzeOutputSchema>>> {
      const start = Date.now();
      try {
        const fullDir = path.resolve(context.workspacePath, input.directory, ".github/workflows");
        let files: string[] = [];
        try {
          files = await fs.readdir(fullDir);
        } catch {
          // directory might not exist
          return { success: true, data: { findings: [] }, durationMs: Date.now() - start };
        }

        const findings: z.infer<typeof DebtFindingSchema>[] = [];
        for (const file of files) {
          if (file.endsWith(".yml") || file.endsWith(".yaml")) {
            const filePath = path.join(fullDir, file);
            const content = await fs.readFile(filePath, "utf-8");
            const fileFindings = engine.analyzeFile(filePath, content);
            findings.push(...fileFindings);
          }
        }
        return { success: true, data: { findings }, durationMs: Date.now() - start };
      } catch (err: any) {
        return {
          success: false,
          error: { code: "ANALYZE_GHA_FAILED", message: err?.message || String(err) },
          durationMs: Date.now() - start,
        };
      }
    },
  };

  const analyzeDockerfile: McpTool<
    z.infer<typeof ConfigAnalyzeInputSchema>,
    z.infer<typeof ConfigAnalyzeOutputSchema>
  > = {
    name: "config.analyze_dockerfile",
    version: CONFIG_TOOL_VERSION,
    description: "Analyze Dockerfiles for configuration debt",
    permission: "READ_ONLY",
    inputSchema: ConfigAnalyzeInputSchema,
    outputSchema: ConfigAnalyzeOutputSchema,

    async execute(
      input,
      context: ToolExecutionContext,
    ): Promise<McpToolResult<z.infer<typeof ConfigAnalyzeOutputSchema>>> {
      const start = Date.now();
      try {
        const fullDir = path.resolve(context.workspacePath, input.directory);
        let files: string[] = [];
        try {
          files = await fs.readdir(fullDir);
        } catch {
          return { success: true, data: { findings: [] }, durationMs: Date.now() - start };
        }

        const findings: z.infer<typeof DebtFindingSchema>[] = [];
        for (const file of files) {
          if (file.toLowerCase().includes("dockerfile")) {
            const filePath = path.join(fullDir, file);
            const content = await fs.readFile(filePath, "utf-8");
            const fileFindings = engine.analyzeFile(filePath, content);
            findings.push(...fileFindings);
          }
        }
        return { success: true, data: { findings }, durationMs: Date.now() - start };
      } catch (err: any) {
        return {
          success: false,
          error: { code: "ANALYZE_DOCKERFILE_FAILED", message: err?.message || String(err) },
          durationMs: Date.now() - start,
        };
      }
    },
  };

  return [analyzeGithubActions, analyzeDockerfile];
}
