/**
 * Rezel 11.4A/B — Workflow Template Registry
 *
 * Central repository and factory for reusable Workflow Templates.
 * Provides template registration, versioning, parameter validation,
 * data-flow analysis, previewing, dry-running, and typed Plan instantiation.
 */

import type {
  WorkflowTemplate,
  WorkflowTemplatePreview,
  WorkflowTemplateInstantiationOptions,
  DryRunResult,
} from './types';
import { TemplateValidator } from './TemplateValidator';
import { BUILTIN_WORKFLOW_TEMPLATES } from './builtins';
import { TaskProfileBuilder } from '../providers/TaskProfileBuilder';
import { ProviderRouter } from '../providers/ProviderRouter';
import { PlanEngine } from '../PlanEngine';
import { WorkflowVariableStore } from '../dataflow/WorkflowVariableStore';
import { WorkflowDataFlowResolver } from '../dataflow/WorkflowDataFlowResolver';
import { DataFlowError } from '../dataflow/types';
import type { Plan, PlanStep } from '../types';

class WorkflowTemplateRegistryImpl {
  /** Keyed by templateId -> version -> WorkflowTemplate */
  private templates = new Map<string, Map<string, WorkflowTemplate>>();

  constructor() {
    this.initBuiltins();
  }

  private initBuiltins(): void {
    for (const tpl of BUILTIN_WORKFLOW_TEMPLATES) {
      this.register(tpl);
    }
  }

  /**
   * Registers a reusable workflow template.
   */
  register(template: WorkflowTemplate): void {
    if (!template.id || !template.version) {
      throw new Error('WorkflowTemplate must have non-empty id and version');
    }

    let versionMap = this.templates.get(template.id);
    if (!versionMap) {
      versionMap = new Map<string, WorkflowTemplate>();
      this.templates.set(template.id, versionMap);
    }

    // Clone to ensure template immutability
    versionMap.set(template.version, JSON.parse(JSON.stringify(template)));
  }

  /**
   * Unregisters a workflow template by ID and optional version.
   */
  unregister(templateId: string, version?: string): boolean {
    const versionMap = this.templates.get(templateId);
    if (!versionMap) return false;

    if (version) {
      const deleted = versionMap.delete(version);
      if (versionMap.size === 0) {
        this.templates.delete(templateId);
      }
      return deleted;
    } else {
      return this.templates.delete(templateId);
    }
  }

  /**
   * Retrieves a template by ID and version. If version is omitted, returns latest.
   */
  get(templateId: string, version?: string): WorkflowTemplate | undefined {
    const versionMap = this.templates.get(templateId);
    if (!versionMap) return undefined;

    if (version) {
      const tpl = versionMap.get(version);
      return tpl ? JSON.parse(JSON.stringify(tpl)) : undefined;
    }

    return this.findLatest(templateId);
  }

  /**
   * Finds the highest/latest semver version of a template ID.
   */
  findLatest(templateId: string): WorkflowTemplate | undefined {
    const versionMap = this.templates.get(templateId);
    if (!versionMap || versionMap.size === 0) return undefined;

    const versions = Array.from(versionMap.keys()).sort((a, b) =>
      b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' })
    );

    const latest = versionMap.get(versions[0]);
    return latest ? JSON.parse(JSON.stringify(latest)) : undefined;
  }

  /**
   * Lists all registered templates (latest version per template ID).
   */
  list(): WorkflowTemplate[] {
    const results: WorkflowTemplate[] = [];
    for (const templateId of this.templates.keys()) {
      const latest = this.findLatest(templateId);
      if (latest) results.push(latest);
    }
    return results;
  }

