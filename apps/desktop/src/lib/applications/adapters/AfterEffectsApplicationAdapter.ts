/**
 * Rezel OS — After Effects Application Adapter (Milestone 11.3E)
 *
 * Implements ApplicationAdapter for Adobe After Effects, wrapping project inspection,
 * composition automation, text layers, transform mutations, and multi-session tracking.
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
import { ApplicationObserver } from '../../ai/verification/ApplicationObserver';
import { VerificationEngine } from '../../ai/verification/VerificationEngine';
import { ToolExecutor as SecurityToolExecutor } from '../../security/ToolExecutor';

export class AfterEffectsApplicationAdapter extends BaseApplicationAdapter {
  readonly applicationId = 'after_effects';
  readonly displayName = 'Adobe After Effects';

  constructor() {
    super();
    this.capabilities = [
      {
        id: 'ae_get_status',
        name: 'ae_get_status',
        description: 'Checks After Effects connection and engine status',
        applicationId: 'after_effects',
        category: 'SYSTEM',
        parameters: { type: 'object', properties: {} },
        mutatesExternalState: false,
        risk: 'LOW',
        retryPolicy: 'AUTO',
        requiredLocks: [{ uri: 'app:after_effects', access: 'READ' }],
      },
      {
        id: 'ae_inspect_project',
        name: 'ae_inspect_project',
        description: 'Inspects active composition, layers, and items in After Effects project',
        applicationId: 'after_effects',
        category: 'PROJECT',
        parameters: { type: 'object', properties: {} },
        mutatesExternalState: false,
        risk: 'LOW',
        retryPolicy: 'AUTO',
        requiredLocks: [{ uri: 'app:after_effects', access: 'READ' }],
      },
      {
        id: 'ae_create_project',
        name: 'ae_create_project',
        description: 'Creates a clean new project in After Effects',
        applicationId: 'after_effects',
        category: 'PROJECT',
        parameters: { type: 'object', properties: {} },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_create_comp',
        name: 'ae_create_comp',
        description: 'Creates a new composition in the active After Effects project',
        applicationId: 'after_effects',
        category: 'COMPOSITION',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Composition name' },
            width: { type: 'number', description: 'Width in pixels' },
            height: { type: 'number', description: 'Height in pixels' },
            duration: { type: 'number', description: 'Duration in seconds' },
            frameRate: { type: 'number', description: 'Frames per second' },
          },
          required: ['name'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_add_text_layer',
        name: 'ae_add_text_layer',
        description: 'Adds a styled text layer to an After Effects composition',
        applicationId: 'after_effects',
        category: 'LAYER',
        parameters: {
          type: 'object',
          properties: {
            compId: { type: 'number', description: 'Target composition ID' },
            compName: { type: 'string', description: 'Target composition name' },
            text: { type: 'string', description: 'Source text string' },
            fontSize: { type: 'number', description: 'Font size in points' },
            font: { type: 'string', description: 'Font postscript name' },
            fillColor: { type: 'array', description: '[r, g, b] normalized color' },
          },
          required: ['text'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_add_layer',
        name: 'ae_add_layer',
        description: 'Adds a solid, text, or shape layer to an After Effects composition',
        applicationId: 'after_effects',
        category: 'LAYER',
        parameters: {
          type: 'object',
          properties: {
            compName: { type: 'string' },
            layerType: { type: 'string' },
            layerName: { type: 'string' },
          },
          required: ['compName', 'layerType'],
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_set_transform',
        name: 'ae_set_transform',
        description: 'Sets transform properties (position, scale, rotation, opacity) of a layer',
        applicationId: 'after_effects',
        category: 'LAYER',
        parameters: {
          type: 'object',
          properties: {
            compId: { type: 'number' },
            compName: { type: 'string' },
            layerIndex: { type: 'number' },
            layerName: { type: 'string' },
            position: { type: 'array' },
            scale: { type: 'array' },
            rotation: { type: 'number' },
            opacity: { type: 'number' },
          },
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_save_project',
        name: 'ae_save_project',
        description: 'Saves the active After Effects project to disk',
        applicationId: 'after_effects',
        category: 'PROJECT',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Destination file path' },
          },
          required: ['path'],
        },
        mutatesExternalState: true,
        risk: 'MEDIUM',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_inspect_timeline',
        name: 'ae_inspect_timeline',
        description: 'Inspects timeline, current time, properties and keyframes of active composition or layer',
        applicationId: 'after_effects',
        category: 'PROJECT',
        parameters: {
          type: 'object',
          properties: {
            compId: { type: 'number' },
            layerIndex: { type: 'number' },
            propertyPath: { type: 'string' },
            maxProperties: { type: 'number' },
            maxKeyframes: { type: 'number' },
          },
        },
        mutatesExternalState: false,
        risk: 'LOW',
        retryPolicy: 'AUTO',
        requiredLocks: [{ uri: 'app:after_effects', access: 'READ' }],
      },
      {
        id: 'ae_add_keyframe',
        name: 'ae_add_keyframe',
        description: 'Adds a keyframe at specified time for a property in active composition',
        applicationId: 'after_effects',
        category: 'LAYER',
        parameters: {
          type: 'object',
          properties: {
            compId: { type: 'number' },
            layerIndex: { type: 'number' },
            propertyPath: { type: 'string' },
            time: { type: 'number' },
            value: { description: 'Target keyframe value' },
          },
          required: ['compId', 'layerIndex', 'propertyPath', 'time', 'value'],
        },
        mutatesExternalState: true,
        risk: 'LOW',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_set_keyframe_value',
        name: 'ae_set_keyframe_value',
        description: 'Sets the value of an existing keyframe at specified time for a property',
        applicationId: 'after_effects',
        category: 'LAYER',
        parameters: {
          type: 'object',
          properties: {
            compId: { type: 'number' },
            layerIndex: { type: 'number' },
            propertyPath: { type: 'string' },
            time: { type: 'number' },
            value: { description: 'New keyframe value' },
          },
          required: ['compId', 'layerIndex', 'propertyPath', 'time', 'value'],
        },
        mutatesExternalState: true,
        risk: 'LOW',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_inspect_effects',
        name: 'ae_inspect_effects',
        description: 'Inspects effects applied to a layer and their parameters',
        applicationId: 'after_effects',
        category: 'LAYER',
        parameters: {
          type: 'object',
          properties: {
            compId: { type: 'number' },
            layerIndex: { type: 'number' },
            maxEffects: { type: 'number' },
            maxPropertiesPerEffect: { type: 'number' },
          },
        },
        mutatesExternalState: false,
        risk: 'LOW',
        retryPolicy: 'AUTO',
        requiredLocks: [{ uri: 'app:after_effects', access: 'READ' }],
      },
      {
        id: 'ae_set_property_value',
        name: 'ae_set_property_value',
        description: 'Sets static value of an effect property on a layer',
        applicationId: 'after_effects',
        category: 'LAYER',
        parameters: {
          type: 'object',
          properties: {
            compId: { type: 'number' },
            layerIndex: { type: 'number' },
            propertyPath: { type: 'string' },
            value: { description: 'Target static property value' },
            effectMatchName: { type: 'string' },
            occurrenceIndex: { type: 'number' },
          },
          required: ['layerIndex', 'propertyPath', 'value'],
        },
        mutatesExternalState: true,
        risk: 'MEDIUM',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_inspect_render_queue',
        name: 'ae_inspect_render_queue',
        description: 'Inspects the After Effects render queue and queued items',
        applicationId: 'after_effects',
        category: 'RENDER',
        parameters: {
          type: 'object',
          properties: {
            maxItems: { type: 'number' },
          },
        },
        mutatesExternalState: false,
        risk: 'LOW',
        retryPolicy: 'AUTO',
        requiredLocks: [{ uri: 'app:after_effects', access: 'READ' }],
      },
      {
        id: 'ae_add_to_render_queue',
        name: 'ae_add_to_render_queue',
        description: 'Adds a composition to the After Effects render queue',
        applicationId: 'after_effects',
        category: 'RENDER',
        parameters: {
          type: 'object',
          properties: {
            compId: { type: 'number' },
          },
        },
        mutatesExternalState: true,
        risk: 'MEDIUM',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_set_render_output_path',
        name: 'ae_set_render_output_path',
        description: 'Sets destination output file path for a render queue item',
        applicationId: 'after_effects',
        category: 'RENDER',
        parameters: {
          type: 'object',
          properties: {
            queueIndex: { type: 'number' },
            outputFilePath: { type: 'string' },
            expectedCompId: { type: 'string' },
          },
          required: ['queueIndex', 'outputFilePath'],
        },
        mutatesExternalState: true,
        risk: 'MEDIUM',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_start_render',
        name: 'ae_start_render',
        description: 'Starts synchronous render queue execution in After Effects',
        applicationId: 'after_effects',
        category: 'RENDER',
        parameters: {
          type: 'object',
          properties: {},
        },
        mutatesExternalState: true,
        risk: 'HIGH',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
      },
      {
        id: 'ae_import_file',
        name: 'ae_import_file',
        description: 'Imports an external media or footage file into the After Effects project',
        applicationId: 'after_effects',
        category: 'PROJECT',
        parameters: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Absolute path to file to import' },
            compId: { type: 'number', description: 'Optional composition ID to add imported item to' },
          },
          required: ['filePath'],
        },
        mutatesExternalState: true,
        risk: 'MEDIUM',
        retryPolicy: 'NEVER',
        requiredLocks: [{ uri: 'app:after_effects', access: 'WRITE' }],
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
      version: '24.5',
      availableSessions: activeSessions,
    };
  }

  async connect(options?: {
    sessionId?: string;
    launchId?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<ApplicationSession> {
    const sessionId = options?.sessionId || `sess_ae_${crypto.randomUUID()}`;
    const connectionId = `conn_ae_${crypto.randomUUID()}`;

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
        message: 'Connected to After Effects ExtendScript IPC bridge',
      },
      capabilities: this.getCapabilities(),
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.registerSession(session);
    return session;
  }

  async disconnect(sessionId: string): Promise<void> {
    this.unregisterSession(sessionId);
  }

  async ping(sessionId?: string): Promise<import('../types').ApplicationHealth> {
    return this.getHealth(sessionId);
  }

  async inspect(request: InspectionRequest, _signal?: AbortSignal): Promise<InspectionResult> {
    const observation = await ApplicationObserver.observe('after_effects', {
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
        error: 'Unable to observe After Effects project state',
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
    const cap = this.capabilities.find(
      (c) => c.id === operation.capabilityId || c.name === operation.capabilityId
    );

    if (!cap) {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: false,
        outcome: 'FAILED',
        error: `Unknown After Effects capability: ${operation.capabilityId}`,
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
        const isUnknown =
          execResult.error?.includes('ae_ipc_timeout') ||
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

      // If mutation has a verification predicate, verify observable state
      let observation: any = undefined;
      if (operation.verificationPredicate) {
        const obsResult = await ApplicationObserver.observe('after_effects', {
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
    const observation = await ApplicationObserver.observe('after_effects', {
      executionId: crypto.randomUUID(),
    });

    if (observation === 'UNKNOWN') {
      return 'UNKNOWN';
    }

    return VerificationEngine.verify(observation, predicate);
  }
}
