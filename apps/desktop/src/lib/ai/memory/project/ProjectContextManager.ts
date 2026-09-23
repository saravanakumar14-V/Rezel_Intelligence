/**
 * Rezel 11.7B — Project Context Spaces & Memory Manager
 *
 * Implements project-scoped memory management, strict project isolation,
 * decision logging, decision supersession, and workflow/application fact capture:
 * - Deterministic project ID resolution with safe failure on ambiguity
 * - Absolute isolation: Project Alpha memories never leak into Project Beta
 * - Project decision versioning and supersession preserving historical provenance
 * - Policy governance over auto-capture of workflow and application facts
 */

import type {
  ProjectContextSpace,
  ProjectMemoryPolicy,
  ProjectDecision,
} from './types';
import { ProjectContextError } from './types';
import type { GovernedMemoryEntry, MemoryQuery } from '../types';
import { GovernedMemoryStore } from '../GovernedMemoryStore';

const DEFAULT_MEMORY_POLICY: ProjectMemoryPolicy = {
  allowAutoCapture: true,
  allowWorkflowFacts: true,
  allowApplicationFacts: true,
  allowSensitiveMemory: false,
};

class ProjectContextManagerImpl {
  private projects = new Map<string, ProjectContextSpace>();
  private decisions = new Map<string, ProjectDecision>();

  /**
   * Registers a new project context space.
   */
  createProject(params: {
    projectId: string;
    name: string;
    memoryPolicy?: Partial<ProjectMemoryPolicy>;
    metadata?: Record<string, unknown>;
  }): ProjectContextSpace {
    if (!params.projectId || !params.name) {
      throw new ProjectContextError('PROJECT_NOT_FOUND', 'Project ID and Name are required');
    }

    const now = Date.now();
    const project: ProjectContextSpace = {
      projectId: params.projectId,
      name: params.name,
      createdAt: now,
      updatedAt: now,
      status: 'ACTIVE',
      memoryPolicy: {
        ...DEFAULT_MEMORY_POLICY,
        ...(params.memoryPolicy || {}),
      },
      metadata: params.metadata,
    };

    this.projects.set(params.projectId, project);
    return project;
  }

