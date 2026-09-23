import type { NormalizedObservation, AppEntity } from './types';
import { AIToolExecutor } from '../ToolExecutor';
import { CapabilityRegistry } from '../capabilities/CapabilityRegistry';


import { ResourceLockManager } from '../scheduler/ResourceLockManager';

export class ApplicationObserverImpl {
  
  async observe(appId: string, context: any): Promise<NormalizedObservation | 'UNKNOWN'> {
    let capabilityId: string;
    
    if (appId === 'blender') {
      capabilityId = 'blender.inspect_scene';
    } else if (appId === 'after_effects') {
      capabilityId = 'ae_inspect_project';
    } else {
      console.warn(`Observation not supported for appId: ${appId}`);
      return 'UNKNOWN';
    }

    let capability = CapabilityRegistry.get(capabilityId);
    if (!capability) {
      // Try direct ApplicationAdapter inspect if registered
      try {
        const { ApplicationRegistry } = await import('../../applications/ApplicationRegistry');
        const adapter = ApplicationRegistry.get(appId);
        if (adapter && adapter.getHealth(context?.sessionId)?.state === 'READY') {
          const inspectRes = await adapter.inspect({ applicationId: appId, sessionId: context?.sessionId });
          if (inspectRes && (inspectRes.status === 'SUCCESS' || (inspectRes.status as string) === 'ACTIVE_SCENE')) {
            const normalized = this.normalizeObservation(
              appId,
              capabilityId,
              inspectRes.rawOutput || inspectRes.entities,
              context?.executionId
            );
            if (normalized.status !== 'ERROR') {
              return normalized;
            }
          }
        }
      } catch (adapterErr) {
        // Fall through
      }

      console.error(`Read-only capability ${capabilityId} not registered.`);
      return 'UNKNOWN';
    }

    const locks = capability.getRequiredLocks ? await capability.getRequiredLocks({}, context) : [];
    if (locks.length > 0) {
      await ResourceLockManager.acquireLocks(context.workflowId, context.executionId, locks);
    }

    try {
      const result = await AIToolExecutor.executeCapability(
        capability,
        {},
        { ...context, mode: 'EXECUTE' },
        {}
      );

      if (!result.success || result.output === undefined) {
        // Fallback to direct ApplicationAdapter inspect if registered and ready
        try {
          const { ApplicationRegistry } = await import('../../applications/ApplicationRegistry');
          const adapter = ApplicationRegistry.get(appId);
          if (adapter && adapter.getHealth(context?.sessionId)?.state === 'READY') {
            const inspectRes = await adapter.inspect({ applicationId: appId, sessionId: context?.sessionId });
            if (inspectRes && (inspectRes.status === 'SUCCESS' || (inspectRes.status as string) === 'ACTIVE_SCENE')) {
              const normalized = this.normalizeObservation(
                appId,
                capabilityId,
                inspectRes.rawOutput || inspectRes.entities,
                context?.executionId
              );
              if (normalized.status !== 'ERROR') {
                return normalized;
              }
            }
          }
        } catch (adapterErr) {
          // Fall through
        }

        return 'UNKNOWN';
      }

      const normalized = this.normalizeObservation(appId, capabilityId, result.output, context.executionId);
      if (normalized.status === 'ERROR') {
         return 'UNKNOWN';
      }
      return normalized;
    } finally {
      if (locks.length > 0) {
        ResourceLockManager.releaseLocks(context.workflowId, context.executionId);
      }
    }
  }

  private normalizeObservation(appId: string, sourceCapability: string, rawOutput: any, executionId?: string): NormalizedObservation {
    const entities: AppEntity[] = [];

    try {
      let output = rawOutput;
      if (typeof rawOutput === 'string') {
        try {
          output = JSON.parse(rawOutput);
        } catch (e) {}
      }
      if (output && typeof output === 'object' && 'success' in output) {
         if (output.success === false) {
            return {
               appId,
               timestamp: Date.now(),
               status: 'ERROR',
               entities: [],
               metadata: { error: output.error || 'Unknown error' },
               sourceCapability,
               executionId,
               isStale: true
            };
         }
         if ('output' in output) {
            output = output.output;
         }
      }
      if (typeof output === 'string') {
        try {
          output = JSON.parse(output);
        } catch (e) {}
      }

      if (appId === 'blender') {
        // Normalize scene entity
        if (output?.scene_name) {
          entities.push({
            id: output.scene_name,
            type: 'SCENE',
            name: output.scene_name,
            properties: {
              name: output.scene_name,
              filePath: output.file_path,
              fileName: output.file_name,
              isDirty: output.is_dirty,
              activeObjectName: output.active_object_name,
            },
          });
        }

        // Normalize collections
        if (Array.isArray(output?.collections)) {
          for (const col of output.collections) {
            entities.push({
              id: col.name || col.id,
              type: 'COLLECTION',
              name: col.name,
              properties: {
                name: col.name,
                objectIds: col.object_ids,
                visible: col.visible,
              },
            });
          }
        }

        // Current Blender IPC returns scene metadata plus an objects array;
        // retain support for the legacy top-level array response.
        const sceneObjects = Array.isArray(output)
          ? output
          : Array.isArray(output?.objects)
            ? output.objects
            : [];
        for (const obj of sceneObjects) {
          entities.push({
            id: obj.name,
            type: obj.type ? String(obj.type).toUpperCase() : 'OBJECT',
            name: obj.name,
            properties: {
              location: obj.location,
              rotation: obj.rotation_euler,
              rotation_order: obj.rotation_order,
              scale: obj.scale,
              name: obj.name,
              type: obj.type,
              parent: obj.parent,
              collections: obj.collection_names,
              visible: obj.visible,
              selected: obj.selected,
              active: obj.active,
            }
          });
        }
      } else if (appId === 'after_effects' && output) {
        // Support nested project inspection output or flat array
        const rawComps: any[] = Array.isArray(output)
          ? output
          : Array.isArray(output?.compositions)
            ? output.compositions
            : output?.activeComp
              ? [output.activeComp]
              : [];

        for (const comp of rawComps) {
          if (comp.name) {
            entities.push({
              id: String(comp.id || comp.name),
              type: 'COMPOSITION',
              name: comp.name,
              properties: {
                width: comp.width,
                height: comp.height,
                duration: comp.duration,
                frameRate: comp.frameRate,
              },
            });
          }

          const rawLayers = Array.isArray(comp.layers) ? comp.layers : [];
          for (const layer of rawLayers) {
            entities.push({
              id: String(layer.id || layer.name),
              type: (layer.type || 'TEXT').toUpperCase(),
              name: layer.name,
              properties: {
                text: layer.text || layer.sourceText,
                position: layer.position,
                scale: layer.scale,
                rotation: layer.rotation,
                opacity: layer.opacity,
                compName: comp.name,
              },
            });
          }
        }
      }

      return {
        appId,
        timestamp: Date.now(),
        status: 'READY',
        entities,
        metadata: {},
        sourceCapability,
        executionId,
        isStale: false
      };
    } catch (e) {
      console.error('Failed to normalize observation', e);
      return {
         appId,
         timestamp: Date.now(),
         status: 'ERROR',
         entities: [],
         metadata: { error: String(e) },
         sourceCapability,
         executionId,
         isStale: true
      };
    }
  }
}

export const ApplicationObserver = new ApplicationObserverImpl();
