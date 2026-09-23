import type {
  AgentAction,
  AgentActionType,
  ActionGraphValidationResult,
  NormalizedActionNode,
} from './types';

export const MAX_ACTIONS_PER_CYCLE = 20;

const DEFAULT_CAPABILITY_MAP: Record<AgentActionType, string> = {
  READ_FILE: 'fs_read_file',
  WRITE_FILE: 'fs_write_file',
  CREATE_FILE: 'fs_create_file',
  DELETE_FILE: 'fs_delete_file',
  RUN_COMMAND: 'run_system_command',
  SEARCH_PROJECT: 'fs_search_files',
  INSPECT_APPLICATION: 'blender.inspect_scene',
  MODIFY_APPLICATION: 'blender.mutate_scene',
  REQUEST_USER_APPROVAL: 'request_user_approval',
  OBSERVE: 'application_observe',
  VERIFY: 'application_verify',
  COMPLETE: 'session_complete',
};

/**
 * ActionNormalizer
 *
 * Responsibilities:
 * 1. Discard non-authoritative model IDs and assign fresh normalized UUIDs (H-01).
 * 2. Remap dependsOn references and validate dependency graph integrity.
 * 3. BLOCK 2: Perform topological cycle detection. Return ZERO actions if a cycle is detected.
 * 4. H-07: Sanitize args by stripping __proto__, constructor, and prototype properties.
 * 5. Map AgentActionType to default capabilityId if omitted.
 * 6. Enforce MAX_ACTIONS_PER_CYCLE cap (20).
 */
export class ActionNormalizer {
  static normalize(rawActions: any[]): {
    actions: AgentAction[];
    validationResult: ActionGraphValidationResult;
  } {
    if (!Array.isArray(rawActions) || rawActions.length === 0) {
      return {
        actions: [],
        validationResult: { valid: true },
      };
    }

    if (rawActions.length > MAX_ACTIONS_PER_CYCLE) {
      return {
        actions: [],
        validationResult: {
          valid: false,
          reason: `Action count (${rawActions.length}) exceeds MAX_ACTIONS_PER_CYCLE (${MAX_ACTIONS_PER_CYCLE})`,
        },
      };
    }

    const idMap = new Map<string, string>(); // modelId -> normalizedId
    const missingReferences = new Set<string>();
    const duplicateIds = new Set<string>();

    // 1. Build ID mapping and check duplicate model-provided IDs
    rawActions.forEach((raw, idx) => {
      const modelId = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim() : `model_act_${idx}`;
      if (idMap.has(modelId)) {
        duplicateIds.add(modelId);
      }
      const normalizedId = `act_${crypto.randomUUID()}`;
      idMap.set(modelId, normalizedId);
    });

    if (duplicateIds.size > 0) {
      return {
        actions: [],
        validationResult: {
          valid: false,
          reason: `Duplicate model action IDs detected: ${Array.from(duplicateIds).join(', ')}`,
        },
      };
    }

    // 2. Normalize action objects and remap dependsOn
    const normalizedNodes: NormalizedActionNode[] = [];
    const normalizedActions: AgentAction[] = [];

    for (let idx = 0; idx < rawActions.length; idx++) {
      const raw = rawActions[idx];
      const modelId = typeof raw.id === 'string' && raw.id.trim().length > 0 ? raw.id.trim() : `model_act_${idx}`;
      const normalizedId = idMap.get(modelId)!;

      const type: AgentActionType = typeof raw.type === 'string' ? (raw.type as AgentActionType) : 'READ_FILE';
      const capabilityId = typeof raw.capabilityId === 'string' && raw.capabilityId.length > 0
        ? raw.capabilityId
        : DEFAULT_CAPABILITY_MAP[type] ?? 'unknown_capability';

      const args = ActionNormalizer.sanitizeArgs(raw.args ?? {});
      const description = typeof raw.description === 'string' ? raw.description : `Action ${type}`;

      // Remap dependsOn references
      const remappedDependsOn: string[] = [];
      if (Array.isArray(raw.dependsOn)) {
        for (const dep of raw.dependsOn) {
          if (typeof dep === 'string' && dep.trim().length > 0) {
            const trimmedDep = dep.trim();
            const remapped = idMap.get(trimmedDep);
            if (remapped) {
              remappedDependsOn.push(remapped);
            } else {
              missingReferences.add(trimmedDep);
            }
          }
        }
      }

      const action: AgentAction = {
        id: normalizedId,
        type,
        capabilityId,
        args,
        description,
        dependsOn: remappedDependsOn.length > 0 ? remappedDependsOn : undefined,
        expectedOutcome: typeof raw.expectedOutcome === 'string' ? raw.expectedOutcome : undefined,
        verificationPredicate: raw.verificationPredicate && typeof raw.verificationPredicate === 'object' ? raw.verificationPredicate : undefined,
        riskHint: (['LOW', 'MEDIUM', 'HIGH'].includes(raw.riskHint) ? raw.riskHint : undefined) as any,
      };

      normalizedActions.push(action);
      normalizedNodes.push({
        id: normalizedId,
        action,
        dependsOn: remappedDependsOn,
      });
    }

    if (missingReferences.size > 0) {
      return {
        actions: [],
        validationResult: {
          valid: false,
          reason: `Missing dependency references: ${Array.from(missingReferences).join(', ')}`,
          missingReferences: Array.from(missingReferences),
        },
      };
    }

    // 3. BLOCK 2: Topological Cycle Detection (Kahn's Algorithm)
    const cycleCheck = ActionNormalizer.detectCycles(normalizedNodes);
    if (!cycleCheck.valid) {
      return {
        actions: [], // ZERO actions on cycle detection
        validationResult: cycleCheck,
      };
    }

    return {
      actions: normalizedActions,
      validationResult: { valid: true },
    };
  }

