import { AgentCore } from '../ai/AgentCore.js';
import { WorkflowRuntime } from '../ai/WorkflowRuntime.js';
import { ModeManager } from './ModeManager.js';
import { IntentRouter } from './IntentRouter.js';
import { ApplicationSessionManager } from './ApplicationSessionManager.js';
import { ContextManager } from './ContextManager.js';
import { ConversationManager } from './ConversationManager.js';
import { HandoffController } from './HandoffController.js';
import { LocalMemory } from '../memory/LocalMemory.js';
import { WorkspaceManager, WorkspaceManagerImpl } from '../workspace/WorkspaceManager.js';
import { ProjectManager, ProjectManagerImpl } from '../workspace/ProjectManager.js';
import type { Mode, Intent, ContextSnapshot, WindowState, HandoffState } from './types.js';
import type { Workspace, Project } from '../workspace/types.js';

export type DirectorEventType = 
  | 'turn_started'
  | 'intent_detected'
  | 'mode_changed'
  | 'profile_changed'
  | 'application_changed'
  | 'workflow_started'
  | 'workflow_progress'
  | 'observation_updated'
  | 'verification_updated'
  | 'recovery_required'
  | 'unknown_state'
  | 'turn_completed'
  | 'interrupted'
  | 'error'
  | 'stream_start'
  | 'stream_text'
  | 'stream_end'
  | 'status_change'
  | 'handoff_started'
  | 'handoff_completed'
  | 'handoff_failed'
  | 'window_mode_changed'
  | 'workspace_changed'
  | 'project_changed'
  | 'reasoning_session_started'
  | 'reasoning_cycle_started'
  | 'reasoning_action_proposed'
  | 'reasoning_action_rejected'
  | 'reasoning_workflow_started'
  | 'reasoning_workflow_completed'
  | 'reasoning_verification_completed'
  | 'reasoning_provider_fallback'
  | 'reasoning_need_info'
  | 'reasoning_error'
  | 'reasoning_completed'
  | 'reasoning_cancelled'
  | 'reasoning_budget_exhausted';


export interface DirectorEvent {
  type: DirectorEventType;
  payload?: any;
}

export type DirectorEventHandler = (event: DirectorEvent) => void;

class RezelDirectorImpl {
  private modeManager = new ModeManager();
  private intentRouter = new IntentRouter();
  private sessionManager = new ApplicationSessionManager();
  private conversationManager = new ConversationManager();
  private handoffController = new HandoffController();
  private contextManager = new ContextManager(
    this.modeManager,
    this.intentRouter,
    this.sessionManager,
    this.conversationManager
  );

  private listeners = new Set<DirectorEventHandler>();
  private activeWorkflowId: string | null = null;

  constructor() {
    this.modeManager.init();
    WorkspaceManager.initialize().catch(console.error);
    this.setupAgentCoreListeners();
    this.setupWorkflowListeners();
    this.setupHandoffListeners();
    this.setupWorkspaceListeners();
  }

  // --- Public API ---

