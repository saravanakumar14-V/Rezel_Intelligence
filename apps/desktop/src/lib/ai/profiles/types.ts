/**
 * Rezel 13.2.1 — Application Profile Contract & Types
 *
 * Defines the minimal, strongly-typed, declarative contract for Application Profiles.
 * Application Profiles describe an application's identity, supported capabilities,
 * semantic landmarks, states, operations, and control strategy.
 *
 * This contract is strictly declarative: NO executable code, eval, or dynamic logic.
 */

import type { VerificationPredicate } from '../verification/types';

// ─── 1. Capabilities ──────────────────────────────────────────────────────────

export type CapabilityVerb = 'read' | 'interact' | 'write' | 'execute';

export interface ApplicationCapabilities {
  readonly read: readonly string[];
  readonly interact: readonly string[];
  readonly write: readonly string[];
  readonly execute: readonly string[];
}

// ─── 2. Landmarks & Matchers ──────────────────────────────────────────────────

export interface UIMatcher {
  readonly automationId?: string;
  readonly name?: string;
  readonly role?: string;
  readonly controlType?: string;
  readonly className?: string;
  readonly hierarchy?: readonly string[];
}

export interface UILandmark {
  readonly id: string;
  readonly description: string;
  readonly matchers: readonly UIMatcher[];
}

// ─── 3. State Definitions ─────────────────────────────────────────────────────

export interface ApplicationStateDefinition {
  readonly id: string;
  readonly description: string;
  readonly matchers: readonly VerificationPredicate[];
}

// ─── 4. Operation Definitions (Closed Safe DSL) ───────────────────────────────

export type OperationStep =
  | {
      readonly type: 'focus_landmark';
      readonly landmarkId: string;
    }
  | {
      readonly type: 'invoke';
      readonly landmarkId: string;
    }
  | {
      readonly type: 'set_value';
      readonly landmarkId: string;
      readonly value: string;
    }
  | {
      readonly type: 'toggle';
      readonly landmarkId: string;
      readonly value?: boolean;
    }
  | {
      readonly type: 'select';
      readonly landmarkId: string;
      readonly value: string;
    }
  | {
      readonly type: 'type_text';
      readonly landmarkId?: string;
      readonly textRef: string;
    }
  | {
      readonly type: 'hotkey';
      readonly keys: readonly string[];
    };

export interface OperationParameter {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean';
  readonly description: string;
  readonly required?: boolean;
  readonly defaultValue?: string | number | boolean;
}

export interface OperationDefinition {
  readonly id: string;
  readonly description: string;
  readonly capabilities: readonly CapabilityVerb[];
  readonly parameters?: readonly OperationParameter[];
  readonly aliases?: readonly string[];
  readonly nativeCapabilityId?: string;
  readonly preconditions: readonly string[];
  readonly execution: readonly OperationStep[];
  readonly postconditions: readonly VerificationPredicate[];
}

// ─── 5. Control Strategy ──────────────────────────────────────────────────────

export type ControlStrategyPreferredTier =
  | 'APPLICATION_NATIVE'
  | 'UIA_SEMANTIC_PATTERN'
  | 'UIA_ELEMENT_INTERACTION'
  | 'NATIVE_INPUT';

export interface ControlStrategy {
  readonly preferredTier: ControlStrategyPreferredTier;
  readonly requiresFocusBeforeInput: boolean;
  readonly preferNativeAdapter: boolean;
}

// ─── 6. Application Profile ───────────────────────────────────────────────────

export interface ApplicationProfile {
  readonly appId: string;
  readonly name: string;
  readonly vendor?: string;
  readonly aliases: readonly string[];
  readonly executableNames: readonly string[];
  readonly versionRange?: string;

  readonly capabilities: ApplicationCapabilities;
  readonly landmarks: Readonly<Record<string, UILandmark>>;
  readonly states: Readonly<Record<string, ApplicationStateDefinition>>;
  readonly operations: Readonly<Record<string, OperationDefinition>>;
  readonly controlStrategy: ControlStrategy;
}

// ─── 7. Version & Resolution Types ───────────────────────────────────────────

export type ProfileResolutionStatus =
  | 'EXACT_MATCH'
  | 'COMPATIBLE'
  | 'UNKNOWN_VERSION'
  | 'NO_MATCH';

export interface ProfileResolutionResult {
  readonly status: ProfileResolutionStatus;
  readonly profile?: ApplicationProfile;
  readonly matchedAppId?: string;
  readonly matchedBy?: 'appId' | 'executable' | 'alias';
  readonly reason: string;
}

export interface ProfileIdentityQuery {
  readonly appId?: string;
  readonly executableName?: string;
  readonly alias?: string;
  readonly version?: string;
}
