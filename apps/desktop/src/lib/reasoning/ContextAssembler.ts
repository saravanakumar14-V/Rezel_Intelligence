import type { ReasoningContext } from './types';
import type { ReasoningSession } from './ReasoningSession';
import { ProjectContextResolver } from '../workspace/ProjectContextResolver';
import { WorkspaceManager } from '../workspace/WorkspaceManager';
import { CapabilityRegistry } from '../ai/capabilities/CapabilityRegistry';
import { ApplicationSessionManager } from '../director/ApplicationSessionManager';

export interface ContextAssemblerOptions {
  maxConfirmedDecisions?: number;
  maxRecentChanges?: number;
  maxRecentConversationMessages?: number;
}

export class ContextAssembler {
  private static readonly DEFAULT_MAX_DECISIONS = 5;
  private static readonly DEFAULT_MAX_CHANGES = 3;
  private static readonly DEFAULT_MAX_MESSAGES = 5;

  /**
   * Builds a bounded, sanitized ReasoningContext from Rezel state sources.
   *
   * SECURITY BOUNDARY:
   * MUST NOT INCLUDE:
   * - API keys, OAuth tokens, credentials
   * - Active locks, PIDs, HWNDs, raw process handles
   * - AuditLogger, PolicyEngine, SafetyValidator internals
   * - Raw hidden chain-of-thought
   * - Unrestricted raw file contents
   * - Environment variables
   */
  static build(
    session: ReasoningSession,
    options: ContextAssemblerOptions = {}
  ): ReasoningContext {
    const maxDecisions = options.maxConfirmedDecisions ?? ContextAssembler.DEFAULT_MAX_DECISIONS;
    const maxChanges = options.maxRecentChanges ?? ContextAssembler.DEFAULT_MAX_CHANGES;
    const maxMessages = options.maxRecentConversationMessages ?? ContextAssembler.DEFAULT_MAX_MESSAGES;

    // 1. Project Snapshot via ProjectContextResolver
    let projectSnapshot = null;
    try {
      const activeProject = WorkspaceManager.getActiveProject();
      if (activeProject || session.projectId) {
        const resolvedProject = activeProject?.id === session.projectId
          ? activeProject
          : WorkspaceManager.getActiveWorkspace().projectIds.includes(session.projectId || '')
          ? WorkspaceManager.getActiveProject()
          : null;

        projectSnapshot = ProjectContextResolver.buildSnapshot(
          resolvedProject,
          session.workflowId
        );
        if (projectSnapshot.recentDecisions) {
          projectSnapshot.recentDecisions = projectSnapshot.recentDecisions.slice(-maxDecisions);
        }
        if (projectSnapshot.recentChanges) {
          projectSnapshot.recentChanges = projectSnapshot.recentChanges.slice(-maxChanges);
        }
      }
    } catch {
      projectSnapshot = null;
    }

    // 2. Application Context via ApplicationSessionManager
    let applicationContext = null;
    try {
      const sessionMgr = new ApplicationSessionManager();
      const activeApp = sessionMgr.getForegroundSession();
      if (activeApp) {
        applicationContext = {
          appId: activeApp.appId,
          connectionStatus: activeApp.connectionStatus,
          capabilities: Array.isArray(activeApp.capabilities) ? [...activeApp.capabilities] : [],
        };
      }
    } catch {
      applicationContext = null;
    }

    // 3. Available Capabilities (Metadata ONLY — no execute functions)
    let availableCapabilities: Array<{ id: string; description: string; category: string }> = [];
    try {
      availableCapabilities = CapabilityRegistry.getAll().map((cap) => ({
        id: cap.id,
        description: cap.description || `Capability ${cap.id}`,
        category: cap.category || 'general',
      }));
    } catch {
      availableCapabilities = [];
    }

    // 4. Conversation Summary (Bounded to maxMessages recent messages, no secrets)
    const conversationSummary = {
      messageCount: Math.min(maxMessages, 0),
      recentMessages: ([] as Array<{ role: string; content: string }>).slice(-maxMessages),
    };

    // 5. Remaining Budget
    const nextCycle = session.currentCycle + 1;
    const remainingBudget = {
      cycles: Math.max(0, session.maxCycles - session.currentCycle),
      tokens: Math.max(0, session.maxTotalTokens - session.totalTokensUsed),
    };

    return {
      projectSnapshot,
      conversationSummary,
      applicationContext,
      availableCapabilities,
      previousCycleResult: session.lastCycleResult,
      currentCycle: nextCycle,
      remainingBudget,
    };
  }
}