  async send(input: string): Promise<string> {
    const trimmedInput = input.trim();
    this.emit({ type: 'turn_started', payload: { input: trimmedInput } });

    // Handle explicit user-authorized mode change commands
    const lowerInput = trimmedInput.toLowerCase().replace(/[.!?,]$/, '');
    if (lowerInput === 'switch to creator mode' || lowerInput === 'enable creator mode') {
      this.setMode('CREATOR');
      const response = 'Switched to Creator mode.';
      this.recordConversationTurn(trimmedInput, response);
      this.emit({ type: 'turn_completed', payload: { result: response } });
      return response;
    }
    if (lowerInput === 'switch to developer mode' || lowerInput === 'enable developer mode') {
      this.setMode('DEVELOPER');
      const response = 'Switched to Developer mode.';
      this.recordConversationTurn(trimmedInput, response);
      this.emit({ type: 'turn_completed', payload: { result: response } });
      return response;
    }
    if (lowerInput === 'go back to friendly mode' || lowerInput === 'switch to friendly mode' || lowerInput === 'enable friendly mode') {
      this.setMode('FRIENDLY');
      const response = 'Switched to Friendly mode.';
      this.recordConversationTurn(trimmedInput, response);
      this.emit({ type: 'turn_completed', payload: { result: response } });
      return response;
    }
    if (lowerInput === 'clear persistent mode' || lowerInput === 'reset mode' || lowerInput === 'go back to automatic mode') {
      this.clearPersistentMode();
      const response = 'Returned to contextual/automatic mode.';
      this.recordConversationTurn(trimmedInput, response);
      this.emit({ type: 'turn_completed', payload: { result: response } });
      return response;
    }

    // 1. Build context (which also updates contextual mode and resolves project context)
    const context = this.contextManager.buildContext(trimmedInput, this.activeWorkflowId);
    console.info(`[CHAT_TRACE] { stage: 'rezel_director_received', inputLength: ${trimmedInput.length}, intent: '${context.intent}', mode: '${context.mode}' }`);
    
    // Emit updates if they changed
    this.emit({ type: 'intent_detected', payload: { intent: context.intent } });
    this.emit({ type: 'mode_changed', payload: { mode: context.mode } });
    this.emit({ type: 'profile_changed', payload: { profile: context.experienceProfile } });

    try {
      // Route CREATIVE_AUTOMATION or explicit application workflows to Reasoning Bridge
      if (this.shouldRouteToReasoning(trimmedInput, context)) {
        console.info(`[CHAT_TRACE] { stage: 'route_to_reasoning', input: '${trimmedInput.slice(0, 30)}...' }`);
        this.emit({ type: 'status_change', payload: { status: 'thinking' } });
        try {
          const { result } = await this.sendToReasoning(trimmedInput);
          
          let responseSummary = 'Automation completed successfully.';
          if (result?.summary) {
            responseSummary = result.summary;
          } else if (result?.workflowOutcome) {
            responseSummary = `Workflow finished with status: ${result.workflowOutcome}.`;
            if (result.verificationSummary?.description) {
              responseSummary += ` Verification: ${result.verificationSummary.description}`;
            }
          }
          
          this.recordConversationTurn(trimmedInput, responseSummary);
          this.emit({ type: 'status_change', payload: { status: 'idle' } });
          this.emit({ type: 'turn_completed', payload: { result: responseSummary } });
          return responseSummary;
        } catch (reasoningErr: any) {
          console.warn('[RezelDirector] Reasoning bridge unavailable, falling back to AgentCore:', reasoningErr?.message);
        }
      }

      // 2. Delegate ordinary conversation/research to AgentCore
      console.info(`[CHAT_TRACE] { stage: 'delegating_to_agent_core', inputLength: ${trimmedInput.length} }`);
      const result = await AgentCore.send(trimmedInput, context);
      console.info(`[CHAT_TRACE] { stage: 'agent_core_completed', resultLength: ${result?.length || 0} }`);
      this.emit({ type: 'turn_completed', payload: { result } });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(`[CHAT_TRACE] { stage: 'rezel_director_error', error: '${msg}', stack: '${stack}' }`);
      this.emit({ type: 'error', payload: { error: msg } });
      this.emit({ type: 'status_change', payload: { status: 'error' } });
      throw err;
    }
  }

  private shouldRouteToReasoning(input: string, context: ContextSnapshot): boolean {
    // Only route action-oriented CREATIVE_AUTOMATION tasks to the reasoning bridge
    if (context.intent === 'CREATIVE_AUTOMATION') {
      const lower = input.toLowerCase();
      // Informational queries (even if mentioning Blender) stay with AgentCore
      const isExplanatory = /^(explain|what is|what are|how does|how do|why is|why does|tell me about|describe)\b/i.test(lower);
      if (!isExplanatory) {
        return true;
      }
    }
    return false;
  }

