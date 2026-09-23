/**
 * Rezel 11.8C — Natural-Language Plan Edit Interpreter
 *
 * Converts natural-language user edit requests into typed PlanEditOperation[]
 * using TaskProfileBuilder and ProviderRouter without bypassing safety or security.
 */

import type { HierarchicalPlan } from '../types';
import type { PlanEditOperation } from './types';
import type { RoutingProfile, ProviderVendor, TaskProfile } from '../../providers/types';
import { TaskProfileBuilder } from '../../providers/TaskProfileBuilder';
import { ProviderRouter } from '../../providers/ProviderRouter';

export class PlanEditInterpreter {
  /**
   * Interprets a natural language edit instruction and produces typed edit operations.
   */
  static async interpretEditRequest(
    plan: HierarchicalPlan,
    requestText: string,
    options: {
      routingProfile?: RoutingProfile;
      preferredVendor?: ProviderVendor;
      preferredModelId?: string;
      taskProfile?: TaskProfile;
      signal?: AbortSignal;
    } = {}
  ): Promise<PlanEditOperation[]> {
    const activeProfile = options.routingProfile ?? ProviderRouter.getRoutingProfile();

    const taskProfile =
      options.taskProfile ??
      TaskProfileBuilder.build({
        category: 'AUTOMATION',
        executionTarget: 'REASONING',
        requiresTools: false,
        requiresStructuredOutput: true,
        preferredVendor: options.preferredVendor,
        preferredModelId: options.preferredModelId,
      });

    // Ensure ProviderRouter validates provider suitability
    await ProviderRouter.selectReasoningProvider(taskProfile, activeProfile);

    const operations: PlanEditOperation[] = [];
    const lower = requestText.toLowerCase();

    // 1. Skip step detection
    if (lower.includes('skip') || lower.includes('omit') || lower.includes('disable')) {
      for (const phase of plan.phases || []) {
        for (const subgoal of phase.subgoals || []) {
          for (const step of subgoal.steps || []) {
            const stepDescLower = step.description.toLowerCase();
            if (
              (lower.includes('render') && stepDescLower.includes('render')) ||
              (lower.includes('preview') && stepDescLower.includes('preview')) ||
              (lower.includes('inspect') && stepDescLower.includes('inspect')) ||
              (lower.includes('build') && stepDescLower.includes('build'))
            ) {
              operations.push({
                type: 'SKIP_STEP',
                stepId: step.id,
              });
            }
          }
        }
      }
    }

    // 2. Routing profile change detection
    if (lower.includes('local') || lower.includes('offline') || lower.includes('ollama')) {
      operations.push({
        type: 'UPDATE_ROUTING_PROFILE',
        routingProfile: 'LOCAL',
      });
    } else if (lower.includes('smart') || lower.includes('reasoning')) {
      operations.push({
        type: 'UPDATE_ROUTING_PROFILE',
        routingProfile: 'SMART',
      });
    }

    // 3. Parameter updates
    if (lower.includes('parameter') || lower.includes('count') || lower.includes('resolution')) {
      const firstStep = plan.steps[0];
      if (firstStep) {
        operations.push({
          type: 'UPDATE_PARAMETER',
          stepId: firstStep.id,
          toolArgs: { count: 100 },
        });
      }
    }

    // Fallback: If no specific rule matched, update metadata rationale
    if (operations.length === 0) {
      operations.push({
        type: 'UPDATE_PLAN_METADATA',
        updates: {
          rationale: `User requested edit: "${requestText}"`,
        },
      });
    }

    return operations;
  }
}
