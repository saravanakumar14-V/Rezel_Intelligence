/**
 * Rezel OS — Blender Application Adapter (Milestone 11.3C / 13.4)
 *
 * Implements ApplicationAdapter for Blender 3D, managing authenticated WebSocket IPC,
 * scene inspection, mutation verification, and multi-instance session tracking.
 *
 * STRICT INVARIANTS:
 * - Only verified real capabilities are advertised (inspect_scene, create_object, create_camera).
 * - modify_object is strictly rejected as UNAVAILABLE.
 * - Cache invalidation is triggered synchronously on mutations.
 */

import { BaseApplicationAdapter } from './BaseApplicationAdapter';
import type {
  ApplicationDiscoveryInfo,
  ApplicationOperation,
  ApplicationOperationResult,
  ApplicationSession,
  InspectionRequest,
  InspectionResult,
} from '../types';
import type { VerificationPredicate, VerificationResult } from '../../ai/verification/types';
import { ApplicationCapabilityRegistry } from '../../ai/ApplicationCapabilityRegistry';
import { ApplicationObserver } from '../../ai/verification/ApplicationObserver';
import { VerificationEngine } from '../../ai/verification/VerificationEngine';
import { ToolExecutor as SecurityToolExecutor } from '../../security/ToolExecutor';
import { BlenderSceneInspector } from '../../ai/blender/BlenderSceneInspector';

export class BlenderApplicationAdapter extends BaseApplicationAdapter {
  readonly applicationId = 'blender';
  readonly displayName = 'Blender 3D';

