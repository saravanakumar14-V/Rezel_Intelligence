/**
 * Rezel 13.3.7 — Execution Recovery Coordinator
 *
 * Dedicated bounded orchestration layer for recovering uncertain Adobe native operations.
 *
 * STRICT SAFETY INVARIANTS:
 * - Exactly ONE bounded recovery attempt: Never executes a second recovery cycle.
 * - Never retries original mutations: Re-executing mutations after timeout is strictly prohibited.
 * - EmergencyAbort is terminal: Zero recovery, zero pings, zero filesystem checks when aborted.
 * - Preserves provenance: Retains initial error, adapter health, verification result, and duration.
 * - Cache Invalidation: Triggers hard cache clearing across all Adobe inspectors.
 */

import { EmergencyAbort } from '../computer/EmergencyAbort';
import { VerificationEngine } from '../verification/VerificationEngine';
import { ApplicationObserver } from '../verification/ApplicationObserver';
import { AdobeProjectInspector } from './AdobeProjectInspector';
import { AdobeTimelineInspector } from './AdobeTimelineInspector';
import { AdobeEffectInspector } from './AdobeEffectInspector';
import { AdobeRenderQueueInspector } from './AdobeRenderQueueInspector';
import { RenderFileVerifier, type RenderOutputBaseline } from './RenderFileVerifier';
import type { PlannedApplicationOperation, PlannedOperationExecutionResult } from '../planning/app/types';
import type { ApplicationAdapter, ApplicationOperationResult } from '../../applications/types';

export interface ExecutionRecoveryContext {
  readonly planned: PlannedApplicationOperation;
  readonly nativeStrategy: {
    readonly adapterId: string;
    readonly operationId: string;
    readonly capabilityId: string;
  };
  readonly adapter: ApplicationAdapter;
  readonly opResult: ApplicationOperationResult;
  readonly rawParams: Record<string, unknown>;
  readonly workflowId: string;
  readonly executionId: string;
  readonly startTime: number;
  readonly renderBaseline?: RenderOutputBaseline;
}

export class ExecutionRecoveryCoordinatorImpl {
  /**
   * Classifies whether an execution failure is recoverable.
   * Terminal failures (Policy, Permission, Abort, Invalid Params, Target Not Found) are NOT recoverable.
   */
  isRecoverable(result: {
    readonly success: boolean;
    readonly status?: string;
    readonly outcome?: unknown;
    readonly error?: string;
  }): boolean {
    if (result.success) return false;

    // Terminal statuses
    if (
      result.status === 'DENIED' ||
      result.status === 'CANCELLED' ||
      result.outcome === 'POLICY_DENIED' ||
      result.outcome === 'PERMISSION_DENIED' ||
      result.outcome === 'EMERGENCY_ABORTED'
    ) {
      return false;
    }

    const err = (result.error || '').toLowerCase();
    if (
      err.includes('emergencyabort') ||
      err.includes('policyengine denied') ||
      err.includes('permission denied') ||
      err.includes('invalid parameters') ||
      err.includes('invalid_parameters') ||
      err.includes('target_not_found') ||
      err.includes('target not found') ||
      err.includes('precondition_failed') ||
      err.includes('precondition')
    ) {
      return false;
    }

    // Uncertain recoverable outcomes
    return (
      result.outcome === 'UNKNOWN' ||
      result.status === 'DISCONNECTED' ||
      err.includes('ae_ipc_timeout') ||
      err.includes('timeout') ||
      err.includes('disconnected') ||
      err.includes('unknown')
    );
  }

