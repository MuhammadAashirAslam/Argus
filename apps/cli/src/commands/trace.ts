import type { AgentEvent } from "@argus/agent-core";

export function formatTrajectoryTimeline(events: AgentEvent[]): string {
  if (events.length === 0) {
    return "No trajectory events found.";
  }

  const lines: string[] = ["ARGUS EXECUTION TIMELINE:", "--------------------------------"];

  for (const e of events) {
    const time = new Date(e.timestamp).toLocaleTimeString();
    const toolInfo = e.tool ? ` [tool: ${e.tool}]` : "";
    lines.push(`${time} [Step ${e.step}] ${e.agent} -> ${e.event}${toolInfo}`);
  }

  return lines.join("\n");
}
