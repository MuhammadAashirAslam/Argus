import { Orchestrator } from "@argus/orchestrator";
import type { RunState } from "@argus/agent-core";

export async function runAnalyze(repo: string, prNumber?: number, objective?: string): Promise<RunState> {
  const orchestrator = new Orchestrator();

  const runState = await orchestrator.executeRun({
    repository: repo,
    pullRequest: prNumber,
    objective: objective ?? `Automated analysis for ${repo}${prNumber ? ` PR #${prNumber}` : ""}`,
  });

  return runState;
}