  private recordConversationTurn(userInput: string, assistantOutput: string): void {
    let convId = this.getConversationId();
    if (!convId) {
      convId = this.startConversation();
    }
    const userMsg: import('../ai/types').Message = {
      role: 'user',
      content: userInput,
      timestamp: new Date().toISOString(),
    };
    const assistantMsg: import('../ai/types').Message = {
      role: 'assistant',
      content: assistantOutput,
      timestamp: new Date().toISOString(),
    };
    LocalMemory.appendMessage(convId, userMsg);
    LocalMemory.appendMessage(convId, assistantMsg);
    LocalMemory.save().catch(console.error);
  }

  async sendToReasoning(goal: string, options?: any): Promise<any> {
    const { ExternalReasoningOrchestrator } = await import('../reasoning/ExternalReasoningOrchestrator.js');
    const orchestrator = new ExternalReasoningOrchestrator();
    const activeProject = this.getActiveProject();

    const session = orchestrator.createSession({
      goal,
      projectId: activeProject?.id,
      providerId: options?.providerId ?? 'gemini-default',
      ...options,
    });

    this.emit({ type: 'reasoning_session_started', payload: { session: session.toRecord() } });

    try {
      const result = await orchestrator.executeCycle(session, options?.signal);
      this.emit({ type: 'reasoning_completed', payload: { session: session.toRecord(), result } });
      return { session: session.toRecord(), result };
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit({ type: 'reasoning_error', payload: { error: msg, session: session.toRecord() } });
      throw err;
    }
  }


  interrupt(): void {
    // Abort LLM generation
    AgentCore.abort();
    
    // Abort active workflow if any
    if (this.activeWorkflowId) {
      WorkflowRuntime.cancel(this.activeWorkflowId);
    }
    
    this.emit({ type: 'interrupted' });
  }

  getContext(): ContextSnapshot {
    return this.contextManager.buildContext('', this.activeWorkflowId);
  }

  getCurrentMode(): Mode {
    return this.modeManager.getEffectiveMode();
  }
  
  getMode(): Mode {
    return this.modeManager.getEffectiveMode();
  }

  getExperienceProfile() {
    return this.getContext().experienceProfile;
  }

  setMode(mode: Mode): void {
    this.modeManager.setPersistentMode(mode);
    const context = this.getContext();
    this.emit({ type: 'mode_changed', payload: { mode: context.mode } });
    this.emit({ type: 'profile_changed', payload: { profile: context.experienceProfile } });
  }

  clearPersistentMode(): void {
    this.modeManager.setPersistentMode(null);
    const context = this.getContext();
    this.emit({ type: 'mode_changed', payload: { mode: context.mode } });
    this.emit({ type: 'profile_changed', payload: { profile: context.experienceProfile } });
  }

  getCurrentIntent(): Intent | null {
    return this.getContext().intent;
  }

  startConversation(title?: string, projectId?: string): string {
    return this.conversationManager.startConversation(title, projectId);
  }

  loadConversation(id: string): boolean {
    return this.conversationManager.loadConversation(id);
  }

  getConversationId(): string | null {
    return this.conversationManager.getActiveConversationId();
  }

  getMessages(): import('../ai/types').Message[] {
    const id = this.getConversationId();
    if (!id) return [];
    return LocalMemory.getMessages(id);
  }

  // --- Workspace & Project Context ---

  getWorkspaceManager(): WorkspaceManagerImpl {
    return WorkspaceManager;
  }

  getProjectManager(): ProjectManagerImpl {
    return ProjectManager;
  }

  getActiveWorkspace(): Workspace {
    return WorkspaceManager.getActiveWorkspace();
  }

  getActiveProject(): Project | null {
    return WorkspaceManager.getActiveProject();
  }

  switchProject(projectId: string | null): {
    previousProjectId: string | null;
    currentProjectId: string | null;
    project: Project | null;
  } {
    const result = WorkspaceManager.switchProject(projectId);
    this.emit({ type: 'project_changed', payload: result });
    return result;
  }

  // --- Handoff & Window Management ---

  async enterCompanionMode(targetAppId?: string): Promise<void> {
    const session = this.sessionManager.getForegroundSession();
    await this.handoffController.enterCompanionMode(targetAppId, session);
  }

  async restoreFullMode(): Promise<void> {
    await this.handoffController.restoreFullMode();
  }

