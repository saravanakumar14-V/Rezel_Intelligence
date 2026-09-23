import type {
  ReasoningProvider,
  ReasoningProviderConfig,
  ReasoningRequest,
  ReasoningProviderResult,
  AgentAction,
  ReasoningResponse,
} from '../types';

export interface DeterministicDevelopmentProviderOptions {
  id?: string;
  displayName?: string;
  priority?: number;
}

/**
 * DeterministicDevelopmentProvider
 *
 * DEVELOPMENT / TEST ONLY reasoning provider.
 *
 * Invariants:
 *  - Never automatically selected as the default production provider (priority = 999).
 *  - Never executes tools directly.
 *  - Never calls Tauri commands directly.
 *  - Never bypasses SecurityToolExecutor or PolicyEngine.
 *  - Never bypasses WorkflowRuntime.
 *  - Simply produces structured AgentAction data for deterministic offline validation.
 */
export class DeterministicDevelopmentProvider implements ReasoningProvider {
  readonly id: string;
  readonly type = 'CUSTOM' as const;
  readonly config: ReasoningProviderConfig;

  constructor(options: DeterministicDevelopmentProviderOptions = {}) {
    this.id = options.id ?? 'dev-deterministic';
    this.config = {
      id: this.id,
      type: 'CUSTOM',
      displayName: options.displayName ?? 'Deterministic Development Provider',
      modelId: 'dev-deterministic-mock',
      maxContextTokens: 128000,
      supportsStructuredOutput: true,
      supportsStreaming: false,
      costTier: 'FREE',
      priority: options.priority ?? 999, // Lowest priority: never default in production
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async reason(
    request: ReasoningRequest,
    signal?: AbortSignal
  ): Promise<ReasoningProviderResult> {
    if (signal?.aborted) {
      throw new Error('Request aborted before reasoning');
    }

    const goalLower = request.goal.toLowerCase();
    let actions: AgentAction[] = [];

    // Support canonical test goal:
    // "Open Blender and create one cube and one camera, then inspect the scene and verify that both exist."
    if (
      goalLower.includes('blender') &&
      (goalLower.includes('cube') || goalLower.includes('camera') || goalLower.includes('inspect'))
    ) {
      actions = [
        {
          id: 'action_blender_launch',
          type: 'MODIFY_APPLICATION',
          capabilityId: 'blender.launch',
          args: { background: false },
          description: 'Launch Blender with Rezel IPC integration',
          riskHint: 'LOW',
        },
        {
          id: 'action_blender_cube',
          type: 'MODIFY_APPLICATION',
          capabilityId: 'blender.create_object',
          args: { type: 'CUBE', name: 'Rezel_Test_Cube_001' },
          dependsOn: ['action_blender_launch'],
          description: 'Create unique test cube Rezel_Test_Cube_001 in Blender scene',
          riskHint: 'LOW',
        },
        {
          id: 'action_blender_camera',
          type: 'MODIFY_APPLICATION',
          capabilityId: 'blender.create_camera',
          args: { name: 'Rezel_Test_Camera_001' },
          dependsOn: ['action_blender_cube'],
          description: 'Create unique test camera Rezel_Test_Camera_001 in Blender scene',
          riskHint: 'LOW',
        },
        {
          id: 'action_blender_inspect',
          type: 'INSPECT_APPLICATION',
          capabilityId: 'blender.inspect_scene',
          args: {},
          dependsOn: ['action_blender_camera'],
          description: 'Inspect scene and verify unique sentinel objects exist',
          riskHint: 'LOW',
          verificationPredicate: {
            operator: 'EQUALS',
            entityType: 'MESH',
            entityName: 'Rezel_Test_Cube_001',
            property: 'name',
            value: 'Rezel_Test_Cube_001',
          },
        },
      ];
    } else {
      actions = [
        {
          id: 'action_default_systeminfo',
          type: 'RUN_COMMAND',
          capabilityId: 'run_system_command',
          args: { command: 'echo', args: ['Rezel deterministic dev action'] },
          description: 'Default deterministic response',
          riskHint: 'LOW',
        },
      ];
    }

    const structured: ReasoningResponse = {
      status: 'ACTIONS',
      summary: `Deterministic reasoning plan for: ${request.goal}`,
      actions,
      verificationPredicates: [
        {
          operator: 'EQUALS',
          entityType: 'MESH',
          entityName: 'Rezel_Test_Cube_001',
          property: 'name',
          value: 'Rezel_Test_Cube_001',
        },
        {
          operator: 'EQUALS',
          entityType: 'CAMERA',
          entityName: 'Rezel_Test_Camera_001',
          property: 'name',
          value: 'Rezel_Test_Camera_001',
        },
      ],
      confidence: 1.0,
    };

    const raw = JSON.stringify(structured, null, 2);

    return {
      raw,
      structured,
      tokenUsage: { input: 50, output: 150 },
      latencyMs: 10,
      providerId: this.id,
    };
  }
}
