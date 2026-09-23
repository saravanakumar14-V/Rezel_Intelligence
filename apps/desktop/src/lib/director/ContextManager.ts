import type { ModeManager } from './ModeManager.js';
import type { IntentRouter } from './IntentRouter.js';
import type { ApplicationSessionManager } from './ApplicationSessionManager.js';
import type { ConversationManager } from './ConversationManager.js';
import { ExperienceProfileRegistry } from './ExperienceProfile.js';
import type { ContextSnapshot } from './types.js';
import { ProjectContextResolver } from '../workspace/ProjectContextResolver.js';

export class ContextManager {
  private modeManager: ModeManager;
  private intentRouter: IntentRouter;
  private sessionManager: ApplicationSessionManager;
  private conversationManager: ConversationManager;

  constructor(
    modeManager: ModeManager,
    intentRouter: IntentRouter,
    sessionManager: ApplicationSessionManager,
    conversationManager: ConversationManager
  ) {
    this.modeManager = modeManager;
    this.intentRouter = intentRouter;
    this.sessionManager = sessionManager;
    this.conversationManager = conversationManager;
  }

  buildContext(input: string, activeWorkflowId: string | null = null): ContextSnapshot {
    const intentClass = this.intentRouter.classify(input);
    
    // Apply temporary contextual mode based on intent classification
    if (intentClass.suggestedMode) {
      this.modeManager.setContextualMode(intentClass.suggestedMode);
    } else {
      this.modeManager.clearContextualMode();
    }

    const mode = this.modeManager.getEffectiveMode();
    const experienceProfile = ExperienceProfileRegistry.getProfile(mode);
    const activeApp = this.sessionManager.getForegroundSession() || null;
    const conversationId = this.conversationManager.getActiveConversationId();

    // Resolve workspace and project context
    const resolvedProject = ProjectContextResolver.resolveProject(input, activeApp);
    const projectContext = ProjectContextResolver.buildSnapshot(resolvedProject, activeWorkflowId);

    return {
      conversationId,
      mode,
      experienceProfile,
      intent: intentClass.intent,
      intentConfidence: intentClass.confidence,
      activeApplication: activeApp,
      activeWorkflowId,
      projectContext,
      sessionState: {}
    };
  }
}
