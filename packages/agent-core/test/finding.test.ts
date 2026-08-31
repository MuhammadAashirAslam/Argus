import { describe, it, expect } from "vitest";
import { FindingSchema, DebtFindingSchema } from "../src/schemas/finding.js";
import { EvidenceSchema } from "../src/schemas/evidence.js";

describe("FindingSchema and EvidenceSchema", () => {
  it("enforces grounded evidence IDs in findings", () => {
    const evidenceId = "550e8400-e29b-41d4-a716-446655440001";
    const validEvidence = {
      id: evidenceId,
      type: "CONFIG_AUDIT",
      epistemic: "FACT",
      payload: { rule: "CD001" },
      capturedAt: new Date().toISOString(),
      toolSource: "config.analyze_github_actions",
    };
    expect(EvidenceSchema.parse(validEvidence).id).toBe(evidenceId);

    const validFinding = {
      id: "550e8400-e29b-41d4-a716-446655440002",
      title: "Unpinned GitHub Action detected",
      description: "actions/checkout is using @master instead of full SHA commit",
      severity: "HIGH",
      epistemic: "INFERENCE",
      confidence: 0.95,
      evidenceIds: [evidenceId],
      tags: ["security", "github-actions"],
      createdAt: new Date().toISOString(),
    };
    expect(FindingSchema.parse(validFinding).confidence).toBe(0.95);
  });

  it("rejects findings without evidence IDs", () => {
    const ungroundedFinding = {
      id: "550e8400-e29b-41d4-a716-446655440002",
      title: "Hallucinated assertion",
      description: "No tool evidence backing this up",
      severity: "HIGH",
      confidence: 1.0,
      evidenceIds: [], // Empty evidenceIds rejected
      createdAt: new Date().toISOString(),
    };
    expect(() => FindingSchema.parse(ungroundedFinding)).toThrow();
  });

  it("validates deterministic DebtFinding schema", () => {
    const debt = {
      ruleId: "CD001",
      title: "Unpinned Action",
      severity: "high",
      file: ".github/workflows/ci.yml",
      line: 14,
      evidence: "uses: actions/checkout@v2",
      recommendation: "Pin action to immutable full commit SHA",
    };
    expect(DebtFindingSchema.parse(debt).ruleId).toBe("CD001");
  });
});
