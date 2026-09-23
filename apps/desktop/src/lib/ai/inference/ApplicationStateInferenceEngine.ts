/**
 * Rezel 13.2.2 — Application State Inference Engine
 *
 * Core engine that combines Application Profiles, live UIA tree observations,
 * native Application Adapters, and the VerificationEngine to infer the runtime
 * state and operational posture of an application.
 *
 * Strict Read-Only Policy: This engine NEVER executes computer actions, mutates OS state,
 * or bypasses security policies.
 */

import type { UIAnalysisResult } from '../ui/types';
import { UIUnderstandingEngine } from '../ui/UIUnderstandingEngine';
import { VerificationEngine } from '../verification/VerificationEngine';
import { ApplicationRegistry } from '../../applications/ApplicationRegistry';
import { ApplicationProfileRegistry } from '../profiles/ApplicationProfileRegistry';
import type { ApplicationProfile } from '../profiles/types';
import type {
  ApplicationRuntimeState,
  InferredState,
  InferredValue,
  StateEvidence,
  StateInferenceQuery,
  StateMutationType,
  DocumentRuntimeState,
  ActivityState,
} from './types';
import { UIAEvidenceMapper } from './UIAEvidenceMapper';
import { ConflictResolver } from './ConflictResolver';
import { StateCache } from './StateCache';
import { AdobeProjectInspector } from '../adobe/AdobeProjectInspector';
import { AdobeTimelineInspector } from '../adobe/AdobeTimelineInspector';
import { AdobeEffectInspector } from '../adobe/AdobeEffectInspector';
import { AdobeRenderQueueInspector } from '../adobe/AdobeRenderQueueInspector';
import type { AdobeProjectSnapshot } from '../adobe/types';
import { BlenderSceneInspector } from '../blender/BlenderSceneInspector';
import type { BlenderSceneSnapshot } from '../blender/types';

export class ApplicationStateInferenceEngineImpl {
  private cache: StateCache;

  constructor(ttlMs = 2000) {
    this.cache = new StateCache(ttlMs);
  }