  getWindowState(): WindowState {
    return this.handoffController.getWindowState();
  }

  getHandoffState(): HandoffState {
    return this.handoffController.getHandoffState();
  }

  getHandoffController(): HandoffController {
    return this.handoffController;
  }

  getApplicationSessionManager(): ApplicationSessionManager {
    return this.sessionManager;
  }

  subscribe(handler: DirectorEventHandler): void {
    this.listeners.add(handler);
  }

  unsubscribe(handler: DirectorEventHandler): void {
    this.listeners.delete(handler);
  }

  // --- Internals ---

  private emit(event: DirectorEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private setupWorkspaceListeners(): void {
    WorkspaceManager.subscribe((event) => {
      if (event.type === 'active_workspace_changed' || event.type === 'workspace_created' || event.type === 'workspace_updated') {
        this.emit({ type: 'workspace_changed', payload: event.payload });
      } else if (event.type === 'active_project_changed') {
        this.emit({ type: 'project_changed', payload: event.payload });
      }
    });
  }

  private setupHandoffListeners(): void {
    this.handoffController.subscribe((event) => {
      if (event.type === 'window_mode_changed') {
        this.emit({ type: 'window_mode_changed', payload: event.payload });
      } else if (event.type === 'handoff_started') {
        this.emit({ type: 'handoff_started', payload: event.payload });
      } else if (event.type === 'handoff_completed') {
        this.emit({ type: 'handoff_completed', payload: event.payload });
      } else if (event.type === 'handoff_failed') {
        this.emit({ type: 'handoff_failed', payload: event.payload });
      }
    });
  }

  private setupAgentCoreListeners(): void {
    AgentCore.addEventHandler((event) => {
      // Forward text and status for UI
      if (event.type === 'stream_start') {
        this.emit({ type: 'stream_start' });
      } else if (event.type === 'stream_text') {
        this.emit({ type: 'stream_text', payload: { text: event.text } });
      } else if (event.type === 'stream_end') {
        this.emit({ type: 'stream_end' });
      } else if (event.type === 'status_change') {
        this.emit({ type: 'status_change', payload: { status: event.status } });
      } else if (event.type === 'stream_error') {
        this.emit({ type: 'error', payload: { error: event.error } });
      }
    });
  }

  private setupWorkflowListeners(): void {
    WorkflowRuntime.addEventHandler((event) => {
      if (!event.workflowId) return;

      this.activeWorkflowId = event.workflowId;

      if (event.type === 'PLAN_STARTED') {
        this.emit({ type: 'workflow_started', payload: { workflowId: event.workflowId } });
      }
      
      this.emit({ type: 'workflow_progress', payload: { event } });

      const workflow = WorkflowRuntime.get(event.workflowId);
      if (!workflow) return;

      // Associate workflow with active project if not already linked
      const activeProject = WorkspaceManager.getActiveProject();
      if (activeProject) {
        ProjectManager.associateWorkflow(activeProject.id, event.workflowId);
      }

      const step = event.stepId ? workflow.plan.steps.find(s => s.id === event.stepId) : undefined;
      
      if (step) {
        if (step.observationResult) {
          this.emit({ type: 'observation_updated', payload: { step } });
        }
        if (step.verificationResult) {
          this.emit({ type: 'verification_updated', payload: { step } });
        }
        if (step.executionOutcome === 'UNKNOWN') {
          this.emit({ type: 'unknown_state', payload: { step } });
        }
      }

      if (
        event.type === 'PLAN_RECOVERY_REQUIRED' ||
        event.type === 'PLAN_SUCCEEDED' ||
        event.type === 'PLAN_FAILED' ||
        event.type === 'PLAN_CANCELLED'
      ) {
        if (workflow.status === 'RECOVERY_REQUIRED') {
          this.emit({ type: 'recovery_required', payload: { workflow } });
        }
        if (workflow.status === 'SUCCEEDED' || workflow.status === 'FAILED' || workflow.status === 'CANCELLED') {
          this.activeWorkflowId = null;
        }
      }
    });
  }
}

export const RezelDirector = new RezelDirectorImpl();
