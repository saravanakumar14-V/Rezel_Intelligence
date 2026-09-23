import { planStateMachine } from './PlanStateMachine';
import { AIToolExecutor } from './ToolExecutor';
import type { Plan, PlanStep } from './types';
import { PlanValidator } from './PlanValidator';
import { TaskProfileBuilder } from './providers/TaskProfileBuilder';
import { ProviderRouter } from './providers/ProviderRouter';
import type {
  ProviderRoute,
  RoutingProfile,
  ProviderVendor,
  TaskRequiredCapabilities,
  TaskProfile,
  TaskCategory,
} from './providers/types';

export interface PlanGenerationOptions {
  projectId?: string;
  workflowId?: string;
  routingProfile?: RoutingProfile;
  preferredVendor?: ProviderVendor;
  preferredModelId?: string;
  requiredCapabilities?: TaskRequiredCapabilities;
  taskProfile?: TaskProfile;
  signal?: AbortSignal;
}

export class PlanExecutor {
  private activeControllers = new Map<string, AbortController[]>();

  /**
   * generatePlan
   * Uses TaskProfileBuilder and ProviderRouter to route reasoning model selection,
   * generates structured planning actions with classified failover, and normalizes into a typed Plan.
   */
  async generatePlan(goal: string, options: PlanGenerationOptions = {}): Promise<Plan> {
    // 1. TaskProfile: reuse immutable profile if provided, else build using TaskProfileBuilder
    const taskProfile = options.taskProfile ?? TaskProfileBuilder.build({
      category: 'AUTOMATION',
      executionTarget: 'REASONING',
      requiresTools: true,
      requiresStructuredOutput: true,
      requiresExtendedThinking: options.requiredCapabilities?.extendedThinking,
      hasVisionMedia: options.requiredCapabilities?.vision,
      hasAudioInput: options.requiredCapabilities?.audioInput,
      preferredVendor: options.preferredVendor,
      preferredModelId: options.preferredModelId,
      minContextTokens: options.requiredCapabilities?.minContextTokens,
    });

    const activeProfile = options.routingProfile ?? ProviderRouter.getRoutingProfile();

    // 2. Select reasoning route via ProviderRouter
    const route = await ProviderRouter.selectReasoningProvider(taskProfile, activeProfile);

    // 3. Dispatch reasoning request via ProviderRouter (which performs classified failover for retryable errors)
    const reasoningRequest = {
      goal,
      context: {
        projectId: options.projectId,
        workflowId: options.workflowId,
      },
      structuredOutputSchema: {
        status: 'ACTIONS',
        actions: [],
      },
    };

    const reasoningResult = await ProviderRouter.reason(taskProfile, reasoningRequest, {
      routingProfile: activeProfile,
      signal: options.signal,
    });

    const actualVendor = (reasoningResult.providerId as ProviderVendor) || route.vendor;
    const actualModelId = reasoningResult.modelId || route.model.id;
    const { ModelCatalog } = await import('./providers/ModelCatalog');
    const actualModel = ModelCatalog.getModel(actualModelId) ?? route.model;

    // 4. Stable ProviderRoute metadata (zero credentials / secrets)
    const planningRoute: ProviderRoute = {
      vendor: actualVendor,
      modelId: actualModelId,
      routingProfile: activeProfile,
      capabilities: actualModel.capabilities,
      isPaid: actualModel.pricing.costTier !== 'FREE',
      selectionReason: route.selectionReason,
      taskProfileId: taskProfile.id,
      selectedAt: Date.now(),
    };

    // 5. Parse and normalize structured actions into typed Plan representation
    let rawActions: any[] = [];
    if (reasoningResult.structured?.actions && Array.isArray(reasoningResult.structured.actions)) {
      rawActions = reasoningResult.structured.actions;
    } else if (reasoningResult.raw) {
      try {
        const parsed = JSON.parse(reasoningResult.raw);
        if (Array.isArray(parsed.actions)) {
          rawActions = parsed.actions;
        } else if (Array.isArray(parsed.steps)) {
          rawActions = parsed.steps;
        }
      } catch {
        // Raw parsing fallback
      }
    }

    const planSteps: PlanStep[] = rawActions.map((act: any, idx: number) => ({
      id: act.id || `step_${idx + 1}`,
      description: act.description || act.title || 'Plan step',
      toolName: act.capabilityId || act.toolName || act.name,
      toolArgs: act.parameters || act.toolArgs || act.args || {},
      dependsOn: act.dependsOn || [],
      status: 'PENDING',
      attempts: 0,
      maxRetries: act.maxRetries ?? 1,
      verificationPredicate: act.verificationPredicate,
    }));

    const plan: Plan = {
      id: `plan_${crypto.randomUUID()}`,
      workflowId: options.workflowId,
      projectId: options.projectId,
      goal,
      steps: planSteps,
      status: 'PLANNED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskProfile,
      planningRoute,
    };

    // 6. Infer task profiles and dynamically route each individual step (Milestone 11.3B)
    for (const step of planSteps) {
      this.inferStepTaskProfile(step, { routingProfile: activeProfile });
      try {
        await this.routeStep(step, plan, { routingProfile: activeProfile });
      } catch (routeErr) {
        console.warn(`[PlanEngine] Initial route resolution for step ${step.id} deferred:`, (routeErr as any)?.message);
      }
    }

    return plan;
  }