  /**
   * Retrieves a project context space by ID.
   */
  getProject(projectId: string): ProjectContextSpace {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new ProjectContextError('PROJECT_NOT_FOUND', `Project not found: ${projectId}`, { projectId });
    }
    return project;
  }

  /**
   * Updates project context metadata or policy.
   */
  updateProject(
    projectId: string,
    updates: Partial<Omit<ProjectContextSpace, 'projectId' | 'createdAt'>>
  ): ProjectContextSpace {
    const project = this.getProject(projectId);
    const updated: ProjectContextSpace = {
      ...project,
      ...updates,
      updatedAt: Date.now(),
    };

    this.projects.set(projectId, updated);
    return updated;
  }

  /**
   * Archives a project context space.
   */
  archiveProject(projectId: string): ProjectContextSpace {
    return this.updateProject(projectId, { status: 'ARCHIVED' });
  }

  /**
   * Deletes a project context space (tombstone) and removes associated active memories.
   */
  deleteProject(projectId: string): ProjectContextSpace {
    const project = this.updateProject(projectId, { status: 'DELETED' });
    GovernedMemoryStore.forgetScope('PROJECT', projectId);
    return project;
  }

  /**
   * Resolves the active project ID deterministically from contextual hints.
   */
  resolveActiveProjectId(hints: {
    explicitProjectId?: string;
    workspaceProjectId?: string;
    workflowProjectId?: string;
  } = {}): string {
    if (hints.explicitProjectId) return hints.explicitProjectId;

    const candidates = [hints.workspaceProjectId, hints.workflowProjectId].filter(
      (id): id is string => Boolean(id)
    );

    const uniqueCandidates = Array.from(new Set(candidates));
    if (uniqueCandidates.length === 1) return uniqueCandidates[0];

    if (uniqueCandidates.length > 1) {
      throw new ProjectContextError(
        'PROJECT_CONTEXT_AMBIGUOUS',
        `Ambiguous project context hints: [${uniqueCandidates.join(', ')}]. Explicit project resolution required.`
      );
    }

    throw new ProjectContextError(
      'PROJECT_NOT_FOUND',
      'No active project specified or resolvable from context'
    );
  }

  /**
   * Records a new project decision with provenance.
   */
  addDecision(
    projectId: string,
    title: string,
    decisionText: string,
    rationale?: string
  ): ProjectDecision {
    const project = this.getProject(projectId);
    if (project.status === 'DELETED') {
      throw new ProjectContextError('PROJECT_DELETED', `Cannot add decision to deleted project: ${projectId}`);
    }

    // Persist as GovernedMemoryEntry
    const mem = GovernedMemoryStore.create({
      type: 'DECISION',
      scope: 'PROJECT',
      projectId,
      content: `[Decision: ${title}] ${decisionText}${rationale ? ` (Rationale: ${rationale})` : ''}`,
      source: 'USER',
      sensitivity: 'NORMAL',
      sourceReference: {
        sourceType: 'USER_INPUT',
        createdAt: Date.now(),
      },
      tags: ['decision', title.toLowerCase().replace(/\s+/g, '-')],
    });

    const now = Date.now();
    const decision: ProjectDecision = {
      decisionId: `dec_${crypto.randomUUID()}`,
      projectId,
      title,
      decision: decisionText,
      rationale,
      sourceMemoryId: mem.memoryId,
      createdAt: now,
      updatedAt: now,
      status: 'ACTIVE',
    };

    this.decisions.set(decision.decisionId, decision);
    return decision;
  }

  /**
   * Supersedes an older decision with an updated decision, preserving full provenance.
   */
  supersedeDecision(
    projectId: string,
    oldDecisionId: string,
    newTitle: string,
    newDecisionText: string,
    rationale?: string
  ): ProjectDecision {
    const oldDecision = this.decisions.get(oldDecisionId);
    if (!oldDecision || oldDecision.projectId !== projectId) {
      throw new ProjectContextError(
        'PROJECT_DECISION_NOT_FOUND',
        `Decision '${oldDecisionId}' not found for project '${projectId}'`
      );
    }

    // Create new active decision
    const newDecision = this.addDecision(projectId, newTitle, newDecisionText, rationale);

    // Supersede old decision
    this.decisions.set(oldDecisionId, {
      ...oldDecision,
      status: 'SUPERSEDED',
      supersededBy: newDecision.decisionId,
      updatedAt: Date.now(),
    });

    return newDecision;
  }

  /**
   * Captures a concise durable summary of a completed workflow into project memory.
   */
  addWorkflowFact(
    projectId: string,
    summary: { workflowId: string; templateId?: string; status: string; summary: string }
  ): GovernedMemoryEntry {
    const project = this.getProject(projectId);
    if (!project.memoryPolicy.allowWorkflowFacts) {
      throw new ProjectContextError(
        'PROJECT_MEMORY_ACCESS_DENIED',
        `Project policy disables workflow fact capture: ${projectId}`
      );
    }

    return GovernedMemoryStore.create({
      type: 'WORKFLOW_FACT',
      scope: 'PROJECT',
      projectId,
      workflowId: summary.workflowId,
      content: `[Workflow ${summary.workflowId} (${summary.status})] ${summary.summary}`,
      source: 'WORKFLOW',
      sensitivity: 'NORMAL',
      sourceReference: {
        sourceType: 'WORKFLOW',
        workflowId: summary.workflowId,
        createdAt: Date.now(),
      },
      tags: ['workflow', summary.status.toLowerCase()],
    });
  }

  /**
   * Captures normalized application state into project memory.
   */
  addApplicationFact(
    projectId: string,
    summary: { applicationId: string; fact: string }
  ): GovernedMemoryEntry {
    const project = this.getProject(projectId);
    if (!project.memoryPolicy.allowApplicationFacts) {
      throw new ProjectContextError(
        'PROJECT_MEMORY_ACCESS_DENIED',
        `Project policy disables application fact capture: ${projectId}`
      );
    }

    return GovernedMemoryStore.create({
      type: 'TECHNICAL_CONTEXT',
      scope: 'PROJECT',
      projectId,
      content: `[App: ${summary.applicationId}] ${summary.fact}`,
      source: 'APPLICATION',
      sensitivity: 'NORMAL',
      sourceReference: {
        sourceType: 'APPLICATION',
        sourceId: summary.applicationId,
        createdAt: Date.now(),
      },
      tags: ['application', summary.applicationId.toLowerCase()],
    });
  }

  /**
   * Searches project-scoped memories with absolute isolation.
   */
  searchProjectMemory(
    projectId: string,
    query: Omit<MemoryQuery, 'projectId' | 'scope'> = {}
  ): GovernedMemoryEntry[] {
    const project = this.getProject(projectId);
    if (project.status === 'DELETED') return [];

    return GovernedMemoryStore.search({
      ...query,
      scope: 'PROJECT',
      projectId,
    });
  }

  /**
   * Returns active (non-superseded) decisions for a project.
   */
  getActiveDecisions(projectId: string): ProjectDecision[] {
    const results: ProjectDecision[] = [];
    for (const dec of this.decisions.values()) {
      if (dec.projectId === projectId && dec.status === 'ACTIVE') {
        results.push(dec);
      }
    }
    return results;
  }

  /**
   * Clears in-memory data for testing.
   */
  clear(): void {
    this.projects.clear();
    this.decisions.clear();
  }
}

export const ProjectContextManager = new ProjectContextManagerImpl();
