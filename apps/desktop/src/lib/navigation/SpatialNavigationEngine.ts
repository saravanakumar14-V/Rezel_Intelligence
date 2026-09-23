/**
 * SpatialNavigationEngine (Compatibility Adaptor)
 *
 * Consolidated navigation router delegating all spatial intent directly to
 * the canonical `accessFieldBus` + Spatial Surface registry architecture.
 *
 * Eliminates redundant parallel navigation stacks.
 */

import type {
  SpatialSpace,
  NavigationState,
  NavigationListener,
} from './types';
import { WorkflowRuntime } from '../ai/WorkflowRuntime';
import { KnowledgeIngestionManager } from '../ai/knowledge/KnowledgeIngestionManager';
import { accessFieldBus } from '../../components/navigation/accessFieldState';

const SPACE_TO_SURFACE_MAP: Record<SpatialSpace, string | null> = {
  CORE: null,
  CONVERSATION: 'conv-chat',
  WORKFLOW: 'auto-workflows',
  AUTOMATION: 'automate',
  MODELS: 'inspect-models',
  MEMORY: 'analyze-memory',
  KNOWLEDGE: 'inspect-knowledge',
  PROVIDERS: 'analyze-providers',
  TRUST: 'ctrl-permissions',
  AUDIT: 'inspect-security',
  SYSTEM: 'analyze-system',
};

const SURFACE_TO_SPACE_MAP: Record<string, SpatialSpace> = {
  'conv-chat': 'CONVERSATION',
  'auto-workflows': 'WORKFLOW',
  'automate': 'AUTOMATION',
  'inspect-models': 'MODELS',
  'analyze-memory': 'MEMORY',
  'inspect-knowledge': 'KNOWLEDGE',
  'analyze-providers': 'PROVIDERS',
  'ctrl-permissions': 'TRUST',
  'inspect-security': 'AUDIT',
  'analyze-system': 'SYSTEM',
};

class SpatialNavigationEngineImpl {
  private listeners = new Set<NavigationListener>();
  private currentSpace: SpatialSpace = 'CORE';
  private currentSubContext?: string = undefined;
  private contextParams?: Record<string, any> = undefined;
  private stack: Array<{ space: SpatialSpace; subContext?: string; params?: Record<string, any>; timestamp: number }> = [
    { space: 'CORE', timestamp: Date.now() },
  ];

  constructor() {
    // Forward canonical accessFieldBus events to any legacy listeners
    accessFieldBus.subscribe(() => {
      this.notify();
    });
  }

  public getCurrentSpace(): SpatialSpace {
    const targetSurfaceId = accessFieldBus.getTargetSurfaceId();
    if (targetSurfaceId && SURFACE_TO_SPACE_MAP[targetSurfaceId]) {
      return SURFACE_TO_SPACE_MAP[targetSurfaceId];
    }
    return this.currentSpace;
  }

  public getCurrentSubContext(): string | undefined {
    return this.currentSubContext;
  }

  public getContextParams(): Record<string, any> | undefined {
    return this.contextParams;
  }

  public canGoBack(): boolean {
    return this.stack.length > 1 || this.currentSubContext !== undefined || (this.currentSpace !== 'CORE' && accessFieldBus.getIsOpen());
  }

  public navigate(space: SpatialSpace, params?: Record<string, any>): void {
    this.currentSpace = space;
    this.contextParams = params;
    this.currentSubContext = undefined;
    this.stack.push({ space, params, timestamp: Date.now() });

    if (space === 'CORE') {
      accessFieldBus.open();
    } else {
      const surfaceId = SPACE_TO_SURFACE_MAP[space];
      if (surfaceId) {
        accessFieldBus.open(surfaceId);
      } else {
        accessFieldBus.open();
      }
    }
    this.notify();
  }

  public pushSubContext(subContext: string, params?: Record<string, any>): void {
    this.currentSubContext = subContext;
    if (params) {
      this.contextParams = { ...(this.contextParams || {}), ...params };
    }
    accessFieldBus.open(subContext);
    this.notify();
  }

  public popSubContext(): void {
    this.currentSubContext = undefined;
    this.notify();
  }

  public goBack(): boolean {
    if (this.currentSubContext !== undefined) {
      this.currentSubContext = undefined;
      this.notify();
      return true;
    }

    if (this.stack.length > 1) {
      this.stack.pop();
      const prev = this.stack[this.stack.length - 1];
      this.currentSpace = prev.space;
      this.contextParams = prev.params;
      this.currentSubContext = prev.subContext;
      if (prev.space === 'CORE') {
        accessFieldBus.close();
      } else {
        const surfaceId = SPACE_TO_SURFACE_MAP[prev.space];
        if (surfaceId) accessFieldBus.open(surfaceId);
      }
      this.notify();
      return true;
    }

    if (accessFieldBus.getIsOpen()) {
      this.currentSpace = 'CORE';
      this.contextParams = undefined;
      this.currentSubContext = undefined;
      accessFieldBus.close();
      this.notify();
      return true;
    }

    return false;
  }

