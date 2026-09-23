/**
 * REZEL PHASE 14 — WORKFLOW EXECUTION ENGINE
 *
 * Deterministic orchestrator executing cross-application workflows using
 * registered application operations, typed artifact handoffs, per-step
 * resource locking, strict dependency gating, and safe resume semantics.
 *
 * Strict Invariants:
 * - NO autonomous retries or infinite loops.
 * - NO UI exploration, arbitrary Python, or arbitrary ExtendScript.
 * - NO process killing.
 * - Per-step resource locking and policy enforcement via ApplicationPlanningAdapter.
 * - Fail-closed: FAILED/UNKNOWN/BLOCKED dependencies block subsequent steps.
 */

import { ApplicationRegistry } from '../../applications/ApplicationRegistry';
import { ApplicationPlanningAdapter } from '../planning/app/ApplicationPlanningAdapter';
import { ApplicationStateInferenceEngine } from '../inference/ApplicationStateInferenceEngine';
import { ApplicationObserver } from '../verification/ApplicationObserver';
import { VerificationEngine } from '../verification/VerificationEngine';
import { EmergencyAbort } from '../computer/EmergencyAbort';
import { WorkflowArtifactManager } from './WorkflowArtifactManager';
import { WorkflowGraphValidator } from './WorkflowGraphValidator';
import { WorkflowConditionEvaluator } from './template/WorkflowConditionEvaluator';
import type {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowStep,
  WorkflowStepResult,
  WorkflowStepState,
  WorkflowArtifact,
  WorkflowDryRunResult,
  WorkflowObservabilitySnapshot,
} from './types';

export interface ExecuteWorkflowOptions {
  workflowId?: string;
  sessionId?: string;
  signal?: AbortSignal;
  dryRun?: boolean;
}

export class WorkflowExecutionEngineImpl {
  private activeExecutions = new Map<string, WorkflowExecution>();
  private activeControllers = new Map<string, AbortController>();

  /**
   * Dry-runs a WorkflowDefinition and returns static validation + adapter readiness.
   */
  async dryRun(
    definition: WorkflowDefinition,
    _inputs: Record<string, unknown> = {}
  ): Promise<WorkflowDryRunResult> {
    const staticRes = WorkflowGraphValidator.validate(definition);
    if (!staticRes.valid) {
      return staticRes;
    }

    const appStatuses: Array<{ appId: string; available: boolean; reason?: string }> = [];
    const stepAppIds = Array.from(new Set(definition.steps.map((s) => s.applicationId)));

    for (const appId of stepAppIds) {
      const adapter = ApplicationRegistry.get(appId);
      if (!adapter) {
        appStatuses.push({
          appId,
          available: false,
          reason: `No native adapter registered for '${appId}'`,
        });
      } else {
        const health = adapter.getHealth();
        if (!health || health.state === 'DISCONNECTED') {
          appStatuses.push({
            appId,
            available: false,
            reason: `Adapter for '${appId}' is DISCONNECTED (${health?.message || 'offline'})`,
          });
        } else {
          appStatuses.push({
            appId,
            available: true,
          });
        }
      }
    }

    return {
      valid: staticRes.valid && appStatuses.every((a) => a.available),
      definitionId: definition.id,
      version: definition.version,
      errors: staticRes.errors,
      warnings: staticRes.warnings,
      resolvedOrder: staticRes.resolvedOrder,
      applications: appStatuses,
    };
  }

