import { z } from "zod";
import { loadEnvFile } from "./env.js";

// ── Canonical Schemas ────────────────────────────────────────

export const LLMMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().nullable().optional(),
  name: z.string().optional(),
  tool_calls: z.array(z.any()).optional(),
  tool_call_id: z.string().optional(),
});

export const LLMRequestSchema = z.object({
  model: z.string(),
  messages: z.array(LLMMessageSchema),
  temperature: z.number().min(0).max(2).optional().default(0.2),
  max_tokens: z.number().positive().optional().default(4096),
  response_format: z.object({ type: z.enum(["text", "json_object"]) }).optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
});

export const LLMUsageSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
});

export type LLMMessage = z.infer<typeof LLMMessageSchema>;
export type LLMRequest = z.infer<typeof LLMRequestSchema>;
export type LLMUsage = z.infer<typeof LLMUsageSchema>;

export interface LLMResponse {
  content: string;
  usage: LLMUsage;
  model: string;
  durationMs: number;
  finishReason: string;
  toolCalls?: any[];
}

// ── Models ─────────────────────────────────────────────────

export const GROQ_MODELS = {
  /** Fast / Instant reasoning (Investigator, Analyzer, Patch) */
  get LARGE(): string {
    return process.env["GROQ_LARGE_MODEL"] ?? process.env["GROQ_MODEL"] ?? "openai/gpt-oss-20b";
  },
  /** Fast tasks (Historian, Configuration) */
  get FAST(): string {
    return process.env["GROQ_FAST_MODEL"] ?? process.env["GROQ_MODEL"] ?? "openai/gpt-oss-20b";
  },
};

// ── Client ─────────────────────────────────────────────────

export interface LLMClientOptions {
  apiKey?: string | undefined;
  baseUrl?: string | undefined;
  defaultModel?: string | undefined;
  maxRetries?: number | undefined;
}

export class LLMClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;
  private readonly maxRetries: number;

  /** Running totals for budget tracking */
  public totalTokens = 0;
  public totalCalls = 0;
  public totalDurationMs = 0;

  constructor(options: LLMClientOptions = {}) {
    loadEnvFile(process.cwd());
    this.apiKey = options.apiKey ?? process.env["GROQ_API_KEY"] ?? "";
    this.baseUrl = options.baseUrl ?? "https://api.groq.com/openai/v1";
    this.defaultModel = options.defaultModel ?? GROQ_MODELS.FAST;
    this.maxRetries = options.maxRetries ?? 5;
  }

  /**
   * Send a chat completion request to Groq.
   * Retries on 429 (rate limit) and 5xx with smart backoff.
   */
  async chat(
    messages: LLMMessage[],
    options: {
      model?: string | undefined;
      temperature?: number | undefined;
      maxTokens?: number | undefined;
      jsonMode?: boolean | undefined;
      tools?: any[] | undefined;
      toolChoice?: any | undefined;
    } = {},
  ): Promise<LLMResponse> {
    const apiKey = this.apiKey || process.env["GROQ_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "GROQ_API_KEY is not set. Put it in .env.local or set it as an environment variable.",
      );
    }

    const model = options.model ?? this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
    };
    if (options.jsonMode) {
      body["response_format"] = { type: "json_object" };
    }
    if (options.tools && options.tools.length > 0) {
      body["tools"] = options.tools;
      if (options.toolChoice) {
        body["tool_choice"] = options.toolChoice;
      }
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      const start = Date.now();
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (res.status === 429 || res.status >= 500) {
          const errBody = await res.text();
          lastError = new Error(`Groq API error ${res.status}: ${errBody}`);

          // Parse retry time if provided (e.g. "Please try again in 3.3s")
          let waitMs = Math.max(3000, 2000 * 2 ** attempt);
          const match = errBody.match(/try again in ([\d.]+)s/i);
          if (match && match[1]) {
            const seconds = parseFloat(match[1]);
            waitMs = Math.ceil(seconds * 1000) + 1000;
          }

          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (!res.ok) {
          const errBody = await res.text();
          lastError = new Error(`Groq API error ${res.status}: ${errBody}`);
          throw lastError;
        }

        const json = (await res.json()) as any;
        const choice = json.choices?.[0];
        const usage: LLMUsage = {
          prompt_tokens: json.usage?.prompt_tokens ?? 0,
          completion_tokens: json.usage?.completion_tokens ?? 0,
          total_tokens: json.usage?.total_tokens ?? 0,
        };
        const durationMs = Date.now() - start;

        this.totalTokens += usage.total_tokens;
        this.totalCalls += 1;
        this.totalDurationMs += durationMs;

        return {
          content: choice?.message?.content ?? "",
          usage,
          model: json.model ?? model,
          durationMs,
          finishReason: choice?.finish_reason ?? "unknown",
          toolCalls: choice?.message?.tool_calls,
        };
      } catch (err: any) {
        lastError = err;
        if (attempt < this.maxRetries - 1) {
          const waitMs = Math.min(2000 * 2 ** attempt, 8000);
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    }

    throw lastError ?? new Error("LLM request failed after retries");
  }

  /**
   * Convenience method for single-turn prompt → string response.
   */
  async prompt(
    promptText: string,
    systemPrompt?: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<string> {
    const messages: LLMMessage[] = [];
    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: promptText });

    const res = await this.chat(messages, options);
    return res.content;
  }

  /**
   * Convenience method for single-turn prompt expecting JSON output.
   */
  async promptJSON<T>(
    promptText: string,
    systemPrompt?: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {},
  ): Promise<T> {
    const sys = systemPrompt
      ? `${systemPrompt}\nYou MUST respond with valid JSON only. No markdown formatting, no code blocks.`
      : "You MUST respond with valid JSON only. No markdown formatting, no code blocks.";

    const content = await this.prompt(promptText, sys, {
      ...options,
    });

    const trimmed = content.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");

    if (jsonStart !== -1 && jsonEnd !== -1) {
      return JSON.parse(trimmed.substring(jsonStart, jsonEnd + 1)) as T;
    }

    return JSON.parse(trimmed) as T;
  }

  /**
   * Get current usage statistics.
   */
  getUsageStats(): {
    totalTokens: number;
    totalCalls: number;
    totalDurationMs: number;
  } {
    return {
      totalTokens: this.totalTokens,
      totalCalls: this.totalCalls,
      totalDurationMs: this.totalDurationMs,
    };
  }
}