  public resetToCore(): void {
    this.currentSpace = 'CORE';
    this.currentSubContext = undefined;
    this.contextParams = undefined;
    this.stack = [{ space: 'CORE', timestamp: Date.now() }];
    accessFieldBus.open();
    this.notify();
  }

  public getBackgroundSpaces(): SpatialSpace[] {
    const bg: SpatialSpace[] = [];
    const current = this.getCurrentSpace();

    const activeWfs = WorkflowRuntime.listActive ? WorkflowRuntime.listActive() : [];
    if (activeWfs.length > 0 && current !== 'WORKFLOW') {
      bg.push('WORKFLOW');
    }

    const docs = KnowledgeIngestionManager.listDocuments ? KnowledgeIngestionManager.listDocuments() : [];
    const isIndexing = docs.some((d) => d.state === 'PARSING' || d.state === 'INDEXING');
    if (isIndexing && current !== 'KNOWLEDGE') {
      bg.push('KNOWLEDGE');
    }

    return bg;
  }

  public getState(): NavigationState {
    return {
      currentSpace: this.getCurrentSpace(),
      currentSubContext: this.getCurrentSubContext(),
      contextParams: this.contextParams,
      stack: [...this.stack],
      backgroundSpaces: this.getBackgroundSpaces(),
      canGoBack: this.canGoBack(),
    };
  }

  /**
   * Resolves a natural or slash command into a spatial navigation action.
   */
  public resolveCommand(input: string): boolean {
    const raw = input.trim().toLowerCase();

    if (raw === '/core' || raw === '/home') {
      this.resetToCore();
      return true;
    }
    if (raw.startsWith('/chat') || raw.startsWith('/conversation') || raw === '/c') {
      this.navigate('CONVERSATION');
      return true;
    }
    if (raw.startsWith('/workflow') || raw.startsWith('/auto') || raw === '/w' || raw === '/a') {
      this.navigate('WORKFLOW');
      return true;
    }
    if (raw.startsWith('/automation') || raw.startsWith('/app')) {
      this.navigate('AUTOMATION');
      return true;
    }
    if (raw.startsWith('/models') || raw.startsWith('/model') || raw === '/m') {
      this.navigate('MODELS');
      return true;
    }
    if (raw.startsWith('/memory')) {
      this.navigate('MEMORY');
      return true;
    }
    if (raw.startsWith('/knowledge')) {
      this.navigate('KNOWLEDGE');
      return true;
    }
    if (raw.startsWith('/providers') || raw.startsWith('/provider') || raw === '/p') {
      this.navigate('PROVIDERS');
      return true;
    }
    if (raw.startsWith('/trust') || raw.startsWith('/permissions')) {
      this.navigate('TRUST');
      return true;
    }
    if (raw.startsWith('/audit') || raw.startsWith('/security')) {
      this.navigate('AUDIT');
      return true;
    }
    if (raw.startsWith('/system') || raw.startsWith('/telemetry') || raw === '/sys') {
      this.navigate('SYSTEM');
      return true;
    }
    if (raw === '/back' || raw === 'back' || raw === 'go back' || raw === 'close') {
      return this.goBack();
    }

    if (raw.includes('show models') || raw.includes('my models') || raw.includes('model list')) {
      this.navigate('MODELS');
      return true;
    }
    if (raw.includes('show workflow') || raw.includes('open workflow') || raw.includes('current workflow')) {
      this.navigate('WORKFLOW');
      return true;
    }
    if (raw.includes('what rezel remembers') || raw.includes('show memory') || raw.includes('open memory')) {
      this.navigate('MEMORY');
      return true;
    }
    if (raw.includes('show provider') || raw.includes('provider status')) {
      this.navigate('PROVIDERS');
      return true;
    }
    if (raw.includes('show audit') || raw.includes('security log') || raw.includes('audit trail')) {
      this.navigate('AUDIT');
      return true;
    }
    if (raw.includes('system status') || raw.includes('show telemetry') || raw.includes('how is my system')) {
      this.navigate('SYSTEM');
      return true;
    }

    return false;
  }

  public subscribe(listener: NavigationListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[SpatialNavigationEngine] Listener error:', err);
      }
    }
  }
}

export const SpatialNavigationEngine = new SpatialNavigationEngineImpl();
