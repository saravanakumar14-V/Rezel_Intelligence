import { WorkspaceStore, DEFAULT_WORKSPACE_ID } from './WorkspaceStore';
import { PathGuard } from '../ai/capabilities/providers/filesystem/PathGuard';
import type {
  Workspace,
  Project,
  WorkspacePreferences,
} from './types';

export type WorkspaceEventType =
  | 'workspace_created'
  | 'workspace_updated'
  | 'workspace_deleted'
  | 'active_workspace_changed'
  | 'active_project_changed';

export interface WorkspaceEvent {
  type: WorkspaceEventType;
  payload: Record<string, any>;
}

type WorkspaceListener = (event: WorkspaceEvent) => void;

export class WorkspaceManagerImpl {
  private listeners = new Set<WorkspaceListener>();

  async initialize(): Promise<void> {
    await WorkspaceStore.load();
    const activeProject = this.getActiveProject();
    if (activeProject?.rootPath) {
      await PathGuard.setProjectRoot(activeProject.rootPath);
    }
  }

  subscribe(listener: WorkspaceListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: WorkspaceEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[WorkspaceManager] Listener error:', err);
      }
    }
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────

  createWorkspace(options: {
    name: string;
    description?: string;
    rootDirectory?: string;
    preferences?: WorkspacePreferences;
    metadata?: Record<string, any>;
  }): Workspace {
    const id = `ws_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const workspace: Workspace = {
      id,
      name: options.name,
      description: options.description,
      projectIds: [],
      activeProjectId: null,
      rootDirectory: options.rootDirectory,
      preferences: options.preferences ?? { autoCompanion: true },
      metadata: options.metadata ?? {},
      createdAt: now,
      updatedAt: now,
    };

    WorkspaceStore.saveWorkspace(workspace);
    this.emit({ type: 'workspace_created', payload: { workspace } });
    return workspace;
  }

  getWorkspace(id: string): Workspace | undefined {
    return WorkspaceStore.getWorkspace(id);
  }

  getAllWorkspaces(): Workspace[] {
    return WorkspaceStore.getAllWorkspaces();
  }

  getActiveWorkspace(): Workspace {
    const activeId = WorkspaceStore.getActiveWorkspaceId();
    const ws = WorkspaceStore.getWorkspace(activeId);
    if (ws) return ws;

    // Fallback to default workspace
    const defaultWs = WorkspaceStore.getWorkspace(DEFAULT_WORKSPACE_ID);
    if (defaultWs) return defaultWs;

    // Failsafe creation if store was completely empty
    return this.createWorkspace({ name: 'Default Workspace' });
  }

  setActiveWorkspace(id: string): boolean {
    const success = WorkspaceStore.setActiveWorkspaceId(id);
    if (success) {
      const ws = WorkspaceStore.getWorkspace(id);
      this.emit({ type: 'active_workspace_changed', payload: { workspaceId: id, workspace: ws } });
      const activeProject = this.getActiveProject();
      PathGuard.setProjectRoot(activeProject?.rootPath ?? ws?.rootDirectory).catch(() => {});
    }
    return success;
  }

  updateWorkspace(
    id: string,
    updates: Partial<Omit<Workspace, 'id' | 'createdAt'>>
  ): Workspace | undefined {
    const existing = WorkspaceStore.getWorkspace(id);
    if (!existing) return undefined;

    const updated: Workspace = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    WorkspaceStore.saveWorkspace(updated);
    this.emit({ type: 'workspace_updated', payload: { workspace: updated } });
    return updated;
  }

  deleteWorkspace(id: string): boolean {
    const success = WorkspaceStore.deleteWorkspace(id);
    if (success) {
      this.emit({ type: 'workspace_deleted', payload: { workspaceId: id } });
    }
    return success;
  }

  // ── Active Project & Switching ─────────────────────────────────────────────

  getActiveProject(): Project | null {
    const ws = this.getActiveWorkspace();
    if (!ws.activeProjectId) return null;
    return WorkspaceStore.getProject(ws.activeProjectId) ?? null;
  }

  setActiveProject(projectId: string | null): boolean {
    const ws = this.getActiveWorkspace();
    if (projectId !== null && !WorkspaceStore.getProject(projectId)) {
      console.warn(`[WorkspaceManager] Cannot set active project: ${projectId} does not exist`);
      return false;
    }

    const previousProjectId = ws.activeProjectId;
    ws.activeProjectId = projectId;
    ws.updatedAt = new Date().toISOString();
    WorkspaceStore.saveWorkspace(ws);

    const project = projectId ? WorkspaceStore.getProject(projectId) ?? null : null;
    PathGuard.setProjectRoot(project?.rootPath ?? ws.rootDirectory).catch(() => {});
    this.emit({
      type: 'active_project_changed',
      payload: { previousProjectId, currentProjectId: projectId, project },
    });
    return true;
  }

  /**
   * switchProject
   * Pure context switch — changes active project pointer without modifying locks,
   * cancelling workflows, or launching external applications.
   */
  switchProject(projectId: string | null): {
    previousProjectId: string | null;
    currentProjectId: string | null;
    project: Project | null;
  } {
    const ws = this.getActiveWorkspace();
    const previousProjectId = ws.activeProjectId;

    if (projectId !== null && !WorkspaceStore.getProject(projectId)) {
      throw new Error(`Project not found: ${projectId}`);
    }

    ws.activeProjectId = projectId;
    ws.updatedAt = new Date().toISOString();
    WorkspaceStore.saveWorkspace(ws);

    const project = projectId ? WorkspaceStore.getProject(projectId) ?? null : null;
    PathGuard.setProjectRoot(project?.rootPath ?? ws.rootDirectory).catch(() => {});
    this.emit({
      type: 'active_project_changed',
      payload: { previousProjectId, currentProjectId: projectId, project },
    });

    return { previousProjectId, currentProjectId: projectId, project };
  }
}

export const WorkspaceManager = new WorkspaceManagerImpl();
