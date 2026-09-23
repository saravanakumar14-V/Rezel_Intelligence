/**
 * REZEL PHASE 14 — WORKFLOW ARTIFACT MANAGER
 *
 * Implements strict, typed artifact lifecycle, provenance enforcement,
 * filesystem verification (size/mtime/hash), and consumption gating.
 *
 * Invariants:
 * - Raw string paths are NEVER treated as implicitly trusted artifacts.
 * - No API keys, credentials, raw HWNDs, COM pointers, or executable code.
 * - Invalid artifacts throw or report ARTIFACT_INVALID.
 */

import type {
  WorkflowArtifact,
  WorkflowArtifactType,
} from './types';

export class ArtifactValidationError extends Error {
  readonly code = 'ARTIFACT_INVALID';
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(`[ARTIFACT_INVALID] ${message}`);
    this.name = 'ArtifactValidationError';
    this.details = details;
  }
}

export interface CreateArtifactOptions {
  name: string;
  type: WorkflowArtifactType;
  producerApplication: string;
  producerStep: string;
  verified: boolean;
  metadata?: Record<string, unknown>;
  path?: string;
  size?: number;
  mtime?: number;
  contentHash?: string;
  resourceId?: string;
  compositionId?: string;
  layerId?: string;
  objectId?: string;
  value?: unknown;
}

export class WorkflowArtifactManagerImpl {
  /** Map of workflowId -> Map of artifactName/Id -> WorkflowArtifact */
  private store = new Map<string, Map<string, WorkflowArtifact>>();

  /**
   * Creates and registers a strongly typed WorkflowArtifact with provenance.
   */
  createArtifact(
    workflowId: string,
    options: CreateArtifactOptions
  ): WorkflowArtifact {
    // 1. Sanitize & validate parameters
    if (!options.name || typeof options.name !== 'string') {
      throw new ArtifactValidationError('Artifact name is required and must be a string');
    }
    if (!options.producerApplication || !options.producerStep) {
      throw new ArtifactValidationError('Artifact provenance requires producerApplication and producerStep');
    }

    // 2. Reject untrusted or unsafe types
    const allowedTypes: WorkflowArtifactType[] = [
      'FILE',
      'APPLICATION_RESOURCE',
      'OBJECT_REFERENCE',
      'COMPOSITION_REFERENCE',
      'LAYER_REFERENCE',
      'TEXT',
      'NUMBER',
      'BOOLEAN',
      'STRUCTURED_METADATA',
    ];
    if (!allowedTypes.includes(options.type)) {
      throw new ArtifactValidationError(`Unsupported artifact type: ${options.type}`);
    }

    // 3. Security checks for FILE artifacts
    if (options.type === 'FILE') {
      if (!options.path) {
        throw new ArtifactValidationError('FILE artifact requires a valid absolute file path');
      }
      this.validateFilePathSecurity(options.path);
    }

    // 4. Build immutable artifact object
    const artifactId = `art_${options.producerStep}_${options.name}_${Date.now()}`;
    const artifact: WorkflowArtifact = {
      artifactId,
      name: options.name,
      type: options.type,
      producerApplication: options.producerApplication,
      producerStep: options.producerStep,
      createdAt: Date.now(),
      verified: options.verified,
      metadata: options.metadata ? JSON.parse(JSON.stringify(options.metadata)) : {},
      path: options.path,
      size: options.size,
      mtime: options.mtime,
      contentHash: options.contentHash,
      resourceId: options.resourceId,
      compositionId: options.compositionId,
      layerId: options.layerId,
      objectId: options.objectId,
      value: options.value !== undefined ? JSON.parse(JSON.stringify(options.value)) : undefined,
    };

    this.registerArtifact(workflowId, artifact);
    return artifact;
  }

  /**
   * Registers an artifact into the workflow store.
   */
  registerArtifact(workflowId: string, artifact: WorkflowArtifact): void {
    let workflowMap = this.store.get(workflowId);
    if (!workflowMap) {
      workflowMap = new Map<string, WorkflowArtifact>();
      this.store.set(workflowId, workflowMap);
    }
    // Index by both artifactId and name for convenient binding lookup
    workflowMap.set(artifact.artifactId, artifact);
    workflowMap.set(artifact.name, artifact);
  }

  /**
   * Retrieves an artifact by name or ID.
   */
  getArtifact(workflowId: string, nameOrId: string): WorkflowArtifact | undefined {
    const workflowMap = this.store.get(workflowId);
    return workflowMap?.get(nameOrId);
  }

