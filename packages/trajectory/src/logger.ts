import type { AgentEvent } from "@argus/agent-core";

const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]{36}/g,
  /xox[baprs]-[a-zA-Z0-9]{10,}/g,
  /(Bearer\s+)[a-zA-Z0-9_\-\.]{20,}/gi,
  /(["']?(?:password|token|secret|apiKey)["']?\s*[:=]\s*["']?)[^"'\s]{8,}(["']?)/gi,
];

export function redactSecrets(text: string): string {
  let redacted = text;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, "$1[REDACTED_SECRET]$2");
  }
  return redacted;
}

export class TrajectoryLogger {
  private readonly events: AgentEvent[] = [];

  public logEvent(event: AgentEvent): void {
    const sanitizedEvent: AgentEvent = {
      ...event,
      tool: event.tool ? redactSecrets(event.tool) : undefined,
    };
    this.events.push(sanitizedEvent);
  }

  public getEvents(): AgentEvent[] {
    return [...this.events];
  }

  public getEventsForAgent(agentName: string): AgentEvent[] {
    return this.events.filter((e) => e.agent === agentName);
  }
}
