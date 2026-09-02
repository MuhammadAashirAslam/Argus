import type { AgentEnvelope } from "@argus/agent-core";

export function buildSystemPrompt(role: string, customInstructions: string = ""): string {
  let base = `You are ARGUS ${role}, a specialized AI agent in an autonomous software engineering system.\n`;
  base += `Your job is to analyze data deterministically and provide structured output.\n`;
  base += `Always stick to facts and evidence provided to you. Do not hallucinate code or facts.\n`;
  if (customInstructions) {
    base += `\n${customInstructions}\n`;
  }
  return base;
}

export function buildUserPrompt(envelope: AgentEnvelope, evidence: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      task: envelope.payload,
      evidence,
    },
    null,
    2,
  );
}