  /**
   * inferStepTaskProfile
   * Derives a structured, immutable TaskProfile for a specific workflow step.
   */
  inferStepTaskProfile(
    step: PlanStep,
    options?: { routingProfile?: RoutingProfile; defaultCategory?: TaskCategory }
  ): TaskProfile {
    if (step.taskProfile) {
      return step.taskProfile;
    }

    let category: TaskCategory = step.stepCategory ?? options?.defaultCategory ?? 'AUTOMATION';
    let requiresTools = Boolean(step.toolName);
    let requiresStructuredOutput = false;
    let requiresExtendedThinking = false;
    let hasVisionMedia = false;
    let minContextTokens: number | undefined = undefined;

    const lowerDesc = (step.description || '').toLowerCase();
    const toolName = (step.toolName || '').toLowerCase();

    if (
      step.stepCategory === 'CODING' ||
      toolName.includes('code') ||
      lowerDesc.includes('code') ||
      lowerDesc.includes('script') ||
      lowerDesc.includes('compile')
    ) {
      category = 'CODING';
      requiresTools = true;
      requiresStructuredOutput = true;
    } else if (
      step.stepCategory === 'VISION' ||
      toolName.includes('vision') ||
      lowerDesc.includes('inspect') ||
      lowerDesc.includes('screenshot') ||
      lowerDesc.includes('visual') ||
      lowerDesc.includes('render')
    ) {
      category = 'VISION';
      hasVisionMedia = true;
      requiresTools = true;
    } else if (
      step.stepCategory === 'REASONING' ||
      lowerDesc.includes('diagnose') ||
      lowerDesc.includes('reason') ||
      lowerDesc.includes('analyze') ||
      lowerDesc.includes('evaluate')
    ) {
      category = 'REASONING';
      requiresExtendedThinking = true;
      minContextTokens = 100_000;
    } else if (
      step.routingProfile === 'LOCAL' ||
      toolName.includes('local') ||
      lowerDesc.includes('offline') ||
      lowerDesc.includes('local')
    ) {
      category = 'SYSTEM';
      requiresTools = true;
    }

    const taskProfile = TaskProfileBuilder.build({
      category,
      executionTarget: category === 'REASONING' ? 'REASONING' : 'CHAT',
      requiresTools,
      requiresStructuredOutput,
      requiresExtendedThinking,
      hasVisionMedia,
      minContextTokens,
    });

    step.taskProfile = taskProfile;
    return taskProfile;
  }

