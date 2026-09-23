/**
 * Rezel 13.2.3 — Declarative Operation Compiler
 *
 * Core engine translating high-level declarative OperationDefinitions into
 * safe, validated, atomic ComputerAction execution plans.
 *
 * Fundamental Architectural Invariant:
 * The compiler NEVER executes actions, triggers Tauri commands, or mutates state.
 * It is strictly an observational, deterministic plan generator.
 */

import { ApplicationProfileRegistry } from '../profiles/ApplicationProfileRegistry';
import { ApplicationStateInferenceEngine } from '../inference/ApplicationStateInferenceEngine';
import { UIUnderstandingEngine } from '../ui/UIUnderstandingEngine';
import type { UIAnalysisResult } from '../ui/types';
import type { ApplicationRuntimeState } from '../inference/types';
import type {
  CompiledOperationPlan,
  OperationCompilationResult,
  OperationCompilationRequest,
  CompiledNativeStrategy,
} from './types';
import { OperationParameterValidator } from './OperationParameterValidator';
import { OperationPreconditionEvaluator } from './OperationPreconditionEvaluator';
import { OperationStepCompiler } from './OperationStepCompiler';
import { CompilationCache } from './CompilationCache';

export class DeclarativeOperationCompilerImpl {
  private cache: CompilationCache;

  constructor(ttlMs = 5000) {
    this.cache = new CompilationCache(ttlMs);
  }

  /**
   * Compiles an operation into an immutable, validated CompiledOperationPlan.
   * Atomic Guarantee: Either all parameters, preconditions, and steps compile successfully,
   * or a typed failure is returned with NO partial plan.
   */
  async compile(request: OperationCompilationRequest): Promise<OperationCompilationResult> {
    const { appId, operationId, sessionId = 'default' } = request;

    // ─── 1. Resolve Application Profile ───────────────────────────────────────
    const profileRes = ApplicationProfileRegistry.resolveProfile({
      appId,
      version: request.version,
    });

    const profile = profileRes.profile;
    if (!profile) {
      return {
        success: false,
        failureCode: 'UNKNOWN',
        reason: `No application profile registered or compatible for '${appId}' (${profileRes.reason})`,
        operationId,
        appId,
      };
    }

    // ─── 2. Lookup Operation Definition ───────────────────────────────────────
    const operation = profile.operations[operationId];
    if (!operation) {
      const available = Object.keys(profile.operations).join(', ');
      return {
        success: false,
        failureCode: 'UNKNOWN',
        reason: `Operation '${operationId}' is not declared in profile for '${appId}'. Available: [${available}]`,
        operationId,
        appId,
      };
    }

    // ─── 3. Parameter Validation ──────────────────────────────────────────────
    const paramRes = OperationParameterValidator.validate(
      operation.parameters,
      request.parameters
    );
    if (!paramRes.valid || !paramRes.validatedParams) {
      return {
        success: false,
        failureCode: 'INVALID_PARAMETERS',
        reason: paramRes.error || 'Parameter validation failed',
        operationId,
        appId,
      };
    }
    const validatedParams = paramRes.validatedParams;

    // ─── 4. Obtain Runtime State & Check Preconditions ────────────────────────
    let runtimeState: ApplicationRuntimeState | undefined = request.runtimeState;
    if (!runtimeState) {
      try {
        runtimeState = await ApplicationStateInferenceEngine.inferState({
          applicationId: appId,
          sessionId,
          uiObservation: request.uiObservation,
          version: request.version,
        });
      } catch (err: any) {
        return {
          success: false,
          failureCode: 'PRECONDITION_FAILED',
          reason: `Failed to infer application runtime state: ${err?.message || err}`,
          operationId,
          appId,
        };
      }
    }

    // ─── 5. Check Cache ───────────────────────────────────────────────────────
    const cacheKey = CompilationCache.buildKey(
      appId,
      operationId,
      profile.versionRange,
      validatedParams,
      runtimeState
    );

    if (!request.forceRefresh) {
      const cachedPlan = this.cache.get(cacheKey);
      if (cachedPlan) {
        return {
          success: true,
          plan: cachedPlan,
        };
      }
    }

    // ─── 6. Evaluate Preconditions ────────────────────────────────────────────
    const preRes = OperationPreconditionEvaluator.evaluate(
      operation.preconditions,
      runtimeState
    );
    if (!preRes.satisfied) {
      return {
        success: false,
        failureCode: preRes.failureCode || 'PRECONDITION_FAILED',
        reason: preRes.reason || 'Preconditions not satisfied',
        operationId,
        appId,
        details: { failedPrecondition: preRes.failedPrecondition },
      };
    }

    // ─── 7. Check Native Adapter Strategy ─────────────────────────────────────
    let nativeStrategy: CompiledNativeStrategy | undefined = undefined;
    if (profile.controlStrategy.preferNativeAdapter) {
      nativeStrategy = {
        adapterId: appId,
        operationId,
        capabilityId: operation.nativeCapabilityId ?? operationId,
      };
    }

    // ─── 8. Obtain UI Observation & Compile Steps ─────────────────────────────
    let uiObservation: UIAnalysisResult | undefined = request.uiObservation;
    if (!uiObservation && !nativeStrategy && operation.execution.length > 0) {
      try {
        uiObservation = await UIUnderstandingEngine.inspectNativeUI({
          applicationId: appId,
        });
      } catch (err: any) {
        return {
          success: false,
          failureCode: 'TARGET_NOT_FOUND',
          reason: `UI observation failed during step compilation: ${err?.message || err}`,
          operationId,
          appId,
        };
      }
    }

    const stepRes = OperationStepCompiler.compileSteps(
      operation.execution,
      profile.landmarks,
      validatedParams,
      operation.parameters || [],
      uiObservation,
      operationId
    );

    if (!stepRes.success) {
      return {
        success: false,
        failureCode: stepRes.failureCode,
        reason: stepRes.reason,
        operationId,
        appId,
        details: { stepIndex: stepRes.stepIndex },
      };
    }

    // ─── 9. Assemble Plan ─────────────────────────────────────────────────────
    const plan: CompiledOperationPlan = {
      operationId,
      appId,
      sessionId,
      actions: stepRes.actions,
      requiredPermissions: stepRes.requiredPermissions,
      postconditions: [...operation.postconditions],
      nativeStrategy,
      compiledAt: Date.now(),
      profileVersion: profile.versionRange,
    };

    // ─── 10. Cache & Return ───────────────────────────────────────────────────
    this.cache.set(cacheKey, plan);

    return {
      success: true,
      plan,
    };
  }

  /**
   * Invalidates compilation cache for an application or operation.
   */
  invalidateCache(appId: string, operationId?: string): void {
    this.cache.invalidate(appId, operationId);
  }

  /**
   * Resets entire compiler cache.
   */
  resetCache(): void {
    this.cache.reset();
  }

  /**
   * Returns cache stats.
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}

export const DeclarativeOperationCompiler = new DeclarativeOperationCompilerImpl();
