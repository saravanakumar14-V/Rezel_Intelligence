import type { CheckpointRecord, CheckpointRollbackResult } from './types';
import { TransactionManager } from '../ai/transactions/TransactionManager';

export interface CreateCheckpointOptions {
  sessionId: string;
  cycleIndex: number;
  projectId: string;
  fileHashes?: Record<string, string>;
  workflowSummary?: string;
}

export class CheckpointManager {
  private static checkpoints: Map<string, CheckpointRecord> = new Map();

  /**
   * Creates a project-level checkpoint metadata record before risky reasoning cycles.
   *
   * SECURITY BOUNDARY:
   * CheckpointManager stores METADATA ONLY.
   * MUST NOT:
   * - bypass TransactionManager
   * - directly undo application mutations
   * - release locks
   * - directly alter WorkflowRuntime state
   * - silently overwrite user files
   */
  static createCheckpoint(options: CreateCheckpointOptions): CheckpointRecord {
    const record: CheckpointRecord = {
      checkpointId: `chk_${crypto.randomUUID()}`,
      sessionId: options.sessionId,
      cycleIndex: options.cycleIndex,
      projectId: options.projectId,
      fileHashes: options.fileHashes ? { ...options.fileHashes } : {},
      workflowSummary: options.workflowSummary,
      createdAt: new Date().toISOString(),
    };

    CheckpointManager.checkpoints.set(record.checkpointId, record);
    return record;
  }

  /**
   * Retrieves all checkpoints, optionally filtered by projectId.
   */
  static listCheckpoints(projectId?: string): CheckpointRecord[] {
    const all = Array.from(CheckpointManager.checkpoints.values());
    if (!projectId) return all;
    return all.filter((c) => c.projectId === projectId);
  }

  /**
   * Retrieves a single checkpoint by ID.
   */
  static getCheckpoint(checkpointId: string): CheckpointRecord | undefined {
    return CheckpointManager.checkpoints.get(checkpointId);
  }

  /**
   * Validates whether rolling back to a checkpoint is safe given active/irreversible transactions.
   */
  static validateRollbackSafety(checkpointId: string): { safe: boolean; warning?: string } {
    const checkpoint = CheckpointManager.checkpoints.get(checkpointId);
    if (!checkpoint) {
      return { safe: false, warning: 'Checkpoint record not found.' };
    }

    // Inspect TransactionManager state if available
    try {
      const activeTransactions = TransactionManager.getTransactions(checkpoint.sessionId);
      const hasIrreversible = activeTransactions.some((tx) => tx.reversibility === 'IRREVERSIBLE');

      if (hasIrreversible) {
        return {
          safe: false,
          warning:
            'Unsafe rollback: Workflow contains irreversible external application mutations (e.g., deleted scene objects or overwritten external assets). Manual reconciliation required.',
        };
      }
    } catch {
      // TransactionManager might not have records for this session
    }

    return {
      safe: true,
      warning:
        'Rollback will restore project metadata checkpoint. External application state (e.g. Blender scene) must be reconciled separately if external mutations occurred.',
    };
  }

  /**
   * Requests a rollback to a checkpoint. MUST be explicitly user-initiated.
   */
  static requestRollback(checkpointId: string, confirmedByUser: boolean): CheckpointRollbackResult {
    if (!confirmedByUser) {
      return {
        success: false,
        restoredCheckpointId: checkpointId,
        warning: 'Rollback rejected: Explicit user initiation and confirmation required.',
      };
    }

    const safety = CheckpointManager.validateRollbackSafety(checkpointId);
    if (!safety.safe) {
      return {
        success: false,
        restoredCheckpointId: checkpointId,
        warning: safety.warning || 'Rollback rejected due to safety checks.',
      };
    }

    return {
      success: true,
      restoredCheckpointId: checkpointId,
      warning: safety.warning,
    };
  }

  /**
   * Resets stored checkpoints (used in testing).
   */
  static clear(): void {
    CheckpointManager.checkpoints.clear();
  }
}
