import type { DebtRule } from "@argus/agent-core";
import { CD001_UnpinnedAction } from "./github-actions/cd001_unpinned_action.js";
import { CD002_FloatingDependency } from "./github-actions/cd002_floating_dependency.js";
import { CD003_HardcodedSecrets } from "./github-actions/cd003_hardcoded_secrets.js";
import { CD004_DuplicatedWorkflowLogic } from "./github-actions/cd004_duplicated_workflow.js";
import { CD005_ExcessiveWorkflowComplexity } from "./github-actions/cd005_workflow_complexity.js";
import { CD101_FloatingBaseImage } from "./docker/cd101_floating_image.js";
import { CD102_UnspecifiedBaseImageVersion } from "./docker/cd102_unspecified_version.js";
import { CD103_ExcessiveImageLayers } from "./docker/cd103_excessive_layers.js";
import { CD104_InefficientPackageInstallation } from "./docker/cd104_inefficient_package_install.js";
import { CD105_RootExecution } from "./docker/cd105_root_execution.js";

export * from "./github-actions/index.js";
export * from "./docker/index.js";

export const ALL_BUILT_IN_RULES: DebtRule[] = [
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
];

export function getAllBuiltInRules(): DebtRule[] {
  return ALL_BUILT_IN_RULES;
}
