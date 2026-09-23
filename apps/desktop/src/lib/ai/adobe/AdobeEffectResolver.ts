/**
 * REZEL 13.3.5 — Adobe Effect Resolver
 *
 * Deterministically resolves semantic effect targets and properties from an
 * AdobeEffectsListSnapshot using strict identity and runtime state checks.
 *
 * RESOLUTION PRECEDENCE:
 * 1. Explicit effect identity (exact match)
 * 2. layerId + matchName + occurrenceIndex
 * 3. layerId + exact effect name when unique
 * 4. Reject ambiguity (AMBIGUOUS_TARGET)
 *
 * CRITICAL INVARIANTS:
 * - Active composition state must be verified (ACTIVE_COMPOSITION === TRUE).
 * - If multiple identical effects exist without occurrenceIndex -> AMBIGUOUS_TARGET.
 * - If property is animated -> PROPERTY_ANIMATED (reject mutation, route to 13.3.4).
 * - If property is unknown/unsupported -> PROPERTY_UNSUPPORTED.
 * - Strictly validates value types and ranges before authorizing mutation.
 */

import type {
  AdobeEffectPropertySnapshot,
  AdobeEffectSnapshot,
  AdobeEffectsListSnapshot,
} from './types';

export type EffectResolverStatus =
  | 'SUCCESS'
  | 'TARGET_NOT_FOUND'
  | 'AMBIGUOUS_TARGET'
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_UNSUPPORTED'
  | 'PROPERTY_ANIMATED'
  | 'INVALID_PARAMETERS'
  | 'PRECONDITION_FAILED'
  | 'UNKNOWN_APPLICATION_STATE'
  | 'ADAPTER_DISCONNECTED';

export interface EffectResolutionQuery {
  readonly compositionId?: string;
  readonly layerId?: string;
  readonly layerIndex?: number;
  readonly effectIdentity?: string;
  readonly effectMatchName?: string;
  readonly effectName?: string;
  readonly occurrenceIndex?: number;
  readonly propertyPath?: string;
}

export interface EffectResolutionResult {
  readonly status: EffectResolverStatus;
  readonly effect?: AdobeEffectSnapshot;
  readonly property?: AdobeEffectPropertySnapshot;
  readonly compositionId?: string;
  readonly layerId?: string;
  readonly reason?: string;
  readonly error?: string;
}

export interface ValueValidationResult {
  readonly valid: boolean;
  readonly error?: string;
}

