/**
 * Workspace & Project Context — Type Definitions
 *
 * Core interfaces for Workspaces, Projects, Application Bindings,
 * Project Decisions, and Context Snapshots.
 */

export type ProjectType = 'CREATIVE_3D' | 'VIDEO_VFX' | 'SOFTWARE' | 'RESEARCH' | 'GENERAL';

export type DecisionCategory = 'DESIGN' | 'TECHNICAL' | 'WORKFLOW' | 'ASSET' | 'GENERAL';

export interface ProjectApplicationBinding {
  appId: string;
  projectFilePath?: string;
  lastConnectedAt?: string;
  metadata?: Record<string, any>;
}

export interface ProjectDecision {
  id: string;
  projectId: string;
  statement: string;
  category: DecisionCategory;
  sourceConversationId?: string;
  confirmedByUser: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  projectType: ProjectType;
  rootPath?: string;
  applications: ProjectApplicationBinding[];
  conversationIds: string[];
  workflowIds: string[];
  tags: string[];
  decisions: ProjectDecision[];
  recentChanges: string[];
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string;
}

export interface WorkspacePreferences {
  defaultMode?: string;
  autoCompanion?: boolean;
  voiceProfileOverrides?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  projectIds: string[];
  activeProjectId: string | null;
  rootDirectory?: string;
  preferences: WorkspacePreferences;
  metadata: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectContextSnapshot {
  workspaceId: string;
  workspaceName: string;
  project: {
    id: string;
    name: string;
    projectType: ProjectType;
    rootPath?: string;
    applications: ProjectApplicationBinding[];
  } | null;
  recentDecisions: string[];
  latestWorkflowSummary?: {
    id: string;
    title: string;
    status: string;
    latestVerification?: string;
  };
  recentChanges: string[];
  verificationSummary?: string;
}

export interface WorkspaceStoreState {
  version: number;
  workspaces: Record<string, Workspace>;
  projects: Record<string, Project>;
  activeWorkspaceId: string;
}
