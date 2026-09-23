import { invoke } from '@tauri-apps/api/core';
import type {
  ApprovalPolicyLevel,
  ReasoningSessionStatus,
  ReasoningWorkflowAssociationStatus,
  UnknownMutationRecord,
} from './types';
import { ReasoningSession } from './ReasoningSession';

const STORE_FILE = 'rezel_reasoning_sessions.json';
const REASONING_STORE_VERSION = 1;
const MAX_STORED_SESSIONS = 50;
const MAX_STORED_CYCLES = 20;
const MAX_ERROR_LENGTH = 500;

export interface PersistedCycleSummary {
  cycleIndex: number;
  startedAt: string;
  completedAt?: string;
  providerId: string;
  tokenUsage: { input: number; output: number };
  proposedActionCount: number;
  acceptedActionCount: number;
  rejectedActionCount: number;
  workflowId?: string;
  workflowOutcome?: 'SUCCEEDED' | 'FAILED' | 'PARTIALLY_SUCCEEDED' | 'CANCELLED';
  verificationSummary?: string;
  errors?: string[];
}

export interface PersistedReasoningSessionRecord {
  sessionId: string;
  goal: string;
  projectId?: string;
  providerId: string;
  status: ReasoningSessionStatus;
  createdAt: string;
  updatedAt: string;
  maxCycles: number;
  maxTotalTokens: number;
  timeoutMs: number;
  currentCycle: number;
  totalTokensUsed: number;
  elapsedMs: number;
  cycles: PersistedCycleSummary[];
  approvalPolicy: ApprovalPolicyLevel;
  workflowId?: string;
  checkpointId?: string;
  associationStatus: ReasoningWorkflowAssociationStatus;
  unknownMutationRecords: UnknownMutationRecord[];
}

export interface ReasoningSessionStoreState {
  version: number;
  sessions: Record<string, PersistedReasoningSessionRecord>;
  checkpointRefs: Record<string, string[]>;
}

export interface ReasoningStoreAdapter {
  read(): Promise<string>;
  write(content: string): Promise<void>;
}

function emptyStore(): ReasoningSessionStoreState {
  return {
    version: REASONING_STORE_VERSION,
    sessions: {},
    checkpointRefs: {},
  };
}

const TERMINAL_STATUSES: Set<ReasoningSessionStatus> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'BUDGET_EXHAUSTED',
]);

export class ReasoningSessionStore {
  private store: ReasoningSessionStoreState = emptyStore();
  private loaded = false;
  private dirty = false;
  private pendingSave: Promise<void> | null = null;
  private customAdapter?: ReasoningStoreAdapter;

  constructor(adapter?: ReasoningStoreAdapter) {
    this.customAdapter = adapter;
  }

  setAdapter(adapter?: ReasoningStoreAdapter): void {
    this.customAdapter = adapter;
  }

  async load(forceReload = false): Promise<void> {
    if (this.loaded && !forceReload) return;

    try {
      let raw: string;
      if (this.customAdapter) {
        raw = await this.customAdapter.read();
      } else {
        raw = await invoke<string>('read_app_file', { path: STORE_FILE });
      }

      const parsed = JSON.parse(raw) as ReasoningSessionStoreState;

      if (parsed && parsed.version === REASONING_STORE_VERSION) {
        const sanitizedSessions: Record<string, PersistedReasoningSessionRecord> = {};

        for (const [id, session] of Object.entries(parsed.sessions ?? {})) {
          // Crash recovery rule: Active uncompleted sessions must become RECOVERY_REQUIRED
          let status = session.status;
          if (!TERMINAL_STATUSES.has(status)) {
            status = 'RECOVERY_REQUIRED';
          }

          sanitizedSessions[id] = {
            ...session,
            status,
            cycles: (session.cycles || []).slice(-MAX_STORED_CYCLES),
            unknownMutationRecords: session.unknownMutationRecords || [],
          };
        }

        this.store = {
          version: parsed.version,
          sessions: sanitizedSessions,
          checkpointRefs: parsed.checkpointRefs ?? {},
        };
      } else {
        console.warn('[ReasoningSessionStore] Unknown store schema version, failing closed to empty state');
        this.store = emptyStore();
      }
    } catch (err: any) {
      const msg = String(err).toLowerCase();
      if (msg.includes('not found') || msg.includes('no such file') || msg.includes('cannot find the file')) {
        this.store = emptyStore();
      } else {
        console.error('[ReasoningSessionStore] Failed to load reasoning sessions, failing closed:', err);
        this.store = emptyStore();
      }
    }

    this.loaded = true;
    this.dirty = false;
  }

