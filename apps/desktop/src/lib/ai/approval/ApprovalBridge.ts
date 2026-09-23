import { ApprovalManager } from './ApprovalManager';
import { WorkflowStore } from '../persistence/WorkflowStore';
import { PermissionManager } from '../../security/PermissionManager';
import type { ApprovalRequest } from './types';

export type ApprovalEventListener = (pending: ApprovalRequest[]) => void;

class ApprovalBridgeImpl {
  private listeners = new Set<ApprovalEventListener>();
  private pendingRequests: ApprovalRequest[] = [];

  constructor() {
    this.refreshPending();
  }

  subscribe(listener: ApprovalEventListener): () => void {
    this.listeners.add(listener);
    listener(this.pendingRequests);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.pendingRequests);
      } catch (err) {
        console.error('[ApprovalBridge] Listener error:', err);
      }
    }
  }

  refreshPending(): void {
    const list = WorkflowStore.getApprovals();
    this.pendingRequests = list.filter((r: ApprovalRequest) => r.state === 'PENDING');
    this.notify();
  }

  getPending(): ApprovalRequest[] {
    return this.pendingRequests;
  }

  getLatestPending(): ApprovalRequest | undefined {
    return this.pendingRequests[0];
  }

  /**
   * Approves a pending request with specified persistence scope.
   */
  async approve(
    approvalId: string,
    options: {
      scope?: 'ONE_TIME' | 'SESSION' | 'PERSISTENT';
      reason?: string;
    } = {}
  ): Promise<boolean> {
    try {
      const res = await ApprovalManager.approveRequest(approvalId, 'user', options.reason || 'User confirmed action');

      // If persistent or session scope granted, register with PermissionManager
      const request = this.pendingRequests.find((r) => r.approvalId === approvalId);
      if (request && options.scope && options.scope !== 'ONE_TIME') {
        for (const cap of request.requestedCapabilities) {
          PermissionManager.grant(cap, 'execute');
        }
      }

      this.refreshPending();
      return Boolean(res.success);
    } catch (err) {
      console.error('[ApprovalBridge] Approve failed:', err);
      this.refreshPending();
      throw err;
    }
  }

  /**
   * Rejects / Denies a pending request.
   */
  async deny(approvalId: string, reason: string = 'User denied action'): Promise<boolean> {
    try {
      const res = await ApprovalManager.rejectRequest(approvalId, 'user', reason);
      this.refreshPending();
      return Boolean(res.state === 'REJECTED');
    } catch (err) {
      console.error('[ApprovalBridge] Deny failed:', err);
      this.refreshPending();
      throw err;
    }
  }

  /**
   * Voice/Command shortcuts.
   */
  async approveLatest(scope: 'ONE_TIME' | 'SESSION' | 'PERSISTENT' = 'ONE_TIME'): Promise<boolean> {
    const latest = this.getLatestPending();
    if (!latest) return false;
    return this.approve(latest.approvalId, { scope });
  }

  async denyLatest(): Promise<boolean> {
    const latest = this.getLatestPending();
    if (!latest) return false;
    return this.deny(latest.approvalId);
  }

  getGrantedKeys(): readonly string[] {
    return PermissionManager.getGrantedKeys();
  }

  revokeGrant(tool: string, action: string = 'execute'): void {
    PermissionManager.revoke(tool, action);
    this.notify();
  }
}

export const ApprovalBridge = new ApprovalBridgeImpl();
