import { describe, it, expect } from "vitest";
import { TrajectoryLogger, redactSecrets } from "../src/logger.js";
import type { AgentEvent } from "@argus/agent-core";

describe("TrajectoryLogger & Secret Redaction", () => {
  it("redacts sensitive tokens, api keys, and passwords", () => {
    const rawText = "Connecting with token: ghp_1234567890abcdefghijklmnopqrstuvwxyz and Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    const redacted = redactSecrets(rawText);

    expect(redacted).not.toContain("ghp_1234567890abcdefghijklmnopqrstuvwxyz");
    expect(redacted).toContain("[REDACTED_SECRET]");
  });

  it("logs and filters agent events", () => {
    const logger = new TrajectoryLogger();

    const event1: AgentEvent = {
      runId: "run_test_1",
      step: 1,
      agent: "INVESTIGATOR",
      state: "investigating",
      event: "agent.started",
      timestamp: new Date().toISOString(),
    };

    const event2: AgentEvent = {
      runId: "run_test_1",
      step: 2,
      agent: "ANALYZER",
      state: "diagnosing",
      event: "agent.started",
      timestamp: new Date().toISOString(),
    };

    logger.logEvent(event1);
    logger.logEvent(event2);

    expect(logger.getEvents().length).toBe(2);
    expect(logger.getEventsForAgent("INVESTIGATOR").length).toBe(1);
    expect(logger.getEventsForAgent("ANALYZER").length).toBe(1);
  });
});
