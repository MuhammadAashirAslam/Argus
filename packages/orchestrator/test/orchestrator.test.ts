import { describe, it, expect } from "vitest";
import { Orchestrator } from "../src/orchestrator.js";
import { InvestigatorAgent } from "../../../agents/investigator/src/index.js";
import { AnalyzerAgent } from "../../../agents/analyzer/src/index.js";

describe("Orchestrator multi-agent coordination", () => {
  it("registers specialized agents and runs investigation cycle", async () => {
    const orchestrator = new Orchestrator();
    const investigator = new InvestigatorAgent();
    const analyzer = new AnalyzerAgent();

    orchestrator.registerAgent(investigator);
    orchestrator.registerAgent(analyzer);

    expect(orchestrator.getAgent("INVESTIGATOR")).toBe(investigator);
    expect(orchestrator.getAgent("ANALYZER")).toBe(analyzer);

    const runState = await orchestrator.executeRun({
      repository: "MuhammadAashirAslam/Argus",
      objective: "Investigate repository configuration debt and code health",
    });

    expect(runState.status).toBe("completed");
    expect(runState.relevantFiles.length).toBeGreaterThan(0);
    expect(runState.trajectory.length).toBeGreaterThanOrEqual(2);

    const events = orchestrator.trajectory.getEvents();
    expect(events.some((e) => e.event === "agent.started")).toBe(true);
    expect(events.some((e) => e.event === "agent.completed")).toBe(true);
  });
});
