import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ToolRegistry } from "../src/registry.js";
import { createArgusMcpServer } from "../src/server.js";
import type { McpTool } from "../src/types.js";

describe("ArgusMcpServer (MCP Protocol Compliance)", () => {
  const echoTool: McpTool<{ message: string }, { echoed: string }> = {
    name: "echo_tool",
    version: "1.0.0",
    description: "Echoes a message back to the caller",
    permission: "READ_ONLY",
    inputSchema: z.object({
      message: z.string().min(1, "Message cannot be empty"),
    }),
    outputSchema: z.object({
      echoed: z.string(),
    }),
    async execute(input) {
      return {
        success: true,
        data: { echoed: input.message },
        durationMs: 2,
      };
    },
  };

  const calculateTool: McpTool<{ a: number; b: number }, { sum: number }> = {
    name: "calculate_tool",
    version: "1.2.0",
    description: "Adds two numbers together",
    permission: "EXECUTE_SANDBOX",
    inputSchema: z.object({
      a: z.number(),
      b: z.number(),
    }),
    outputSchema: z.object({
      sum: z.number(),
    }),
    async execute(input) {
      return {
        success: true,
        data: { sum: input.a + input.b },
        durationMs: 1,
      };
    },
  };

  async function setupMcpPair(registry: ToolRegistry) {
    const server = createArgusMcpServer(registry, {
      name: "argus-test-server",
      version: "0.1.0",
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);

    return { server, client };
  }

  it("lists all registered tools over the MCP protocol", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    registry.register(calculateTool);

    const { client } = await setupMcpPair(registry);
    const response = await client.listTools();

    expect(response.tools).toHaveLength(2);

    const echoMeta = response.tools.find((t) => t.name === "echo_tool");
    expect(echoMeta).toBeDefined();
    expect(echoMeta?.description).toContain("Echoes a message");
    expect(echoMeta?.description).toContain("permission: READ_ONLY");
    expect(echoMeta?.inputSchema.type).toBe("object");

    const calcMeta = response.tools.find((t) => t.name === "calculate_tool");
    expect(calcMeta).toBeDefined();
    expect(calcMeta?.description).toContain("Adds two numbers");
  });

  it("executes a registered tool via MCP client.callTool()", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);

    const { client } = await setupMcpPair(registry);
    const result = await client.callTool({
      name: "echo_tool",
      arguments: { message: "Hello ARGUS MCP!" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]?.type).toBe("text");

    const textContent = (result.content[0] as { type: "text"; text: string }).text;
    const parsed = JSON.parse(textContent);
    expect(parsed).toEqual({ echoed: "Hello ARGUS MCP!" });
  });

  it("returns formatted MCP error when input fails schema validation", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);

    const { client } = await setupMcpPair(registry);
    const result = await client.callTool({
      name: "echo_tool",
      arguments: { message: "" }, // Invalid per .min(1)
    });

    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const textContent = (result.content[0] as { type: "text"; text: string }).text;
    expect(textContent).toContain("INVALID_TOOL_INPUT");
    expect(textContent).toContain("Message cannot be empty");
  });

  it("returns formatted MCP error when tool is not registered", async () => {
    const registry = new ToolRegistry();
    const { client } = await setupMcpPair(registry);

    const result = await client.callTool({
      name: "non_existent_tool",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const textContent = (result.content[0] as { type: "text"; text: string }).text;
    expect(textContent).toContain("TOOL_NOT_FOUND");
    expect(textContent).toContain("is not registered in MCP Server");
  });
});
