/**
 * Rezel 13.2.1 — Application Profile Validation Engine
 *
 * Strict validation and reference integrity checker for Application Profiles.
 * Enforces schema validity, closed operation step vocabularies, landmark reference integrity,
 * state precondition consistency, and prevents malformed profiles from entering runtime.
 */

import type {
  ApplicationProfile,
  OperationStep,
  CapabilityVerb,
  ControlStrategyPreferredTier,
} from './types';

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

const VALID_CAPABILITY_VERBS: ReadonlySet<CapabilityVerb> = new Set([
  'read',
  'interact',
  'write',
  'execute',
]);

const VALID_OPERATION_STEP_TYPES: ReadonlySet<string> = new Set([
  'focus_landmark',
  'invoke',
  'set_value',
  'toggle',
  'select',
  'type_text',
  'hotkey',
]);

const VALID_CONTROL_STRATEGY_TIERS: ReadonlySet<ControlStrategyPreferredTier> = new Set([
  'APPLICATION_NATIVE',
  'UIA_SEMANTIC_PATTERN',
  'UIA_ELEMENT_INTERACTION',
  'NATIVE_INPUT',
]);

const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Validates an ApplicationProfile for structural correctness, schema conformance,
 * and internal reference integrity.
 */
export function validateApplicationProfile(profile: unknown): ValidationResult {
  const errors: string[] = [];

  if (!profile || typeof profile !== 'object') {
    return { valid: false, errors: ['Profile must be a non-null object'] };
  }

  const p = profile as Partial<ApplicationProfile>;

  // ─── 1. Identity Fields ───────────────────────────────────────────────────

  if (!p.appId || typeof p.appId !== 'string' || !ID_REGEX.test(p.appId.trim())) {
    errors.push(`Invalid or missing appId: '${p.appId}'. Must be a non-empty alphanumeric string.`);
  }

  if (!p.name || typeof p.name !== 'string' || p.name.trim().length === 0) {
    errors.push('Missing or empty application name.');
  }

  if (p.vendor !== undefined && (typeof p.vendor !== 'string' || p.vendor.trim().length === 0)) {
    errors.push('Vendor if specified must be a non-empty string.');
  }

  if (!Array.isArray(p.aliases)) {
    errors.push('Aliases must be an array of strings.');
  } else {
    for (const alias of p.aliases) {
      if (typeof alias !== 'string' || alias.trim().length === 0) {
        errors.push(`Invalid alias entry: '${alias}'. Aliases must be non-empty strings.`);
      }
    }
  }

  if (!Array.isArray(p.executableNames) || p.executableNames.length === 0) {
    errors.push('ExecutableNames must be a non-empty array of strings.');
  } else {
    for (const exe of p.executableNames) {
      if (typeof exe !== 'string' || exe.trim().length === 0) {
        errors.push(`Invalid executableName entry: '${exe}'. Must be non-empty string.`);
      }
    }
  }

  if (p.versionRange !== undefined && typeof p.versionRange !== 'string') {
    errors.push('versionRange if specified must be a string.');
  }

  // ─── 2. Capabilities ──────────────────────────────────────────────────────

  if (!p.capabilities || typeof p.capabilities !== 'object') {
    errors.push('Missing capabilities object.');
  } else {
    const verbs: (keyof typeof p.capabilities)[] = ['read', 'interact', 'write', 'execute'];
    for (const verb of verbs) {
      if (!Array.isArray(p.capabilities[verb])) {
        errors.push(`Capabilities.${verb} must be an array of strings.`);
      } else {
        for (const item of p.capabilities[verb]) {
          if (typeof item !== 'string' || item.trim().length === 0) {
            errors.push(`Invalid entry in capabilities.${verb}: '${item}'. Must be non-empty string.`);
          }
        }
      }
    }
  }

  // ─── 3. Landmarks ─────────────────────────────────────────────────────────

  const declaredLandmarkIds = new Set<string>();

  if (!p.landmarks || typeof p.landmarks !== 'object') {
    errors.push('Missing landmarks object.');
  } else {
    for (const [key, landmark] of Object.entries(p.landmarks)) {
      if (!landmark || typeof landmark !== 'object') {
        errors.push(`Landmark '${key}' must be an object.`);
        continue;
      }

      if (landmark.id !== key) {
        errors.push(`Landmark key '${key}' does not match landmark.id '${landmark.id}'.`);
      }

      if (!landmark.id || typeof landmark.id !== 'string' || !ID_REGEX.test(landmark.id)) {
        errors.push(`Invalid landmark id: '${landmark.id}'. Must be a non-empty alphanumeric string.`);
      }

      if (!landmark.description || typeof landmark.description !== 'string') {
        errors.push(`Landmark '${key}' missing description string.`);
      }

      if (!Array.isArray(landmark.matchers) || landmark.matchers.length === 0) {
        errors.push(`Landmark '${key}' must have at least one matcher.`);
      } else {
        for (let i = 0; i < landmark.matchers.length; i++) {
          const matcher = landmark.matchers[i];
          if (!matcher || typeof matcher !== 'object') {
            errors.push(`Landmark '${key}' matcher [${i}] must be an object.`);
            continue;
          }
          const hasProp =
            Boolean(matcher.automationId) ||
            Boolean(matcher.name) ||
            Boolean(matcher.role) ||
            Boolean(matcher.controlType) ||
            Boolean(matcher.className) ||
            (Array.isArray(matcher.hierarchy) && matcher.hierarchy.length > 0);

          if (!hasProp) {
            errors.push(`Landmark '${key}' matcher [${i}] has no matching criteria defined.`);
          }
        }
      }

      declaredLandmarkIds.add(key);
    }
  }

  // ─── 4. States ────────────────────────────────────────────────────────────

  const declaredStateIds = new Set<string>();

  if (!p.states || typeof p.states !== 'object') {
    errors.push('Missing states object.');
  } else {
    for (const [key, state] of Object.entries(p.states)) {
      if (!state || typeof state !== 'object') {
        errors.push(`State '${key}' must be an object.`);
        continue;
      }

      if (state.id !== key) {
        errors.push(`State key '${key}' does not match state.id '${state.id}'.`);
      }

      if (!state.id || typeof state.id !== 'string' || !ID_REGEX.test(state.id)) {
        errors.push(`Invalid state id: '${state.id}'. Must be a non-empty alphanumeric string.`);
      }

      if (!state.description || typeof state.description !== 'string') {
        errors.push(`State '${key}' missing description string.`);
      }

      if (!Array.isArray(state.matchers)) {
        errors.push(`State '${key}' matchers must be an array of VerificationPredicates.`);
      }

      declaredStateIds.add(key);
    }
  }

  // ─── 5. Operations & Reference Integrity ──────────────────────────────────

  if (!p.operations || typeof p.operations !== 'object') {
    errors.push('Missing operations object.');
  } else {
    for (const [key, op] of Object.entries(p.operations)) {
      if (!op || typeof op !== 'object') {
        errors.push(`Operation '${key}' must be an object.`);
        continue;
      }

      if (op.id !== key) {
        errors.push(`Operation key '${key}' does not match op.id '${op.id}'.`);
      }

      if (!op.id || typeof op.id !== 'string' || !ID_REGEX.test(op.id)) {
        errors.push(`Invalid operation id: '${op.id}'. Must be a non-empty alphanumeric string.`);
      }

      if (!op.description || typeof op.description !== 'string') {
        errors.push(`Operation '${key}' missing description string.`);
      }

      if (!Array.isArray(op.capabilities) || op.capabilities.length === 0) {
        errors.push(`Operation '${key}' must declare at least one capability verb.`);
      } else {
        for (const cap of op.capabilities) {
          if (!VALID_CAPABILITY_VERBS.has(cap)) {
            errors.push(`Operation '${key}' declares invalid capability verb: '${cap}'.`);
          }
        }
      }

      // Check preconditions reference integrity
      if (!Array.isArray(op.preconditions)) {
        errors.push(`Operation '${key}' preconditions must be an array of string state IDs.`);
      } else {
        for (const stateRef of op.preconditions) {
          if (!declaredStateIds.has(stateRef)) {
            errors.push(
              `Operation '${key}' references unknown state precondition '${stateRef}'.`
            );
          }
        }
      }

      if (op.nativeCapabilityId !== undefined && (typeof op.nativeCapabilityId !== 'string' || op.nativeCapabilityId.trim().length === 0)) {
        errors.push(`Operation '${key}' nativeCapabilityId must be a non-empty string.`);
      }

      // Check execution steps
      if (!Array.isArray(op.execution)) {
        errors.push(`Operation '${key}' execution must be an array of OperationSteps.`);
      } else if (op.execution.length === 0) {
        // Native operation rule: execution: [] + nativeCapabilityId + preferNativeAdapter is VALID
        const hasNativeStrategy = Boolean(p.controlStrategy?.preferNativeAdapter && op.nativeCapabilityId && typeof op.nativeCapabilityId === 'string' && op.nativeCapabilityId.trim().length > 0);
        if (!hasNativeStrategy) {
          errors.push(`Operation '${key}' has empty execution steps but is missing native strategy (requires preferNativeAdapter: true and nativeCapabilityId).`);
        }
      } else {
        for (let sIdx = 0; sIdx < op.execution.length; sIdx++) {
          const step = op.execution[sIdx] as OperationStep;
          if (!step || typeof step !== 'object') {
            errors.push(`Operation '${key}' step [${sIdx}] is not an object.`);
            continue;
          }

          if (!VALID_OPERATION_STEP_TYPES.has(step.type)) {
            errors.push(`Operation '${key}' step [${sIdx}] has invalid type '${(step as any).type}'.`);
            continue;
          }

          // Check landmark reference integrity
          if ('landmarkId' in step && step.landmarkId !== undefined) {
            if (!declaredLandmarkIds.has(step.landmarkId)) {
              errors.push(
                `Operation '${key}' step [${sIdx}] (${step.type}) references unknown landmarkId '${step.landmarkId}'.`
              );
            }
          }

          if (step.type === 'set_value' && typeof step.value !== 'string') {
            errors.push(`Operation '${key}' step [${sIdx}] (set_value) missing string value.`);
          }

          if (step.type === 'select' && typeof step.value !== 'string') {
            errors.push(`Operation '${key}' step [${sIdx}] (select) missing string value.`);
          }

          if (step.type === 'type_text' && typeof step.textRef !== 'string') {
            errors.push(`Operation '${key}' step [${sIdx}] (type_text) missing string textRef.`);
          }

          if (step.type === 'hotkey' && (!Array.isArray(step.keys) || step.keys.length === 0)) {
            errors.push(`Operation '${key}' step [${sIdx}] (hotkey) keys must be non-empty string array.`);
          }
        }
      }

      if (!Array.isArray(op.postconditions)) {
        errors.push(`Operation '${key}' postconditions must be an array of VerificationPredicates.`);
      }
    }
  }

  // ─── 6. Control Strategy ──────────────────────────────────────────────────

  if (!p.controlStrategy || typeof p.controlStrategy !== 'object') {
    errors.push('Missing controlStrategy object.');
  } else {
    if (!VALID_CONTROL_STRATEGY_TIERS.has(p.controlStrategy.preferredTier)) {
      errors.push(`Invalid controlStrategy.preferredTier: '${p.controlStrategy.preferredTier}'.`);
    }
    if (typeof p.controlStrategy.requiresFocusBeforeInput !== 'boolean') {
      errors.push('controlStrategy.requiresFocusBeforeInput must be a boolean.');
    }
    if (typeof p.controlStrategy.preferNativeAdapter !== 'boolean') {
      errors.push('controlStrategy.preferNativeAdapter must be a boolean.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