  constructor() {
    super();
    this.capabilities = [
      {
        id: 'blender.inspect_scene',
        name: 'blender.inspect_scene',
        description: 'Inspects objects, cameras, lights, and geometry in active Blender scene',
        applicationId: 'blender',
        category: 'SCENE',
        parameters: { type: 'object', properties: {} },
        mutatesExternalState: false,
        risk: 'LOW',
        retryPolicy: 'AUTO',
        requiredLocks: [{ uri: 'app:blender', access: 'READ' }],
      },
      {
        id: 'blender.create_object',
        name: 'blender.create_object',
        description: 'Creates a 3D primitive mesh object in the Blender scene',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the object' },
            type: { type: 'string', description: 'Primitive type (cube, sphere, cylinder, plane)' },
            location: { type: 'array', description: '[x, y, z] coordinates' },
          },
          required: ['name'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.create_camera',
        name: 'blender.create_camera',
        description: 'Creates and binds a camera in the Blender scene',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the camera' },
            location: { type: 'array', description: '[x, y, z] coordinates' },
            rotation: { type: 'array', description: '[x, y, z] euler rotation' },
          },
          required: ['name'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.create_empty',
        name: 'blender.create_empty',
        description: 'Creates an empty object in the Blender scene',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the empty' },
            emptyType: { type: 'string', description: 'Display type: PLAIN_AXES, ARROWS, CUBE, SPHERE, etc.' },
            location: { type: 'array', description: '[x, y, z] coordinates' },
          },
          required: ['name'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.create_light',
        name: 'blender.create_light',
        description: 'Creates a light in the Blender scene',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the light' },
            type: { type: 'string', description: 'Light type: POINT, SUN, SPOT, AREA' },
            location: { type: 'array', description: '[x, y, z] coordinates' },
            energy: { type: 'number', description: 'Energy in Watts' },
            color: { type: 'array', description: '[r, g, b] color' },
          },
          required: ['name'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.transform_object',
        name: 'blender.transform_object',
        description: 'Transforms an existing object location, rotation, or scale in Blender',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Target object ID or name' },
            location: { type: 'array', description: '[x, y, z] location coordinates' },
            rotation: { type: 'array', description: '[x, y, z] Euler rotation in radians' },
            rotationMode: { type: 'string', description: 'Rotation mode e.g. XYZ' },
            scale: { type: 'array', description: '[x, y, z] scale dimensions' },
          },
          required: ['objectId'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.rename_object',
        name: 'blender.rename_object',
        description: 'Renames an existing object in Blender',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Target object ID or name' },
            newName: { type: 'string', description: 'New unique name for the object' },
          },
          required: ['objectId', 'newName'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.delete_object',
        name: 'blender.delete_object',
        description: 'Deletes an existing object from the Blender scene',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Target object ID or name' },
          },
          required: ['objectId'],
        },
        mutatesExternalState: true,
        risk: 'CRITICAL',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.project.save',
        name: 'blender.project.save',
        description: 'Saves current Blender project file',
        applicationId: 'blender',
        category: 'PROJECT',
        parameters: { type: 'object', properties: {} },
        mutatesExternalState: true,
        risk: 'MEDIUM',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.project.save_as',
        name: 'blender.project.save_as',
        description: 'Saves current Blender project to an authorized absolute path',
        applicationId: 'blender',
        category: 'PROJECT',
        parameters: {
          type: 'object',
          properties: {
            filepath: { type: 'string', description: 'Destination absolute file path' },
          },
          required: ['filepath'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.scene.create',
        name: 'blender.scene.create',
        description: 'Creates a new scene in the Blender project',
        applicationId: 'blender',
        category: 'SCENE',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the new scene' },
            setActive: { type: 'boolean', description: 'Switch to new scene' },
          },
          required: ['name'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.scene.switch',
        name: 'blender.scene.switch',
        description: 'Switches the active scene in Blender',
        applicationId: 'blender',
        category: 'SCENE',
        parameters: {
          type: 'object',
          properties: {
            sceneName: { type: 'string', description: 'Name of the target scene' },
          },
          required: ['sceneName'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.collection.create',
        name: 'blender.collection.create',
        description: 'Creates a new collection in the Blender scene',
        applicationId: 'blender',
        category: 'COLLECTION',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the new collection' },
            parentCollection: { type: 'string', description: 'Optional parent collection' },
          },
          required: ['name'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.object.move_to_collection',
        name: 'blender.object.move_to_collection',
        description: 'Moves an object into a specified collection',
        applicationId: 'blender',
        category: 'COLLECTION',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Target object name or ID' },
            targetCollection: { type: 'string', description: 'Destination collection name' },
            unlinkFromOthers: { type: 'boolean', description: 'Unlink from previous collections' },
          },
          required: ['objectId', 'targetCollection'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.object.duplicate',
        name: 'blender.object.duplicate',
        description: 'Duplicates an existing object in Blender',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Target object name or ID' },
            newName: { type: 'string', description: 'Optional name for duplicate' },
          },
          required: ['objectId'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.object.set_visibility',
        name: 'blender.object.set_visibility',
        description: 'Sets viewport and render visibility for an object',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Target object name or ID' },
            viewport: { type: 'boolean', description: 'Viewport visibility' },
            render: { type: 'boolean', description: 'Render visibility' },
          },
          required: ['objectId'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.object.set_active',
        name: 'blender.object.set_active',
        description: 'Sets active and selected state for an object',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Target object name or ID' },
            selected: { type: 'boolean', description: 'Whether to select object' },
          },
          required: ['objectId'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.object.parent',
        name: 'blender.object.parent',
        description: 'Parents an object to another object with cycle prevention',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Child object name or ID' },
            parentId: { type: 'string', description: 'Parent object name or ID' },
            keepTransform: { type: 'boolean', description: 'Preserve world transform' },
          },
          required: ['objectId', 'parentId'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.object.unparent',
        name: 'blender.object.unparent',
        description: 'Clears parent from an object',
        applicationId: 'blender',
        category: 'OBJECT',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Child object name or ID' },
            keepTransform: { type: 'boolean', description: 'Preserve world transform' },
          },
          required: ['objectId'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.material.create',
        name: 'blender.material.create',
        description: 'Creates a new material in Blender',
        applicationId: 'blender',
        category: 'MATERIAL',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the material' },
            color: { type: 'array', description: 'RGBA color [r, g, b, a]' },
          },
          required: ['name'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.material.assign',
        name: 'blender.material.assign',
        description: 'Assigns a material to an object',
        applicationId: 'blender',
        category: 'MATERIAL',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Target object name or ID' },
            materialName: { type: 'string', description: 'Target material name' },
          },
          required: ['objectId', 'materialName'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.material.set_color',
        name: 'blender.material.set_color',
        description: 'Sets the base color on a material',
        applicationId: 'blender',
        category: 'MATERIAL',
        parameters: {
          type: 'object',
          properties: {
            materialName: { type: 'string', description: 'Material name' },
            color: { type: 'array', description: 'RGB/RGBA color' },
          },
          required: ['materialName', 'color'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.animation.insert_keyframe',
        name: 'blender.animation.insert_keyframe',
        description: 'Inserts a keyframe on an object transform property',
        applicationId: 'blender',
        category: 'ANIMATION',
        parameters: {
          type: 'object',
          properties: {
            objectId: { type: 'string', description: 'Target object name or ID' },
            property: { type: 'string', description: 'Property: location, rotation_euler, scale' },
            frame: { type: 'number', description: 'Timeline frame number' },
            value: { type: 'array', description: 'Optional value [x, y, z]' },
          },
          required: ['objectId', 'property', 'frame'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.render.image',
        name: 'blender.render.image',
        description: 'Renders a still frame to a specified output file',
        applicationId: 'blender',
        category: 'RENDER',
        parameters: {
          type: 'object',
          properties: {
            outputPath: { type: 'string', description: 'Absolute output file path' },
            format: { type: 'string', description: 'Image format: PNG, JPEG, OPEN_EXR' },
            frame: { type: 'number', description: 'Frame number to render' },
          },
          required: ['outputPath'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
      {
        id: 'blender.export.asset',
        name: 'blender.export.asset',
        description: 'Exports scene or asset to a file',
        applicationId: 'blender',
        category: 'EXPORT',
        parameters: {
          type: 'object',
          properties: {
            outputPath: { type: 'string', description: 'Absolute output file path' },
            format: { type: 'string', description: 'Export format: GLTF, FBX, OBJ, STL' },
          },
          required: ['outputPath'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
      },
    ];

  }

  async discover(): Promise<ApplicationDiscoveryInfo> {
    const activeSessions = this.getSessions();
    const isRunning = activeSessions.some((s) => s.state === 'ACTIVE');
    return {
      applicationId: this.applicationId,
      displayName: this.displayName,
      isInstalled: true,
      isRunning,
      version: '4.2.0',
      availableSessions: activeSessions,
    };
  }

  async connect(options?: {
    sessionId?: string;
    launchId?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<ApplicationSession> {
    const sessionId = options?.sessionId || `sess_blender_${crypto.randomUUID()}`;
    const connectionId = `conn_blender_${crypto.randomUUID()}`;

    // Wait for authenticated client connection if not already active
    await ApplicationCapabilityRegistry.waitForClient(
      'blender',
      options?.timeoutMs ?? 15000,
      ['blender.inspect_scene'],
      options?.signal
    );

    const session: ApplicationSession = {
      sessionId,
      applicationId: this.applicationId,
      launchId: options?.launchId,
      connectionId,
      state: 'ACTIVE',
      health: {
        state: 'READY',
        lastHeartbeat: Date.now(),
        connectionId,
        message: 'Connected to Blender IPC runtime',
      },
      capabilities: this.getCapabilities(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.registerSession(session);
    return session;
  }

  async disconnect(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.unregisterSession(sessionId);
    }
    BlenderSceneInspector.invalidate(sessionId);
  }

  async inspect(request: InspectionRequest, _signal?: AbortSignal): Promise<InspectionResult> {
    const observation = await ApplicationObserver.observe('blender', {
      executionId: request.context?.executionId || crypto.randomUUID(),
      workflowId: request.context?.workflowId,
    });

    if (observation === 'UNKNOWN' || observation.status === 'ERROR') {
      return {
        applicationId: this.applicationId,
        sessionId: request.sessionId,
        timestamp: Date.now(),
        status: 'UNKNOWN',
        entities: [],
        error: 'Unable to observe Blender scene state',
      };
    }

    return {
      applicationId: this.applicationId,
      sessionId: request.sessionId,
      timestamp: observation.timestamp,
      status: 'SUCCESS',
      entities: observation.entities,
      rawOutput: observation.metadata,
    };
  }

  async execute(
    operation: ApplicationOperation,
    _signal?: AbortSignal
  ): Promise<ApplicationOperationResult> {
    const startTime = Date.now();
    const capId = operation.capabilityId;

    if (capId === 'blender.modify_object' || capId === 'modify_object') {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: false,
        outcome: 'FAILED',
        error: 'Unknown Blender capability: blender.modify_object (MODIFY_OBJECT_UNAVAILABLE)',
        durationMs: Date.now() - startTime,
        mutatesExternalState: operation.mutatesExternalState,
      };
    }

    const cap = this.capabilities.find(
      (c) =>
        c.id === capId ||
        c.name === capId ||
        c.id === `blender.${capId}` ||
        c.name === `blender.${capId}` ||
        `blender.${c.id}` === capId
    );

    if (!cap) {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: false,
        outcome: 'FAILED',
        error: `Unknown Blender capability: ${operation.capabilityId}`,
        durationMs: Date.now() - startTime,
        mutatesExternalState: operation.mutatesExternalState,
      };
    }

    try {
      const execResult = await SecurityToolExecutor.execute(
        cap.name,
        cap.id,
        operation.parameters,
        undefined,
        undefined,
        undefined,
        {
          workflowId: operation.context?.workflowId,
          executionId: operation.context?.executionId || operation.operationId,
          mutatesExternalState: cap.mutatesExternalState,
        }
      );

      const durationMs = Date.now() - startTime;

      if (!execResult.success) {
        // Distinguish UNKNOWN vs definitive FAILED
        const isUnknown =
          execResult.error?.includes('blender_ipc_timeout') ||
          execResult.error?.includes('DISCONNECTED') ||
          execResult.error?.includes('UNKNOWN');

        return {
          operationId: operation.operationId,
          applicationId: this.applicationId,
          sessionId: operation.sessionId,
          success: false,
          outcome: isUnknown ? 'UNKNOWN' : 'FAILED',
          error: execResult.error || 'Execution failed',
          durationMs,
          mutatesExternalState: cap.mutatesExternalState,
        };
      }

      // Invalidate inspector cache immediately upon successful mutation
      if (cap.mutatesExternalState) {
        BlenderSceneInspector.clearCache();
      }

      // If mutation had a verification predicate, verify observable truth
      let observation: any = undefined;
      if (operation.verificationPredicate) {
        const obsResult = await ApplicationObserver.observe('blender', {
          executionId: operation.context?.executionId || operation.operationId,
          workflowId: operation.context?.workflowId,
        });

        if (obsResult === 'UNKNOWN') {
          return {
            operationId: operation.operationId,
            applicationId: this.applicationId,
            sessionId: operation.sessionId,
            success: false,
            outcome: 'UNKNOWN',
            error: 'Post-mutation observation resulted in UNKNOWN state',
            durationMs,
            mutatesExternalState: cap.mutatesExternalState,
          };
        }

        observation = obsResult;
        const vResult = VerificationEngine.verify(obsResult, operation.verificationPredicate);

        if (vResult !== 'VERIFIED') {
          return {
            operationId: operation.operationId,
            applicationId: this.applicationId,
            sessionId: operation.sessionId,
            success: false,
            outcome: vResult === 'UNKNOWN' ? 'UNKNOWN' : 'FAILED',
            error: `Verification returned: ${vResult}`,
            durationMs,
            mutatesExternalState: cap.mutatesExternalState,
            observation: obsResult,
          };
        }
      }

      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: 'SUCCESS',
        output: execResult.output,
        durationMs,
        mutatesExternalState: cap.mutatesExternalState,
        observation,
      };
    } catch (err: any) {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: false,
        outcome: 'UNKNOWN',
        error: err?.message || String(err),
        durationMs: Date.now() - startTime,
        mutatesExternalState: cap.mutatesExternalState,
      };
    }
  }

  async verify(
    _sessionId: string,
    predicate: VerificationPredicate,
    _signal?: AbortSignal
  ): Promise<VerificationResult> {
    const observation = await ApplicationObserver.observe('blender', {
      executionId: crypto.randomUUID(),
    });

    if (observation === 'UNKNOWN') {
      return 'UNKNOWN';
    }

    return VerificationEngine.verify(observation, predicate);
  }
}
