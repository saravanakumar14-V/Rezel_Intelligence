import { invoke } from '@tauri-apps/api/core';
import type { Workflow } from '../types';
import type { PlanEvent } from '../PlanStateMachine';
import type { TransactionRecord } from '../transactions/TransactionManager';

import type { WorkflowCheckpoint } from '../checkpoints/types';
import type { ApprovalRequest, ApprovalAuditRecord } from '../approval/types';

const STORE_FILE = 'rezel_workflows.json';
const STORE_VERSION = 1;

export interface WorkflowStoreState {
  version: number;
  workflows: Record<string, Workflow>;
  events: Record<string, PlanEvent[]>;
  transactions: Record<string, TransactionRecord[]>;
  checkpoints: Record<string, WorkflowCheckpoint[]>;
  approvals: Record<string, ApprovalRequest[]>;
  approvalAudits: Record<string, ApprovalAuditRecord[]>;
}

function emptyStore(): WorkflowStoreState {
  return {
    version: STORE_VERSION,
    workflows: {},
    events: {},
    transactions: {},
    checkpoints: {},
    approvals: {},
    approvalAudits: {},
  };
}

class WorkflowStoreImpl {
  private store: WorkflowStoreState = emptyStore();
  private loaded = false;
  private pendingSave: Promise<void> | null = null;
  private dirty = false;

  async load(forceReload = false): Promise<void> {
    if (this.loaded && !forceReload) return;

    try {
      const raw = await invoke<string>('read_app_file', { path: STORE_FILE });
      const parsed = JSON.parse(raw) as WorkflowStoreState;

      if (parsed.version === STORE_VERSION) {
        this.store = {
          version: parsed.version,
          workflows: parsed.workflows ?? {},
          events: parsed.events ?? {},
          transactions: parsed.transactions ?? {},
          checkpoints: parsed.checkpoints ?? {},
          approvals: parsed.approvals ?? {},
          approvalAudits: parsed.approvalAudits ?? {},
        };
      } else {
        console.warn('[WorkflowStore] Unknown store version, failing closed / starting fresh');
        this.store = emptyStore();
      }
    } catch (err) {
      const msg = String(err).toLowerCase();
      if (msg.includes('not found') || msg.includes('no such file') || msg.includes('cannot find the file')) {
        this.store = emptyStore();
      } else {
        console.error('[WorkflowStore] Failed to load workflows file:', err);
        // Fail closed on corruption
        this.store = emptyStore();
      }
    }

    this.loaded = true;
    this.dirty = false;
  }

  /**
   * Debounced/serialized save to ensure JSON writes are sufficiently atomic
   * and do not conflict.
   */
  async save(): Promise<void> {
    if (!this.dirty) return;
    
    if (this.pendingSave) {
      await this.pendingSave;
      if (!this.dirty) return;
    }

    this.dirty = false;
    const executeSave = async () => {
      try {
        const json = JSON.stringify(this.store, null, 2);
        await invoke('write_app_file', { path: STORE_FILE, content: json });
      } catch (err) {
        this.dirty = true;
        console.error('[WorkflowStore] Save failed:', err);
      }
    };

    this.pendingSave = executeSave();
    await this.pendingSave;
    this.pendingSave = null;
  }

  // --- Workflows ---

  saveWorkflow(workflow: Workflow): void {
    this.store.workflows[workflow.id] = JSON.parse(JSON.stringify(workflow));
    this.dirty = true;
    this.save().catch(console.error);
  }

  getWorkflow(workflowId: string): Workflow | undefined {
    return this.store.workflows[workflowId];
  }

  listWorkflows(): Workflow[] {
    return Object.values(this.store.workflows);
  }

  deleteWorkflow(workflowId: string): void {
    delete this.store.workflows[workflowId];
    delete this.store.events[workflowId];
    delete this.store.transactions[workflowId];
    delete this.store.checkpoints[workflowId];
    delete this.store.approvals[workflowId];
    delete this.store.approvalAudits[workflowId];
    this.dirty = true;
    this.save().catch(console.error);
  }

  // --- Events ---

