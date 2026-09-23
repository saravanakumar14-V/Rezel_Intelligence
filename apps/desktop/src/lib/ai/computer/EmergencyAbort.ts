/**
 * Rezel 13.1 — Computer Control Emergency Abort System
 *
 * Provides immediate low-level interruption for active computer control sequences:
 * - Halts pending input dispatch and action pipelines
 * - Releases acquired resource locks
 * - Returns deterministic EMERGENCY_ABORTED cancellation results
 */

export type AbortListener = (reason: string) => void;

class EmergencyAbortControllerImpl {
  private aborted = false;
  private abortReason: string | null = null;
  private listeners = new Set<AbortListener>();

  /**
   * Checks if emergency abort has been triggered.
   */
  isAborted(): boolean {
    return this.aborted;
  }

  /**
   * Returns the reason for the abort if triggered.
   */
  getReason(): string | null {
    return this.abortReason;
  }

  /**
   * Triggers immediate emergency abort of all computer control activities.
   */
  trigger(reason = 'Emergency stop triggered by user or safety interlock'): void {
    this.aborted = true;
    this.abortReason = reason;
    console.warn(`🚨 [EmergencyAbort] ACTIVE: ${reason}`);

    for (const listener of this.listeners) {
      try {
        listener(reason);
      } catch (err) {
        console.error('[EmergencyAbort] Listener failed:', err);
      }
    }
  }

  /**
   * Resets the emergency abort state for a new authorized session.
   */
  reset(): void {
    this.aborted = false;
    this.abortReason = null;
  }

  /**
   * Subscribes to emergency abort events.
   */
  onAbort(listener: AbortListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const EmergencyAbort = new EmergencyAbortControllerImpl();