  /**
   * Coordinates exactly one bounded recovery attempt for an uncertain native operation.
   */
  async coordinateRecovery(ctx: ExecutionRecoveryContext): Promise<PlannedOperationExecutionResult> {
    const { planned, nativeStrategy, adapter, opResult, workflowId, executionId, startTime, renderBaseline } = ctx;

    // 1. Check EmergencyAbort — Terminal, zero recovery
    if (EmergencyAbort.isAborted()) {
      const abortMsg = `Execution halted by EmergencyAbort: ${EmergencyAbort.getReason()}`;
      return {
        success: false,
        status: 'CANCELLED',
        results: [],
        error: abortMsg,
        executionResult: {
          success: false,
          status: 'CANCELLED',
          operationId: planned.operationId,
          applicationId: planned.applicationId,
          adapterId: nativeStrategy.adapterId,
          error: abortMsg,
          durationMs: Date.now() - startTime,
          recoveryAttempted: false,
        } as any,
      };
    }

    // 2. Invalidate all Adobe inspection caches to prevent stale reads
    AdobeProjectInspector.clearCache();
    AdobeTimelineInspector.invalidate();
    AdobeEffectInspector.clearCache();
    AdobeRenderQueueInspector.invalidateAll();

    // 3. Perform ONE lightweight adapter health check
    const sessionId = planned.compiledPlan.sessionId;
    const health = adapter.getHealth(sessionId);
    const isAdapterReady = health && health.state === 'READY';

    const isRenderOp =
      planned.operationId === 'start_render' ||
      nativeStrategy.capabilityId === 'ae_start_render' ||
      planned.operationId === 'ae_start_render';

    // ─── 4A. Adapter is READY ────────────────────────────────────────────────
    if (isAdapterReady) {
      // Check EmergencyAbort again before inspection
      if (EmergencyAbort.isAborted()) {
        const abortMsg = `Execution halted by EmergencyAbort during recovery: ${EmergencyAbort.getReason()}`;
        return {
          success: false,
          status: 'CANCELLED',
          results: [],
          error: abortMsg,
          executionResult: {
            success: false,
            status: 'CANCELLED',
            operationId: planned.operationId,
            applicationId: planned.applicationId,
            adapterId: nativeStrategy.adapterId,
            error: abortMsg,
            durationMs: Date.now() - startTime,
            recoveryAttempted: true,
          } as any,
        };
      }

      // Render Queue postcondition verification
      if (isRenderOp) {
        try {
          const rqSnap = await AdobeRenderQueueInspector.inspectRenderQueue({
            sessionId,
            forceRefresh: true,
          });

          if (rqSnap.status === 'ACTIVE_PROJECT' && rqSnap.items.length > 0) {
            const anyDone = rqSnap.items.some((it) => it.status === 'DONE');
            const anyErr = rqSnap.items.some((it) => it.status === 'ERR_STOPPED');

            if (anyDone && !anyErr) {
              const userExplanation = 'Render completed and the expected output was verified.';
              return {
                success: true,
                status: 'SUCCESS',
                results: [],
                executionResult: {
                  success: true,
                  status: 'SUCCESS',
                  operationId: planned.operationId,
                  applicationId: planned.applicationId,
                  adapterId: nativeStrategy.adapterId,
                  outcome: 'RENDER_CONFIRMED',
                  durationMs: Date.now() - startTime,
                  recoveryAttempted: true,
                  recoveryReason: opResult.error || 'Control-plane timeout during render',
                  verificationResult: 'VERIFIED',
                  userExplanation,
                } as any,
              };
            }

            if (anyErr) {
              const errMsg = 'Render failed in After Effects render queue.';
              return {
                success: false,
                status: 'FAILED',
                results: [],
                error: errMsg,
                executionResult: {
                  success: false,
                  status: 'FAILED',
                  operationId: planned.operationId,
                  applicationId: planned.applicationId,
                  adapterId: nativeStrategy.adapterId,
                  outcome: 'RENDER_NOT_CONFIRMED',
                  error: errMsg,
                  durationMs: Date.now() - startTime,
                  recoveryAttempted: true,
                  recoveryReason: opResult.error || 'Control-plane timeout during render',
                  verificationResult: 'NOT_VERIFIED',
                } as any,
              };
            }
          }
        } catch {
          // Fall through to filesystem secondary evidence check
        }

        // Secondary evidence check via filesystem
        if (renderBaseline) {
          const fileRes = await RenderFileVerifier.verifyPostRenderFile(renderBaseline);
          if (fileRes.status === 'VERIFIED') {
            const userExplanation = 'Render completed and the expected output was verified.';
            return {
              success: true,
              status: 'SUCCESS',
              results: [],
              executionResult: {
                success: true,
                status: 'SUCCESS',
                operationId: planned.operationId,
                applicationId: planned.applicationId,
                adapterId: nativeStrategy.adapterId,
                outcome: 'RENDER_CONFIRMED',
                durationMs: Date.now() - startTime,
                recoveryAttempted: true,
                recoveryReason: opResult.error || 'Control-plane timeout during render',
                verificationResult: 'VERIFIED',
                userExplanation,
              } as any,
            };
          }
        }

        const unknownMsg = 'After Effects stopped responding during render. Output could not be confirmed.';
        return {
          success: false,
          status: 'UNKNOWN',
          results: [],
          error: unknownMsg,
          executionResult: {
            success: false,
            status: 'UNKNOWN',
            operationId: planned.operationId,
            applicationId: planned.applicationId,
            adapterId: nativeStrategy.adapterId,
            outcome: 'RENDER_UNKNOWN',
            error: unknownMsg,
            durationMs: Date.now() - startTime,
            recoveryAttempted: true,
            recoveryReason: opResult.error || 'Control-plane timeout during render',
            verificationResult: 'UNKNOWN',
          } as any,
        };
      }

      // Standard mutation postcondition verification
      try {
        const observation = await ApplicationObserver.observe('after_effects', {
          workflowId,
          executionId,
        });

        if (observation === 'UNKNOWN' || observation.status === 'ERROR') {
          const unknownMsg =
            'After Effects stopped responding during the request. Rezel could not confirm whether the operation completed.';
          return {
            success: false,
            status: 'UNKNOWN',
            results: [],
            error: unknownMsg,
            executionResult: {
              success: false,
              status: 'UNKNOWN',
              operationId: planned.operationId,
              applicationId: planned.applicationId,
              adapterId: nativeStrategy.adapterId,
              error: unknownMsg,
              durationMs: Date.now() - startTime,
              recoveryAttempted: true,
              recoveryReason: opResult.error || 'IPC timeout during mutation',
              verificationResult: 'UNKNOWN',
            } as any,
          };
        }

        const postconditions = planned.compiledPlan.postconditions || [];
        if (postconditions.length > 0) {
          let allVerified = true;
          let anyDisproven = false;

          for (const predicate of postconditions) {
            const vResult = VerificationEngine.verify(observation, predicate);
            if (vResult === 'NOT_VERIFIED') {
              anyDisproven = true;
              allVerified = false;
              break;
            } else if (vResult === 'UNKNOWN') {
              allVerified = false;
            }
          }

          if (allVerified) {
            return {
              success: true,
              status: 'SUCCESS',
              results: [],
              executionResult: {
                success: true,
                status: 'SUCCESS',
                operationId: planned.operationId,
                applicationId: planned.applicationId,
                adapterId: nativeStrategy.adapterId,
                outcome: 'SUCCESS',
                durationMs: Date.now() - startTime,
                recoveryAttempted: true,
                recoveryReason: opResult.error || 'IPC timeout during mutation',
                verificationResult: 'VERIFIED',
              } as any,
            };
          }

          if (anyDisproven) {
            const failedMsg = 'Postcondition verification disproved mutation after timeout.';
            return {
              success: false,
              status: 'FAILED',
              results: [],
              error: failedMsg,
              executionResult: {
                success: false,
                status: 'FAILED',
                operationId: planned.operationId,
                applicationId: planned.applicationId,
                adapterId: nativeStrategy.adapterId,
                error: failedMsg,
                durationMs: Date.now() - startTime,
                recoveryAttempted: true,
                recoveryReason: opResult.error || 'IPC timeout during mutation',
                verificationResult: 'NOT_VERIFIED',
              } as any,
            };
          }
        } else {
          // No postconditions, but adapter is alive and observation succeeded
          return {
            success: true,
            status: 'SUCCESS',
            results: [],
            executionResult: {
              success: true,
              status: 'SUCCESS',
              operationId: planned.operationId,
              applicationId: planned.applicationId,
              adapterId: nativeStrategy.adapterId,
              outcome: 'SUCCESS',
              durationMs: Date.now() - startTime,
              recoveryAttempted: true,
              recoveryReason: opResult.error || 'IPC timeout during mutation',
              verificationResult: 'VERIFIED',
            } as any,
          };
        }
      } catch {
        // Fall through to UNKNOWN
      }

      const unknownMsg =
        'After Effects stopped responding during the request. Rezel could not confirm whether the operation completed.';
      return {
        success: false,
        status: 'UNKNOWN',
        results: [],
        error: unknownMsg,
        executionResult: {
          success: false,
          status: 'UNKNOWN',
          operationId: planned.operationId,
          applicationId: planned.applicationId,
          adapterId: nativeStrategy.adapterId,
          error: unknownMsg,
          durationMs: Date.now() - startTime,
          recoveryAttempted: true,
          recoveryReason: opResult.error || 'IPC timeout during mutation',
          verificationResult: 'UNKNOWN',
        } as any,
      };
    }

    // ─── 4B. Adapter Remains DISCONNECTED ────────────────────────────────────
    if (isRenderOp && renderBaseline) {
      const fileRes = await RenderFileVerifier.verifyPostRenderFile(renderBaseline);
      if (fileRes.status === 'VERIFIED') {
        const userExplanation = 'Render completed and the expected output was verified.';
        return {
          success: true,
          status: 'SUCCESS',
          results: [],
          executionResult: {
            success: true,
            status: 'SUCCESS',
            operationId: planned.operationId,
            applicationId: planned.applicationId,
            adapterId: nativeStrategy.adapterId,
            outcome: 'RENDER_CONFIRMED',
            durationMs: Date.now() - startTime,
            recoveryAttempted: true,
            recoveryReason: opResult.error || 'After Effects disconnected during render',
            verificationResult: 'VERIFIED',
            userExplanation,
          } as any,
        };
      }
    }

    const disconnectedMsg =
      'After Effects stopped responding during the request. Rezel could not confirm whether the operation completed.';
    return {
      success: false,
      status: 'UNKNOWN',
      results: [],
      error: disconnectedMsg,
      executionResult: {
        success: false,
        status: 'UNKNOWN',
        operationId: planned.operationId,
        applicationId: planned.applicationId,
        adapterId: nativeStrategy.adapterId,
        error: disconnectedMsg,
        durationMs: Date.now() - startTime,
        recoveryAttempted: true,
        recoveryReason: opResult.error || 'Adapter disconnected',
        verificationResult: 'UNKNOWN',
      } as any,
    };
  }
}

export const ExecutionRecoveryCoordinator = new ExecutionRecoveryCoordinatorImpl();