  /**
   * Topological Cycle Detection
   */
  private static detectCycles(nodes: NormalizedActionNode[]): ActionGraphValidationResult {
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>(); // node -> array of nodes depending on it

    nodes.forEach((node) => {
      inDegree.set(node.id, 0);
      graph.set(node.id, []);
    });

    // Populate graph edges and in-degrees
    nodes.forEach((node) => {
      for (const depId of node.dependsOn) {
        if (graph.has(depId)) {
          graph.get(depId)!.push(node.id);
          inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
        }
      }
    });

    const queue: string[] = [];
    inDegree.forEach((degree, id) => {
      if (degree === 0) queue.push(id);
    });

    let visitedCount = 0;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      visitedCount++;

      const dependents = graph.get(curr) || [];
      for (const dep of dependents) {
        const newDeg = (inDegree.get(dep) || 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          queue.push(dep);
        }
      }
    }

    if (visitedCount !== nodes.length) {
      const cycleNodes: string[] = [];
      inDegree.forEach((deg, id) => {
        if (deg > 0) cycleNodes.push(id);
      });

      return {
        valid: false,
        reason: 'Dependency cycle detected in proposed actions graph',
        cycleNodes,
      };
    }

    return { valid: true };
  }

  /**
   * H-07: Sanitize args by deep-stripping dangerous prototype pollution keys
   */
  static sanitizeArgs(obj: any): Record<string, unknown> {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return {};
    }

    const clean: Record<string, unknown> = {};

    const keys = Object.getOwnPropertyNames(obj);
    for (const key of keys) {
      if (
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype' ||
        key.startsWith('__proto__') ||
        key.startsWith('constructor') ||
        key.startsWith('prototype')
      ) {
        continue;
      }
      const val = obj[key];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        clean[key] = ActionNormalizer.sanitizeArgs(val);
      } else if (Array.isArray(val)) {
        clean[key] = val.map((item) =>
          typeof item === 'object' && item !== null ? ActionNormalizer.sanitizeArgs(item) : item
        );
      } else {
        clean[key] = val;
      }
    }

    return clean;
  }

}
