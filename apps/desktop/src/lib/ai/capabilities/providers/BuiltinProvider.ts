import type { CapabilityProvider, Capability, ExecutionContext, ScopeResult } from '../types';

class PingCapability implements Capability<Record<string, unknown>, string> {
  readonly id = 'builtin.ping';
  readonly description = 'A native testing capability that returns "pong". Does not access Tauri or external systems.';
  readonly category = 'system';
  readonly parameters = {};
  
  readonly riskLevel = 'LOW';
  readonly mutatesExternalState = false;
  readonly isReversible = true;
  readonly retryPolicy = 'AUTO';
  readonly toolGroup = 'system';

  validateScope(): ScopeResult {
    return { allowed: true };
  }

  async execute(_args: Record<string, unknown>, _context: ExecutionContext): Promise<string> {
    return 'pong';
  }
}

export class BuiltinProvider implements CapabilityProvider {
  readonly id = 'provider.builtin';
  readonly type = 'builtin';

  capabilities(): Capability<any, any>[] {
    return [new PingCapability()];
  }

  health() {
    return { status: 'CONNECTED' as const };
  }
}
