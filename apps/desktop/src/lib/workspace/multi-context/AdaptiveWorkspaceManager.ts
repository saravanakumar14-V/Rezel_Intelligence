import type {
  RezelActiveContext,
  ContextType,
  ContextStatus,
  ContextPriority,
  MultiContextListener,
} from './types';
import { SpatialNavigationEngine } from '../../navigation/SpatialNavigationEngine';
import { NotificationIntelligenceCenter } from '../../notifications/NotificationIntelligenceCenter';

class AdaptiveWorkspaceManagerImpl {
  private contexts = new Map<string, RezelActiveContext>();
  private activeContextId: string | null = null;
  private listeners = new Set<MultiContextListener>();

  constructor() {
    this.initRuntimeSync();
  }

  private initRuntimeSync(): void {
    // Initial sync / heartbeat if needed
  }

  public registerContext(params: {
    id?: string;
    type: ContextType;
    title: string;
    summary: string;
    priority?: ContextPriority;
    progress?: number;
    stepDescription?: string;
    relatedId?: string;
    targetSpace?: import('../../navigation/types').SpatialSpace;
    canCancel?: boolean;
    canResume?: boolean;
  }): RezelActiveContext {
    const id = params.id || `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const targetSpace = params.targetSpace || this.getDefaultTargetSpace(params.type);
    const existing = this.contexts.get(id);

    const context: RezelActiveContext = {
      id,
      type: params.type,
      title: params.title,
      summary: params.summary,
      status: existing?.status || (this.activeContextId === id ? 'ACTIVE' : 'BACKGROUND'),
      priority: params.priority || 'RELEVANT',
      progress: params.progress ?? existing?.progress,
      stepDescription: params.stepDescription ?? existing?.stepDescription,
      relatedId: params.relatedId ?? existing?.relatedId,
      targetSpace,
      createdAt: existing?.createdAt || Date.now(),
      lastFocusedTime: existing?.lastFocusedTime || Date.now(),
      canCancel: params.canCancel ?? true,
      canResume: params.canResume ?? true,
    };

    this.contexts.set(id, context);
    this.notify();
    return context;
  }

  private getDefaultTargetSpace(type: ContextType): import('../../navigation/types').SpatialSpace {
    switch (type) {
      case 'WORKFLOW': return 'WORKFLOW';
      case 'AUTOMATION': return 'AUTOMATION';
      case 'MODEL_DOWNLOAD': return 'MODELS';
      case 'KNOWLEDGE_INDEX': return 'MEMORY';
      case 'CONVERSATION': return 'CONVERSATION';
      case 'SYSTEM_TASK': default: return 'SYSTEM';
    }
  }

  public updateProgress(id: string, progress: number, stepDescription?: string): void {
    const ctx = this.contexts.get(id);
    if (!ctx) return;
    ctx.progress = Math.min(100, Math.max(0, progress));
    if (stepDescription) {
      ctx.stepDescription = stepDescription;
    }
    this.notify();
  }

  public updateStatus(id: string, status: ContextStatus, blockedReason?: string): void {
    const ctx = this.contexts.get(id);
    if (!ctx) return;
    ctx.status = status;
    ctx.blockedReason = blockedReason;
    if (status === 'ATTENTION' || status === 'BLOCKED') {
      ctx.priority = 'ATTENTION';
    }
    this.notify();
  }

  public focusContext(id: string): boolean {
    const ctx = this.contexts.get(id);
    if (!ctx) return false;

    // Demote current active context to background
    if (this.activeContextId && this.activeContextId !== id) {
      const prev = this.contexts.get(this.activeContextId);
      if (prev && prev.status === 'ACTIVE') {
        prev.status = 'BACKGROUND';
      }
    }

    this.activeContextId = id;
    ctx.status = 'ACTIVE';
    ctx.lastFocusedTime = Date.now();

    // Seamlessly navigate SpatialNavigationEngine to the target space
    SpatialNavigationEngine.navigate(ctx.targetSpace, {
      contextId: ctx.id,
      relatedId: ctx.relatedId,
    });

    this.notify();
    return true;
  }

  public backgroundContext(id: string): void {
    const ctx = this.contexts.get(id);
    if (!ctx) return;
    ctx.status = 'BACKGROUND';
    if (this.activeContextId === id) {
      this.activeContextId = null;
    }
    this.notify();
  }

  public completeContext(id: string, summary?: string): void {
    const ctx = this.contexts.get(id);
    if (!ctx) return;
    ctx.status = 'COMPLETED';
    ctx.progress = 100;
    if (summary) ctx.summary = summary;

    NotificationIntelligenceCenter.emit({
      title: `${ctx.title} Complete`,
      summary: summary || ctx.summary,
      severity: 'SUCCESS',
      source: 'WORKFLOW',
      soundCue: 'SUCCESS',
    });

    this.notify();
  }

  public cancelContext(id: string): boolean {
    const ctx = this.contexts.get(id);
    if (!ctx) return false;
    this.contexts.delete(id);
    if (this.activeContextId === id) {
      this.activeContextId = null;
    }
    this.notify();
    return true;
  }

  public getContext(id: string): RezelActiveContext | undefined {
    return this.contexts.get(id);
  }

  public getActiveContext(): RezelActiveContext | null {
    if (!this.activeContextId) return null;
    return this.contexts.get(this.activeContextId) || null;
  }

  public getBackgroundContexts(): RezelActiveContext[] {
    return Array.from(this.contexts.values()).filter(
      (c) => c.status === 'BACKGROUND' || c.status === 'ATTENTION' || c.status === 'BLOCKED'
    );
  }

  public getAttentionContexts(): RezelActiveContext[] {
    return Array.from(this.contexts.values()).filter(
      (c) => c.status === 'ATTENTION' || c.status === 'BLOCKED'
    );
  }

  public listContexts(): RezelActiveContext[] {
    return Array.from(this.contexts.values()).sort(
      (a, b) => b.lastFocusedTime - a.lastFocusedTime
    );
  }

  public subscribe(listener: MultiContextListener): () => void {
    this.listeners.add(listener);
    listener(this.listContexts());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const list = this.listContexts();
    for (const listener of this.listeners) {
      try {
        listener(list);
      } catch (err) {
        console.error('[AdaptiveWorkspaceManager] Listener error:', err);
      }
    }
  }
}

export const AdaptiveWorkspaceManager = new AdaptiveWorkspaceManagerImpl();
