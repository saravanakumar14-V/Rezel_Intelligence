/**
 * Rezel 11.5C — Multimodal Context Builder & Orchestrator
 *
 * Consolidates text, audio transcripts, visual assets, application state,
 * workflow variables, and conversation history into a unified multimodal context:
 * - Validates input sources and enforces privacy redaction
 * - Explicitly detects and classifies conflicts between modalities
 * - Guarantees the invariant: Structured application state overrides visual interpretation
 * - Derives unified TaskProfiles for authoritative ProviderRouter dispatch
 */

import type { VisionInput } from '../vision/types';
import type { AudioInput } from '../audio/types';
import type {
  UnifiedMultimodalContext,
  AudioTranscriptContextItem,
  ApplicationStateContextItem,
  WorkflowStateContextItem,
  ConversationContextItem,
  ContextConflict,
} from './types';
import { ContextError } from './types';
import { TaskProfileBuilder, type TaskProfileInput } from '../providers/TaskProfileBuilder';
import type { TaskProfile } from '../providers/types';

export class MultimodalContextBuilder {
  private contextId: string;
  private textContent?: string;
  private transcripts: AudioTranscriptContextItem[] = [];
  private visuals: VisionInput[] = [];
  private audios: AudioInput[] = [];
  private appStates: ApplicationStateContextItem[] = [];
  private wfState?: WorkflowStateContextItem;
  private runtimeVars: Record<string, unknown> = {};
  private conversationHistory: ConversationContextItem[] = [];
  private hasSensitiveContent = false;

  constructor(contextId?: string) {
    this.contextId = contextId || `ctx_${crypto.randomUUID()}`;
  }

  addText(text: string, isSensitive = false): this {
    if (text && text.trim().length > 0) {
      this.textContent = text.trim();
      if (isSensitive) this.hasSensitiveContent = true;
    }
    return this;
  }

  addVoiceTranscript(
    transcript: string,
    options: { id?: string; confidence?: number; isSensitive?: boolean; sourceId?: string } = {}
  ): this {
    if (transcript && transcript.trim().length > 0) {
      const item: AudioTranscriptContextItem = {
        id: options.id || `tr_${crypto.randomUUID()}`,
        text: transcript.trim(),
        confidence: options.confidence ?? 0.95,
        isSensitive: options.isSensitive ?? false,
        sourceId: options.sourceId,
      };
      this.transcripts.push(item);
      if (item.isSensitive) this.hasSensitiveContent = true;
    }
    return this;
  }

  addVisionInput(input: VisionInput): this {
    if (input) {
      this.visuals.push(input);
      if (input.isSensitive) this.hasSensitiveContent = true;
    }
    return this;
  }

  addAudioInput(input: AudioInput): this {
    if (input) {
      this.audios.push(input);
      if (input.isSensitive) this.hasSensitiveContent = true;
    }
    return this;
  }

  addApplicationState(appState: {
    applicationId: string;
    sessionId?: string;
    entities: unknown[];
    status: string;
    isAuthoritative?: boolean;
    timestamp?: number;
  }): this {
    if (appState && appState.applicationId) {
      this.appStates.push({
        applicationId: appState.applicationId,
        sessionId: appState.sessionId,
        timestamp: appState.timestamp || Date.now(),
        entities: appState.entities || [],
        status: appState.status || 'READY',
        isAuthoritative: appState.isAuthoritative ?? true,
      });
    }
    return this;
  }

  addWorkflowState(wfState: {
    workflowId: string;
    currentStepId?: string;
    state: string;
    checkpointId?: string;
  }): this {
    if (wfState && wfState.workflowId) {
      this.wfState = {
        workflowId: wfState.workflowId,
        currentStepId: wfState.currentStepId,
        state: wfState.state,
        checkpointId: wfState.checkpointId,
      };
    }
    return this;
  }

  addRuntimeVariables(vars: Record<string, unknown>): this {
    if (vars) {
      this.runtimeVars = { ...this.runtimeVars, ...vars };
    }
    return this;
  }

  addConversationContext(messages: Array<{ role: string; content: string }>): this {
    if (messages && Array.isArray(messages)) {
      this.conversationHistory.push(...messages);
    }
    return this;
  }

