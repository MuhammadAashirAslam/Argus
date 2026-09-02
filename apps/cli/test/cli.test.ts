import { describe, it, expect } from "vitest";
import { runConfigScan } from "../src/commands/config_scan.js";
import { formatTrajectoryTimeline } from "../src/commands/trace.js";
import { runAnalyze } from "../src/commands/analyze.js";

describe("Developer CLI Commands (§23)", () => {
  it("formats trajectory timeline correctly", () => {
    const timeline = formatTrajectoryTimeline([
      {
        runId: "run_cli_1",
        step: 1,
        agent: "INVESTIGATOR",
        state: "investigating",
        event: "agent.started",
        timestamp: new Date().toISOString(),
      },
    ]);
    expect(timeline).toContain("ARGUS EXECUTION TIMELINE");
    expect(timeline).toContain("INVESTIGATOR -> agent.started");
  });

  it("runs config scan against workspace", async () => {
    const findings = await runConfigScan(process.cwd());
    expect(Array.isArray(findings)).toBe(true);
  });

  it("runs analyze command", async () => {
    const state = await runAnalyze("MuhammadAashirAslam/Argus");
    expect(state.status).toBe("completed");
  });
});