  /**
   * Previews a template with resolved parameters without executing or mutating.
   */
  preview(options: WorkflowTemplateInstantiationOptions): WorkflowTemplatePreview {
    const template = this.get(options.templateId, options.version);
    if (!template) {
      throw new Error(`Template not found: '${options.templateId}' (version: ${options.version || 'latest'})`);
    }

    const validation = TemplateValidator.validate(template.parameters, options.parameters);
    if (!validation.valid) {
      throw new Error(`Template parameter validation failed: ${validation.errors.join(', ')}`);
    }

    const resolved = validation.resolvedParameters;

    const estimatedLocks: { uri: string; access: 'READ' | 'WRITE' }[] = [];
    for (const step of template.steps) {
      if (step.requiredLocks) {
        for (const lock of step.requiredLocks) {
          if (!estimatedLocks.some((l) => l.uri === lock.uri && l.access === lock.access)) {
            estimatedLocks.push(lock);
          }
        }
      }
    }

    const previewSteps = template.steps.map((step) => {
      const interpolatedDesc = TemplateValidator.interpolate(step.description, resolved);
      return {
        id: step.id,
        description: interpolatedDesc,
        toolName: step.toolName,
        mutatesExternalState: !!step.mutatesExternalState,
        category: step.category,
        risk: step.risk,
      };
    });

    const mutatingCount = previewSteps.filter((s) => s.mutatesExternalState).length;

    const checkpointBoundaries: Array<{ stepId: string; type: string }> = [];
    for (const step of template.steps) {
      if (step.checkpoint) {
        checkpointBoundaries.push({ stepId: step.id, type: step.checkpoint.type });
      }
    }

    return {
      templateId: template.id,
      templateVersion: template.version,
      templateName: template.name,
      description: template.description,
      resolvedParameters: resolved,
      requiredApplications: template.requiredApplications || [],
      requiredCapabilities: template.requiredCapabilities || [],
      stepCount: previewSteps.length,
      mutatingStepsCount: mutatingCount,
      estimatedLocks,
      checkpointBoundaries,
      steps: previewSteps,
    };
  }

