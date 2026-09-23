import type { CompensationIntent } from '../capabilities/types';
import { AIToolExecutor } from '../ToolExecutor';
import { CapabilityRegistry } from '../capabilities/CapabilityRegistry';
import type { ResourceScope } from '../capabilities/types';
import { WorkflowStore } from '../persistence/WorkflowStore';

export type TransactionStatus =
  | 'COMMITTED'
  | 'COMPENSATING'
  | 'COMPENSATED'
  | 'COMPENSATION_FAILED';

export interface TransactionRecord {
  readonly workflowId: string;
  readonly stepId: string;
  readonly capabilityId: string;
  readonly executionId: string;
  readonly resourceInfo: unknown;
  readonly compensationInfo: CompensationIntent | null;
  readonly reversibility: 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE';
  status: TransactionStatus;
}

export class TransactionManagerImpl {
  private records: Map<string, TransactionRecord[]> = new Map();

  /**
   * Initializes the TransactionManager by loading existing transaction records from the WorkflowStore.
   */
  async initialize(): Promise<void> {
    await WorkflowStore.load();
    const workflows = WorkflowStore.listWorkflows();
    for (const w of workflows) {
      const txs = WorkflowStore.getTransactions(w.id);
      if (txs && txs.length > 0) {
        this.records.set(w.id, txs);
      }
    }
  }

  /**
   * Registers a completed mutation that may be rolled back later.
   */
  registerTransaction(record: TransactionRecord): void {
    if (record.status !== 'COMMITTED') {
      throw new Error(`Cannot register transaction in status: ${record.status}`);
    }
    const workflowRecords = this.records.get(record.workflowId) ?? [];
    
    // Concurrency safety: Isolate by stepId/executionId
    if (workflowRecords.some(r => r.stepId === record.stepId || r.executionId === record.executionId)) {
      throw new Error(`Transaction already registered for stepId ${record.stepId} or executionId ${record.executionId}`);
    }

    workflowRecords.push(record);
    this.records.set(record.workflowId, workflowRecords);
    WorkflowStore.saveTransaction(record);
  }

  /**
   * Initiates rollback for all eligible transactions in a workflow.
   * Executes compensations in reverse order.
   * @returns true if fully rolled back, false if partial failure.
   */
  async rollbackWorkflow(workflowId: string, scopes: ResourceScope[]): Promise<boolean> {
    const workflowRecords = this.records.get(workflowId) ?? [];
    if (workflowRecords.length === 0) return true; // Nothing to rollback

    let fullyCompensated = true;

    // Reverse order for safe rollback
    for (let i = workflowRecords.length - 1; i >= 0; i--) {
      const record = workflowRecords[i];

      if (record.status !== 'COMMITTED') continue; // Prevent duplicate compensation
      if (record.reversibility === 'IRREVERSIBLE') {
        // Can't roll back irreversible actions, but keep trying others
        fullyCompensated = false;
        continue;
      }
      if (!record.compensationInfo) {
        // Missing compensation data
        fullyCompensated = false;
        continue;
      }

      record.status = 'COMPENSATING';

      try {
        const capability = CapabilityRegistry.get(record.compensationInfo.capabilityId);
        if (!capability) {
          throw new Error(`Compensation capability not found: ${record.compensationInfo.capabilityId}`);
        }

        // We route through AIToolExecutor which routes through SecurityToolExecutor
        const context = {
          workflowId: record.workflowId,
          executionId: crypto.randomUUID(), // New execution ID for the compensation
          scopes,
          metadata: { isCompensation: true, originalExecutionId: record.executionId, mode: 'COMPENSATE' }
        };

        const result = await AIToolExecutor.executeCapability(
          capability,
          record.compensationInfo.args,
          context
        );

        if (result.success) {
          record.status = 'COMPENSATED';
        } else {
          record.status = 'COMPENSATION_FAILED';
          fullyCompensated = false;
        }
        WorkflowStore.saveTransaction(record);
      } catch (err) {
        console.error(`Compensation failed for step ${record.stepId}`, err);
        record.status = 'COMPENSATION_FAILED';
        fullyCompensated = false;
        WorkflowStore.saveTransaction(record);
      }
    }

    return fullyCompensated;
  }

  /**
   * Retrieves transaction records for a given workflow ID.
   */
  getTransactions(workflowId: string): TransactionRecord[] {
    return this.records.get(workflowId) ?? [];
  }

  /**
   * Removes all transaction records for a workflow (e.g. upon successful completion or cancellation).
   */
  clearWorkflow(workflowId: string): void {
    this.records.delete(workflowId);
  }
}

export const TransactionManager = new TransactionManagerImpl();
