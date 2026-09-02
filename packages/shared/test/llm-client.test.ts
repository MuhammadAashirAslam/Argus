import { describe, it, expect, vi, beforeEach } from "vitest";
import { LLMClient } from "../src/llm-client.js";

describe("LLMClient", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "mocked response" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      }),
    );
  });

  it("should send a basic prompt and return content", async () => {
    const client = new LLMClient({ apiKey: "test-key" });
    const res = await client.prompt("hello");
    expect(res).toBe("mocked response");
    expect(client.getUsageStats().totalCalls).toBe(1);
    expect(client.getUsageStats().totalTokens).toBe(15);
  });

  it("should throw if no API key is provided and none in env", async () => {
    const originalEnv = process.env["GROQ_API_KEY"];
    delete process.env["GROQ_API_KEY"];
    const client = new LLMClient();
    await expect(client.prompt("hello")).rejects.toThrow(/GROQ_API_KEY is not set/);
    if (originalEnv) {
      process.env["GROQ_API_KEY"] = originalEnv;
    }
  });
});
