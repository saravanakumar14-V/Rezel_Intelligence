import { WorkspaceStore, DEFAULT_WORKSPACE_ID } from './WorkspaceStore';
import type {
  Project,
  ProjectType,
  ProjectApplicationBinding,
  ProjectDecision,
  DecisionCategory,
} from './types';

const MAX_RECENT_CHANGES = 10;

export class ProjectManagerImpl {
  createProject(options: {
    workspaceId?: string;
    name: string;
    description?: string;
    projectType?: ProjectType;
    rootPath?: string;
    tags?: string[];
    metadata?: Record<string, any>;
  }): Project {
    const workspaceId = options.workspaceId ?? WorkspaceStore.getActiveWorkspaceId() ?? DEFAULT_WORKSPACE_ID;
    const id = `proj_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const project: Project = {
      id,
      workspaceId,
      name: options.name,
      description: options.description,
      projectType: options.projectType ?? 'GENERAL',
      rootPath: options.rootPath,
      applications: [],
      conversationIds: [],
      workflowIds: [],
      tags: options.tags ?? [],
      decisions: [],
      recentChanges: [],
      metadata: options.metadata ?? {},
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    };

    WorkspaceStore.saveProject(project);
    return project;
  }

  getProject(id: string): Project | undefined {
    return WorkspaceStore.getProject(id);
  }

  getAllProjects(): Project[] {
    return WorkspaceStore.getAllProjects();
  }

  updateProject(
    id: string,
    updates: Partial<Omit<Project, 'id' | 'workspaceId' | 'createdAt'>>
  ): Project | undefined {
    const existing = WorkspaceStore.getProject(id);
    if (!existing) return undefined;

    const updated: Project = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    WorkspaceStore.saveProject(updated);
    return updated;
  }

  deleteProject(id: string): boolean {
    return WorkspaceStore.deleteProject(id);
  }

  // ── Application Bindings ───────────────────────────────────────────────────

  bindApplication(projectId: string, binding: ProjectApplicationBinding): boolean {
    const project = WorkspaceStore.getProject(projectId);
    if (!project) return false;

    // Filter out existing binding for same appId
    const existingIdx = project.applications.findIndex((a) => a.appId === binding.appId);
    if (existingIdx >= 0) {
      project.applications[existingIdx] = {
        ...project.applications[existingIdx],
        ...binding,
        lastConnectedAt: new Date().toISOString(),
      };
    } else {
      project.applications.push({
        ...binding,
        lastConnectedAt: new Date().toISOString(),
      });
    }

    WorkspaceStore.saveProject(project);
    return true;
  }

  unbindApplication(projectId: string, appId: string): boolean {
    const project = WorkspaceStore.getProject(projectId);
    if (!project) return false;

    const prevLen = project.applications.length;
    project.applications = project.applications.filter((a) => a.appId !== appId);
    if (project.applications.length === prevLen) return false;

    WorkspaceStore.saveProject(project);
    return true;
  }

  // ── Decision Memory ────────────────────────────────────────────────────────

  addDecision(
    projectId: string,
    statement: string,
    category: DecisionCategory = 'GENERAL',
    sourceConversationId?: string,
    autoConfirm = false
  ): ProjectDecision | null {
    const project = WorkspaceStore.getProject(projectId);
    if (!project) return null;

    const decisionId = `dec_${crypto.randomUUID()}`;
    const now = new Date().toISOString();

    const decision: ProjectDecision = {
      id: decisionId,
      projectId,
      statement,
      category,
      sourceConversationId,
      confirmedByUser: autoConfirm,
      createdAt: now,
      updatedAt: now,
    };

    project.decisions.push(decision);
    WorkspaceStore.saveProject(project);
    return decision;
  }

  confirmDecision(projectId: string, decisionId: string): boolean {
    const project = WorkspaceStore.getProject(projectId);
    if (!project) return false;

    const dec = project.decisions.find((d) => d.id === decisionId);
    if (!dec) return false;

    dec.confirmedByUser = true;
    dec.updatedAt = new Date().toISOString();
    WorkspaceStore.saveProject(project);
    return true;
  }

  removeDecision(projectId: string, decisionId: string): boolean {
    const project = WorkspaceStore.getProject(projectId);
    if (!project) return false;

    const prevLen = project.decisions.length;
    project.decisions = project.decisions.filter((d) => d.id !== decisionId);
    if (project.decisions.length === prevLen) return false;

    WorkspaceStore.saveProject(project);
    return true;
  }

  getConfirmedDecisions(projectId: string): ProjectDecision[] {
    const project = WorkspaceStore.getProject(projectId);
    if (!project) return [];
    return project.decisions.filter((d) => d.confirmedByUser);
  }

  // ── Associations & Recent Activity ─────────────────────────────────────────

  associateWorkflow(projectId: string, workflowId: string): boolean {
    const project = WorkspaceStore.getProject(projectId);
    if (!project) return false;

    if (!project.workflowIds.includes(workflowId)) {
      project.workflowIds.push(workflowId);
      project.lastActiveAt = new Date().toISOString();
      WorkspaceStore.saveProject(project);
    }
    return true;
  }

  associateConversation(projectId: string, conversationId: string): boolean {
    const project = WorkspaceStore.getProject(projectId);
    if (!project) return false;

    if (!project.conversationIds.includes(conversationId)) {
      project.conversationIds.push(conversationId);
      project.lastActiveAt = new Date().toISOString();
      WorkspaceStore.saveProject(project);
    }
    return true;
  }

  addRecentChange(projectId: string, description: string): boolean {
    const project = WorkspaceStore.getProject(projectId);
    if (!project) return false;

    project.recentChanges.unshift(description);
    if (project.recentChanges.length > MAX_RECENT_CHANGES) {
      project.recentChanges.pop();
    }
    project.lastActiveAt = new Date().toISOString();
    WorkspaceStore.saveProject(project);
    return true;
  }

  touchProject(projectId: string): void {
    const project = WorkspaceStore.getProject(projectId);
    if (project) {
      project.lastActiveAt = new Date().toISOString();
      WorkspaceStore.saveProject(project);
    }
  }
}

export const ProjectManager = new ProjectManagerImpl();