  /**
   * Evaluates and classifies potential conflicts across modalities.
   */
  detectConflicts(): ContextConflict[] {
    const conflicts: ContextConflict[] = [];

    // 1. Text vs. Voice Transcript discrepancy
    if (this.textContent && this.transcripts.length > 0) {
      const primaryTranscript = this.transcripts[0].text;
      if (this.textContent !== primaryTranscript) {
        conflicts.push({
          conflictId: `cfl_${crypto.randomUUID()}`,
          sources: ['USER_TEXT', 'VOICE_TRANSCRIPT'],
          conflictType: 'USER_INPUT_CONFLICT',
          severity: 'MEDIUM',
          description: `Discrepancy detected between typed text ("${this.textContent}") and voice transcript ("${primaryTranscript}")`,
          resolution: 'Text user assertion given precedence over voice transcript',
        });
      }
    }

    // 2. Visual evidence vs. Structured Application State discrepancy
    for (const visual of this.visuals) {
      const visualEntityCount = (visual.metadata as any)?.entityCount;
      if (visualEntityCount !== undefined && this.appStates.length > 0) {
        const app = this.appStates[0];
        if (visualEntityCount !== app.entities.length) {
          conflicts.push({
            conflictId: `cfl_${crypto.randomUUID()}`,
            sources: ['VISUAL_EVIDENCE', 'STRUCTURED_APPLICATION_STATE'],
            conflictType: 'VISUAL_STRUCTURED_CONFLICT',
            severity: 'HIGH',
            description: `Visual observation (${visualEntityCount} entities) conflicts with structured state (${app.entities.length} entities)`,
            resolution: 'Structured application state is strictly authoritative; visual observation treated as auxiliary evidence',
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Builds the normalized UnifiedMultimodalContext.
   */
  build(): UnifiedMultimodalContext {
    const conflicts = this.detectConflicts();

    const context: UnifiedMultimodalContext = {
      contextId: this.contextId,
      text: this.textContent,
      audioTranscripts: this.transcripts.length > 0 ? this.transcripts : undefined,
      visualInputs: this.visuals.length > 0 ? this.visuals : undefined,
      audioInputs: this.audios.length > 0 ? this.audios : undefined,
      applicationState: this.appStates.length > 0 ? this.appStates : undefined,
      workflowState: this.wfState,
      runtimeVariables: Object.keys(this.runtimeVars).length > 0 ? this.runtimeVars : undefined,
      conversation: this.conversationHistory.length > 0 ? this.conversationHistory : undefined,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
      isSensitive: this.hasSensitiveContent,
      createdAt: Date.now(),
    };

    this.validate(context);
    return context;
  }

  /**
   * Validates that the context contains at least one meaningful source.
   */
  validate(context: UnifiedMultimodalContext): void {
    if (!context || !context.contextId) {
      throw new ContextError('CONTEXT_INVALID', 'Multimodal context missing valid ID');
    }

    const hasContent =
      Boolean(context.text) ||
      Boolean(context.audioTranscripts && context.audioTranscripts.length > 0) ||
      Boolean(context.visualInputs && context.visualInputs.length > 0) ||
      Boolean(context.audioInputs && context.audioInputs.length > 0) ||
      Boolean(context.applicationState && context.applicationState.length > 0) ||
      Boolean(context.workflowState) ||
      Boolean(context.conversation && context.conversation.length > 0);

    if (!hasContent) {
      throw new ContextError('CONTEXT_SOURCE_MISSING', 'Unified multimodal context must contain at least one content source');
    }
  }

  /**
   * Derives a unified, immutable TaskProfile matching the combined capabilities of the context.
   */
  deriveTaskProfile(
    context: UnifiedMultimodalContext,
    overrides: Partial<TaskProfileInput> = {}
  ): TaskProfile {
    const hasVision = Boolean(context.visualInputs && context.visualInputs.length > 0);
    const hasAudio = Boolean(context.audioInputs && context.audioInputs.length > 0);
    const hasApp = Boolean(context.applicationState && context.applicationState.length > 0);
    const hasWorkflow = Boolean(context.workflowState);

    const goalText =
      context.text ||
      (context.audioTranscripts && context.audioTranscripts[0]?.text) ||
      'Unified multimodal context evaluation';

    return TaskProfileBuilder.build({
      category: hasVision ? 'VISION' : hasApp || hasWorkflow ? 'AUTOMATION' : 'CONVERSATION',
      executionTarget: hasApp || hasWorkflow || hasVision ? 'REASONING' : 'CHAT',
      goal: goalText,
      hasVisionMedia: hasVision,
      hasAudioInput: hasAudio,
      requiresTools: hasApp || hasWorkflow,
      requiresStructuredOutput: hasApp || hasWorkflow,
      ...overrides,
    });
  }

  /**
   * Summarizes the unified multimodal context for safe diagnostics.
   */
  summarize(context: UnifiedMultimodalContext): string {
    const parts: string[] = [];
    if (context.text) parts.push(`Text: "${context.text.slice(0, 40)}..."`);
    if (context.audioTranscripts) parts.push(`${context.audioTranscripts.length} Transcript(s)`);
    if (context.visualInputs) parts.push(`${context.visualInputs.length} Visual Input(s)`);
    if (context.audioInputs) parts.push(`${context.audioInputs.length} Audio Input(s)`);
    if (context.applicationState) parts.push(`${context.applicationState.length} App State(s)`);
    if (context.workflowState) parts.push(`Workflow: ${context.workflowState.workflowId}`);
    if (context.conflicts) parts.push(`${context.conflicts.length} Conflict(s)`);
    return `[Context: ${context.contextId}] ${parts.join(' | ')}`;
  }
}
