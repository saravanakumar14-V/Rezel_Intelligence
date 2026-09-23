/**
 * Rezel 13.2.3 — Operation Step Compiler
 *
 * Compiles declarative OperationStep items from the closed 13.2.1 DSL into
 * validated 13.1 ComputerAction specifications.
 *
 * Output Contract: Produces pure ComputerAction objects consumable by ComputerActionExecutor.
 * Never executes actions directly or invokes OS APIs.
 */

import type { OperationStep, UILandmark, OperationParameter } from '../profiles/types';
import type { ComputerAction, ComputerActionTarget } from '../computer/types';
import type { UIAnalysisResult } from '../ui/types';
import type { OperationFailureCode } from './types';
import { OperationLandmarkResolver } from './OperationLandmarkResolver';
import { OperationParameterValidator } from './OperationParameterValidator';

export interface StepCompilationSuccess {
  readonly success: true;
  readonly actions: readonly ComputerAction[];
  readonly requiredPermissions: readonly string[];
}

export interface StepCompilationFailure {
  readonly success: false;
  readonly failureCode: OperationFailureCode;
  readonly reason: string;
  readonly stepIndex: number;
}

export type StepCompilationResult =
  | StepCompilationSuccess
  | StepCompilationFailure;

export class OperationStepCompiler {
  /**
   * Compiles an array of OperationSteps atomically.
   * If any step fails (e.g. TARGET_NOT_FOUND, INVALID_PARAMETERS), returns failure immediately.
   */
  static compileSteps(
    steps: readonly OperationStep[],
    landmarks: Readonly<Record<string, UILandmark>>,
    parameters: Readonly<Record<string, unknown>>,
    declaredParams: readonly OperationParameter[],
    uiObservation?: UIAnalysisResult,
    operationId = 'op'
  ): StepCompilationResult {
    const actions: ComputerAction[] = [];
    const permissionSet = new Set<string>();

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const actionId = `${operationId}_step_${i + 1}`;

      switch (step.type) {
        // ─── 1. focus_landmark ──────────────────────────────────────────────
        case 'focus_landmark': {
          const res = OperationLandmarkResolver.resolve(step.landmarkId, landmarks, uiObservation);
          if (!res.success) {
            return {
              success: false,
              failureCode: res.failureCode,
              reason: `Step ${i + 1} (focus_landmark): ${res.reason}`,
              stepIndex: i,
            };
          }

          actions.push({
            actionId,
            type: 'FOCUS',
            target: res.target,
            mutatesExternalState: false,
            riskLevel: 'LOW',
            requiredCapability: 'computer.focus',
            requiresApproval: false,
            isIdempotent: true,
          });
          permissionSet.add('INTERACT');
          break;
        }

        // ─── 2. invoke ───────────────────────────────────────────────────────
        case 'invoke': {
          const res = OperationLandmarkResolver.resolve(step.landmarkId, landmarks, uiObservation);
          if (!res.success) {
            return {
              success: false,
              failureCode: res.failureCode,
              reason: `Step ${i + 1} (invoke): ${res.reason}`,
              stepIndex: i,
            };
          }

          actions.push({
            actionId,
            type: 'CLICK',
            target: res.target,
            mutatesExternalState: true,
            riskLevel: 'LOW',
            requiredCapability: 'computer.click',
            requiresApproval: false,
            isIdempotent: false,
          });
          permissionSet.add('INTERACT');
          break;
        }

        // ─── 3. set_value ───────────────────────────────────────────────────
        case 'set_value': {
          const res = OperationLandmarkResolver.resolve(step.landmarkId, landmarks, uiObservation);
          if (!res.success) {
            return {
              success: false,
              failureCode: res.failureCode,
              reason: `Step ${i + 1} (set_value): ${res.reason}`,
              stepIndex: i,
            };
          }

          const subRes = OperationParameterValidator.substitute(
            step.value,
            parameters,
            declaredParams
          );
          if (!subRes.success) {
            return {
              success: false,
              failureCode: 'INVALID_PARAMETERS',
              reason: `Step ${i + 1} (set_value substitution): ${subRes.error}`,
              stepIndex: i,
            };
          }

          actions.push({
            actionId,
            type: 'TYPE',
            target: res.target,
            parameters: { text: subRes.result },
            mutatesExternalState: true,
            riskLevel: 'MEDIUM',
            requiredCapability: 'computer.type',
            requiresApproval: false,
            isIdempotent: false,
          });
          permissionSet.add('WRITE');
          permissionSet.add('INTERACT');
          break;
        }

        // ─── 4. toggle ──────────────────────────────────────────────────────
        case 'toggle': {
          const res = OperationLandmarkResolver.resolve(step.landmarkId, landmarks, uiObservation);
          if (!res.success) {
            return {
              success: false,
              failureCode: res.failureCode,
              reason: `Step ${i + 1} (toggle): ${res.reason}`,
              stepIndex: i,
            };
          }

          actions.push({
            actionId,
            type: 'CLICK',
            target: res.target,
            parameters: step.value !== undefined ? { toggleState: step.value } : undefined,
            mutatesExternalState: true,
            riskLevel: 'LOW',
            requiredCapability: 'computer.click',
            requiresApproval: false,
            isIdempotent: false,
          });
          permissionSet.add('INTERACT');
          break;
        }

        // ─── 5. select ──────────────────────────────────────────────────────
        case 'select': {
          const res = OperationLandmarkResolver.resolve(step.landmarkId, landmarks, uiObservation);
          if (!res.success) {
            return {
              success: false,
              failureCode: res.failureCode,
              reason: `Step ${i + 1} (select): ${res.reason}`,
              stepIndex: i,
            };
          }

          const subRes = OperationParameterValidator.substitute(
            step.value,
            parameters,
            declaredParams
          );
          if (!subRes.success) {
            return {
              success: false,
              failureCode: 'INVALID_PARAMETERS',
              reason: `Step ${i + 1} (select substitution): ${subRes.error}`,
              stepIndex: i,
            };
          }

          actions.push({
            actionId,
            type: 'SELECT',
            target: res.target,
            parameters: { value: subRes.result },
            mutatesExternalState: true,
            riskLevel: 'LOW',
            requiredCapability: 'computer.select',
            requiresApproval: false,
            isIdempotent: true,
          });
          permissionSet.add('INTERACT');
          break;
        }

        // ─── 6. type_text ───────────────────────────────────────────────────
        case 'type_text': {
          let target: ComputerActionTarget | undefined = undefined;
          if (step.landmarkId) {
            const res = OperationLandmarkResolver.resolve(step.landmarkId, landmarks, uiObservation);
            if (!res.success) {
              return {
                success: false,
                failureCode: res.failureCode,
                reason: `Step ${i + 1} (type_text): ${res.reason}`,
                stepIndex: i,
              };
            }
            target = res.target;
          }

          const subRes = OperationParameterValidator.substitute(
            step.textRef,
            parameters,
            declaredParams
          );
          if (!subRes.success) {
            return {
              success: false,
              failureCode: 'INVALID_PARAMETERS',
              reason: `Step ${i + 1} (type_text substitution): ${subRes.error}`,
              stepIndex: i,
            };
          }

          actions.push({
            actionId,
            type: 'TYPE',
            target,
            parameters: { text: subRes.result },
            mutatesExternalState: true,
            riskLevel: 'LOW',
            requiredCapability: 'computer.type',
            requiresApproval: false,
            isIdempotent: false,
          });
          permissionSet.add('WRITE');
          permissionSet.add('INTERACT');
          break;
        }

        // ─── 7. hotkey ──────────────────────────────────────────────────────
        case 'hotkey': {
          actions.push({
            actionId,
            type: 'HOTKEY',
            parameters: { keys: [...step.keys] },
            mutatesExternalState: true,
            riskLevel: 'LOW',
            requiredCapability: 'computer.hotkey',
            requiresApproval: false,
            isIdempotent: false,
          });
          permissionSet.add('INTERACT');
          break;
        }

        default:
          return {
            success: false,
            failureCode: 'UNKNOWN',
            reason: `Unsupported operation step type: '${(step as any).type}'`,
            stepIndex: i,
          };
      }
    }

    if (permissionSet.size === 0) {
      permissionSet.add('INTERACT');
    }

    return {
      success: true,
      actions,
      requiredPermissions: Array.from(permissionSet),
    };
  }
}