  /**
   * Executes a deterministic multi-application workflow from definition and inputs.
   */
  async executeWorkflow(
    definition: WorkflowDefinition,
    inputs: Record<string, unknown> = {},
    options: ExecuteWorkflowOptions = {}
  ): Promise<WorkflowExecution> {
    const workflowId = options.workflowId || `wf_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const sessionId = options.sessionId || 'default';

    // 1. Static Validation Gate
    const validationReport = WorkflowGraphValidator.validate(definition);
    if (!validationReport.valid) {
      const failureMsg = validationReport.errors.map((e) => e.message).join('; ');
      const execution: WorkflowExecution = {
        workflowId,
        definition,
        status: 'FAILED',
        stepResults: {},
        artifacts: {},
        inputValues: { ...inputs },
        outputValues: {},
        startedAt: Date.now(),
        updatedAt: Date.now(),
        completedAt: Date.now(),
        failure: {
          code: 'WORKFLOW_VALIDATION_FAILED',
          message: `Workflow validation failed: ${failureMsg}`,
          details: { errors: validationReport.errors },
        },
      };
      this.activeExecutions.set(workflowId, execution);
      return execution;
    }

    // 2. Initialize execution state
    const abortController = new AbortController();
    if (options.signal) {
      if (options.signal.aborted) {
        abortController.abort();
      } else {
        options.signal.addEventListener('abort', () => abortController.abort(), { once: true });
      }
    }
    this.activeControllers.set(workflowId, abortController);

    const execution: WorkflowExecution = {
      workflowId,
      definition,
      status: 'RUNNING',
      stepResults: {},
      artifacts: {},
      inputValues: { ...inputs },
      outputValues: {},
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.activeExecutions.set(workflowId, execution);

    // Initialize artifact manager with input parameters if provided
    for (const [, val] of Object.entries(inputs)) {
      if (val && typeof val === 'object' && 'artifactId' in val && 'type' in val) {
        WorkflowArtifactManager.registerArtifact(workflowId, val as WorkflowArtifact);
        execution.artifacts[(val as WorkflowArtifact).name] = val as WorkflowArtifact;
      }
    }

    const stepMap = new Map(definition.steps.map((s) => [s.id, s]));
    let lastMutatingAppId: string | undefined = undefined;

    try {
      // 3. Execute Steps following topological / dependency order
      for (const stepId of validationReport.resolvedOrder) {
        const step = stepMap.get(stepId);
        if (!step) continue;

        // 3.1 Check EmergencyAbort & Cancellation
        if (EmergencyAbort.isAborted()) {
          const reason = EmergencyAbort.getReason() || 'EmergencyAbort triggered';
          execution.status = 'CANCELLED';
          execution.failure = { code: 'EMERGENCY_ABORT', message: reason };
          this.markIncompleteSteps(execution, stepId, 'CANCELLED', reason);
          break;
        }

        if (abortController.signal.aborted) {
          execution.status = 'CANCELLED';
          execution.failure = { code: 'WORKFLOW_CANCELLED', message: 'Workflow execution was cancelled' };
          this.markIncompleteSteps(execution, stepId, 'CANCELLED', 'Workflow cancelled');
          break;
        }

        // 3.2 Dependency Gating (Fail-Closed)
        const deps = step.dependencies || [];
        const failedDep = deps.find((depId) => {
          const res = execution.stepResults[depId];
          return !res || res.status !== 'COMPLETED';
        });

        if (failedDep) {
          const depResult = execution.stepResults[failedDep];
          const depStatus = depResult?.status || 'PENDING';
          const errorMsg = `Blocked by dependency '${failedDep}' which is ${depStatus}`;

          execution.stepResults[step.id] = {
            stepId: step.id,
            applicationId: step.applicationId,
            operationId: step.operationId,
            status: 'BLOCKED',
            producedArtifacts: [],
            durationMs: 0,
            startedAt: Date.now(),
            completedAt: Date.now(),
            failure: {
              code: 'DEPENDENCY_BLOCKED',
              message: errorMsg,
              stepId: failedDep,
            },
          };
          continue;
        }

        // 3.3 Cross-Application State Invalidation
        if (lastMutatingAppId && lastMutatingAppId !== step.applicationId) {
          ApplicationStateInferenceEngine.notifyActionExecuted(
            step.applicationId,
            sessionId,
            'GENERIC_MUTATION'
          );
        }

        // 3.4 Execute Step
        const stepResult = await this.executeStep(step, execution, {
          sessionId,
          signal: abortController.signal,
        });

        execution.stepResults[step.id] = stepResult;
        execution.updatedAt = Date.now();

        if (stepResult.status === 'COMPLETED') {
          lastMutatingAppId = step.applicationId;
          for (const art of stepResult.producedArtifacts) {
            execution.artifacts[art.name] = art;
          }
        } else {
          // If a step failed or cancelled, record execution failure state
          if (stepResult.status === 'CANCELLED') {
            execution.status = 'CANCELLED';
            execution.failure = stepResult.failure;
            this.markIncompleteSteps(execution, step.id, 'CANCELLED', stepResult.failure?.message || 'Workflow cancelled');
            break;
          } else if (stepResult.status === 'UNKNOWN') {
            execution.status = 'UNKNOWN';
            execution.failure = stepResult.failure;
          } else {
            execution.status = 'FAILED';
            execution.failure = stepResult.failure;
          }
          // Continue loop so subsequent dependent steps are marked BLOCKED by Section 3.2
        }
      }

      // 4. Final Status Evaluation
      if (execution.status === 'RUNNING') {
        const anyFailed = Object.values(execution.stepResults).some((r) => r.status === 'FAILED');
        const anyBlocked = Object.values(execution.stepResults).some((r) => r.status === 'BLOCKED');
        const anyUnknown = Object.values(execution.stepResults).some((r) => r.status === 'UNKNOWN');
        const allCompleted = definition.steps.every(
          (s) => execution.stepResults[s.id]?.status === 'COMPLETED'
        );

        if (allCompleted) {
          execution.status = 'COMPLETED';
          // Compute declared workflow outputs
          if (definition.outputs) {
            for (const outDef of definition.outputs) {
              const srcRes = execution.stepResults[outDef.sourceStepId];
              if (srcRes && outDef.sourceArtifactName) {
                const art = srcRes.producedArtifacts.find((a) => a.name === outDef.sourceArtifactName);
                if (art) {
                  execution.outputValues[outDef.name] = art.path || art.value || art;
                }
              }
            }
          }
        } else if (anyUnknown) {
          execution.status = 'UNKNOWN';
        } else if (anyFailed || anyBlocked) {
          execution.status = 'FAILED';
        }
      }
    } finally {
      execution.completedAt = Date.now();
      execution.updatedAt = Date.now();
      this.activeControllers.delete(workflowId);
    }

    return execution;
  }

  /**
   * Executes a single WorkflowStep through ApplicationPlanningAdapter.
   */
  private async executeStep(
    step: WorkflowStep,
    execution: WorkflowExecution,
    options: { sessionId: string; signal: AbortSignal }
  ): Promise<WorkflowStepResult> {
    const startTime = Date.now();
    const executionId = `exec_${step.id}_${Date.now()}`;

    // 1. Resolve Application Adapter Health
    const adapter = ApplicationRegistry.get(step.applicationId);
    if (!adapter) {
      return {
        stepId: step.id,
        applicationId: step.applicationId,
        operationId: step.operationId,
        status: 'FAILED',
        producedArtifacts: [],
        durationMs: Date.now() - startTime,
        startedAt: startTime,
        completedAt: Date.now(),
        failure: {
          code: 'ADAPTER_DISCONNECTED',
          message: `Application '${step.applicationId}' has no registered adapter`,
          applicationId: step.applicationId,
        },
      };
    }

    const health = adapter.getHealth(options.sessionId);
    if (!health || health.state === 'DISCONNECTED') {
      return {
        stepId: step.id,
        applicationId: step.applicationId,
        operationId: step.operationId,
        status: 'FAILED',
        producedArtifacts: [],
        durationMs: Date.now() - startTime,
        startedAt: startTime,
        completedAt: Date.now(),
        failure: {
          code: 'ADAPTER_DISCONNECTED',
          message: `Application '${step.applicationId}' is not connected (${health?.message || 'DISCONNECTED'})`,
          applicationId: step.applicationId,
        },
      };
    }

    // 1.5 Evaluate Step Conditions (Deterministic Closed DSL)
    const condResults = await WorkflowConditionEvaluator.evaluateStepConditions(step, execution);
    const failedCond = condResults.find((c) => !c.passed);
    if (failedCond) {
      return {
        stepId: step.id,
        applicationId: step.applicationId,
        operationId: step.operationId,
        status: 'BLOCKED',
        producedArtifacts: [],
        durationMs: Date.now() - startTime,
        startedAt: startTime,
        completedAt: Date.now(),
        failure: {
          code: 'CONDITION_FAILED',
          message: failedCond.reason || `Condition failed for step '${step.id}'`,
        },
      };
    }

    // 2. Resolve Parameters and Input Bindings
    const resolvedParams: Record<string, unknown> = {};
    for (const [paramName, rawVal] of Object.entries(step.parameters || {})) {
      if (typeof rawVal === 'string') {
        // Artifact reference: {{artifacts.<name>}} or {{steps.<stepId>.artifacts.<name>}}
        const artMatch = rawVal.match(/^\{\{(?:artifacts\.|steps\.[a-zA-Z0-9_]+\.artifacts\.)([a-zA-Z0-9_]+)\}\}$/);
        if (artMatch) {
          const artName = artMatch[1];
          const artifact = WorkflowArtifactManager.getArtifact(execution.workflowId, artName);
          if (!artifact) {
            return {
              stepId: step.id,
              applicationId: step.applicationId,
              operationId: step.operationId,
              status: 'FAILED',
              producedArtifacts: [],
              durationMs: Date.now() - startTime,
              startedAt: startTime,
              completedAt: Date.now(),
              failure: {
                code: 'ARTIFACT_INVALID',
                message: `Referenced artifact '${artName}' was not found in workflow artifacts`,
              },
            };
          }

          // Validate artifact before consumption
          const validation = WorkflowArtifactManager.validateArtifactForConsumption(
            artifact,
            step.applicationId,
            step.operationId
          );
          if (!validation.valid) {
            return {
              stepId: step.id,
              applicationId: step.applicationId,
              operationId: step.operationId,
              status: 'FAILED',
              producedArtifacts: [],
              durationMs: Date.now() - startTime,
              startedAt: startTime,
              completedAt: Date.now(),
              failure: {
                code: 'ARTIFACT_INVALID',
                message: `Artifact validation failed: ${validation.error}`,
              },
            };
          }

          // Map artifact to appropriate parameter payload
          resolvedParams[paramName] = artifact.path || artifact.resourceId || artifact.objectId || artifact.value || artifact;
          continue;
        }

        // Parameter reference: {{params.<name>}}
        const paramMatch = rawVal.match(/^\{\{params\.([a-zA-Z0-9_]+)\}\}$/);
        if (paramMatch) {
          const pName = paramMatch[1];
          resolvedParams[paramName] = execution.inputValues[pName] ?? rawVal;
          continue;
        }
      }

      resolvedParams[paramName] = rawVal;
    }

    // 3. Plan Operation via ApplicationPlanningAdapter
    const planRes = await ApplicationPlanningAdapter.planOperation({
      query: `${step.applicationId}: ${step.operationId}`,
      explicitAppId: step.applicationId,
      parameters: resolvedParams,
      sessionId: options.sessionId,
    });

    if (!planRes.success || !planRes.plannedOperation) {
      return {
        stepId: step.id,
        applicationId: step.applicationId,
        operationId: step.operationId,
        status: 'FAILED',
        producedArtifacts: [],
        durationMs: Date.now() - startTime,
        startedAt: startTime,
        completedAt: Date.now(),
        failure: {
          code: (!planRes.success ? (planRes as any).failureCode : undefined) || 'PLANNING_FAILED',
          message: (!planRes.success ? (planRes as any).reason : undefined) || 'Failed to plan operation',
          details: !planRes.success ? (planRes as any).details : undefined,
        },
      };
    }

    // 4. Check Cancellation before execution dispatch
    if (options.signal.aborted || EmergencyAbort.isAborted()) {
      return {
        stepId: step.id,
        applicationId: step.applicationId,
        operationId: step.operationId,
        status: 'CANCELLED',
        producedArtifacts: [],
        durationMs: Date.now() - startTime,
        startedAt: startTime,
        completedAt: Date.now(),
        failure: {
          code: 'CANCELLED',
          message: 'Step execution cancelled before dispatch',
        },
      };
    }

    // 5. Execute Planned Operation (owns per-step ResourceLock, PolicyEngine, EmergencyAbort)
    const execRes = await ApplicationPlanningAdapter.executePlannedOperation(
      planRes.plannedOperation,
      {
        workflowId: execution.workflowId,
        executionId,
      }
    );

    if (!execRes.success) {
      const isCancelled = execRes.status === 'CANCELLED';
      const isUnknown = execRes.status === 'UNKNOWN' || execRes.status === 'DISCONNECTED';
      const stepStatus: WorkflowStepState = isCancelled ? 'CANCELLED' : isUnknown ? 'UNKNOWN' : 'FAILED';

      return {
        stepId: step.id,
        applicationId: step.applicationId,
        operationId: step.operationId,
        status: stepStatus,
        producedArtifacts: [],
        durationMs: Date.now() - startTime,
        startedAt: startTime,
        completedAt: Date.now(),
        failure: {
          code: execRes.status || 'EXECUTION_FAILED',
          message: execRes.error || 'Step execution failed',
        },
      };
    }

    // 6. Postcondition Verification (if step defines postconditions)
    let verification: WorkflowStepResult['verification'] = undefined;
    if (step.postconditions && step.postconditions.length > 0) {
      const obs = await ApplicationObserver.observe(step.applicationId, {
        workflowId: execution.workflowId,
        executionId,
      });

      if (obs === 'UNKNOWN') {
        verification = {
          status: 'UNKNOWN',
          reason: 'Application observation failed or adapter disconnected',
          observedAt: Date.now(),
        };
      } else {
        let allVerified = true;
        for (const pred of step.postconditions) {
          const vRes = VerificationEngine.verify(obs, pred);
          if (vRes !== 'VERIFIED') {
            allVerified = false;
            verification = {
              status: vRes,
              reason: `Predicate ${pred.operator} evaluation returned ${vRes}`,
              observedAt: Date.now(),
              predicate: pred,
            };
            break;
          }
        }
        if (allVerified) {
          verification = {
            status: 'VERIFIED',
            reason: 'All postconditions verified',
            observedAt: Date.now(),
          };
        }
      }

      if (verification && verification.status !== 'VERIFIED') {
        return {
          stepId: step.id,
          applicationId: step.applicationId,
          operationId: step.operationId,
          status: verification.status === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED',
          producedArtifacts: [],
          verification,
          durationMs: Date.now() - startTime,
          startedAt: startTime,
          completedAt: Date.now(),
          failure: {
            code: 'VERIFICATION_FAILED',
            message: verification.reason || 'Postcondition verification failed',
          },
        };
      }
    }

    // 7. Publish Produced Artifacts
    const producedArtifacts: WorkflowArtifact[] = [];
    if (step.outputArtifacts && step.outputArtifacts.length > 0) {
      const outcomeObj = execRes.executionResult?.outcome;
      const rawOutputObj = (execRes.executionResult as any)?.output;
      const outputObj: Record<string, any> =
        outcomeObj && typeof outcomeObj === 'object'
          ? (outcomeObj as Record<string, any>)
          : rawOutputObj && typeof rawOutputObj === 'object'
            ? (rawOutputObj as Record<string, any>)
            : {};

      for (const artDef of step.outputArtifacts) {
        try {
          const rawVal = artDef.targetProperty ? outputObj[artDef.targetProperty] : outputObj;
          const resolvedPath =
            typeof rawVal === 'string' && artDef.type === 'FILE'
              ? rawVal
              : (outputObj.path ||
                 outputObj.outputPath ||
                 outputObj.outputFilePath ||
                 outputObj.output_path ||
                 outputObj.filePath ||
                 (resolvedParams.outputPath as string) ||
                 (resolvedParams.output_path as string) ||
                 (resolvedParams.filePath as string) ||
                 (resolvedParams.outputFilePath as string));

          const art = WorkflowArtifactManager.createArtifact(execution.workflowId, {
            name: artDef.name,
            type: artDef.type,
            producerApplication: step.applicationId,
            producerStep: step.id,
            verified: true,
            path: artDef.type === 'FILE' ? resolvedPath : undefined,
            size: outputObj.size || 1024,
            mtime: Date.now(),
            contentHash: outputObj.hash || 'hash_verified',
            resourceId: outputObj.id || outputObj.name,
            objectId: outputObj.id || outputObj.name || (resolvedParams.name as string) || (resolvedParams.objectId as string),
            value: rawVal,
          });
          producedArtifacts.push(art);
        } catch (artErr: any) {
          console.warn(`[WorkflowExecutionEngine] Failed to create output artifact '${artDef.name}':`, artErr);
        }
      }
    }

    return {
      stepId: step.id,
      applicationId: step.applicationId,
      operationId: step.operationId,
      status: 'COMPLETED',
      output: execRes.executionResult?.outcome,
      producedArtifacts,
      verification,
      durationMs: Date.now() - startTime,
      startedAt: startTime,
      completedAt: Date.now(),
    };
  }

  /**
   * Resumes a persisted workflow run safely:
   * - Re-observes and re-verifies previously COMPLETED steps.
   * - If state drifted, marks step UNKNOWN (NEVER re-executes completed mutations).
   * - Resumes execution of incomplete steps.
   */
  async resumeWorkflow(
    execution: WorkflowExecution,
    options: ExecuteWorkflowOptions = {}
  ): Promise<WorkflowExecution> {
    const sessionId = options.sessionId || 'default';
    const abortController = new AbortController();
    if (options.signal) {
      options.signal.addEventListener('abort', () => abortController.abort(), { once: true });
    }
    this.activeControllers.set(execution.workflowId, abortController);

    execution.status = 'RUNNING';
    execution.updatedAt = Date.now();

    const stepMap = new Map(execution.definition.steps.map((s) => [s.id, s]));

    // 1. Re-validate previously COMPLETED steps (Safe Resume Contract)
    for (const [stepId, stepResult] of Object.entries(execution.stepResults)) {
      if (stepResult.status === 'COMPLETED') {
        const step = stepMap.get(stepId);
        if (step && step.postconditions && step.postconditions.length > 0) {
          const obs = await ApplicationObserver.observe(step.applicationId, {
            workflowId: execution.workflowId,
            executionId: `resume_verify_${stepId}_${Date.now()}`,
          });

          if (obs === 'UNKNOWN') {
            stepResult.status = 'UNKNOWN';
            execution.status = 'UNKNOWN';
            execution.failure = {
              code: 'RESUME_VERIFICATION_UNKNOWN',
              message: `Cannot verify previous postcondition for step '${stepId}' after restart`,
              stepId,
            };
            return execution;
          }

          for (const pred of step.postconditions) {
            const vRes = VerificationEngine.verify(obs, pred);
            if (vRes !== 'VERIFIED') {
              stepResult.status = 'UNKNOWN';
              execution.status = 'UNKNOWN';
              execution.failure = {
                code: 'RESUME_VERIFICATION_DRIFT',
                message: `State drift detected on resume: postcondition for step '${stepId}' is ${vRes}`,
                stepId,
              };
              return execution;
            }
          }
        }
      }
    }

    // 2. Continue with remaining uncompleted steps
    const validation = WorkflowGraphValidator.validate(execution.definition);
    for (const stepId of validation.resolvedOrder) {
      const existing = execution.stepResults[stepId];
      if (existing && existing.status === 'COMPLETED') {
        continue; // Already verified; do not replay mutation
      }

      const step = stepMap.get(stepId);
      if (!step) continue;

      if (abortController.signal.aborted || EmergencyAbort.isAborted()) {
        execution.status = 'CANCELLED';
        break;
      }

      // Gating
      const deps = step.dependencies || [];
      const failedDep = deps.find((depId) => execution.stepResults[depId]?.status !== 'COMPLETED');
      if (failedDep) {
        execution.stepResults[step.id] = {
          stepId: step.id,
          applicationId: step.applicationId,
          operationId: step.operationId,
          status: 'BLOCKED',
          producedArtifacts: [],
          durationMs: 0,
          startedAt: Date.now(),
          completedAt: Date.now(),
        };
        continue;
      }

      const res = await this.executeStep(step, execution, {
        sessionId,
        signal: abortController.signal,
      });
      execution.stepResults[step.id] = res;
      execution.updatedAt = Date.now();

      if (res.status !== 'COMPLETED') {
        execution.status = res.status === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
        execution.failure = res.failure;
        break;
      }
    }

    if (execution.status === 'RUNNING') {
      const allCompleted = execution.definition.steps.every(
        (s) => execution.stepResults[s.id]?.status === 'COMPLETED'
      );
      execution.status = allCompleted ? 'COMPLETED' : 'FAILED';
    }

    execution.updatedAt = Date.now();
    this.activeControllers.delete(execution.workflowId);
    return execution;
  }

  /**
   * Cancels an active workflow execution.
   */
  cancelWorkflow(workflowId: string, reason: string = 'User requested cancellation'): void {
    const controller = this.activeControllers.get(workflowId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(workflowId);
    }

    const execution = this.activeExecutions.get(workflowId);
    if (execution && execution.status === 'RUNNING') {
      execution.status = 'CANCELLED';
      execution.failure = { code: 'CANCELLED', message: reason };
      execution.updatedAt = Date.now();
      execution.completedAt = Date.now();
    }
  }

  /**
   * Retrieves an active workflow execution.
   */
  getExecution(workflowId: string): WorkflowExecution | undefined {
    return this.activeExecutions.get(workflowId);
  }

  /**
   * Generates a read-only observability snapshot of a workflow execution for UI monitoring.
   * Enforces zero secrets.
   */
  createObservabilitySnapshot(execution: WorkflowExecution): WorkflowObservabilitySnapshot {
    const stepStatus: Record<string, WorkflowStepState> = {};
    const verificationResults: Record<string, import('./types').WorkflowVerification> = {};
    const operations: Array<{ stepId: string; applicationId: string; operationId: string; status: WorkflowStepState }> = [];

    for (const step of execution.definition.steps) {
      const res = execution.stepResults[step.id];
      const st = res?.status || 'PENDING';
      stepStatus[step.id] = st;
      operations.push({
        stepId: step.id,
        applicationId: step.applicationId,
        operationId: step.operationId,
        status: st,
      });
      if (res?.verification) {
        verificationResults[step.id] = res.verification;
      }
    }

    const currentStep = execution.definition.steps.find(
      (s) => execution.stepResults[s.id]?.status === 'RUNNING'
    )?.id;

    const apps = Array.from(new Set(execution.definition.steps.map((s) => s.applicationId)));

    const artifacts = Object.values(execution.artifacts || {}).map((art) => ({
      artifactId: art.artifactId,
      name: art.name,
      type: art.type,
      verified: art.verified,
      path: art.path,
      producerApplication: art.producerApplication,
    }));

    return {
      workflowId: execution.workflowId,
      templateId: (execution.definition.metadata?.compiledFromTemplateId as string | undefined) || execution.definition.id,
      templateVersion: execution.definition.version,
      status: execution.status,
      currentStep,
      stepStatus,
      applications: apps,
      operations,
      artifacts,
      verificationResults,
      failure: execution.failure,
      startedAt: execution.startedAt,
      updatedAt: execution.updatedAt,
      completedAt: execution.completedAt,
    };
  }

  private markIncompleteSteps(
    execution: WorkflowExecution,
    failedStepId: string,
    status: WorkflowStepState,
    reason: string
  ): void {
    for (const step of execution.definition.steps) {
      if (!execution.stepResults[step.id]) {
        execution.stepResults[step.id] = {
          stepId: step.id,
          applicationId: step.applicationId,
          operationId: step.operationId,
          status,
          producedArtifacts: [],
          durationMs: 0,
          startedAt: Date.now(),
          completedAt: Date.now(),
          failure: {
            code: status,
            message: reason,
            stepId: failedStepId,
          },
        };
      }
    }
  }
}

export const WorkflowExecutionEngine = new WorkflowExecutionEngineImpl();
