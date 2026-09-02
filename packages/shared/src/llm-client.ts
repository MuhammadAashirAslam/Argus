import { z } from "zod";
import { loadEnvFile } from "./env.js";

// ── Schemas ────────────────────────────────────────────────

export const LLMMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string().nullable().optional(),
  tool_calls: z.array(z.any()).optional(),
  tool_call_id: z.string().optional(),
});

export const LLMRequestSchema = z.object({
  model: z.string(),
  messages: z.array(LLMMessageSchema).min(1),
  temperature: z.number().min(0).max(2).default(0.2),
  max_tokens: z.number().int().positive().default(4096),
  response_format: z.object({ type: z.enum(["text", "json_object"]) }).optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
});

export const LLMUsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
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
  /** 70B — complex reasoning (Analyzer, Patch Agent) */
  LARGE: "llama-3.3-70b-versatile",
  /** 8B — fast tasks (Investigator, Historian, Configuration) */
  FAST: "llama-3.1-8b-instant",
} as const;

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
    loadEnvFile();
    this.apiKey = options.apiKey ?? process.env["GROQ_API_KEY"] ?? "";
    this.baseUrl = options.baseUrl ?? "https://api.groq.com/openai/v1";
    this.defaultModel = options.defaultModel ?? GROQ_MODELS.FAST;
    this.maxRetries = options.maxRetries ?? 3;

    // API key check is deferred to chat() to allow instantiation in test environments
  }

  /**
   * Send a chat completion request to Groq.
   * Retries on 429 (rate limit) and 5xx with exponential backoff.
   */
  async chat(
    messages: LLMMessage[],
    options: {
      model?: string | undefined;
      temperature?: number | undefined;
      maxTokens?: number | undefined;
      jsonMode?: boolean | undefined;
      tools?: any[];
      toolChoice?: any;
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
          const waitMs = Math.min(1000 * 2 ** attempt, 10000);
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(`Groq API error ${res.status}: ${errBody}`);
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
          model,
          durationMs,
          finishReason: choice?.finish_reason ?? "unknown",
          toolCalls: choice?.message?.tool_calls,
        };
      } catch (err: any) {
        lastError = err;
        if (attempt < this.maxRetries - 1) {
          const waitMs = Math.min(1000 * 2 ** attempt, 10000);
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
    }
    throw lastError ?? new Error("LLM request failed after retries");
  }

  /**
   * Convenience: send a single user prompt and get text back.
   */
  async prompt(
    userMessage: string,
    systemMessage?: string,
    options?: { model?: string; jsonMode?: boolean },
  ): Promise<string> {
    const messages: LLMMessage[] = [];
    if (systemMessage) {
      messages.push({ role: "system", content: systemMessage });
    }
    messages.push({ role: "user", content: userMessage });
    const res = await this.chat(messages, options);
    return res.content;
  }

  /**
   * Send a prompt and parse the JSON response.
   * Uses Groq's json_object response format for guaranteed valid JSON.
   */
  async promptJSON<T = unknown>(
    userMessage: string,
    systemMessage?: string,
    options?: { model?: string },
  ): Promise<T> {
    const content = await this.prompt(userMessage, systemMessage, {
      ...options,
      jsonMode: true,
    });
    return JSON.parse(content) as T;
  }

  /** Current budget statistics */
  getUsageStats(): { totalTokens: number; totalCalls: number; totalDurationMs: number } {
    return {
      totalTokens: this.totalTokens,
      totalCalls: this.totalCalls,
      totalDurationMs: this.totalDurationMs,
    };
  }
}
