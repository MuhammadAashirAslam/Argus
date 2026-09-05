import { randomUUID } from "node:crypto";
import type { McpTool, ToolExecutionContext } from "@argus/mcp-server";
import type { Evidence, EvidenceType } from "@argus/agent-core";
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

function getEvidenceTypeForTool(toolName: string): EvidenceType {
  if (toolName.startsWith("git.")) return "GIT_HISTORY";
  if (toolName === "repo.read_file" || toolName === "repo.search") return "SOURCE_SNIPPET";
  if (toolName.startsWith("ci.")) return "LOG_TRACE";
  if (toolName.includes("config")) return "CONFIG_AUDIT";
  return "LOG_TRACE";
}

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

  const capturedEvidence: Evidence[] = [];

  while (iterations < maxIterations) {
    iterations++;

    // Prune oldest intermediate tool rounds if conversation history grows too large
    if (messages.length > 12) {
      const system = messages[0];
      const user = messages[1];
      // Ensure we don't start recent slice with an orphaned 'tool' message
      let sliceStart = messages.length - 6;
      while (sliceStart > 2 && messages[sliceStart]?.role === "tool") {
        sliceStart--;
      }
      const recent = messages.slice(sliceStart);
      messages = [system!, user!, ...recent];
    }

    const isFinalIteration = iterations === maxIterations;
    if (isFinalIteration) {
      messages.push({
        role: "user",
        content:
          "Please summarize your findings and return only the final JSON object now. Include relevant evidenceIds from previous tool outputs.",
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
        const fallbackRes = await options.client.chat(
          [
            messages[0]!,
            messages[1]!,
            {
              role: "user",
              content:
                "Please output the final JSON object directly based on your investigation so far.",
            },
          ],
          { model: options.model },
        );
        fallbackRes.capturedEvidence = capturedEvidence;
        return fallbackRes;
      }
      throw err;
    }

    if (!res.toolCalls || res.toolCalls.length === 0 || isFinalIteration) {
      // The LLM has returned its final response
      res.capturedEvidence = capturedEvidence;
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

      console.log(
        `    ↳ [${options.context.agentId}] Tool: ${toolName}(${JSON.stringify(toolArgs).slice(0, 60)})`,
      );

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

      // Validate tool arguments against schema (§15)
      const parseResult = tool.inputSchema.safeParse(toolArgs);
      if (!parseResult.success) {
        messages.push({
          role: "tool",
          name: toolName,
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            error: "Tool argument schema validation failed",
            issues: parseResult.error.issues,
          }),
        });
        continue;
      }
      const validatedArgs = parseResult.data;

      try {
        const result = await tool.execute(validatedArgs, options.context);
        const evidenceId = randomUUID();
        const evidence: Evidence = {
          id: evidenceId,
          type: getEvidenceTypeForTool(toolName),
          epistemic: "FACT",
          location: (validatedArgs as any)?.filePath
            ? {
                filePath: String((validatedArgs as any).filePath),
                startLine: Number((validatedArgs as any).startLine ?? 1),
                endLine: Number((validatedArgs as any).endLine ?? 1),
              }
            : undefined,
          payload: {
            tool: toolName,
            args: validatedArgs,
            data: result.data ?? {},
          },
          capturedAt: new Date().toISOString(),
          toolSource: `mcp:${toolName}`,
        };
        capturedEvidence.push(evidence);

        let serialized = JSON.stringify({ evidenceId, ...result });
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
  const finalRes = await options.client.chat(
    [
      messages[0]!,
      messages[1]!,
      {
        role: "user",
        content:
          "Please summarize your findings and produce the final JSON response now. Include relevant evidenceIds.",
      },
    ],
    { model: options.model },
  );
  finalRes.capturedEvidence = capturedEvidence;
  return finalRes;
}
