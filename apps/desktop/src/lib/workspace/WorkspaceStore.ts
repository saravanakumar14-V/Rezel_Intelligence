import { invoke } from '@tauri-apps/api/core';
import type {
  Workspace,
  Project,
  WorkspaceStoreState,
} from './types';

const STORE_FILE = 'rezel_workspace.json';
const STORE_VERSION = 1;

export const DEFAULT_WORKSPACE_ID = 'ws_default';

function emptyStore(): WorkspaceStoreState {
  const defaultWs: Workspace = {
    id: DEFAULT_WORKSPACE_ID,
    name: 'Default Workspace',
    description: 'Primary Rezel workspace',
    projectIds: [],
    activeProjectId: null,
    preferences: {
      autoCompanion: true,
    },
    metadata: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    version: STORE_VERSION,
    workspaces: {
      [DEFAULT_WORKSPACE_ID]: defaultWs,
    },
    projects: {},
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
  };
}

class WorkspaceStoreImpl {
  private store: WorkspaceStoreState = emptyStore();
  private loaded = false;
  private loadingPromise: Promise<void> | null = null;
  private pendingSave: Promise<void> | null = null;
  private dirty = false;

  async load(forceReload = false): Promise<void> {
    if (this.loaded && !forceReload) return;
    if (this.loadingPromise && !forceReload) return this.loadingPromise;

    const executeLoad = async () => {
      try {
        const raw = await invoke<string>('read_app_file', { path: STORE_FILE });
        const parsed = JSON.parse(raw) as WorkspaceStoreState;

        if (parsed && parsed.version === STORE_VERSION) {
          this.store = {
            version: parsed.version,
            workspaces: parsed.workspaces ?? {},
            projects: parsed.projects ?? {},
            activeWorkspaceId: parsed.activeWorkspaceId ?? DEFAULT_WORKSPACE_ID,
          };

          // Guarantee default workspace exists
          if (!this.store.workspaces[DEFAULT_WORKSPACE_ID]) {
            const defaultWs = emptyStore().workspaces[DEFAULT_WORKSPACE_ID];
            this.store.workspaces[DEFAULT_WORKSPACE_ID] = defaultWs;
          }
        } else {
          console.warn('[WorkspaceStore] Unknown or incompatible store version, starting fresh');
          this.store = emptyStore();
        }
      } catch (err) {
        const msg = String(err).toLowerCase();
        if (msg.includes('not found') || msg.includes('no such file') || msg.includes('cannot find the file')) {
          this.store = emptyStore();
        } else {
          console.error('[WorkspaceStore] Failed to load workspace store, failing closed to safe empty state:', err);
          this.store = emptyStore();
        }
      }

      this.loaded = true;
      this.dirty = false;
    };

    this.loadingPromise = executeLoad();
    await this.loadingPromise;
    this.loadingPromise = null;
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
        await invoke('write_app_file', { path: STORE_FILE, content: json });
      } catch (err) {
        this.dirty = true;
        console.error('[WorkspaceStore] Save failed:', err);
      }
    };

    this.pendingSave = executeSave();
    await this.pendingSave;
    this.pendingSave = null;
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────

  getWorkspace(id: string): Workspace | undefined {
    const ws = this.store.workspaces[id];
    return ws ? JSON.parse(JSON.stringify(ws)) : undefined;
  }

  getAllWorkspaces(): Workspace[] {
    return Object.values(this.store.workspaces).map((ws) => JSON.parse(JSON.stringify(ws)));
  }

  saveWorkspace(workspace: Workspace): void {
    workspace.updatedAt = new Date().toISOString();
    this.store.workspaces[workspace.id] = JSON.parse(JSON.stringify(workspace));
    this.dirty = true;
    this.save().catch(console.error);
  }

  deleteWorkspace(id: string): boolean {
    if (id === DEFAULT_WORKSPACE_ID) {
      console.warn('[WorkspaceStore] Cannot delete default workspace');
      return false;
    }
    if (!this.store.workspaces[id]) return false;

    // Delete associated projects
    const ws = this.store.workspaces[id];
    for (const projId of ws.projectIds) {
      delete this.store.projects[projId];
    }
    delete this.store.workspaces[id];

    if (this.store.activeWorkspaceId === id) {
      this.store.activeWorkspaceId = DEFAULT_WORKSPACE_ID;
    }

    this.dirty = true;
    this.save().catch(console.error);
    return true;
  }

  getActiveWorkspaceId(): string {
    return this.store.activeWorkspaceId || DEFAULT_WORKSPACE_ID;
  }

  setActiveWorkspaceId(id: string): boolean {
    if (!this.store.workspaces[id]) return false;
    this.store.activeWorkspaceId = id;
    this.dirty = true;
    this.save().catch(console.error);
    return true;
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  getProject(id: string): Project | undefined {
    const proj = this.store.projects[id];
    return proj ? JSON.parse(JSON.stringify(proj)) : undefined;
  }

  getAllProjects(): Project[] {
    return Object.values(this.store.projects).map((p) => JSON.parse(JSON.stringify(p)));
  }

  getProjectsForWorkspace(workspaceId: string): Project[] {
    const ws = this.store.workspaces[workspaceId];
    if (!ws) return [];
    return ws.projectIds
      .map((pid) => this.store.projects[pid])
      .filter((p): p is Project => Boolean(p))
      .map((p) => JSON.parse(JSON.stringify(p)));
  }

  saveProject(project: Project): void {
    project.updatedAt = new Date().toISOString();
    this.store.projects[project.id] = JSON.parse(JSON.stringify(project));

    // Ensure parent workspace indexes this project
    const ws = this.store.workspaces[project.workspaceId];
    if (ws && !ws.projectIds.includes(project.id)) {
      ws.projectIds.push(project.id);
      ws.updatedAt = new Date().toISOString();
    }

    this.dirty = true;
    this.save().catch(console.error);
  }

  deleteProject(id: string): boolean {
    const proj = this.store.projects[id];
    if (!proj) return false;

    // Remove from parent workspace
    const ws = this.store.workspaces[proj.workspaceId];
    if (ws) {
      ws.projectIds = ws.projectIds.filter((pid) => pid !== id);
      if (ws.activeProjectId === id) {
        ws.activeProjectId = null;
      }
      ws.updatedAt = new Date().toISOString();
    }

    delete this.store.projects[id];
    this.dirty = true;
    this.save().catch(console.error);
    return true;
  }

  // ── Test / Debug / Reset ───────────────────────────────────────────────────

  reset(): void {
    this.store = emptyStore();
    this.loaded = true;
    this.dirty = false;
    this.loadingPromise = null;
  }

  getState(): WorkspaceStoreState {
    return JSON.parse(JSON.stringify(this.store));
  }
}

export const WorkspaceStore = new WorkspaceStoreImpl();
