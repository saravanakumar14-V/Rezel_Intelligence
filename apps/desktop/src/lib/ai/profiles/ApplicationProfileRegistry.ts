/**
 * Rezel 13.2.1 — Application Profile Registry
 *
 * Deterministic, standalone registry for Application Profiles.
 * Coordinates profile registration, validation, reference checking, application identity resolution,
 * and version compatibility matching.
 *
 * Completely isolated from LocalMemory, user preferences, or conversation memory.
 */

import type {
  ApplicationProfile,
  ProfileIdentityQuery,
  ProfileResolutionResult,
} from './types';
import { validateApplicationProfile } from './validator';
import { resolveVersionStatus } from './version';
import { BUILTIN_PROFILES } from './builtin';

export class ApplicationProfileRegistryImpl {
  private profiles = new Map<string, ApplicationProfile>();
  private executableIndex = new Map<string, string>(); // lowercase exe -> appId
  private aliasIndex = new Map<string, string>();      // lowercase alias -> appId

  constructor(autoLoadDefaults = true) {
    if (autoLoadDefaults) {
      this.loadDefaults();
    }
  }

  /**
   * Registers a new ApplicationProfile.
   * Performs full structural and reference validation.
   * Rejects duplicate profile IDs and invalid profiles.
   */
  register(profile: ApplicationProfile): void {
    const validation = validateApplicationProfile(profile);
    if (!validation.valid) {
      throw new Error(
        `[ApplicationProfileRegistry] Cannot register invalid profile '${profile?.appId || 'unknown'}':\n - ${validation.errors.join(
          '\n - '
        )}`
      );
    }

    if (this.profiles.has(profile.appId)) {
      throw new Error(
        `[ApplicationProfileRegistry] Duplicate profile registration: appId '${profile.appId}' is already registered.`
      );
    }

    this.profiles.set(profile.appId, profile);

    // Index executables
    for (const exe of profile.executableNames) {
      const cleanExe = exe.toLowerCase().trim();
      this.executableIndex.set(cleanExe, profile.appId);
    }

    // Index aliases
    for (const alias of profile.aliases) {
      const cleanAlias = alias.toLowerCase().trim();
      this.aliasIndex.set(cleanAlias, profile.appId);
    }
  }

  /**
   * Unregisters an ApplicationProfile by appId.
   */
  unregister(appId: string): boolean {
    const profile = this.profiles.get(appId);
    if (!profile) return false;

    // Clean executable index
    for (const exe of profile.executableNames) {
      const cleanExe = exe.toLowerCase().trim();
      if (this.executableIndex.get(cleanExe) === appId) {
        this.executableIndex.delete(cleanExe);
      }
    }

    // Clean alias index
    for (const alias of profile.aliases) {
      const cleanAlias = alias.toLowerCase().trim();
      if (this.aliasIndex.get(cleanAlias) === appId) {
        this.aliasIndex.delete(cleanAlias);
      }
    }

    return this.profiles.delete(appId);
  }

  /**
   * Retrieves an ApplicationProfile by its primary appId.
   */
  get(appId: string): ApplicationProfile | undefined {
    return this.profiles.get(appId);
  }

  /**
   * Lists all registered ApplicationProfiles.
   */
  list(): readonly ApplicationProfile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Resolves the primary appId from an application identity query (appId, executableName, or alias).
   */
  resolveApplicationIdentity(
    query: ProfileIdentityQuery
  ): { appId: string; matchedBy: 'appId' | 'executable' | 'alias' } | undefined {
    if (query.appId && this.profiles.has(query.appId)) {
      return { appId: query.appId, matchedBy: 'appId' };
    }

    if (query.executableName) {
      const cleanExe = query.executableName.toLowerCase().trim();
      const matched = this.executableIndex.get(cleanExe);
      if (matched) {
        return { appId: matched, matchedBy: 'executable' };
      }
      // Try stripping path or adding .exe if omitted
      const baseName = cleanExe.split(/[/\\]/).pop() || cleanExe;
      const matchedBase = this.executableIndex.get(baseName);
      if (matchedBase) {
        return { appId: matchedBase, matchedBy: 'executable' };
      }
      if (!baseName.endsWith('.exe')) {
        const matchedWithExe = this.executableIndex.get(`${baseName}.exe`);
        if (matchedWithExe) {
          return { appId: matchedWithExe, matchedBy: 'executable' };
        }
      }
    }

    if (query.alias) {
      const cleanAlias = query.alias.toLowerCase().trim();
      const matched = this.aliasIndex.get(cleanAlias);
      if (matched) {
        return { appId: matched, matchedBy: 'alias' };
      }
    }

    return undefined;
  }

  /**
   * Resolves a compatible ApplicationProfile for a target query with strict version evaluation.
   *
   * Resolution Outcomes:
   * - EXACT_MATCH: App identity matches and queried version satisfies exact profile version.
   * - COMPATIBLE: App identity matches and queried version satisfies declared version range.
   * - UNKNOWN_VERSION: App identity matches but version was not supplied / is unknown.
   * - NO_MATCH: No app identity matches, or target version is incompatible with declared range.
   */
  resolveProfile(query: ProfileIdentityQuery): ProfileResolutionResult {
    const identityMatch = this.resolveApplicationIdentity(query);
    if (!identityMatch) {
      return {
        status: 'NO_MATCH',
        reason: `No registered profile found matching application query (appId: '${query.appId || ''}', exe: '${query.executableName || ''}', alias: '${query.alias || ''}')`,
      };
    }

    const profile = this.profiles.get(identityMatch.appId);
    if (!profile) {
      return {
        status: 'NO_MATCH',
        reason: `Application profile '${identityMatch.appId}' not found in registry.`,
      };
    }

    const versionStatus = resolveVersionStatus(query.version, profile.versionRange);

    if (versionStatus === 'NO_MATCH') {
      return {
        status: 'NO_MATCH',
        matchedAppId: profile.appId,
        matchedBy: identityMatch.matchedBy,
        reason: `Application '${profile.appId}' version '${query.version}' is incompatible with declared profile versionRange '${profile.versionRange || '*'}'`,
      };
    }

    if (versionStatus === 'UNKNOWN_VERSION') {
      return {
        status: 'UNKNOWN_VERSION',
        profile,
        matchedAppId: profile.appId,
        matchedBy: identityMatch.matchedBy,
        reason: `Application '${profile.appId}' identified by ${identityMatch.matchedBy}, but application version is unknown. Profile available for generic fallback.`,
      };
    }

    return {
      status: versionStatus,
      profile,
      matchedAppId: profile.appId,
      matchedBy: identityMatch.matchedBy,
      reason: `Application '${profile.appId}' successfully resolved (${versionStatus}) by ${identityMatch.matchedBy}.`,
    };
  }

  /**
   * Validates a profile object without registering it.
   */
  validate(profile: unknown) {
    return validateApplicationProfile(profile);
  }

  /**
   * Loads built-in application profiles.
   */
  loadDefaults(): void {
    for (const profile of BUILTIN_PROFILES) {
      if (!this.profiles.has(profile.appId)) {
        this.register(profile);
      }
    }
  }

  /**
   * Clears all registered profiles and index caches (for test isolation).
   */
  reset(): void {
    this.profiles.clear();
    this.executableIndex.clear();
    this.aliasIndex.clear();
  }
}

export const ApplicationProfileRegistry = new ApplicationProfileRegistryImpl();
