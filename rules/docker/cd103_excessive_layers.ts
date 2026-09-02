import type { DebtRule, ParsedConfigContext } from "@argus/config-engine";
import type { DebtFinding } from "@argus/agent-core";

const MAX_RECOMMENDED_RUN_LAYERS = 8;

export const CD103_ExcessiveImageLayers: DebtRule = {
  id: "CD103",
  title: "Excessive Image Layers",
  fileType: "DOCKERFILE",
  severity: "low",
  version: "1.0.0",

  evaluate(context: ParsedConfigContext): DebtFinding[] {
    const findings: DebtFinding[] = [];
    const runInstructions = context.lines.filter((l) => /^\s*RUN\s+/i.test(l));

    if (runInstructions.length > MAX_RECOMMENDED_RUN_LAYERS) {
      findings.push({
        ruleId: "CD103",
        title: "Excessive Image Layers",
        severity: "low",
        file: context.filePath,
        evidence: `Dockerfile contains ${runInstructions.length} individual RUN instructions (threshold: ${MAX_RECOMMENDED_RUN_LAYERS})`,
        recommendation: "Combine consecutive RUN commands using '&&' into single layers and clean up temporary cache files to reduce overall container image size.",
      });
    }

    return findings;
  },
};