export class AdobeEffectResolver {
  /**
   * Resolves an AdobeEffectSnapshot and optionally an AdobeEffectPropertySnapshot from an effects snapshot.
   */
  static resolve(
    snapshot: AdobeEffectsListSnapshot | undefined,
    query: EffectResolutionQuery
  ): EffectResolutionResult {
    // 1. Snapshot presence check
    if (!snapshot) {
      return {
        status: 'UNKNOWN_APPLICATION_STATE',
        reason: 'Effects snapshot is unavailable',
        error: 'Snapshot unavailable',
      };
    }

    // 2. Adapter Disconnected check
    if (snapshot.status === 'ADAPTER_DISCONNECTED') {
      return {
        status: 'ADAPTER_DISCONNECTED',
        reason: 'After Effects adapter is disconnected',
        error: 'Adapter disconnected',
      };
    }

    // 3. Unknown application state check
    if (snapshot.status === 'UNKNOWN') {
      return {
        status: 'UNKNOWN_APPLICATION_STATE',
        reason: 'After Effects project state is UNKNOWN',
        error: 'Project state UNKNOWN',
      };
    }

    // 4. Precondition check: active composition
    if (snapshot.status === 'PROJECT_CLOSED' || snapshot.status === 'NO_ACTIVE_COMPOSITION' || !snapshot.compositionId) {
      return {
        status: 'PRECONDITION_FAILED',
        reason: 'No active composition available for effect resolution',
        error: 'Precondition ACTIVE_COMPOSITION is false',
      };
    }

    const effects = snapshot.effects || [];

    // 5. Resolution Precedence 1: Explicit effect identity
    if (query.effectIdentity) {
      const target = effects.find((e) => e.identity === query.effectIdentity);
      if (!target) {
        return {
          status: 'TARGET_NOT_FOUND',
          reason: `Effect with identity '${query.effectIdentity}' was not found on layer`,
          error: 'Effect identity not found',
        };
      }
      return this.resolvePropertyWithinEffect(target, query, snapshot);
    }

    // 6. Resolution Precedence 2: matchName + occurrenceIndex
    if (query.effectMatchName && query.occurrenceIndex !== undefined) {
      const target = effects.find(
        (e) => e.matchName === query.effectMatchName && e.occurrenceIndex === query.occurrenceIndex
      );
      if (!target) {
        return {
          status: 'TARGET_NOT_FOUND',
          reason: `Effect with matchName '${query.effectMatchName}' and occurrenceIndex ${query.occurrenceIndex} was not found`,
          error: 'Effect matchName/occurrence not found',
        };
      }
      return this.resolvePropertyWithinEffect(target, query, snapshot);
    }

    // 7. Resolution Precedence 3: matchName alone
    if (query.effectMatchName) {
      const matches = effects.filter((e) => e.matchName === query.effectMatchName);
      if (matches.length === 0) {
        return {
          status: 'TARGET_NOT_FOUND',
          reason: `Effect with matchName '${query.effectMatchName}' was not found`,
          error: 'Effect matchName not found',
        };
      }
      if (matches.length > 1) {
        return {
          status: 'AMBIGUOUS_TARGET',
          reason: `Multiple (${matches.length}) effects match '${query.effectMatchName}'. Specify occurrenceIndex to disambiguate.`,
          error: 'Duplicate effect matchName ambiguity',
        };
      }
      return this.resolvePropertyWithinEffect(matches[0], query, snapshot);
    }

    // 8. Resolution Precedence 4: effectName alone
    if (query.effectName) {
      const matches = effects.filter(
        (e) => e.name.toLowerCase() === query.effectName!.toLowerCase()
      );
      if (matches.length === 0) {
        return {
          status: 'TARGET_NOT_FOUND',
          reason: `Effect with name '${query.effectName}' was not found on layer`,
          error: 'Effect name not found',
        };
      }
      if (matches.length > 1) {
        return {
          status: 'AMBIGUOUS_TARGET',
          reason: `Multiple (${matches.length}) effects named '${query.effectName}' exist on layer. Specify effectMatchName or occurrenceIndex.`,
          error: 'Duplicate effect name ambiguity',
        };
      }
      return this.resolvePropertyWithinEffect(matches[0], query, snapshot);
    }

    // 9. Resolution Precedence 5: Extract effect from propertyPath (e.g. 'Effects.Gaussian Blur.Blurriness')
    if (query.propertyPath) {
      const parts = query.propertyPath.split('.');
      if (parts.length >= 2 && (parts[0] === 'Effects' || parts[0] === 'ADBE Effect Parade')) {
        const potentialEffName = parts[1];
        const matches = effects.filter(
          (e) =>
            e.name.toLowerCase() === potentialEffName.toLowerCase() ||
            e.matchName.toLowerCase() === potentialEffName.toLowerCase() ||
            String(e.occurrenceIndex) === potentialEffName
        );
        if (matches.length === 1) {
          return this.resolvePropertyWithinEffect(matches[0], query, snapshot);
        }
        if (matches.length > 1) {
          return {
            status: 'AMBIGUOUS_TARGET',
            reason: `Ambiguous effect '${potentialEffName}' in propertyPath. Multiple effects match.`,
            error: 'Ambiguous effect in propertyPath',
          };
        }
      }
    }

    return {
      status: 'INVALID_PARAMETERS',
      reason: 'No valid effect identity, matchName, or name provided in query',
      error: 'Missing effect identifier',
    };
  }

