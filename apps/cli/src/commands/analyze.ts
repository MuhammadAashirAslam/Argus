import { Orchestrator } from "@argus/orchestrator";
import type { RunState } from "@argus/agent-core";
import { InvestigatorAgent } from "@argus/agent-investigator";
import { AnalyzerAgent } from "@argus/agent-analyzer";
import { PatchAgent } from "@argus/agent-patch";
import { VerifierAgent } from "@argus/agent-verifier";
import { ConfigurationAgent } from "@argus/agent-configuration";
import { HistorianAgent } from "@argus/agent-historian";

export async function runAnalyze(repo: string, prNumber?: number, objective?: string): Promise<RunState> {
  const orchestrator = new Orchestrator();

  orchestrator.registerAgent(new InvestigatorAgent());
  orchestrator.registerAgent(new AnalyzerAgent());
  orchestrator.registerAgent(new ConfigurationAgent());
  orchestrator.registerAgent(new HistorianAgent());
  orchestrator.registerAgent(new PatchAgent());
  orchestrator.registerAgent(new VerifierAgent());

  const runState = await orchestrator.executeRun({
    repository: repo,
    pullRequest: prNumber,
    objective: objective ?? `Automated analysis for ${repo}${prNumber ? ` PR #${prNumber}` : ""}`,
  });

  return runState;
}
