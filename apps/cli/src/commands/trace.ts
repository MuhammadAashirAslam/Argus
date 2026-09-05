import type { AgentEvent } from "@argus/agent-core";
import { TrajectoryLogger } from "@argus/trajectory";

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

export async function runTrace(runId: string, baseDir: string = process.cwd()): Promise<string> {
  try {
    const events = await TrajectoryLogger.load(runId, baseDir);
    return formatTrajectoryTimeline(events);
  } catch (err: any) {
    throw new Error(`Failed to load trajectory for run '${runId}': ${err?.message || String(err)}`);
  }
}
