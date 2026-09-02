import type { McpTool, ToolExecutionContext } from "@argus/mcp-server";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { LLMClient, LLMMessage, LLMResponse } from "./llm-client.js";

export interface LLMToolAdapterOptions {
  client: LLMClient;
  model?: string;
  tools: McpTool[];
  context: ToolExecutionContext;
  maxIterations?: number;
}

export async function executeLLMWithTools(
  messages: LLMMessage[],
  options: LLMToolAdapterOptions,
): Promise<LLMResponse> {
  const maxIterations = options.maxIterations ?? 10;
  let iterations = 0;

  const openAiTools = options.tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.inputSchema),
    },
  }));

  const toolsMap = new Map(options.tools.map((t) => [t.name, t]));

  while (iterations < maxIterations) {
    iterations++;

    const res = await options.client.chat(messages, {
      model: options.model,
      tools: openAiTools,
    });

    if (!res.toolCalls || res.toolCalls.length === 0) {
      // The LLM has chosen to return a final response without tools
      return res;
    }

    // Append the assistant's message with the tool_calls
    messages.push({
      role: "assistant",
      content: res.content || null,
      tool_calls: res.toolCalls,
    });

    // Execute each tool
    for (const toolCall of res.toolCalls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

      const tool = toolsMap.get(toolName);
      if (!tool) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: `Tool ${toolName} not found` }),
        });
        continue;
      }

      try {
        const result = await tool.execute(toolArgs, options.context);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      } catch (err: any) {
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: err.message || String(err) }),
        });
      }
    }
  }

  throw new Error(`Max iterations (${maxIterations}) reached while executing tools.`);
}