  /**
   * routeStep
   * Dynamically selects and assigns a ProviderRoute for a single workflow step.
   */
  async routeStep(
    step: PlanStep,
    plan?: Plan,
    options?: { routingProfile?: RoutingProfile; forceReRoute?: boolean }
  ): Promise<ProviderRoute> {
    if (step.providerRoute && !options?.forceReRoute) {
      return step.providerRoute;
    }

    const taskProfile = this.inferStepTaskProfile(step, options);
    const effectiveProfile: RoutingProfile =
      step.routingProfile ??
      options?.routingProfile ??
      plan?.planningRoute?.routingProfile ??
      ProviderRouter.getRoutingProfile();

    const selectedRoute = await ProviderRouter.selectChatProvider(taskProfile, effectiveProfile);

    const route: ProviderRoute = {
      vendor: selectedRoute.vendor,
      modelId: selectedRoute.model.id,
      routingProfile: effectiveProfile,
      capabilities: selectedRoute.model.capabilities,
      isPaid: selectedRoute.isPaid,
      selectionReason: selectedRoute.selectionReason,
      taskProfileId: taskProfile.id,
      selectedAt: Date.now(),
    };

    step.providerRoute = route;
    return route;
  }

  /**
   * createPlan
   * Parses and validates raw LLM JSON, returning a type-safe Plan.
   */
  createPlan(rawPayload: unknown): Plan {
    console.log('REBUILT PLANNER');
    return PlanValidator.validate(rawPayload);
  }

  /**
   * execute
   * Orchestrates the step-by-step execution of a plan, respecting dependencies.
   */
  async execute(plan: Plan): Promise<Plan> {
    console.log('REBUILT PLANNER EXECUTE');
    if ((plan.status as string) !== 'PLANNED') {
      throw new Error(`Cannot execute plan in status: ${plan.status}`);
    }

    this.activeControllers.set(plan.id, []);
    planStateMachine.startPlan(plan);
    const { Scheduler } = await import('./scheduler/Scheduler');
    await Scheduler.executePlan(plan, async (plan, step, getLocks, releaseLocks) => {
      await this.executeStepWithRetry(plan, step, getLocks, releaseLocks);
    });

    this.activeControllers.delete(plan.id);

    // Determine final plan status
    if ((plan.status as string) !== 'CANCELLED') {
      const anyFailed = plan.steps.some((s) => s.status === 'FAILED');
      const anyCompleted = plan.steps.some((s) => s.status === 'COMPLETED');

      if (anyFailed && anyCompleted) {
        planStateMachine.partiallySucceedPlan(plan);
      } else if (anyFailed) {
        const { TransactionManager } = await import('./transactions/TransactionManager');
        if (plan.workflowId) {
           const fullyRolledBack = await TransactionManager.rollbackWorkflow(plan.workflowId, []);
           if (!fullyRolledBack) {
              planStateMachine.partiallyRolledBackPlan(plan);
           } else {
              planStateMachine.failPlan(plan, 'Plan failed due to step failures and was rolled back');
           }
        } else {
           planStateMachine.failPlan(plan, 'Plan failed due to step failures');
        }
      } else {
        planStateMachine.succeedPlan(plan);
      }
    }

    return plan;
  }

  /**
   * cancel
   * Aborts a running plan.
   */
  cancel(plan: Plan): void {
    planStateMachine.cancelPlan(plan);
    const controllers = this.activeControllers.get(plan.id);
    if (controllers) {
      for (const controller of controllers) {
        controller.abort(new Error('Plan cancelled'));
      }
      this.activeControllers.delete(plan.id);
    }
  }