  /**
   * Sanitizes a ReasoningSession into a safe PersistedReasoningSessionRecord
   * ensuring no hidden CoT, raw prompts, raw responses, locks, or process IDs are stored.
   */
  private sanitizeSession(session: ReasoningSession): PersistedReasoningSessionRecord {
    const cycles: PersistedCycleSummary[] = session.cycles.slice(-MAX_STORED_CYCLES).map((c) => ({
      cycleIndex: c.cycleIndex,
      startedAt: c.startedAt,
      completedAt: c.completedAt,
      providerId: c.providerId,
      tokenUsage: { ...c.tokenUsage },
      proposedActionCount: c.proposedActionCount,
      acceptedActionCount: c.acceptedActionCount,
      rejectedActionCount: c.rejectedActionCount,
      workflowId: c.workflowId,
      workflowOutcome: c.workflowOutcome,
      verificationSummary: c.verificationSummary ? c.verificationSummary.substring(0, MAX_ERROR_LENGTH) : undefined,
      errors: c.errors
        ? c.errors.map((e: any) =>
            typeof e === 'string'
              ? e.substring(0, MAX_ERROR_LENGTH)
              : e.sanitizedMessage
              ? String(e.sanitizedMessage).substring(0, MAX_ERROR_LENGTH)
              : String(e).substring(0, MAX_ERROR_LENGTH)
          )
        : undefined,
    }));

    return {
      sessionId: session.sessionId,
      goal: session.goal,
      projectId: session.projectId,
      providerId: session.providerId,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      maxCycles: session.maxCycles,
      maxTotalTokens: session.maxTotalTokens,
      timeoutMs: session.timeoutMs,
      currentCycle: session.currentCycle,
      totalTokensUsed: session.totalTokensUsed,
      elapsedMs: session.elapsedMs,
      cycles,
      approvalPolicy: session.approvalPolicy,
      workflowId: session.workflowId,
      checkpointId: session.checkpointId,
      associationStatus: session.associationStatus,
      unknownMutationRecords: [...session.unknownMutationRecords],
    };
  }

  /**
   * Enforces bounded retention of stored sessions by pruning oldest terminal sessions.
   */
  private pruneOldSessions(): void {
    const sessionIds = Object.keys(this.store.sessions);
    if (sessionIds.length <= MAX_STORED_SESSIONS) return;

    // Separate terminal vs active/recovery sessions
    const terminalIds = sessionIds.filter((id) => TERMINAL_STATUSES.has(this.store.sessions[id].status));
    terminalIds.sort((a, b) => {
      const timeA = new Date(this.store.sessions[a].updatedAt).getTime();
      const timeB = new Date(this.store.sessions[b].updatedAt).getTime();
      return timeA - timeB; // Oldest first
    });

    while (
      Object.keys(this.store.sessions).length > MAX_STORED_SESSIONS &&
      terminalIds.length > 0
    ) {
      const oldestId = terminalIds.shift()!;
      delete this.store.sessions[oldestId];
      delete this.store.checkpointRefs[oldestId];
    }
  }

  async saveSession(session: ReasoningSession): Promise<void> {
    const sanitized = this.sanitizeSession(session);
    this.store.sessions[session.sessionId] = sanitized;

    if (session.checkpointId) {
      const existing = this.store.checkpointRefs[session.sessionId] || [];
      if (!existing.includes(session.checkpointId)) {
        this.store.checkpointRefs[session.sessionId] = [...existing, session.checkpointId];
      }
    }

    this.pruneOldSessions();
    this.dirty = true;
    await this.save();
  }

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
        if (this.customAdapter) {
          await this.customAdapter.write(json);
        } else {
          await invoke('write_app_file', { path: STORE_FILE, content: json });
        }
      } catch (err) {
        this.dirty = true;
        console.error('[ReasoningSessionStore] Save failed:', err);
      }
    };

    this.pendingSave = executeSave();
    await this.pendingSave;
    this.pendingSave = null;
  }

  getSession(sessionId: string): PersistedReasoningSessionRecord | undefined {
    return this.store.sessions[sessionId];
  }

  getAllSessions(): PersistedReasoningSessionRecord[] {
    return Object.values(this.store.sessions);
  }

  getCheckpointRefs(sessionId: string): string[] {
    return this.store.checkpointRefs[sessionId] || [];
  }

  clear(): void {
    this.store = emptyStore();
    this.dirty = true;
  }
}

let globalStore: ReasoningSessionStore | null = null;

export function getReasoningSessionStore(): ReasoningSessionStore {
  if (!globalStore) {
    globalStore = new ReasoningSessionStore();
  }
  return globalStore;
}
