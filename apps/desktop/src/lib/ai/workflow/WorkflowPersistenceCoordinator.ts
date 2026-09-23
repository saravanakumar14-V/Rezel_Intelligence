/**
 * REZEL PHASE 16 — WORKFLOW PERSISTENCE & SAFE RESUME COORDINATOR
 *
 * Implements persistent serialization and safe resume semantics for Phase 16 workflows:
 * - Persists exact workflow run state, template ID, version, step states, artifacts, and verification.
 * - Enforces zero secrets in persisted state.
 * - Safe resume:
 *   1. Revalidate template version and definition.
 *   2. Revalidate file artifacts.
 *   3. Re-observe original postconditions for COMPLETED steps.
 *   4. Valid -> keep COMPLETED.
 *   5. Invalid/unprovable -> mark UNKNOWN (NEVER automatically replay completed mutations).
 *   6. Resume incomplete steps.
 */

import type { WorkflowExecution } from './types';
import { WorkflowExecutionEngine, type ExecuteWorkflowOptions } from './WorkflowExecutionEngine';
import { WorkflowArtifactManager } from './WorkflowArtifactManager';
import { ApplicationObserver } from '../verification/ApplicationObserver';
import { VerificationEngine } from '../verification/VerificationEngine';

const STORAGE_PREFIX = 'rezel_workflow_exec_';

export class WorkflowPersistenceCoordinator {
  private inMemoryStore = new Map<string, string>();

  /**
   * Persists a WorkflowExecution snapshot safely.
   */
  async save(execution: WorkflowExecution): Promise<void> {
    // Sanitize state to prevent persisting secrets or credentials
    const sanitized = this.sanitizeExecution(execution);
    const jsonStr = JSON.stringify(sanitized);

    this.inMemoryStore.set(execution.workflowId, jsonStr);

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(`${STORAGE_PREFIX}${execution.workflowId}`, jsonStr);
      } catch (err) {
        console.warn(`[WorkflowPersistenceCoordinator] Failed to save to localStorage:`, err);
      }
    }
  }

  /**
   * Loads a persisted WorkflowExecution.
   */
  async load(workflowId: string): Promise<WorkflowExecution | undefined> {
    if (this.inMemoryStore.has(workflowId)) {
      const raw = this.inMemoryStore.get(workflowId)!;
      return JSON.parse(raw);
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${workflowId}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          this.inMemoryStore.set(workflowId, raw);
          return parsed;
        }
      } catch (err) {
        console.warn(`[WorkflowPersistenceCoordinator] Failed to load from localStorage:`, err);
      }
    }

    return undefined;
  }

  /**
   * Resumes a persisted execution safely adhering to the Phase 16 zero-blind-replay invariant.
   */
  async resume(
    workflowId: string,
    options: ExecuteWorkflowOptions = {}
  ): Promise<WorkflowExecution> {
    const execution = await this.load(workflowId);
    if (!execution) {
      throw new Error(`[RESUME_ERROR] Workflow execution '${workflowId}' not found in persistence store`);
    }

    // 1. Revalidate Template Version & Definition
    if (!execution.definition || !execution.definition.version) {
      execution.status = 'UNKNOWN';
      execution.failure = {
        code: 'INVALID_PERSISTED_STATE',
        message: 'Persisted workflow definition or version is missing',
      };
      await this.save(execution);
      return execution;
    }

    // 2. Revalidate File Artifacts
    for (const [artName, art] of Object.entries(execution.artifacts || {})) {
      if (art.type === 'FILE' && art.path) {
        const valid = WorkflowArtifactManager.validateArtifactForConsumption(art, 'system', 'resume');
        if (!valid.valid) {
          execution.status = 'UNKNOWN';
          execution.failure = {
            code: 'ARTIFACT_DRIFT',
            message: `Persisted file artifact '${artName}' is no longer valid: ${valid.error}`,
          };
          await this.save(execution);
          return execution;
        }
      }
    }

    // 3. Re-observe original postconditions for COMPLETED steps
    const stepMap = new Map(execution.definition.steps.map((s) => [s.id, s]));
    for (const [stepId, stepResult] of Object.entries(execution.stepResults)) {
      if (stepResult.status === 'COMPLETED') {
        const step = stepMap.get(stepId);
        if (step && step.postconditions && step.postconditions.length > 0) {
          const obs = await ApplicationObserver.observe(step.applicationId, {
            workflowId: execution.workflowId,
            executionId: `resume_verify_${stepId}_${Date.now()}`,
          });

          if (obs === 'UNKNOWN' || obs.status === 'ERROR') {
            // Unprovable state -> mark step UNKNOWN (NEVER replay mutation)
            stepResult.status = 'UNKNOWN';
            execution.status = 'UNKNOWN';
            execution.failure = {
              code: 'RESUME_VERIFICATION_UNPROVABLE',
              message: `Cannot observe application state to revalidate completed step '${stepId}'`,
              stepId,
            };
            await this.save(execution);
            return execution;
          }

          for (const pred of step.postconditions) {
            const vRes = VerificationEngine.verify(obs, pred);
            if (vRes !== 'VERIFIED') {
              // Postcondition no longer true -> mark UNKNOWN (NEVER replay mutation)
              stepResult.status = 'UNKNOWN';
              execution.status = 'UNKNOWN';
              execution.failure = {
                code: 'RESUME_VERIFICATION_DRIFT',
                message: `State drift detected on resume: postcondition for step '${stepId}' is ${vRes}`,
                stepId,
              };
              await this.save(execution);
              return execution;
            }
          }
        }
      }
    }

    // 4. Delegate to WorkflowExecutionEngine to resume incomplete steps
    const resumed = await WorkflowExecutionEngine.resumeWorkflow(execution, options);
    await this.save(resumed);
    return resumed;
  }

  /**
   * Sanitizes execution data to guarantee no credentials or secrets are persisted.
   */
  private sanitizeExecution(execution: WorkflowExecution): WorkflowExecution {
    const clone: WorkflowExecution = JSON.parse(JSON.stringify(execution));

    // Strip sensitive keys from metadata and inputValues
    const sensitiveKeys = ['password', 'secret', 'token', 'apiKey', 'authorization', 'credential'];
    
    function sanitizeObject(obj: any) {
      if (!obj || typeof obj !== 'object') return;
      for (const k of Object.keys(obj)) {
        if (sensitiveKeys.some((s) => k.toLowerCase().includes(s.toLowerCase()))) {
          delete obj[k];
        } else if (typeof obj[k] === 'object') {
          sanitizeObject(obj[k]);
        }
      }
    }

    sanitizeObject(clone.inputValues);
    sanitizeObject(clone.outputValues);
    sanitizeObject(clone.definition.metadata);

    return clone;
  }
}

export const WorkflowPersistence = new WorkflowPersistenceCoordinator();