  /**
   * executeStepWithRetry
   * Manages retries, timeouts, and execution of a single step.
   */
  private async executeStepWithRetry(
    plan: Plan,
    step: PlanStep,
    getLocks: () => Promise<void>,
    releaseLocks: () => void
  ): Promise<void> {
    const timeoutMs = 60000; // 60 seconds default timeout

    while (step.status !== 'CANCELLED' && plan.status !== 'CANCELLED') {
      // Ensure step-level dynamic routing and task profile are resolved (Milestone 11.3B)
      if (!step.taskProfile) {
        this.inferStepTaskProfile(step, { routingProfile: plan.planningRoute?.routingProfile });
      }
      if (!step.providerRoute) {
        try {
          await this.routeStep(step, plan, { routingProfile: plan.planningRoute?.routingProfile });
        } catch (routeErr) {
          console.warn(`[PlanEngine] Route resolution on execution for step ${step.id}:`, (routeErr as any)?.message);
        }
      }

      if (step.status === 'FAILED') {
        planStateMachine.retryStep(plan, step, `Retrying step (Attempt ${step.attempts + 1})`);
      } else {
        planStateMachine.startStep(plan, step);
      }

      // Informational step
      if (!step.toolName) {
        planStateMachine.succeedStep(plan, step, 'Informational step — no action required.');
        return;
      }

      const { CapabilityRegistry } = await import('./capabilities/CapabilityRegistry');
      const capability = CapabilityRegistry.get(step.toolName);
      
      if (!capability) {
        planStateMachine.failStep(plan, step, `Unknown capability: ${step.toolName}`, 'EXECUTION_FAILED', 'FAILED');
        return;
      }

      const isMutation = capability.mutatesExternalState ?? true; // Safe default
      const retryPolicy = capability.retryPolicy ?? 'NEVER'; // Safe default
      const maxRetries = retryPolicy === 'NEVER' ? 0 : (step.maxRetries ?? 3);

      step.executionId = crypto.randomUUID();

      let timeoutHandle: ReturnType<typeof setTimeout> | undefined = undefined;
      let timeoutReject: (reason?: any) => void;
      let timeRemaining = timeoutMs;
      let lastStartTime = 0;

      let timeoutPromise: Promise<never> | undefined;
      const abortController = new AbortController();
      
      const controllers = this.activeControllers.get(plan.id);
      if (controllers) controllers.push(abortController);

      const abortPromise = new Promise<never>((_, reject) => {
         if (abortController.signal.aborted) {
            reject(abortController.signal.reason);
         } else {
            abortController.signal.addEventListener('abort', () => reject(abortController.signal.reason), { once: true });
         }
      });
      // Prevent unhandled rejection if it's never awaited
      abortPromise.catch(() => {});

      try {
        planStateMachine.emitActionStarted(plan, step, `Action ${step.toolName} started.`);
        
        await Promise.race([getLocks(), abortPromise]);

        lastStartTime = performance.now();
        console.log(`Setting timeout for ${step.toolName} to ${timeRemaining}ms`);
        timeoutPromise = new Promise<never>((_, reject) => {
          timeoutReject = reject;
          timeoutHandle = setTimeout(() => reject(new Error(`Step execution timed out after ${timeRemaining}ms`)), timeRemaining);
        });
        // Prevent unhandled promise rejection if it rejects before Promise.race processes it
        timeoutPromise.catch(() => {});

        if (isMutation) {
          planStateMachine.emitVerificationStarted(plan, step, `Verifying ${step.toolName}...`);
        }

        if (plan.workflowId) {
          const { WorkflowDataFlowResolver } = await import('./dataflow/WorkflowDataFlowResolver');
          const { resolvedArgs, errors } = WorkflowDataFlowResolver.resolveStepInputs(step, plan.workflowId);
          if (errors.length > 0) {
            planStateMachine.failStep(plan, step, `Data flow resolution error: ${errors.join('; ')}`, 'EXECUTION_FAILED', 'FAILED');
            releaseLocks();
            return;
          }
          if (Object.keys(resolvedArgs).length > 0) {
            step.toolArgs = resolvedArgs;
          }
        }

        const context = {
          workflowId: plan.workflowId!,
          executionId: step.executionId,
          scopes: [],
          metadata: {},
          signal: abortController.signal
        };

        let dryRunResult: any = null;
        if (isMutation) {
          dryRunResult = await AIToolExecutor.dryRunCapability(capability, step.toolArgs ?? {}, { ...context, mode: 'DRY_RUN' });
        }

        const resultPromise = AIToolExecutor.executeCapability(capability, step.toolArgs ?? {}, { ...context, mode: 'EXECUTE' }, {
          onStatusChange: async (status) => {
            if (status === 'WAITING_FOR_USER') {
              releaseLocks();
              clearTimeout(timeoutHandle);
              timeRemaining -= (performance.now() - lastStartTime);
              planStateMachine.waitStep(plan, step, 'USER_CONFIRMATION', 'Waiting for user approval...');
            } else if (status === 'RUNNING') {
              await getLocks();
              lastStartTime = performance.now();
              timeoutHandle = setTimeout(() => timeoutReject(new Error('Step execution timed out')), timeRemaining);
              planStateMachine.startStep(plan, step);
            }
          }
        });

        const toolResult = await Promise.race([resultPromise, timeoutPromise!]);
        clearTimeout(timeoutHandle);

        planStateMachine.emitActionCompleted(plan, step, `Action ${step.toolName} finished.`);

        if ((step.status as string) === 'CANCELLED' || (plan.status as string) === 'CANCELLED') {
          releaseLocks();
          return;
        }

        if (toolResult.success) {
          if (isMutation) {
            planStateMachine.emitVerificationStarted(plan, step, `Verifying ${step.toolName}...`);
            const vResult = await AIToolExecutor.verifyCapability(capability, step.toolArgs ?? {}, toolResult.output, context);
            if (vResult === 'FAILED') {
               planStateMachine.emitVerificationFailed(plan, step, `Verification failed`);
               throw new Error("Verification failed after execution.");
            }
            planStateMachine.emitVerificationSucceeded(plan, step, `Verification succeeded for ${step.toolName}`);

            // Register Transaction
            const { TransactionManager } = await import('./transactions/TransactionManager');
            const compIntent = capability.getCompensationIntent ? await capability.getCompensationIntent(step.toolArgs ?? {}, toolResult.output, context) : null;
            
            TransactionManager.registerTransaction({
              workflowId: plan.workflowId!,
              stepId: step.id,
              capabilityId: step.toolName,
              executionId: step.executionId,
              resourceInfo: dryRunResult,
              compensationInfo: compIntent,
              reversibility: capability.isReversible ? 'REVERSIBLE' : 'IRREVERSIBLE',
              status: 'COMMITTED'
            });
          }
          
          if (controllers) {
            const index = controllers.indexOf(abortController);
            if (index !== -1) controllers.splice(index, 1);
          }
          
          releaseLocks();
          
          let observationOutcome: 'UNKNOWN' | 'VERIFIED' | 'NOT_VERIFIED' | undefined;
          let obsResult: any;

          if (isMutation && step.verificationPredicate) {
             planStateMachine.emitVerificationStarted(plan, step, `Observing application state...`);
             const { ApplicationObserver } = await import('./verification/ApplicationObserver');
             const { VerificationEngine } = await import('./verification/VerificationEngine');

             // We need to determine the appId. If tool is blender.* it's blender.
             const appId = capability.id.startsWith('ae_') ? 'after_effects' : capability.id.startsWith('blender.') ? 'blender' : null;
             
             if (appId) {
               obsResult = await ApplicationObserver.observe(appId, context);
               if (obsResult === 'UNKNOWN') {
                 observationOutcome = 'UNKNOWN';
               } else {
                 step.observationResult = obsResult;
                 observationOutcome = VerificationEngine.verify(obsResult, step.verificationPredicate);
                 step.verificationResult = observationOutcome;
               }
             }
          }

          if (observationOutcome === 'UNKNOWN') {
             planStateMachine.failStep(plan, step, 'Observation failed or application disconnected.', 'EXECUTION_FAILED', 'UNKNOWN');
             return; // Do NOT retry UNKNOWN
          } else if (observationOutcome === 'NOT_VERIFIED') {
             planStateMachine.failStep(plan, step, 'Verification predicate failed after observation.', 'EXECUTION_FAILED', 'FAILED');
             return; // Do NOT retry NOT_VERIFIED automatically
          }

          if (plan.workflowId) {
            const { WorkflowVariableStore } = await import('./dataflow/WorkflowVariableStore');
            let parsedOutputs: Record<string, unknown> = {};
            try {
              if (typeof toolResult.output === 'string' && toolResult.output.trim().startsWith('{')) {
                parsedOutputs = JSON.parse(toolResult.output);
              } else if (typeof toolResult.output === 'object' && toolResult.output !== null) {
                parsedOutputs = toolResult.output;
              }
            } catch {
              parsedOutputs = { output: toolResult.output };
            }
            step.stepOutputs = parsedOutputs;
            WorkflowVariableStore.setStepOutputs(
              plan.workflowId,
              step.id,
              parsedOutputs,
              step.outputDefinitions
            );
          }

          planStateMachine.succeedStep(plan, step, toolResult.output);
          return; // Success, exit retry loop
        } else {
          if (isMutation) {
            planStateMachine.emitVerificationFailed(plan, step, toolResult.error ?? 'Execution failed');
          }
          throw new Error(toolResult.error ?? toolResult.output);
        }

      } catch (err: unknown) {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        
        if (controllers) {
          const index = controllers.indexOf(abortController);
          if (index !== -1) controllers.splice(index, 1);
        }

        if ((step.status as string) === 'CANCELLED' || (plan.status as string) === 'CANCELLED') {
          releaseLocks();
          return;
        }

        const errorMsg = err instanceof Error ? err.message : String(err);
        
        if (errorMsg.includes('Action denied by user') || errorMsg.includes('[Rezel Security] Blocked')) {
          // Security / Permission failures are NON-RETRYABLE
          planStateMachine.failStep(plan, step, errorMsg, 'SECURITY_BLOCKED', 'FAILED');
          releaseLocks();
          return;
        }

        if (errorMsg === 'Step execution timed out') {
          if (isMutation || retryPolicy === 'NEVER') {
            planStateMachine.failStep(plan, step, errorMsg, 'TIMEOUT', 'UNKNOWN');
            releaseLocks();
            return;
          } else {
            planStateMachine.failStep(plan, step, errorMsg, 'TIMEOUT', 'FAILED');
          }
        } else {
          // Regular execution failure
          planStateMachine.failStep(plan, step, errorMsg, 'EXECUTION_FAILED', 'FAILED');
          if (isMutation || retryPolicy === 'NEVER') {
            releaseLocks();
            return;
          }
        }

        if (step.attempts > maxRetries) {
          releaseLocks();
          return;
        }
        
        // Wait before retry
        releaseLocks();
        planStateMachine.waitStep(plan, step, 'RETRY_BACKOFF', `Waiting before retry...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * step.attempts));
      }
    }
  }

  /**
   * reconcileStep
   * Allows explicit reconciliation via ApplicationObserver for recovery, without executing mutations.
   */
  async reconcileStep(plan: Plan, step: PlanStep): Promise<void> {
    if (!step.verificationPredicate) {
      throw new Error("Cannot reconcile step without a verificationPredicate.");
    }
    const { CapabilityRegistry } = await import('./capabilities/CapabilityRegistry');
    const capability = CapabilityRegistry.get(step.toolName!);
    if (!capability) throw new Error("Unknown capability");

    const appId = capability.id.startsWith('ae_') ? 'after_effects' : capability.id.startsWith('blender.') ? 'blender' : null;
    if (!appId) throw new Error("Unsupported capability for reconciliation");

    const { ApplicationObserver } = await import('./verification/ApplicationObserver');
    const { VerificationEngine } = await import('./verification/VerificationEngine');

    planStateMachine.emitVerificationStarted(plan, step, `Reconciling application state...`);
    
    const context = {
      workflowId: plan.workflowId!,
      executionId: step.executionId,
      scopes: [],
      metadata: {},
      signal: new AbortController().signal
    };

    const obsResult = await ApplicationObserver.observe(appId, context);
    if (obsResult === 'UNKNOWN') {
      planStateMachine.failStep(plan, step, 'Observation failed or application disconnected.', 'EXECUTION_FAILED', 'UNKNOWN');
      return;
    }
    
    step.observationResult = obsResult;
    const observationOutcome = VerificationEngine.verify(obsResult, step.verificationPredicate);
    step.verificationResult = observationOutcome;

    if (observationOutcome === 'VERIFIED') {
      step.status = 'RUNNING';
      planStateMachine.succeedStep(plan, step, step.result ?? 'Reconciled successfully');
    } else if (observationOutcome === 'NOT_VERIFIED') {
      step.status = 'RUNNING';
      planStateMachine.failStep(plan, step, 'Reconciliation verification predicate failed.', 'EXECUTION_FAILED', 'FAILED');
    }
  }
}

export const PlanEngine = new PlanExecutor();
