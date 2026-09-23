import type { ResourceRequirement } from '../capabilities/types';

interface LockRecord {
  workflowId: string;
  stepId: string;
  uri: string;
  access: 'READ' | 'WRITE' | 'EXCLUSIVE';
}

interface QueuedRequest {
  workflowId: string;
  stepId: string;
  reqs: ResourceRequirement[];
  resolve: () => void;
}

class ResourceLockManagerImpl {
  private activeLocks: LockRecord[] = [];
  private waitQueue: QueuedRequest[] = [];

  async acquireLocks(workflowId: string, stepId: string, requirements: ResourceRequirement[]): Promise<void> {
    if (requirements.length === 0) return Promise.resolve();

    const sortedReqs = this.normalizeAndSort(requirements);

    return new Promise((resolve) => {
      this.waitQueue.push({ workflowId, stepId, reqs: sortedReqs, resolve });
      this.processQueue();
    });
  }

  releaseLocks(workflowId: string, stepId: string): void {
    this.activeLocks = this.activeLocks.filter(l => !(l.workflowId === workflowId && l.stepId === stepId));
    this.waitQueue = this.waitQueue.filter(q => !(q.workflowId === workflowId && q.stepId === stepId));
    this.processQueue();
  }

  releaseWorkflowLocks(workflowId: string): void {
    this.activeLocks = this.activeLocks.filter(l => l.workflowId !== workflowId);
    this.waitQueue = this.waitQueue.filter(q => q.workflowId !== workflowId);
    this.processQueue();
  }

  isLocked(uri: string): boolean {
    return this.activeLocks.some(l => l.uri === uri);
  }

  getActiveLocks(): LockRecord[] {
    return [...this.activeLocks];
  }

  private normalizeAndSort(reqs: ResourceRequirement[]): ResourceRequirement[] {
    const normalized = reqs.map(r => ({
      ...r,
      uri: r.uri.startsWith('fs:') ? r.uri.replace(/\\/g, '/').toLowerCase() : r.uri
    }));

    const uriMap = new Map<string, ResourceRequirement>();
    for (const req of normalized) {
      const existing = uriMap.get(req.uri);
      if (!existing) {
        uriMap.set(req.uri, req);
      } else {
        if (req.access === 'EXCLUSIVE') existing.access = 'EXCLUSIVE';
        else if (req.access === 'WRITE' && existing.access !== 'EXCLUSIVE') existing.access = 'WRITE';
      }
    }
    
    return Array.from(uriMap.values()).sort((a, b) => a.uri.localeCompare(b.uri));
  }

  private processQueue() {
    const unblocked: QueuedRequest[] = [];
    const pendingReqs: LockRecord[] = [];

    for (const req of this.waitQueue) {
      const virtualLocks = [...this.activeLocks, ...pendingReqs];
      
      if (this.canAcquire(req.workflowId, req.stepId, req.reqs, virtualLocks)) {
        unblocked.push(req);
        // Do not add to pendingReqs; they will become activeLocks
      } else {
        // This request is blocked. It reserves these locks so later requests don't skip ahead and starve it.
        for (const r of req.reqs) {
          pendingReqs.push({
            workflowId: req.workflowId,
            stepId: req.stepId,
            uri: r.uri,
            access: r.access
          });
        }
      }
    }

    this.waitQueue = this.waitQueue.filter(q => !unblocked.includes(q));
    
    for (const req of unblocked) {
      for (const r of req.reqs) {
        this.activeLocks.push({
          workflowId: req.workflowId,
          stepId: req.stepId,
          uri: r.uri,
          access: r.access
        });
      }
      req.resolve();
    }
  }

  private canAcquire(workflowId: string, stepId: string, reqs: ResourceRequirement[], existingLocks: LockRecord[]): boolean {
    for (const req of reqs) {
      for (const lock of existingLocks) {
        // Re-entrant lock allowance: the same step in the same workflow can safely acquire nested locks
        if (lock.workflowId === workflowId && lock.stepId === stepId) {
          continue;
        }
        if (this.isConflict(req, lock)) return false;
      }
    }
    return true;
  }

  private isConflict(req: ResourceRequirement, lock: LockRecord): boolean {
    const rIsFs = req.uri.startsWith('fs:');
    const lIsFs = lock.uri.startsWith('fs:');

    let overlap = false;
    if (rIsFs && lIsFs) {
      // Path containment check (assuming unix-style normalized paths)
      const rPath = req.uri.slice(3).replace(/\/$/, ''); // strip trailing slash
      const lPath = lock.uri.slice(3).replace(/\/$/, '');
      if (rPath === lPath || rPath.startsWith(lPath + '/') || lPath.startsWith(rPath + '/')) {
        overlap = true;
      }
    } else {
      overlap = req.uri === lock.uri;
    }

    if (!overlap) return false;

    if (req.access === 'EXCLUSIVE' || lock.access === 'EXCLUSIVE') return true;
    if (req.access === 'WRITE' || lock.access === 'WRITE') return true;
    // READ + READ = allowed
    return false;
  }
}

export const ResourceLockManager = new ResourceLockManagerImpl();
