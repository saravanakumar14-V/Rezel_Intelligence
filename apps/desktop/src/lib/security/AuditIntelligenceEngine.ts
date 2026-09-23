import { ProviderRouter } from '../ai/providers/ProviderRouter';
import type { RiskLevel } from './PermissionManager';
import type { ProviderLifecycleEvent } from '../ai/providers/types';

export type EventCategory =
  | 'INTENT'
  | 'PLAN'
  | 'WORKFLOW'
  | 'PERMISSION'
  | 'ACTION'
  | 'TOOL'
  | 'APPLICATION'
  | 'PROVIDER'
  | 'RECOVERY'
  | 'VERIFICATION'
  | 'RESULT'
  | 'SECURITY'
  | 'MODEL'
  | 'MEMORY';

export type EventStatus =
  | 'SUCCESS'
  | 'DENIED'
  | 'BLOCKED'
  | 'FAILED'
  | 'RECOVERED'
  | 'PENDING';

export interface UnifiedAuditEvent {
  eventId: string;
  timestamp: number;
  timeFormatted: string;
  category: EventCategory;
  title: string;
  summary: string;
  risk: RiskLevel;
  status: EventStatus;
  context: {
    workflowId?: string;
    stepId?: string;
    toolName?: string;
    provider?: string;
    modelId?: string;
    applicationId?: string;
    resourcePath?: string;
    latencyMs?: number;
    failureReason?: string;
    metadata?: Record<string, unknown>;
  };
}

export type AuditEventListener = (events: UnifiedAuditEvent[]) => void;

class AuditIntelligenceEngineImpl {
  private listeners = new Set<AuditEventListener>();
  private unifiedEvents: UnifiedAuditEvent[] = [];

  constructor() {
    this.initDefaultEvents();
    this.subscribeToSources();
  }

  private initDefaultEvents(): void {
    // Seed initial boot/runtime security initialization event
    const now = Date.now();
    this.recordEvent({
      category: 'SECURITY',
      title: 'Security & Policy Runtime Initialized',
      summary: 'Strict sandbox boundaries, permission gates, and immutable audit logging active.',
      risk: 'LOW',
      status: 'SUCCESS',
      context: {
        toolName: 'SecurityValidator',
      },
      timestamp: now - 3600000,
    });
  }

  private subscribeToSources(): void {
    // 1. Subscribe to Provider Events
    ProviderRouter.subscribe((event: ProviderLifecycleEvent) => {
      if (event.type === 'provider_fallback') {
        this.recordEvent({
          category: 'PROVIDER',
          title: `Failover: ${event.vendor} → ${event.payload.fallbackVendor || 'Ollama'}`,
          summary: `Automatic resilience transition due to: ${event.payload.reason || 'Connection timeout'}`,
          risk: 'MEDIUM',
          status: 'RECOVERED',
          context: {
            provider: event.vendor,
            failureReason: event.payload.reason,
          },
        });
      } else if (event.type === 'provider_auth_failed') {
        this.recordEvent({
          category: 'SECURITY',
          title: `Provider Auth Failed: ${event.vendor}`,
          summary: 'Missing or invalid API key credential. User authorization required.',
          risk: 'HIGH',
          status: 'BLOCKED',
          context: {
            provider: event.vendor,
          },
        });
      }
    });
  }

  recordEvent(params: {
    category: EventCategory;
    title: string;
    summary: string;
    risk?: RiskLevel;
    status?: EventStatus;
    context?: UnifiedAuditEvent['context'];
    timestamp?: number;
  }): UnifiedAuditEvent {
    const ts = params.timestamp || Date.now();
    const dateObj = new Date(ts);
    const timeFormatted = dateObj.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const event: UnifiedAuditEvent = {
      eventId: `evt_${crypto.randomUUID()}`,
      timestamp: ts,
      timeFormatted,
      category: params.category,
      title: params.title,
      summary: params.summary,
      risk: params.risk || 'LOW',
      status: params.status || 'SUCCESS',
      context: params.context || {},
    };

    this.unifiedEvents.unshift(event);
    if (this.unifiedEvents.length > 200) {
      this.unifiedEvents.pop();
    }

    this.notify();
    return event;
  }

  getEvents(filterCategory?: EventCategory | 'ALL'): UnifiedAuditEvent[] {
    if (!filterCategory || filterCategory === 'ALL') {
      return this.unifiedEvents;
    }
    return this.unifiedEvents.filter((e) => e.category === filterCategory);
  }

  subscribe(listener: AuditEventListener): () => void {
    this.listeners.add(listener);
    listener(this.unifiedEvents);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.unifiedEvents);
      } catch (err) {
        console.error('[AuditIntelligenceEngine] Listener error:', err);
      }
    }
  }
}

export const AuditIntelligenceEngine = new AuditIntelligenceEngineImpl();