  /**
   * Generates a fully typed, routed, parameterized Plan from a WorkflowTemplate.
   */
  async instantiate(options: WorkflowTemplateInstantiationOptions): Promise<{
    plan: Plan;
    workflowMetadata: {
      templateId: string;
      templateVersion: string;
      resolvedParameters: Record<string, unknown>;
    };
  }> {
    const template = this.get(options.templateId, options.version);
    if (!template) {
      throw new Error(`Template not found: '${options.templateId}' (version: ${options.version || 'latest'})`);
    }

    const validation = TemplateValidator.validate(template.parameters, options.parameters);
    if (!validation.valid) {
      throw new Error(`Template parameter validation failed:\n• ${validation.errors.join('\n• ')}`);
    }

    const resolved = validation.resolvedParameters;
    const planId = `plan_tpl_${crypto.randomUUID()}`;
    const workflowId = options.workflowId || `wf_tpl_${crypto.randomUUID()}`;

    // Initialize parameters in variable store
    WorkflowVariableStore.initParameters(workflowId, resolved);

    // 1. Goal description with interpolated params
    const goal = `${template.name} [${template.id}@${template.version}]`;

    // 2. Planning routing & task profile
    const activeRoutingProfile =
      options.routingProfileOverride || template.defaultRoutingProfile || ProviderRouter.getRoutingProfile();

    const planTaskProfile = TaskProfileBuilder.build({
      category: 'AUTOMATION',
      executionTarget: 'REASONING',
      requiresTools: true,
      requiresStructuredOutput: true,
    });

    let planningRoute: any = undefined;
    try {
      planningRoute = await ProviderRouter.selectReasoningProvider(planTaskProfile, activeRoutingProfile);
    } catch {
      // Defer route resolution if providers temporarily offline
    }

    // 3. Build PlanSteps with parameter interpolation and per-step dynamic routing
    const steps: PlanStep[] = [];

    for (const stepDef of template.steps) {
      const interpolatedDesc = TemplateValidator.interpolate(stepDef.description, resolved);

      let resolvedArgs: Record<string, unknown> = {};
      if (typeof stepDef.toolArgs === 'function') {
        resolvedArgs = stepDef.toolArgs(resolved);
      } else if (stepDef.toolArgs) {
        resolvedArgs = TemplateValidator.interpolate(stepDef.toolArgs, resolved);
      }

      let interpolatedPredicate = undefined;
      if (stepDef.verificationPredicate) {
        interpolatedPredicate = TemplateValidator.interpolate(stepDef.verificationPredicate, resolved);
      }

      const planStep: PlanStep = {
        id: stepDef.id,
        description: interpolatedDesc,
        toolName: stepDef.toolName,
        toolArgs: resolvedArgs,
        dependsOn: stepDef.dependsOn ? [...stepDef.dependsOn] : [],
        status: 'PENDING',
        attempts: 0,
        maxRetries: stepDef.maxRetries ?? (stepDef.mutatesExternalState ? 0 : 3),
        risk: stepDef.risk || (stepDef.mutatesExternalState ? 'HIGH' : 'LOW'),
        verificationPredicate: interpolatedPredicate,
        stepCategory: stepDef.category || 'AUTOMATION',
        routingProfile: stepDef.routingProfile || activeRoutingProfile,
        outputDefinitions: stepDef.outputs,
        inputBindings: stepDef.inputBindings,
      };

      // Derive per-step TaskProfile and ProviderRoute through 11.3B mechanism
      const stepTaskProfile = PlanEngine.inferStepTaskProfile(planStep, {
        routingProfile: planStep.routingProfile,
        defaultCategory: stepDef.category || 'AUTOMATION',
      });
      planStep.taskProfile = stepTaskProfile;

      try {
        planStep.providerRoute = await PlanEngine.routeStep(planStep, undefined, {
          routingProfile: planStep.routingProfile,
        });
      } catch {
        // Step route resolution deferred if offline
      }

      steps.push(planStep);
    }

    // 4. Data dependency analysis & cycle detection (Milestone 11.4B)
    const depGraph = WorkflowDataFlowResolver.buildDataDependencyGraph(steps);
    if (depGraph.circularDependencies.length > 0) {
      const cycleStrs = depGraph.circularDependencies.map((c) => c.join(' -> ')).join(', ');
      throw new DataFlowError(
        'CIRCULAR_DATA_DEPENDENCY',
        `Detected circular data dependency in template '${template.id}': ${cycleStrs}`,
        { cycles: depGraph.circularDependencies }
      );
    }

    // Merge inferred data dependencies into step.dependsOn
    for (const step of steps) {
      const dataDeps = depGraph.dataDependencies.get(step.id);
      if (dataDeps) {
        for (const depId of dataDeps) {
          if (!step.dependsOn!.includes(depId)) {
            step.dependsOn!.push(depId);
          }
        }
      }
    }

    const plan: Plan = {
      id: planId,
      workflowId,
      projectId: options.projectId,
      goal,
      steps,
      status: 'PLANNED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskProfile: planTaskProfile,
      planningRoute,
    };

    return {
      plan,
      workflowMetadata: {
        templateId: template.id,
        templateVersion: template.version,
        resolvedParameters: resolved,
      },
    };
  }

  /**
   * Safe dry-run mode: validates parameters, builds preview, resolves data-flow graph,
   * and builds Plan, but NEVER mutates external state.
   */
  async dryRun(options: WorkflowTemplateInstantiationOptions): Promise<DryRunResult> {
    try {
      const preview = this.preview(options);
      const { plan } = await this.instantiate(options);

      return {
        valid: true,
        preview,
        plan,
      };
    } catch (err: any) {
      return {
        valid: false,
        preview: null as any,
        plan: null as any,
        errors: [err?.message || String(err)],
      };
    }
  }
}

export const WorkflowTemplateRegistry = new WorkflowTemplateRegistryImpl();
