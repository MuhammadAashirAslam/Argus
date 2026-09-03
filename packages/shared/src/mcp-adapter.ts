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

const MAX_TOOL_OUTPUT_CHARS = 4000;

export async function executeLLMWithTools(
  messages: LLMMessage[],
  options: LLMToolAdapterOptions,
): Promise<LLMResponse> {
  const maxIterations = options.maxIterations ?? 6;
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

    // On the final iteration, omit tools so the model is forced to synthesize its final answer
    const isFinalIteration = iterations === maxIterations;
    const res = await options.client.chat(messages, {
      model: options.model,
      tools: isFinalIteration ? undefined : openAiTools,
    });

    if (!res.toolCalls || res.toolCalls.length === 0 || isFinalIteration) {
      // The LLM has returned its final response
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
      let toolArgs: any = {};
      try {
        toolArgs = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        toolArgs = {};
      }

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
        let serialized = JSON.stringify(result);
        if (serialized.length > MAX_TOOL_OUTPUT_CHARS) {
          serialized = serialized.slice(0, MAX_TOOL_OUTPUT_CHARS) + " ... [truncated]";
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: serialized,
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

  // Graceful fallback if reached
  return options.client.chat(
    [
      ...messages,
      {
        role: "user",
        content: "Please summarize your findings and produce the final JSON response now.",
      },
    ],
    { model: options.model },
  );
}