  /**
   * Infers the complete runtime state snapshot of an application.
   */
  async inferState(query: StateInferenceQuery): Promise<ApplicationRuntimeState> {
    const appIdHint = query.applicationId || query.executableName || 'unknown_app';
    const cacheKey = `${appIdHint}_${query.sessionId || query.windowId || 'default'}`;

    // 1. Check bounded cache if refresh not forced
    if (!query.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const now = Date.now();
    const collectedEvidence: StateEvidence[] = [];

    // 2. Resolve Application Profile
    const profileRes = ApplicationProfileRegistry.resolveProfile({
      appId: query.applicationId,
      executableName: query.executableName,
      version: query.version,
    });

    const profile: ApplicationProfile | undefined = profileRes.profile;
    const resolvedAppId = profileRes.matchedAppId || query.applicationId || 'unknown_app';
    const profileStatus =
      profileRes.status === 'NO_MATCH' ? 'NO_PROFILE' : profileRes.status;

    collectedEvidence.push({
      source: 'PROFILE_MATCHER',
      description: `Profile resolution: ${profileStatus} (${profileRes.reason})`,
      confidence: profile ? 'HIGH' : 'LOW',
      observedAt: now,
      details: { profileStatus, matchedAppId: resolvedAppId },
    });

    // 3. Query Native Application Adapter if available
    const activeStates: Record<string, InferredState> = {};
    let adapterActivity: ActivityState = 'UNKNOWN';
    let adapterModal: boolean | undefined = undefined;
    let adapterWorkspace: string | undefined = undefined;
    let adapterEvidence: StateEvidence | undefined = undefined;

    const adapter = ApplicationRegistry.get(resolvedAppId);
    if (adapter) {
      const health = adapter.getHealth(query.sessionId);
      if (health) {
        if (health.state === 'READY') {
          adapterActivity = 'IDLE';
          activeStates['APP_READY'] = {
            stateId: 'APP_READY',
            isTrue: 'TRUE',
            confidence: 'HIGH',
            evidence: [
              {
                stateId: 'APP_READY',
                source: 'APPLICATION_ADAPTER',
                adapterId: resolvedAppId,
                description: `Application adapter is connected and ready (${health.message || 'READY'})`,
                confidence: 'HIGH',
                observedAt: health.lastHeartbeat || now,
              },
            ],
          };
        } else if (health.state === 'CONNECTING') {
          adapterActivity = 'LOADING';
        } else {
          adapterActivity = 'UNKNOWN';
        }

        adapterEvidence = {
          source: 'APPLICATION_ADAPTER',
          adapterId: resolvedAppId,
          description: `Native Adapter heartbeat state: '${health.state}' (${health.message || 'normal'})`,
          confidence: 'HIGH',
          observedAt: health.lastHeartbeat || now,
          details: { healthState: health.state, connectionId: health.connectionId },
        };
        collectedEvidence.push(adapterEvidence);
      }
    }

    // 4. Collect Live UIA Observation
    let uiObservation: UIAnalysisResult | undefined = query.uiObservation;
    if (!uiObservation) {
      try {
        uiObservation = await UIUnderstandingEngine.inspectNativeUI({
          applicationId: query.applicationId,
          windowId: query.windowId,
          processId: query.processId,
        });
      } catch (err: any) {
        collectedEvidence.push({
          source: 'UIA',
          description: `Native UIA inspection failed: ${err?.message || err}`,
          confidence: 'LOW',
          observedAt: now,
          details: { error: err?.message || err },
        });
      }
    }

    // 5. Extract structural UIA and Window evidence
    let hasModalDialog = false;
    let uiaModalEvidence: StateEvidence | undefined = undefined;
    const structuralEvidence: StateEvidence[] = [];

    if (uiObservation) {
      const extracted = UIAEvidenceMapper.extractStructuralEvidence(uiObservation);
      structuralEvidence.push(...extracted);
      collectedEvidence.push(...extracted);

      const modalEv = extracted.find((e) => e.description.includes('Modal dialog'));
      if (modalEv) {
        hasModalDialog = true;
        uiaModalEvidence = modalEv;
      }
    }

    // 6. Evaluate Profile State Matchers via VerificationEngine
    if (profile && profile.states) {
      for (const [stateId, stateDef] of Object.entries(profile.states)) {
        if (activeStates[stateId] && activeStates[stateId].evidence.some((e) => e.source === 'APPLICATION_ADAPTER')) {
          continue;
        }

        if (!uiObservation || (uiObservation.elements.length === 0 && uiObservation.windows.length === 0)) {
          // Incomplete observation -> UNKNOWN (never false!)
          activeStates[stateId] = {
            stateId,
            isTrue: 'UNKNOWN',
            confidence: 'LOW',
            evidence: [
              {
                stateId,
                source: 'PROFILE_MATCHER',
                description: `UIA observation incomplete or unavailable for state '${stateId}'`,
                confidence: 'LOW',
                observedAt: now,
              },
            ],
          };
          continue;
        }

        const normalizedObs = UIAEvidenceMapper.toNormalizedObservation(
          uiObservation,
          resolvedAppId,
          query.sessionId
        );

        const candidates: Array<{
          isTrue: import('./types').TriStateBoolean;
          confidence: import('./types').ConfidenceLevel;
          evidence: StateEvidence;
        }> = [];

        let allVerified = true;
        let anyUnknown = false;
        const matchedElementIds: string[] = [];

        for (const predicate of stateDef.matchers) {
          const vResult = VerificationEngine.verify(normalizedObs, predicate);
          if (vResult === 'VERIFIED') {
            // Find matched element IDs
            const matches = normalizedObs.entities.filter((e) => {
              if (predicate.entityType && (e.type || '').toUpperCase() !== predicate.entityType.toUpperCase()) {
                return false;
              }
              if (predicate.entityName && e.name !== predicate.entityName) {
                return false;
              }
              return true;
            });
            for (const m of matches) {
              if (m.id) matchedElementIds.push(m.id);
            }
          } else if (vResult === 'UNKNOWN') {
            anyUnknown = true;
            allVerified = false;
          } else {
            allVerified = false;
          }
        }

        if (allVerified && stateDef.matchers.length > 0) {
          candidates.push({
            isTrue: 'TRUE',
            confidence: 'HIGH',
            evidence: {
              stateId,
              source: 'PROFILE_MATCHER',
              description: `Profile state '${stateId}' satisfied by ${stateDef.matchers.length} predicate matcher(s)`,
              matchedElements: matchedElementIds,
              confidence: 'HIGH',
              observedAt: now,
            },
          });
        } else if (anyUnknown) {
          candidates.push({
            isTrue: 'UNKNOWN',
            confidence: 'LOW',
            evidence: {
              stateId,
              source: 'PROFILE_MATCHER',
              description: `State '${stateId}' could not be conclusively determined from partial observation`,
              confidence: 'LOW',
              observedAt: now,
            },
          });
        } else {
          candidates.push({
            isTrue: 'FALSE',
            confidence: 'HIGH',
            evidence: {
              stateId,
              source: 'PROFILE_MATCHER',
              description: `Profile state '${stateId}' predicate matchers were not satisfied`,
              confidence: 'HIGH',
              observedAt: now,
            },
          });
        }

        activeStates[stateId] = ConflictResolver.resolveState(stateId, candidates);
      }
    }

    // 7. Resolve Standard Dimensions
    const hasValidUIA = Boolean(uiObservation && (uiObservation.elements.length > 0 || uiObservation.windows.length > 0));
    const modalState = ConflictResolver.resolveModalState(
      hasModalDialog,
      hasValidUIA,
      uiaModalEvidence,
      adapterModal,
      adapterEvidence
    );

    const activity = ConflictResolver.resolveActivity(
      adapterActivity,
      adapterEvidence,
      'UNKNOWN',
      undefined
    );

    // 8. Derive Document State (for text editor / document apps like Notepad)
    const documentState = this.deriveDocumentState(uiObservation, resolvedAppId, now);

    // 9. Derive Workspace / Location (for Explorer or workspace apps)
    const workspace = this.deriveWorkspaceState(uiObservation, resolvedAppId, adapterWorkspace, now);

    // 10. Query Adobe Project Intelligence if application is After Effects
    let adobeProjectSnapshot: AdobeProjectSnapshot | undefined = undefined;
    if (resolvedAppId === 'after_effects') {
      try {
        adobeProjectSnapshot = await AdobeProjectInspector.inspectProject({
          sessionId: query.sessionId,
          forceRefresh: query.forceRefresh,
        });

        if (adobeProjectSnapshot) {
          collectedEvidence.push({
            source: 'APPLICATION_ADAPTER',
            adapterId: 'after_effects',
            description: `Adobe project state: ${adobeProjectSnapshot.status} (${adobeProjectSnapshot.compositions.length} comp(s)${adobeProjectSnapshot.activeCompositionId ? `, active: ${adobeProjectSnapshot.activeCompositionId}` : ''})`,
            confidence:
              adobeProjectSnapshot.status === 'UNKNOWN' ||
              adobeProjectSnapshot.status === 'ADAPTER_DISCONNECTED'
                ? 'LOW'
                : 'HIGH',
            observedAt: adobeProjectSnapshot.observedAt,
            details: {
              status: adobeProjectSnapshot.status,
              projectName: adobeProjectSnapshot.projectName,
              compositionsCount: adobeProjectSnapshot.compositions.length,
              activeCompositionId: adobeProjectSnapshot.activeCompositionId,
            },
          });

          // Reflect Adobe state directly into activeStates with Tier 1 Application Adapter authority
          if (adobeProjectSnapshot.status === 'ACTIVE_COMPOSITION') {
            activeStates['ACTIVE_COMPOSITION'] = {
              stateId: 'ACTIVE_COMPOSITION',
              isTrue: 'TRUE',
              confidence: 'HIGH',
              evidence: [
                {
                  stateId: 'ACTIVE_COMPOSITION',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'after_effects',
                  description: `Active composition loaded: ${adobeProjectSnapshot.activeCompositionId}`,
                  confidence: 'HIGH',
                  observedAt: adobeProjectSnapshot.observedAt,
                },
              ],
            };
            activeStates['PROJECT_OPEN'] = {
              stateId: 'PROJECT_OPEN',
              isTrue: 'TRUE',
              confidence: 'HIGH',
              evidence: [
                {
                  stateId: 'PROJECT_OPEN',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'after_effects',
                  description: `Project open with active composition`,
                  confidence: 'HIGH',
                  observedAt: adobeProjectSnapshot.observedAt,
                },
              ],
            };
          } else if (adobeProjectSnapshot.status === 'NO_ACTIVE_COMPOSITION' || adobeProjectSnapshot.status === 'PROJECT_OPEN') {
            activeStates['ACTIVE_COMPOSITION'] = {
              stateId: 'ACTIVE_COMPOSITION',
              isTrue: 'FALSE',
              confidence: 'HIGH',
              evidence: [
                {
                  stateId: 'ACTIVE_COMPOSITION',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'after_effects',
                  description: `Project is open but no active composition is selected`,
                  confidence: 'HIGH',
                  observedAt: adobeProjectSnapshot.observedAt,
                },
              ],
            };
            activeStates['PROJECT_OPEN'] = {
              stateId: 'PROJECT_OPEN',
              isTrue: 'TRUE',
              confidence: 'HIGH',
              evidence: [
                {
                  stateId: 'PROJECT_OPEN',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'after_effects',
                  description: `Project open`,
                  confidence: 'HIGH',
                  observedAt: adobeProjectSnapshot.observedAt,
                },
              ],
            };
          } else if (adobeProjectSnapshot.status === 'PROJECT_CLOSED') {
            activeStates['ACTIVE_COMPOSITION'] = {
              stateId: 'ACTIVE_COMPOSITION',
              isTrue: 'FALSE',
              confidence: 'HIGH',
              evidence: [
                {
                  stateId: 'ACTIVE_COMPOSITION',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'after_effects',
                  description: `Project closed`,
                  confidence: 'HIGH',
                  observedAt: adobeProjectSnapshot.observedAt,
                },
              ],
            };
            activeStates['PROJECT_OPEN'] = {
              stateId: 'PROJECT_OPEN',
              isTrue: 'FALSE',
              confidence: 'HIGH',
              evidence: [
                {
                  stateId: 'PROJECT_OPEN',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'after_effects',
                  description: `Project closed`,
                  confidence: 'HIGH',
                  observedAt: adobeProjectSnapshot.observedAt,
                },
              ],
            };
          } else if (
            adobeProjectSnapshot.status === 'ADAPTER_DISCONNECTED' ||
            adobeProjectSnapshot.status === 'UNKNOWN'
          ) {
            activeStates['ACTIVE_COMPOSITION'] = {
              stateId: 'ACTIVE_COMPOSITION',
              isTrue: 'UNKNOWN',
              confidence: 'LOW',
              evidence: [
                {
                  stateId: 'ACTIVE_COMPOSITION',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'after_effects',
                  description: `Adapter disconnected or state unknown`,
                  confidence: 'LOW',
                  observedAt: adobeProjectSnapshot.observedAt,
                },
              ],
            };
          }
        }
      } catch (err: any) {
        collectedEvidence.push({
          source: 'APPLICATION_ADAPTER',
          adapterId: 'after_effects',
          description: `Adobe project inspection failed: ${err?.message || err}`,
          confidence: 'LOW',
          observedAt: now,
          details: { error: err?.message || err },
        });
      }
    }

    // 11. Query Blender Scene Intelligence if application is Blender
    let blenderSceneSnapshot: BlenderSceneSnapshot | undefined = undefined;
    if (resolvedAppId === 'blender') {
      try {
        blenderSceneSnapshot = await BlenderSceneInspector.inspectScene({
          sessionId: query.sessionId,
          forceRefresh: query.forceRefresh,
        });

        if (blenderSceneSnapshot) {
          collectedEvidence.push({
            source: 'APPLICATION_ADAPTER',
            adapterId: 'blender',
            description: `Blender scene state: ${blenderSceneSnapshot.status} (${blenderSceneSnapshot.objects.length} object(s), ${blenderSceneSnapshot.collections.length} collection(s)${blenderSceneSnapshot.activeSceneName ? `, scene: ${blenderSceneSnapshot.activeSceneName}` : ''})`,
            confidence:
              blenderSceneSnapshot.status === 'UNKNOWN' ||
              blenderSceneSnapshot.status === 'ADAPTER_DISCONNECTED'
                ? 'LOW'
                : 'HIGH',
            observedAt: blenderSceneSnapshot.observedAt,
            details: {
              status: blenderSceneSnapshot.status,
              activeSceneName: blenderSceneSnapshot.activeSceneName,
              objectsCount: blenderSceneSnapshot.objects.length,
              collectionsCount: blenderSceneSnapshot.collections.length,
            },
          });

          // Reflect Blender state directly into activeStates with Tier 1 authority
          if (blenderSceneSnapshot.status === 'ACTIVE_SCENE') {
            activeStates['ACTIVE_SCENE'] = {
              stateId: 'ACTIVE_SCENE',
              isTrue: 'TRUE',
              confidence: 'HIGH',
              evidence: [
                {
                  stateId: 'ACTIVE_SCENE',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'blender',
                  description: `Active scene loaded: ${blenderSceneSnapshot.activeSceneName || 'Scene'}`,
                  confidence: 'HIGH',
                  observedAt: blenderSceneSnapshot.observedAt,
                },
              ],
            };
            activeStates['PROJECT_OPEN'] = {
              stateId: 'PROJECT_OPEN',
              isTrue: 'TRUE',
              confidence: 'HIGH',
              evidence: [
                {
                  stateId: 'PROJECT_OPEN',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'blender',
                  description: `Blender project open with active scene`,
                  confidence: 'HIGH',
                  observedAt: blenderSceneSnapshot.observedAt,
                },
              ],
            };
          } else if (blenderSceneSnapshot.status === 'NO_ACTIVE_SCENE') {
            activeStates['ACTIVE_SCENE'] = {
              stateId: 'ACTIVE_SCENE',
              isTrue: 'FALSE',
              confidence: 'HIGH',
              evidence: [
                {
                  stateId: 'ACTIVE_SCENE',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'blender',
                  description: `No active scene loaded in Blender`,
                  confidence: 'HIGH',
                  observedAt: blenderSceneSnapshot.observedAt,
                },
              ],
            };
          } else if (
            blenderSceneSnapshot.status === 'ADAPTER_DISCONNECTED' ||
            blenderSceneSnapshot.status === 'UNKNOWN'
          ) {
            activeStates['ACTIVE_SCENE'] = {
              stateId: 'ACTIVE_SCENE',
              isTrue: 'UNKNOWN',
              confidence: 'LOW',
              evidence: [
                {
                  stateId: 'ACTIVE_SCENE',
                  source: 'APPLICATION_ADAPTER',
                  adapterId: 'blender',
                  description: `Blender adapter disconnected or state unknown`,
                  confidence: 'LOW',
                  observedAt: blenderSceneSnapshot.observedAt,
                },
              ],
            };
          }
        }
      } catch (err: any) {
        collectedEvidence.push({
          source: 'APPLICATION_ADAPTER',
          adapterId: 'blender',
          description: `Blender scene inspection failed: ${err?.message || err}`,
          confidence: 'LOW',
          observedAt: now,
          details: { error: err?.message || err },
        });
      }
    }

    // 12. Assemble complete runtime state snapshot
    const runtimeState: ApplicationRuntimeState = {
      appId: resolvedAppId,
      sessionId: query.sessionId,
      windowId: query.windowId || uiObservation?.windows[0]?.windowId,
      processId: query.processId || uiObservation?.windows[0]?.processId,
      profileStatus,
      activeStates,
      workspace,
      document: documentState,
      modalState,
      activity,
      adobeProject: adobeProjectSnapshot,
      blenderScene: blenderSceneSnapshot,
      evidence: collectedEvidence,
      observedAt: now,
      isCached: false,
    };

    // 12. Cache current snapshot
    this.cache.set(cacheKey, runtimeState);

    return runtimeState;
  }

  /**
   * Derives document state from window title and editor element properties.
   */
  private deriveDocumentState(
    uiResult: UIAnalysisResult | undefined,
    appId: string,
    now: number
  ): DocumentRuntimeState | undefined {
    if (!uiResult || !uiResult.windows || uiResult.windows.length === 0) {
      return undefined;
    }

    const win = uiResult.windows.find((w) => w.focused) || uiResult.windows[0];
    const title = win?.title || '';

    // Check Notepad title patterns: "*Untitled - Notepad", "Untitled - Notepad", "*doc.txt - Notepad"
    if (appId === 'notepad' || title.toLowerCase().includes('notepad')) {
      const isDirty = title.startsWith('*');
      const cleanTitle = title.replace(/^\*/, '').trim();
      const parts = cleanTitle.split(' - ');
      const docName = parts.length > 1 ? parts[0].trim() : cleanTitle;

      const docEvidence: StateEvidence = {
        source: 'WINDOW',
        description: `Document title extracted from window title: '${title}'`,
        confidence: 'HIGH',
        observedAt: now,
        matchedElements: [win.windowId],
      };

      return {
        name: {
          value: docName,
          confidence: 'HIGH',
          evidence: [docEvidence],
        },
        dirty: {
          value: isDirty,
          confidence: 'HIGH',
          evidence: [docEvidence],
        },
      };
    }

    return undefined;
  }

  /**
   * Derives workspace / location state from address bars or navigation elements.
   */
  private deriveWorkspaceState(
    uiResult: UIAnalysisResult | undefined,
    appId: string,
    adapterWorkspace: string | undefined,
    now: number
  ): InferredValue<string> | undefined {
    if (adapterWorkspace) {
      return {
        value: adapterWorkspace,
        confidence: 'HIGH',
        evidence: [
          {
            source: 'APPLICATION_ADAPTER',
            description: `Workspace reported by native adapter: '${adapterWorkspace}'`,
            confidence: 'HIGH',
            observedAt: now,
          },
        ],
      };
    }

    if (!uiResult) return undefined;

    // File Explorer address bar / navigation path
    if (appId === 'explorer' || (uiResult.windows && uiResult.windows.some((w) => w.className === 'CabinetWClass'))) {
      const addressBar = uiResult.elements.find(
        (el) => el.automationId === 'AddressBandRoot' || el.className === 'Address Band Root' || el.role === 'ComboBox'
      );
      if (addressBar && (addressBar.value || addressBar.text)) {
        const path = addressBar.value || addressBar.text || '';
        return {
          value: path,
          confidence: 'HIGH',
          evidence: [
            {
              source: 'UIA',
              description: `Location path extracted from address bar: '${path}'`,
              matchedElements: [addressBar.elementId],
              confidence: 'HIGH',
              observedAt: now,
            },
          ],
        };
      }
    }

    return undefined;
  }

  /**
   * Invalidates cached state when an action mutates application state.
   */
  notifyActionExecuted(appId: string, sessionId: string | undefined, mutationType: StateMutationType): boolean {
    const key = `${appId}_${sessionId || 'default'}`;
    if (appId === 'after_effects') {
      AdobeProjectInspector.invalidateCache(sessionId);
      AdobeTimelineInspector.invalidate();
      AdobeEffectInspector.clearCache();
      AdobeRenderQueueInspector.invalidate(sessionId);
    } else if (appId === 'blender') {
      BlenderSceneInspector.invalidate(sessionId);
    }
    return this.cache.invalidateByMutation(key, mutationType);
  }

  /**
   * Invalidates session when an application exits or disconnects.
   */
  invalidateSession(appId: string, sessionId?: string): boolean {
    const key = `${appId}_${sessionId || 'default'}`;
    if (appId === 'after_effects') {
      AdobeProjectInspector.invalidateCache(sessionId);
      AdobeTimelineInspector.invalidate();
      AdobeEffectInspector.clearCache();
      AdobeRenderQueueInspector.invalidate(sessionId);
    } else if (appId === 'blender') {
      BlenderSceneInspector.invalidate(sessionId);
    }
    return this.cache.invalidate(key, 'Session disconnected/exited');
  }

  /**
   * Clears entire inference cache.
   */
  reset(): void {
    this.cache.reset();
    AdobeProjectInspector.clearCache();
    AdobeTimelineInspector.invalidate();
    AdobeEffectInspector.clearCache();
    AdobeRenderQueueInspector.invalidateAll();
    BlenderSceneInspector.clearCache();
  }

  /**
   * Retrieves cache statistics.
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Configures cache TTL.
   */
  setCacheTTL(ttlMs: number) {
    this.cache.setTTL(ttlMs);
  }
}

export const ApplicationStateInferenceEngine = new ApplicationStateInferenceEngineImpl();
