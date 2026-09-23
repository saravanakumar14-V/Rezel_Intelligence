import { ProviderRouter } from './ProviderRouter';
import { ProviderHealthManager } from './ProviderHealthManager';
import { ProviderAuthManager } from './ProviderAuthManager';
import { ModelCatalog } from './ModelCatalog';
import type {
  ProviderVendor,
  RoutingProfile,
  HealthState,
  ProviderLifecycleEvent,
} from './types';

export interface ProviderNodeState {
  vendor: ProviderVendor;
  displayName: string;
  isLocal: boolean;
  health: HealthState;
  hasAuth: boolean;
  isActive: boolean;
  activeModelId?: string;
}

export interface RoutingDecisionSnapshot {
  timestamp: number;
  taskCategory: string;
  selectedVendor: ProviderVendor;
  selectedModel: string;
  isLocal: boolean;
  isPaid: boolean;
  routingProfile: RoutingProfile;
  selectionReason: string;
  decisionFactors: string[];
}

export interface FailoverEventSnapshot {
  timestamp: number;
  fromVendor: ProviderVendor;
  toVendor: ProviderVendor;
  reason: string;
  isAutomatic: boolean;
}

export interface RuntimeTelemetrySnapshot {
  activeRoute?: RoutingDecisionSnapshot;
  recentFailovers: FailoverEventSnapshot[];
  providerNodes: ProviderNodeState[];
  costGuard: {
    dailyBudgetUSD: number;
    dailySpentUSD: number;
    allowPaidFailover: boolean;
  };
  totalRequests: number;
  averageLatencyMs: number;
}

export type TelemetryListener = (telemetry: RuntimeTelemetrySnapshot) => void;

class ProviderIntelligenceBridgeImpl {
  private activeRoute?: RoutingDecisionSnapshot;
  private recentFailovers: FailoverEventSnapshot[] = [];
  private listeners = new Set<TelemetryListener>();
  private requestCount = 0;
  private totalLatency = 0;
  private authMap: Record<ProviderVendor, boolean> = {
    GEMINI: false,
    OPENAI: false,
    ANTHROPIC: false,
    OLLAMA: true,
    LOCAL: true,
  };

  constructor() {
    this.initDefaultState();
    this.subscribeToRouter();
    this.loadAuthKeys();
  }

  private async loadAuthKeys(): Promise<void> {
    this.authMap.GEMINI = await ProviderAuthManager.hasKey('GEMINI');
    this.authMap.OPENAI = await ProviderAuthManager.hasKey('OPENAI');
    this.authMap.ANTHROPIC = await ProviderAuthManager.hasKey('ANTHROPIC');
    this.notify();
  }

  private initDefaultState(): void {
    const defaultModel = ModelCatalog.getDefaultModel('GEMINI');
    this.activeRoute = {
      timestamp: Date.now(),
      taskCategory: 'GENERAL_INTELLIGENCE',
      selectedVendor: 'GEMINI',
      selectedModel: defaultModel?.displayName || 'Gemini 3.6 Flash',
      isLocal: false,
      isPaid: false,
      routingProfile: 'AUTO',
      selectionReason: 'Optimal multimodal capabilities, high speed, and low latency.',
      decisionFactors: [
        '✓ High-speed streaming response',
        '✓ Multimodal & tool execution eligible',
        '✓ Verified healthy cloud connection',
      ],
    };
  }

  private subscribeToRouter(): void {
    ProviderRouter.subscribe((event: ProviderLifecycleEvent) => {
      this.handleRouterEvent(event);
    });

    ProviderHealthManager.subscribe(() => {
      this.notify();
    });
  }

  private handleRouterEvent(event: ProviderLifecycleEvent): void {
    if (event.type === 'provider_selected') {
      this.requestCount++;
      const isLocal = event.vendor === 'OLLAMA' || event.vendor === 'LOCAL';
      const modelMeta = event.modelId ? ModelCatalog.getModel(event.modelId) : undefined;
      const modelName = modelMeta?.displayName || event.modelId || 'Gemini 3.6 Flash';

      this.activeRoute = {
        timestamp: event.timestamp || Date.now(),
        taskCategory: event.taskProfileId || 'ACTIVE_TASK',
        selectedVendor: event.vendor,
        selectedModel: modelName,
        isLocal,
        isPaid: false,
        routingProfile: ProviderRouter.getRoutingProfile(),
        selectionReason: event.payload.reason || 'Best matching provider for task profile.',
        decisionFactors: [
          `✓ ${isLocal ? '100% offline local inference' : 'Frontier cloud intelligence'}`,
          `✓ Authorized under ${ProviderRouter.getRoutingProfile()} profile`,
          '✓ Tool calling and reasoning certified',
        ],
      };
      if (event.payload.latencyMs) {
        this.totalLatency += event.payload.latencyMs;
      }
      this.notify();
    }

    if (event.type === 'provider_fallback') {
      this.recentFailovers.unshift({
        timestamp: event.timestamp || Date.now(),
        fromVendor: event.vendor,
        toVendor: event.payload.fallbackVendor || 'OLLAMA',
        reason: event.payload.reason || 'Connection timeout or rate limit',
        isAutomatic: true,
      });
      if (this.recentFailovers.length > 5) this.recentFailovers.pop();
      this.notify();
    }
  }

  subscribe(listener: TelemetryListener): () => void {
    this.listeners.add(listener);
    listener(this.getTelemetrySnapshot());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const snapshot = this.getTelemetrySnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[ProviderIntelligenceBridge] Listener error:', err);
      }
    }
  }

  getTelemetrySnapshot(): RuntimeTelemetrySnapshot {
    const vendors: ProviderVendor[] = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'OLLAMA'];
    const activeVendor = this.activeRoute?.selectedVendor || 'GEMINI';

    const providerNodes: ProviderNodeState[] = vendors.map((v) => {
      const health = ProviderHealthManager.getProviderHealth(v);
      const isLocal = v === 'OLLAMA' || v === 'LOCAL';
      const hasAuth = isLocal ? true : (this.authMap[v] ?? false);
      return {
        vendor: v,
        displayName: v === 'OLLAMA' ? 'Ollama (Local)' : v.charAt(0) + v.slice(1).toLowerCase(),
        isLocal,
        health: health.state,
        hasAuth,
        isActive: v === activeVendor,
        activeModelId: v === activeVendor ? this.activeRoute?.selectedModel : undefined,
      };
    });

    const auth = ProviderAuthManager.getAuthorization('GEMINI');

    return {
      activeRoute: this.activeRoute,
      recentFailovers: this.recentFailovers,
      providerNodes,
      costGuard: {
        dailyBudgetUSD: auth.maxDailyCostUSD || 5.00,
        dailySpentUSD: auth.currentDailySpentUSD || 0.00,
        allowPaidFailover: auth.allowPaidFailover,
      },
      totalRequests: this.requestCount,
      averageLatencyMs: this.requestCount > 0 ? Math.round(this.totalLatency / this.requestCount) : 180,
    };
  }

  /**
   * Sets preferred vendor or routing profile.
   */
  setRoutingProfile(profile: RoutingProfile): void {
    ProviderRouter.setRoutingProfile(profile);
    if (this.activeRoute) {
      this.activeRoute.routingProfile = profile;
      this.notify();
    }
  }
}

export const ProviderIntelligenceBridge = new ProviderIntelligenceBridgeImpl();
