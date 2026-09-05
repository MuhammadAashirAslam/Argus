import { describe, it, expect } from "vitest";
import { ConfigDebtEngine } from "../src/engine.js";
import {
  CD001_UnpinnedAction,
  CD002_FloatingDependency,
  CD003_HardcodedSecrets,
  CD004_DuplicatedWorkflowLogic,
  CD005_ExcessiveWorkflowComplexity,
  CD101_FloatingBaseImage,
  CD102_UnspecifiedBaseImageVersion,
  CD103_ExcessiveImageLayers,
  CD104_InefficientPackageInstallation,
  CD105_RootExecution,
} from "@argus/rules";

describe("All 10 PRD Configuration Debt Rules (§15)", () => {
  const engine = new ConfigDebtEngine();
  [
    CD001_UnpinnedAction,
    CD002_FloatingDependency,
    CD003_HardcodedSecrets,
    CD004_DuplicatedWorkflowLogic,
    CD005_ExcessiveWorkflowComplexity,
    CD101_FloatingBaseImage,
    CD102_UnspecifiedBaseImageVersion,
    CD103_ExcessiveImageLayers,
    CD104_InefficientPackageInstallation,
    CD105_RootExecution,
  ].forEach((r) => engine.registerRule(r));

  it("registers all 10 deterministic rules exactly", () => {
    expect(engine.getRules().length).toBe(10);
  });

  it("evaluates CD002 (Floating Dependency)", () => {
    const yaml = "steps:\n  - run: npm install lodash";
    const findings = engine.analyzeFile(".github/workflows/ci.yml", yaml);
    expect(findings.some((f) => f.ruleId === "CD002")).toBe(true);
  });

  it("evaluates CD004 (Duplicated Workflow Logic)", () => {
    const cmd =
      "run: echo 'very long command string that repeats across multiple steps in the workflow file'";
    const yaml = `steps:\n  - ${cmd}\n  - ${cmd}`;
    const findings = engine.analyzeFile(".github/workflows/ci.yml", yaml);
    expect(findings.some((f) => f.ruleId === "CD004")).toBe(true);
  });

  it("evaluates CD102 (Unspecified Base Image Version)", () => {
    const dockerfile = "FROM ubuntu\nCMD ['bash']";
    const findings = engine.analyzeFile("Dockerfile", dockerfile);
    expect(findings.some((f) => f.ruleId === "CD102")).toBe(true);
  });

  it("evaluates CD103 (Excessive Image Layers)", () => {
    const runs = Array.from({ length: 10 }, (_, i) => `RUN echo layer_${i}`).join("\n");
    const findings = engine.analyzeFile("Dockerfile", runs);
    expect(findings.some((f) => f.ruleId === "CD103")).toBe(true);
  });

  it("evaluates CD104 (Inefficient Package Installation)", () => {
    const dockerfile = "FROM alpine:3.19\nRUN apk add curl";
    const findings = engine.analyzeFile("Dockerfile", dockerfile);
    expect(findings.some((f) => f.ruleId === "CD104")).toBe(true);
  });
});
