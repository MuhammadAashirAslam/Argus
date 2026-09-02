import type { DebtFinding } from "@argus/agent-core";
import type { DebtRule, ConfigFileType } from "./types.js";
export declare class ConfigDebtEngine {
    private readonly rules;
    registerRule(rule: DebtRule): void;
    getRules(): DebtRule[];
    detectFileType(filePath: string): ConfigFileType | null;
    /**
     * Evaluates content deterministically against registered rules (§16).
     */
    analyzeFile(filePath: string, content: string): DebtFinding[];
}
//# sourceMappingURL=engine.d.ts.map