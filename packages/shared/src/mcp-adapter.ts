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

const MAX_TOOL_OUTPUT_CHARS = 1200;

export async function executeLLMWithTools(
  messages: LLMMessage[],
  options: LLMToolAdapterOptions,
): Promise<LLMResponse> {
  const maxIterations = options.maxIterations ?? 4;
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

    // Prune intermediate messages if conversation history grows too large for TPM limits
    if (messages.length > 6) {
      const system = messages[0];
      const user = messages[1];
      const recent = messages.slice(-3);
      messages = [system!, user!, ...recent];
    }

    const isFinalIteration = iterations === maxIterations;
    if (isFinalIteration) {
      messages.push({
        role: "user",
        content: "Please summarize your findings and return only the final JSON object now.",
      });
    }

    let res: LLMResponse;
    try {
      res = await options.client.chat(messages, {
        model: options.model,
        tools: openAiTools,
      });
    } catch (err: any) {
      // If Groq complains about tool_use_failed, fallback to requesting final JSON directly
      if (err.message?.includes("tool_use_failed")) {
        console.log(`    ↳ [${options.context.agentId}] Synthesizing final JSON response...`);
        return options.client.chat(
          [
            messages[0]!,
            messages[1]!,
            {
              role: "user",
              content: "Please output the final JSON object directly based on your investigation so far.",
            },
          ],
          { model: options.model },
        );
      }
      throw err;
    }

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

      console.log(`    ↳ [${options.context.agentId}] Tool: ${toolName}(${JSON.stringify(toolArgs).slice(0, 60)})`);

      const tool = toolsMap.get(toolName);
      if (!tool) {
        messages.push({
          role: "tool",
          name: toolName,
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
          name: toolName,
          tool_call_id: toolCall.id,
          content: serialized,
        });
      } catch (err: any) {
        messages.push({
          role: "tool",
          name: toolName,
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: err.message || String(err) }),
        });
      }
    }
  }

  // Graceful fallback if reached
  return options.client.chat(
    [
      messages[0]!,
      messages[1]!,
      {
        role: "user",
        content: "Please summarize your findings and produce the final JSON response now.",
      },
    ],
    { model: options.model },
  );
}
