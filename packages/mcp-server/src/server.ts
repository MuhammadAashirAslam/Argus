import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ToolRegistry } from "./registry.js";
import type { ToolExecutionContext } from "./types.js";

export interface ArgusMcpServerOptions {
  name?: string;
  version?: string;
  defaultWorkspace?: string;
}

/**
 * Creates an official Model Context Protocol (MCP) server instance
 * bound to an ARGUS ToolRegistry (§13, §14).
 */
export function createArgusMcpServer(
  registry: ToolRegistry,
  options?: ArgusMcpServerOptions,
): Server {
  const serverName = options?.name ?? "argus-mcp-server";
  const serverVersion = options?.version ?? "0.1.0";
  const workspacePath = options?.defaultWorkspace ?? process.cwd();

  const server = new Server(
    {
      name: serverName,
      version: serverVersion,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // 1. MCP tools/list protocol handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = registry.listTools().map((t) => {
      const tool = registry.get(t.name);
      if (!tool) {
        return {
          name: t.name,
          description: t.description,
          inputSchema: { type: "object" as const },
        };
      }

      // Convert Zod schema to standard JSON Schema for MCP clients
      const rawJsonSchema = zodToJsonSchema(tool.inputSchema, {
        target: "jsonSchema7",
      }) as Record<string, unknown>;

      // Remove meta $schema field for cleaner client compatibility
      const { $schema, ...inputSchema } = rawJsonSchema;

      return {
        name: tool.name,
        description: `${tool.description} (permission: ${tool.permission}, version: ${tool.version})`,
        inputSchema: (inputSchema.type ? inputSchema : { type: "object", ...inputSchema }) as {
          type: "object";
          [key: string]: unknown;
        },
      };
    });

    return { tools };
  });

  // 2. MCP tools/call protocol handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const context: ToolExecutionContext = {
      runId: `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      agentId: "mcp_client",
      workspacePath,
    };

    try {
      const result = await registry.executeTool(name, rawArgs ?? {}, context);

      if (!result.success) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Tool Execution Failed: [${result.error?.code ?? "ERROR"}] ${result.error?.message ?? "Unknown error"}\nDetails: ${JSON.stringify(result.error ?? {}, null, 2)}`,
            },
          ],
          isError: true,
        };
      }

      const textOutput =
        typeof result.data === "string" ? result.data : JSON.stringify(result.data, null, 2);

      return {
        content: [
          {
            type: "text" as const,
            text: textOutput,
          },
        ],
        isError: false,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: "text" as const,
            text: `Internal MCP tool execution error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Starts an ARGUS MCP server connected to Node.js standard input/output (stdio).
 * This allows external clients (Claude Desktop, Cursor, Antigravity) to launch and interact with ARGUS tools.
 */
export async function startStdioMcpServer(
  registry: ToolRegistry,
  options?: ArgusMcpServerOptions,
): Promise<{ server: Server; transport: StdioServerTransport }> {
  const server = createArgusMcpServer(registry, options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, transport };
}