  appendEvent(event: PlanEvent): void {
    if (!event.workflowId) return;
    const events = this.store.events[event.workflowId] ?? [];
    events.push(JSON.parse(JSON.stringify(event)));
    this.store.events[event.workflowId] = events;
    this.dirty = true;
    this.save().catch(console.error);
  }

  getEvents(workflowId: string): PlanEvent[] {
    return this.store.events[workflowId] ?? [];
  }

  // --- Transactions ---

  saveTransaction(record: TransactionRecord): void {
    const records = this.store.transactions[record.workflowId] ?? [];
    
    const existingIndex = records.findIndex(r => r.executionId === record.executionId);
    if (existingIndex >= 0) {
      records[existingIndex] = JSON.parse(JSON.stringify(record));
    } else {
      records.push(JSON.parse(JSON.stringify(record)));
    }
    
    this.store.transactions[record.workflowId] = records;
    this.dirty = true;
    this.save().catch(console.error);
  }

  getTransactions(workflowId: string): TransactionRecord[] {
    return this.store.transactions[workflowId] ?? [];
  }

  // --- Checkpoints (Milestone 11.4C) ---

  saveCheckpoint(checkpoint: WorkflowCheckpoint): void {
    const checkpoints = this.store.checkpoints[checkpoint.workflowId] ?? [];
    const existingIndex = checkpoints.findIndex(c => c.checkpointId === checkpoint.checkpointId);

    if (existingIndex >= 0) {
      checkpoints[existingIndex] = JSON.parse(JSON.stringify(checkpoint));
    } else {
      checkpoints.push(JSON.parse(JSON.stringify(checkpoint)));
    }

    this.store.checkpoints[checkpoint.workflowId] = checkpoints;
    this.dirty = true;
    this.save().catch(console.error);
  }

  getCheckpoints(workflowId: string): WorkflowCheckpoint[] {
    return this.store.checkpoints[workflowId] ?? [];
  }

  getCheckpoint(checkpointId: string): WorkflowCheckpoint | undefined {
    for (const list of Object.values(this.store.checkpoints)) {
      const match = list.find(c => c.checkpointId === checkpointId);
      if (match) return JSON.parse(JSON.stringify(match));
    }
    return undefined;
  }

  // --- Approvals (Milestone 11.4D) ---

  saveApproval(approval: ApprovalRequest): void {
    const list = this.store.approvals[approval.workflowId] ?? [];
    const idx = list.findIndex(a => a.approvalId === approval.approvalId);
    if (idx >= 0) {
      list[idx] = JSON.parse(JSON.stringify(approval));
    } else {
      list.push(JSON.parse(JSON.stringify(approval)));
    }
    this.store.approvals[approval.workflowId] = list;
    this.dirty = true;
    this.save().catch(console.error);
  }

  getApprovals(workflowId?: string): ApprovalRequest[] {
    if (workflowId) {
      return (this.store.approvals[workflowId] ?? []).map(a => JSON.parse(JSON.stringify(a)));
    }
    const all: ApprovalRequest[] = [];
    for (const list of Object.values(this.store.approvals)) {
      all.push(...list.map(a => JSON.parse(JSON.stringify(a))));
    }
    return all;
  }

  getApproval(approvalId: string): ApprovalRequest | undefined {
    for (const list of Object.values(this.store.approvals)) {
      const match = list.find(a => a.approvalId === approvalId);
      if (match) return JSON.parse(JSON.stringify(match));
    }
    return undefined;
  }

  saveApprovalAudit(audit: ApprovalAuditRecord): void {
    const list = this.store.approvalAudits[audit.workflowId] ?? [];
    list.push(JSON.parse(JSON.stringify(audit)));
    this.store.approvalAudits[audit.workflowId] = list;
    this.dirty = true;
    this.save().catch(console.error);
  }

  getApprovalAudits(workflowId?: string): ApprovalAuditRecord[] {
    if (workflowId) {
      return (this.store.approvalAudits[workflowId] ?? []).map(a => JSON.parse(JSON.stringify(a)));
    }
    const all: ApprovalAuditRecord[] = [];
    for (const list of Object.values(this.store.approvalAudits)) {
      all.push(...list.map(a => JSON.parse(JSON.stringify(a))));
    }
    return all;
  }
}

export const WorkflowStore = new WorkflowStoreImpl();
