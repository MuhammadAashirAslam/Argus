import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildStandardToolRegistry } from "@argus/cli";
import { createArgusMcpServer } from "@argus/mcp-server";

describe("ARGUS E2E Model Context Protocol (MCP) Server (§13, §14)", () => {
  async function createMcpClientServerPair() {
    const registry = buildStandardToolRegistry();
    const server = createArgusMcpServer(registry, {
      name: "argus-e2e-mcp-server",
      version: "0.1.0",
      defaultWorkspace: process.cwd(),
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client(
      { name: "argus-e2e-test-client", version: "1.0.0" },
      { capabilities: {} },
    );
    await client.connect(clientTransport);

    return { client, server, registry };
  }

  it("lists all canonical ARGUS MCP tools (§13) with typed input schemas", async () => {
    const { client } = await createMcpClientServerPair();
    const listResult = await client.listTools();

    expect(listResult.tools.length).toBeGreaterThanOrEqual(19);

    const toolNames = listResult.tools.map((t) => t.name);

    // Repository Tools
    expect(toolNames).toContain("repo.read_file");
    expect(toolNames).toContain("repo.search");
    expect(toolNames).toContain("repo.list_files");
    expect(toolNames).toContain("repo.get_diff");
    expect(toolNames).toContain("repo.get_dependencies");

    // Git Tools
    expect(toolNames).toContain("git.log");
    expect(toolNames).toContain("git.status");
    expect(toolNames).toContain("git.diff");
    expect(toolNames).toContain("git.show_commit");
    expect(toolNames).toContain("git.blame");

    // GitHub & CI Tools
    expect(toolNames).toContain("github.get_pull_request");
    expect(toolNames).toContain("github.get_pull_request_files");
    expect(toolNames).toContain("github.get_issues");
    expect(toolNames).toContain("github.get_comments");
    expect(toolNames).toContain("ci.list_workflows");
    expect(toolNames).toContain("ci.get_runs");
    expect(toolNames).toContain("ci.get_logs");

    // Config Tools
    expect(toolNames).toContain("config.analyze_dockerfile");
    expect(toolNames).toContain("config.analyze_github_actions");

    // Check schema formatting on a sample tool
    const readFileTool = listResult.tools.find((t) => t.name === "repo.read_file");
    expect(readFileTool?.description).toContain("Read the contents of a file");
    expect(readFileTool?.inputSchema.type).toBe("object");
    expect((readFileTool?.inputSchema as any).properties).toHaveProperty("filePath");
  });

  it("executes repo.list_files via MCP callTool and receives structured response", async () => {
    const { client } = await createMcpClientServerPair();

    const result = await client.callTool({
      name: "repo.list_files",
      arguments: { path: "." },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: "text"; text: string };
    const data = JSON.parse(content.text);

    expect(data).toHaveProperty("files");
    expect(Array.isArray(data.files)).toBe(true);
    expect(data.files.length).toBeGreaterThan(0);
    expect(data.files).toContain("package.json");
  });

  it("executes git.status via MCP callTool", async () => {
    const { client } = await createMcpClientServerPair();

    const result = await client.callTool({
      name: "git.status",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: "text"; text: string };
    const data = JSON.parse(content.text);

    expect(data).toHaveProperty("branch");
    expect(data).toHaveProperty("clean");
  });

  it("executes config.analyze_dockerfile via MCP callTool", async () => {
    const { client } = await createMcpClientServerPair();

    const result = await client.callTool({
      name: "config.analyze_dockerfile",
      arguments: { directory: "." },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);
    const content = result.content[0] as { type: "text"; text: string };
    const data = JSON.parse(content.text);

    expect(data).toHaveProperty("findings");
    expect(Array.isArray(data.findings)).toBe(true);
  });

  it("rejects callTool with invalid arguments and returns schema error", async () => {
    const { client } = await createMcpClientServerPair();

    // repo.read_file requires filePath string
    const result = await client.callTool({
      name: "repo.read_file",
      arguments: {},
    });

    expect(result.isError).toBe(true);
    const content = result.content[0] as { type: "text"; text: string };
    expect(content.text).toContain("INVALID_TOOL_INPUT");
  });
});
