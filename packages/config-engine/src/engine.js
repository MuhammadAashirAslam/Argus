import YAML from "yaml";
export class ConfigDebtEngine {
    rules = new Map();
    registerRule(rule) {
        if (this.rules.has(rule.id)) {
            throw new Error(`Rule with ID '${rule.id}' is already registered.`);
        }
        this.rules.set(rule.id, rule);
    }
    getRules() {
        return Array.from(this.rules.values());
    }
    detectFileType(filePath) {
        const normalized = filePath.replace(/\\/g, "/").toLowerCase();
        if (normalized.includes(".github/workflows/") && (normalized.endsWith(".yml") || normalized.endsWith(".yaml"))) {
            return "GITHUB_ACTIONS";
        }
        if (normalized.endsWith("dockerfile") || normalized.includes("dockerfile.")) {
            return "DOCKERFILE";
        }
        return null;
    }
    /**
     * Evaluates content deterministically against registered rules (§16).
     */
    analyzeFile(filePath, content) {
        const fileType = this.detectFileType(filePath);
        if (!fileType) {
            return [];
        }
        const lines = content.split("\n");
        let parsedAst = undefined;
        if (fileType === "GITHUB_ACTIONS") {
            try {
                parsedAst = YAML.parse(content);
            }
            catch {
                parsedAst = undefined;
            }
        }
        const context = {
            filePath,
            fileType,
            rawContent: content,
            parsedAst,
            lines,
        };
        const findings = [];
        for (const rule of this.rules.values()) {
            if (rule.fileType === fileType) {
                const ruleFindings = rule.evaluate(context);
                findings.push(...ruleFindings);
            }
        }
        return findings;
    }
}
//# sourceMappingURL=engine.js.map