import { CapabilityRegistry } from '../ai/capabilities/CapabilityRegistry';
import type {
  AgentAction,
  RejectedAction,
  UnknownMutationRecord,
  MutationFingerprint,
} from './types';

export interface ActionValidationOptions {
  projectRootPath?: string;
  workspaceRootDirectory?: string;
  unknownMutationRecords?: UnknownMutationRecord[];
  /** Optional custom capability checker for unit tests */
  capabilityChecker?: (capabilityId: string) => boolean;
}

const BUILTIN_CAPABILITIES = new Set([
  'fs_read_file',
  'fs_write_file',
  'fs_create_file',
  'fs_delete_file',
  'run_system_command',
  'fs_search_files',
  'fs_list_directory',
  'blender.inspect_scene',
  'blender.mutate_scene',
  'request_user_approval',
  'application_observe',
  'application_verify',
  'session_complete',
]);

export class ActionValidator {
  /**
   * Validates normalized AgentActions against security rules and registered capabilities.
   *
   * Enforces:
   * 1. Capability existence check (rejects UNKNOWN_CAPABILITY).
   * 2. BLOCK 1: Path boundary verification (rejects PATH_OUT_OF_SCOPE for traversal, UNC, or root escapes).
   * 3. BLOCK 4 / H-04: Rejects UNKNOWN_MUTATION_BLOCKED if action matches a previous cycle's ambiguous mutation fingerprint.
   * 4. H-03: Ignores riskHint for security classification.
   */
  static validate(
    actions: AgentAction[],
    options: ActionValidationOptions = {}
  ): { accepted: AgentAction[]; rejected: RejectedAction[] } {
    const accepted: AgentAction[] = [];
    const rejected: RejectedAction[] = [];

    const projectRoot = ActionValidator.normalizePath(
      options.projectRootPath || options.workspaceRootDirectory || ''
    );

    for (const action of actions) {
      // 1. Capability Existence Check
      const capId = action.capabilityId;
      if (!capId) {
        rejected.push({
          actionId: action.id,
          reason: 'Action missing capabilityId',
          code: 'UNKNOWN_CAPABILITY',
        });
        continue;
      }

      const isRegistered = options.capabilityChecker
        ? options.capabilityChecker(capId)
        : CapabilityRegistry.has(capId) || BUILTIN_CAPABILITIES.has(capId);

      if (!isRegistered) {
        rejected.push({
          actionId: action.id,
          reason: `Capability '${capId}' is not registered in CapabilityRegistry`,
          code: 'UNKNOWN_CAPABILITY',
        });
        continue;
      }

      // 2. BLOCK 4 / H-04: Check against UNKNOWN Mutation Fingerprints
      if (options.unknownMutationRecords && options.unknownMutationRecords.length > 0) {
        const fingerprintHash = ActionValidator.computeFingerprintHash(
          capId,
          action.args,
          options.projectRootPath
        );

        const isBlockedUnknown = options.unknownMutationRecords.some(
          (record) => record.fingerprint.hash === fingerprintHash
        );

        if (isBlockedUnknown) {
          rejected.push({
            actionId: action.id,
            reason: `Action capability '${capId}' matches an ambiguous UNKNOWN mutation from a previous cycle and cannot be automatically retried`,
            code: 'UNKNOWN_MUTATION_BLOCKED',
          });
          continue;
        }
      }

      // 3. BLOCK 1: Path Traversal & Scope Validation for file operations
      const targetPath = ActionValidator.extractPathFromArgs(action.args);
      if (targetPath) {
        const pathCheck = ActionValidator.validatePathScope(targetPath, projectRoot);
        if (!pathCheck.valid) {
          rejected.push({
            actionId: action.id,
            reason: pathCheck.reason || 'Path out of project/workspace scope',
            code: 'PATH_OUT_OF_SCOPE',
          });
          continue;
        }
      }

      // All checks passed -> Accept action
      accepted.push(action);
    }

    return { accepted, rejected };
  }

  /**
   * Helper to compute deterministic hash for H-04 MutationFingerprint matching
   */
  static computeFingerprintHash(
    capabilityId: string,
    args: Record<string, unknown>,
    projectId?: string
  ): string {
    const canonicalArgs = JSON.stringify(args, Object.keys(args).sort());
    const rawStr = `${capabilityId}:${canonicalArgs}:${projectId ?? ''}`;
    let hash = 0;
    for (let i = 0; i < rawStr.length; i++) {
      const char = rawStr.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return `fp_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Creates a MutationFingerprint object for an action
   */
  static createFingerprint(
    capabilityId: string,
    args: Record<string, unknown>,
    projectId?: string
  ): MutationFingerprint {
    const hash = ActionValidator.computeFingerprintHash(capabilityId, args, projectId);
    return {
      capabilityId,
      canonicalArgs: args,
      projectId,
      hash,
    };
  }

  /**
   * Extracts path string from standard capability arguments
   */
  private static extractPathFromArgs(args: Record<string, unknown>): string | undefined {
    for (const key of ['path', 'filePath', 'targetFile', 'directory', 'rootPath']) {
      if (typeof args[key] === 'string' && (args[key] as string).trim().length > 0) {
        return (args[key] as string).trim();
      }
    }
    return undefined;
  }

  /**
   * BLOCK 1: Path Scope Validation
   * Detects:
   * - Traversal patterns (.. , \..\)
   * - UNC paths (\\?\ , \\.\)
   * - Absolute paths outside root
   */
  private static validatePathScope(
    rawPath: string,
    allowedRoot: string
  ): { valid: boolean; reason?: string } {
    // 1. Detect UNC paths
    if (rawPath.startsWith('\\\\') || rawPath.startsWith('//')) {
      return { valid: false, reason: 'UNC network paths are prohibited' };
    }

    // 2. Detect directory traversal patterns
    const normalized = ActionValidator.normalizePath(rawPath);
    const pathParts = normalized.split('/');
    if (pathParts.includes('..')) {
      return { valid: false, reason: 'Directory traversal (..) detected in path' };
    }

    // 3. If allowedRoot is configured, check if path escapes root
    if (allowedRoot && allowedRoot.length > 0) {
      // If raw path is absolute (e.g. C:/... or /...)
      const isAbsolute = /^(?:[a-zA-Z]:[\\/]|[\\/])/.test(rawPath);
      if (isAbsolute) {
        if (!normalized.toLowerCase().startsWith(allowedRoot.toLowerCase())) {
          return {
            valid: false,
            reason: `Path '${rawPath}' escapes allowed project root '${allowedRoot}'`,
          };
        }
      }
    }

    return { valid: true };
  }

  private static normalizePath(pathStr: string): string {
    return pathStr.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '');
  }
}
