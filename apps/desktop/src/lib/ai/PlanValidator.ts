import { ToolRegistry } from './ToolRegistry';
import type { Plan, PlanStep } from './types';
import { PermissionManager } from '../security/PermissionManager';

export interface RawPlanPayload {
  goal: string;
  steps: Array<{
    description: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    dependsOn?: string[];
  }>;
}

export class PlanValidator {
  static validate(rawPayload: unknown): Plan {
    // 1. Basic schema validation
    if (!rawPayload || typeof rawPayload !== 'object') {
      throw new Error('Plan payload must be an object');
    }

    const payload = rawPayload as RawPlanPayload;
    if (typeof payload.goal !== 'string' || !payload.goal) {
      throw new Error('Plan must have a non-empty string "goal"');
    }

    if (!Array.isArray(payload.steps)) {
      throw new Error('Plan must have a "steps" array');
    }

    if (payload.steps.length === 0) {
      throw new Error('Plan must have at least one step');
    }

    if (payload.steps.length > 50) {
      throw new Error('Plan exceeds maximum step limit of 50');
    }

    // 2. Validate and build steps
    const steps: PlanStep[] = [];
    const stepIds = new Set<string>();

    for (let i = 0; i < payload.steps.length; i++) {
      const rawStep = payload.steps[i];
      
      if (typeof rawStep.description !== 'string' || !rawStep.description) {
        throw new Error(`Step ${i} must have a non-empty "description"`);
      }

      // Default to informational step if no toolName
      if (!rawStep.toolName) {
        const id = `step_${crypto.randomUUID()}`;
        stepIds.add(id);
        steps.push({
          id,
          description: rawStep.description,
          status: 'PENDING',
          attempts: 0,
          dependsOn: Array.isArray(rawStep.dependsOn) ? rawStep.dependsOn : [],
        });
        continue;
      }

      // Validate tool
      const toolDef = ToolRegistry.get(rawStep.toolName);
      if (!toolDef) {
        throw new Error(`Step ${i} uses unknown tool: "${rawStep.toolName}"`);
      }

      // Validate arguments
      const toolArgs = rawStep.toolArgs ?? {};
      if (typeof toolArgs !== 'object' || toolArgs === null) {
        throw new Error(`Step ${i} toolArgs must be an object`);
      }

      for (const [paramName, paramDef] of Object.entries(toolDef.parameters)) {
        if (paramDef.required && !(paramName in toolArgs)) {
          throw new Error(`Step ${i} missing required argument: "${paramName}" for tool "${rawStep.toolName}"`);
        }
        // Strict typing could go here if needed, but for now we rely on the schema check above
      }

      // For extra security, ensure no unexpected arguments are passed
      for (const argName of Object.keys(toolArgs)) {
        if (!(argName in toolDef.parameters)) {
          throw new Error(`Step ${i} provided unknown argument: "${argName}" for tool "${rawStep.toolName}"`);
        }
      }

      const id = rawStep.toolName ? `step_${crypto.randomUUID()}` : `step_${i + 1}`;
      stepIds.add(id);
      
      // Determine risk for the step based on PermissionManager rules
      const { risk } = PermissionManager.classify(toolDef.toolGroup, toolDef.tauriCommand ?? toolDef.name);

      steps.push({
        id,
        description: rawStep.description,
        toolName: rawStep.toolName,
        toolArgs,
        dependsOn: Array.isArray(rawStep.dependsOn) ? rawStep.dependsOn : [],
        status: 'PENDING',
        attempts: 0,
        maxRetries: 3, // Safe default
        risk,
      });
    }

    // 3. Validate Dependencies (DAG Check)
    for (const step of steps) {
      if (step.dependsOn) {
        for (const dep of step.dependsOn) {
          if (!stepIds.has(dep)) {
            throw new Error(`Step ${step.id} depends on unknown step: "${dep}"`);
          }
          if (dep === step.id) {
            throw new Error(`Step ${step.id} depends on itself`);
          }
        }
      }
    }

    // Simple cycle detection
    const visited = new Set<string>();
    const recStack = new Set<string>();

    const checkCycle = (stepId: string) => {
      if (recStack.has(stepId)) {
        throw new Error(`Circular dependency detected involving step: "${stepId}"`);
      }
      if (visited.has(stepId)) {
        return;
      }
      
      visited.add(stepId);
      recStack.add(stepId);

      const step = steps.find(s => s.id === stepId);
      if (step && step.dependsOn) {
        for (const dep of step.dependsOn) {
          checkCycle(dep);
        }
      }
      recStack.delete(stepId);
    };

    for (const step of steps) {
      checkCycle(step.id);
    }

    // 4. Return valid plan
    return {
      id: crypto.randomUUID(),
      goal: payload.goal,
      steps,
      status: 'PLANNED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
