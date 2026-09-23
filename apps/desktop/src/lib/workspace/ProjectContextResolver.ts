import { WorkspaceStore } from './WorkspaceStore';
import { WorkspaceManager } from './WorkspaceManager';
import { ProjectManager } from './ProjectManager';
import type { Project, ProjectContextSnapshot } from './types';
import type { ApplicationSession } from '../director/types';
import { WorkflowRuntime } from '../ai/WorkflowRuntime';

const MAX_SNAPSHOT_DECISIONS = 5;
const MAX_SNAPSHOT_CHANGES = 3;

export class ProjectContextResolver {
  /**
   * resolveProject
   * Bounded heuristic resolution of the most relevant project:
   * 1. Explicit project ID or name match from user prompt.
   * 2. Active application session's active scene / project file.
   * 3. Currently active project in the workspace.
   * 4. Null if no project is active or matching.
   */
  static resolveProject(
    prompt?: string,
    activeApp?: ApplicationSession | null
  ): Project | null {
    const ws = WorkspaceManager.getActiveWorkspace();
    const projects = WorkspaceStore.getProjectsForWorkspace(ws.id);

    // 1. Explicit match in user prompt
    if (prompt && prompt.trim().length > 0) {
      const lower = prompt.toLowerCase();

      // Check exact project name or ID
      for (const p of projects) {
        if (lower.includes(p.name.toLowerCase()) || lower.includes(p.id.toLowerCase())) {
          return p;
        }
      }

      // Check tags
      for (const p of projects) {
        if (p.tags.some((tag) => lower.includes(tag.toLowerCase()))) {
          return p;
        }
      }
    }

    // 2. Match active application session file/binding
    if (activeApp) {
      for (const p of projects) {
        const binding = p.applications.find((a) => a.appId === activeApp.appId);
        if (binding) {
          if (
            activeApp.activeProject &&
            binding.projectFilePath &&
            (binding.projectFilePath.toLowerCase().endsWith(activeApp.activeProject.toLowerCase()) ||
              activeApp.activeProject.toLowerCase().endsWith(binding.projectFilePath.toLowerCase()))
          ) {
            return p;
          }
          // If only 1 project is bound to this app, resolve it
          if (projects.filter((proj) => proj.applications.some((a) => a.appId === activeApp.appId)).length === 1) {
            return p;
          }
        }
      }
    }

    // 3. Current active project
    const activeProj = WorkspaceManager.getActiveProject();
    if (activeProj) {
      return activeProj;
    }

    // 4. Default to first project if only one exists in workspace
    if (projects.length === 1) {
      return projects[0];
    }

    return null;
  }

  /**
   * buildSnapshot
   * Generates a bounded, sanitized ProjectContextSnapshot.
   */
  static buildSnapshot(
    project: Project | null,
    activeWorkflowId?: string | null
  ): ProjectContextSnapshot {
    const ws = WorkspaceManager.getActiveWorkspace();

    if (!project) {
      return {
        workspaceId: ws.id,
        workspaceName: ws.name,
        project: null,
        recentDecisions: [],
        recentChanges: [],
      };
    }

    // Bounded confirmed decisions (max 5)
    const confirmedDecisions = ProjectManager.getConfirmedDecisions(project.id)
      .slice(-MAX_SNAPSHOT_DECISIONS)
      .map((d) => d.statement);

    // Bounded recent changes (max 3)
    const recentChanges = (project.recentChanges ?? []).slice(0, MAX_SNAPSHOT_CHANGES);

    // Latest workflow summary
    let latestWorkflowSummary: ProjectContextSnapshot['latestWorkflowSummary'] = undefined;
    let verificationSummary: string | undefined = undefined;

    const targetWorkflowId = activeWorkflowId ?? (project.workflowIds.length > 0 ? project.workflowIds[project.workflowIds.length - 1] : null);

    if (targetWorkflowId) {
      const wf = WorkflowRuntime.get(targetWorkflowId);
      if (wf) {
        const verifiedSteps = wf.plan.steps.filter((s) => s.verificationResult === 'VERIFIED');
        const unknownSteps = wf.plan.steps.filter((s) => s.executionOutcome === 'UNKNOWN' || s.verificationResult === 'UNKNOWN');

        let verifStr = 'UNVERIFIED';
        if (unknownSteps.length > 0) verifStr = 'UNKNOWN';
        else if (verifiedSteps.length > 0) verifStr = `${verifiedSteps.length}/${wf.plan.steps.length} VERIFIED`;

        verificationSummary = verifStr;

        latestWorkflowSummary = {
          id: wf.id,
          title: (wf.plan as any).title ?? wf.plan.goal ?? 'Workflow',
          status: wf.status,
          latestVerification: verifStr,
        };
      }
    }

    return {
      workspaceId: ws.id,
      workspaceName: ws.name,
      project: {
        id: project.id,
        name: project.name,
        projectType: project.projectType,
        rootPath: project.rootPath,
        applications: project.applications.map((a) => ({
          appId: a.appId,
          projectFilePath: a.projectFilePath,
          lastConnectedAt: a.lastConnectedAt,
        })),
      },
      recentDecisions: confirmedDecisions,
      latestWorkflowSummary,
      recentChanges,
      verificationSummary,
    };
  }
}