  /**
   * Resolves a property within an already-resolved AdobeEffectSnapshot.
   */
  private static resolvePropertyWithinEffect(
    effect: AdobeEffectSnapshot,
    query: EffectResolutionQuery,
    snapshot: AdobeEffectsListSnapshot
  ): EffectResolutionResult {
    if (!query.propertyPath) {
      return {
        status: 'SUCCESS',
        effect,
        compositionId: snapshot.compositionId,
        layerId: snapshot.layerId,
      };
    }

    const props = effect.properties || [];
    const queryPath = query.propertyPath;
    const propName = queryPath.includes('.') ? queryPath.split('.').pop()! : queryPath;

    const property = props.find(
      (p) =>
        p.propertyPath === queryPath ||
        p.displayName.toLowerCase() === propName.toLowerCase() ||
        p.propertyPath.endsWith('.' + propName)
    );

    if (!property) {
      return {
        status: 'PROPERTY_NOT_FOUND',
        effect,
        reason: `Property '${queryPath}' was not found on effect '${effect.name}'`,
        error: 'Property not found on effect',
      };
    }

    if (property.animated) {
      return {
        status: 'PROPERTY_ANIMATED',
        effect,
        property,
        reason: `Property '${property.displayName}' is animated/time-varying. Use 13.3.4 keyframe operations.`,
        error: 'Property is animated',
      };
    }

    if (property.valueType === 'UNKNOWN') {
      return {
        status: 'PROPERTY_UNSUPPORTED',
        effect,
        property,
        reason: `Property '${property.displayName}' has unsupported type 'UNKNOWN'`,
        error: 'Unsupported property type',
      };
    }

    return {
      status: 'SUCCESS',
      effect,
      property,
      compositionId: snapshot.compositionId,
      layerId: snapshot.layerId,
    };
  }

  /**
   * Validates a value against an effect property snapshot definition.
   */
  static validateValue(
    property: AdobeEffectPropertySnapshot,
    value: unknown
  ): ValueValidationResult {
    if (value === undefined || value === null) {
      return { valid: false, error: 'Value cannot be null or undefined' };
    }

    switch (property.valueType) {
      case 'NUMBER': {
        if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
          return { valid: false, error: `Expected finite number, got ${typeof value} (${value})` };
        }
        if (property.minValue !== undefined && value < property.minValue) {
          return { valid: false, error: `Value ${value} is less than minimum allowed ${property.minValue}` };
        }
        if (property.maxValue !== undefined && value > property.maxValue) {
          return { valid: false, error: `Value ${value} is greater than maximum allowed ${property.maxValue}` };
        }
        return { valid: true };
      }

      case 'VECTOR': {
        if (!Array.isArray(value)) {
          return { valid: false, error: `Expected array for VECTOR property, got ${typeof value}` };
        }
        for (let i = 0; i < value.length; i++) {
          const n = value[i];
          if (typeof n !== 'number' || isNaN(n) || !isFinite(n)) {
            return { valid: false, error: `Vector element at index ${i} is not a finite number (${n})` };
          }
        }
        return { valid: true };
      }

      case 'COLOR': {
        if (!Array.isArray(value)) {
          return { valid: false, error: `Expected RGB(A) array for COLOR property, got ${typeof value}` };
        }
        if (value.length < 3 || value.length > 4) {
          return { valid: false, error: `Color vector must have 3 (RGB) or 4 (RGBA) components, got ${value.length}` };
        }
        for (let i = 0; i < value.length; i++) {
          const c = value[i];
          if (typeof c !== 'number' || isNaN(c) || !isFinite(c) || c < 0 || c > 1) {
            return { valid: false, error: `Color component at index ${i} must be a normalized number in range [0, 1], got ${c}` };
          }
        }
        return { valid: true };
      }

      case 'BOOLEAN': {
        if (typeof value !== 'boolean') {
          return { valid: false, error: `Expected boolean, got ${typeof value}` };
        }
        return { valid: true };
      }

      case 'ENUM': {
        if (typeof value !== 'number' && typeof value !== 'string') {
          return { valid: false, error: `Expected number or string for ENUM, got ${typeof value}` };
        }
        return { valid: true };
      }

      case 'TEXT': {
        if (typeof value !== 'string') {
          return { valid: false, error: `Expected string for TEXT, got ${typeof value}` };
        }
        return { valid: true };
      }

      case 'UNKNOWN':
      default:
        return { valid: false, error: `Cannot mutate property of unsupported type '${property.valueType}'` };
    }
  }
}
