import type {
  RezelNotificationEvent,
  EventSeverity,
  EventVisibility,
  EventSource,
  NotificationContext,
  NotificationListener,
  SoundCue,
} from './types';
import { RezelDirector, type DirectorEvent } from '../director/RezelDirector';
import { SystemIntelligenceEngine, type SystemIntelligenceSnapshot } from '../system/SystemIntelligenceEngine';

class NotificationIntelligenceCenterImpl {
  private events: RezelNotificationEvent[] = [];
  private listeners = new Set<NotificationListener>();
  private activeTransient: RezelNotificationEvent | null = null;
  private transientTimer: ReturnType<typeof setTimeout> | null = null;
  private soundHandler?: (cue: SoundCue) => void;
  private readonly MAX_HISTORY = 50;

  constructor() {
    this.initCrossSystemSubscriptions();
  }

  public setSoundHandler(handler: (cue: SoundCue) => void): void {
    this.soundHandler = handler;
  }

  private initCrossSystemSubscriptions(): void {
    // 1. Subscribe to Director lifecycle events
    RezelDirector.subscribe((evt: DirectorEvent) => {
      this.handleDirectorEvent(evt);
    });

    // 2. Subscribe to System Intelligence transitions
    SystemIntelligenceEngine.subscribe((snapshot: SystemIntelligenceSnapshot) => {
      this.handleSystemSnapshot(snapshot);
    });
  }

  private handleDirectorEvent(evt: DirectorEvent): void {
    switch (evt.type) {
      case 'workflow_started':
        this.emit({
          title: 'Workflow Execution Started',
          summary: evt.payload?.title || 'Rezel started an orchestrated workflow.',
          severity: 'INFO',
          source: 'WORKFLOW',
          visibility: 'LEVEL_1_CONTEXTUAL',
          context: { workflowId: evt.payload?.id },
        });
        break;

      case 'turn_completed':
        if (evt.payload?.success) {
          this.emit({
            title: 'Task Completed Successfully',
            summary: evt.payload?.summary || 'Execution completed and verified.',
            severity: 'SUCCESS',
            source: 'AGENT',
            visibility: 'LEVEL_2_TRANSIENT',
            soundCue: 'SUCCESS',
          });
        }
        break;

      case 'reasoning_provider_fallback':
        this.emit({
          title: 'Provider Failover Engaged',
          summary: `Shifted from ${evt.payload?.from || 'Cloud'} to ${evt.payload?.to || 'Fallback'} to maintain uninterrupted execution.`,
          severity: 'RECOVERY',
          source: 'PROVIDER',
          visibility: 'LEVEL_2_TRANSIENT',
          soundCue: 'WARNING',
        });
        break;

      case 'error':
      case 'reasoning_error':
        this.emit({
          title: 'Execution Error Encountered',
          summary: evt.payload?.message || 'A task step encountered an unhandled exception.',
          severity: 'ERROR',
          source: 'AGENT',
          visibility: 'LEVEL_3_PERSISTENT',
          soundCue: 'CRITICAL',
        });
        break;
    }
  }

  private lastSystemState = 'NORMAL';
  private handleSystemSnapshot(snapshot: SystemIntelligenceSnapshot): void {
    if (snapshot.state !== this.lastSystemState) {
      this.lastSystemState = snapshot.state;

      if (snapshot.state === 'GPU_PRESSURE') {
        this.emit({
          title: 'GPU Capacity Constrained',
          summary: snapshot.insight,
          severity: 'WARNING',
          source: 'SYSTEM',
          visibility: 'LEVEL_2_TRANSIENT',
          soundCue: 'WARNING',
        });
      } else if (snapshot.state === 'MEMORY_PRESSURE') {
        this.emit({
          title: 'High Memory Pressure',
          summary: snapshot.insight,
          severity: 'WARNING',
          source: 'SYSTEM',
          visibility: 'LEVEL_3_PERSISTENT',
          soundCue: 'WARNING',
        });
      }
    }
  }