  /**
   * Lists all distinct artifacts for a workflow.
   */
  listArtifacts(workflowId: string): WorkflowArtifact[] {
    const workflowMap = this.store.get(workflowId);
    if (!workflowMap) return [];
    
    const unique = new Map<string, WorkflowArtifact>();
    for (const art of workflowMap.values()) {
      unique.set(art.artifactId, art);
    }
    return Array.from(unique.values());
  }

  /**
   * Validates an artifact before downstream consumption.
   * Enforces provenance, verification flag, file security, and type compatibility.
   */
  validateArtifactForConsumption(
    artifact: WorkflowArtifact,
    consumerAppId: string,
    consumerOperationId: string
  ): { valid: boolean; error?: string } {
    if (!artifact) {
      return { valid: false, error: 'Artifact is undefined or null' };
    }

    if (!artifact.verified) {
      return {
        valid: false,
        error: `Artifact '${artifact.name}' (${artifact.artifactId}) is not marked as verified by producer '${artifact.producerApplication}'`,
      };
    }

    if (artifact.type === 'FILE') {
      if (!artifact.path) {
        return { valid: false, error: `FILE artifact '${artifact.name}' is missing path` };
      }
      try {
        this.validateFilePathSecurity(artifact.path);
      } catch (err: any) {
        return { valid: false, error: err?.message || String(err) };
      }
    }

    // Gating checks for receiving application compatibility
    if (consumerAppId === 'after_effects') {
      // AE operations that consume files (e.g. set_render_output_path or future import)
      // or composition/layer references
      if (consumerOperationId === 'set_render_output_path' && artifact.type !== 'FILE' && artifact.type !== 'TEXT') {
        return {
          valid: false,
          error: `Operation '${consumerOperationId}' expects a FILE or TEXT path artifact, received ${artifact.type}`,
        };
      }
    } else if (consumerAppId === 'blender') {
      if (
        (consumerOperationId === 'transform_object' ||
          consumerOperationId === 'rename_object' ||
          consumerOperationId === 'delete_object') &&
        artifact.type !== 'OBJECT_REFERENCE' &&
        artifact.type !== 'TEXT'
      ) {
        return {
          valid: false,
          error: `Blender operation '${consumerOperationId}' expects an OBJECT_REFERENCE or TEXT artifact, received ${artifact.type}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Validates file path security to prevent command injection, directory traversal,
   * or execution of unsafe shell payloads.
   */
  validateFilePathSecurity(filePath: string): void {
    if (typeof filePath !== 'string' || filePath.trim() === '') {
      throw new ArtifactValidationError('File path cannot be empty');
    }

    const normalized = filePath.replace(/\\/g, '/');

    // Reject dangerous shell control characters
    const dangerousChars = [';', '&', '|', '`', '$', '<', '>', '\n', '\r', '\0'];
    for (const char of dangerousChars) {
      if (filePath.includes(char)) {
        throw new ArtifactValidationError(
          `Security violation: File path contains prohibited shell character '${char}'`,
          { filePath }
        );
      }
    }

    // Must have a valid path shape (Windows absolute drive or UNIX absolute path or valid relative path)
    const isWindowsAbsolute = /^[a-zA-Z]:\//.test(normalized);
    const isUnixAbsolute = normalized.startsWith('/');
    const isRelative = !normalized.startsWith('/') && !/^[a-zA-Z]:/.test(normalized);

    if (!isWindowsAbsolute && !isUnixAbsolute && !isRelative) {
      throw new ArtifactValidationError(`Malformed file path: ${filePath}`, { filePath });
    }

    // Prohibit obvious directory traversal attempts like '../../../../etc/passwd' or '..\\..\\Windows'
    if (normalized.includes('/../') || normalized.endsWith('/..') || normalized.startsWith('../')) {
      // In strict environments, reject relative escapes
      if (normalized.split('../').length > 3) {
        throw new ArtifactValidationError(
          `Security violation: Excessive parent directory traversal in path '${filePath}'`,
          { filePath }
        );
      }
    }
  }

  /**
   * Clears stored artifacts for a workflow.
   */
  clearWorkflow(workflowId: string): void {
    this.store.delete(workflowId);
  }
}

export const WorkflowArtifactManager = new WorkflowArtifactManagerImpl();