  /**
   * Primary entry point to emit a normalized notification event.
   */
  public emit(params: {
    title: string;
    summary: string;
    severity: EventSeverity;
    source: EventSource;
    visibility?: EventVisibility;
    durationMs?: number;
    dismissible?: boolean;
    persistent?: boolean;
    requiresInteraction?: boolean;
    context?: NotificationContext;
    groupId?: string;
    soundCue?: SoundCue;
  }): RezelNotificationEvent {
    const timestamp = Date.now();
    const id = `evt_${timestamp}_${Math.random().toString(36).substring(2, 7)}`;
    const timeFormatted = new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    // Determine default visibility based on severity
    let visibility = params.visibility;
    if (!visibility) {
      switch (params.severity) {
        case 'CRITICAL':
          visibility = 'LEVEL_4_INTERVENTION';
          break;
        case 'ERROR':
          visibility = 'LEVEL_3_PERSISTENT';
          break;
        case 'WARNING':
        case 'RECOVERY':
        case 'SUCCESS':
        case 'ATTENTION':
          visibility = 'LEVEL_2_TRANSIENT';
          break;
        case 'PROGRESS':
        case 'INFO':
          visibility = 'LEVEL_1_CONTEXTUAL';
          break;
        case 'BACKGROUND':
        default:
          visibility = 'LEVEL_0_AMBIENT';
          break;
      }
    }

    const isPersistent = params.persistent ?? (visibility === 'LEVEL_3_PERSISTENT' || visibility === 'LEVEL_4_INTERVENTION');
    const isDismissible = params.dismissible ?? true;
    const requiresInteraction = params.requiresInteraction ?? (visibility === 'LEVEL_4_INTERVENTION');

    // Check for repetitive event grouping
    if (params.groupId) {
      const existingGroupItem = this.events.find((e) => e.groupId === params.groupId && !e.resolved);
      if (existingGroupItem) {
        existingGroupItem.groupCount = (existingGroupItem.groupCount || 1) + 1;
        existingGroupItem.summary = `${params.summary} (${existingGroupItem.groupCount} updates)`;
        existingGroupItem.timestamp = timestamp;
        existingGroupItem.timeFormatted = timeFormatted;
        this.notify();
        return existingGroupItem;
      }
    }

    const event: RezelNotificationEvent = {
      id,
      title: params.title,
      summary: params.summary,
      severity: params.severity,
      visibility,
      source: params.source,
      timestamp,
      timeFormatted,
      durationMs: params.durationMs ?? (visibility === 'LEVEL_2_TRANSIENT' ? 4000 : undefined),
      dismissible: isDismissible,
      persistent: isPersistent,
      resolved: false,
      requiresInteraction,
      context: params.context,
      groupId: params.groupId,
      groupCount: params.groupId ? 1 : undefined,
      soundCue: params.soundCue,
    };

    // Prepend to event ring buffer
    this.events.unshift(event);
    if (this.events.length > this.MAX_HISTORY) {
      this.events.pop();
    }

    // Set transient notification capsule
    if (visibility === 'LEVEL_2_TRANSIENT') {
      this.setActiveTransient(event);
    }

    // Trigger semantic sound cue if specified
    if (params.soundCue && this.soundHandler) {
      try {
        this.soundHandler(params.soundCue);
      } catch {
        // Safe sound execution
      }
    }

    this.notify();
    return event;
  }

  private setActiveTransient(event: RezelNotificationEvent): void {
    if (this.transientTimer) {
      clearTimeout(this.transientTimer);
      this.transientTimer = null;
    }

    this.activeTransient = event;

    const duration = event.durationMs || 4000;
    this.transientTimer = setTimeout(() => {
      if (this.activeTransient?.id === event.id) {
        this.activeTransient = null;
        this.notify();
      }
    }, duration);
  }

  public dismiss(id: string): void {
    const item = this.events.find((e) => e.id === id);
    if (item) {
      item.resolved = true;
    }
    if (this.activeTransient?.id === id) {
      this.activeTransient = null;
      if (this.transientTimer) {
        clearTimeout(this.transientTimer);
        this.transientTimer = null;
      }
    }
    this.notify();
  }

  public dismissAll(): void {
    for (const e of this.events) {
      e.resolved = true;
    }
    this.activeTransient = null;
    if (this.transientTimer) {
      clearTimeout(this.transientTimer);
      this.transientTimer = null;
    }
    this.notify();
  }

  public getActiveTransient(): RezelNotificationEvent | null {
    return this.activeTransient;
  }

  public getPersistentAttention(): RezelNotificationEvent[] {
    return this.events.filter((e) => (e.visibility === 'LEVEL_3_PERSISTENT' || e.visibility === 'LEVEL_4_INTERVENTION') && !e.resolved);
  }

  public getEvents(filter?: {
    severity?: EventSeverity;
    source?: EventSource;
    unresolvedOnly?: boolean;
  }): RezelNotificationEvent[] {
    return this.events.filter((e) => {
      if (filter?.severity && e.severity !== filter.severity) return false;
      if (filter?.source && e.source !== filter.source) return false;
      if (filter?.unresolvedOnly && e.resolved) return false;
      return true;
    });
  }

  public subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    listener([...this.events]);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = [...this.events];
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[NotificationIntelligenceCenter] Listener error:', err);
      }
    }
  }
}

export const NotificationIntelligenceCenter = new NotificationIntelligenceCenterImpl();
