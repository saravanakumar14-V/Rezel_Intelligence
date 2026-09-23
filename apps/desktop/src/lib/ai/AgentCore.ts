/**
 * AgentCore
 *
 * Central AI orchestration engine for Rezel.
 *
 * Responsibilities:
 *  - Provider management (currently Gemini; pluggable)
 *  - Conversation state management
 *  - Streaming response pipeline with tool-call handling
 *  - Planner integration for multi-step tasks
 *  - Memory integration (load/save via LocalMemory)
 *  - Tool registration on init
 *
 * Data flow:
 *  User message → AgentCore.send()
 *    → GeminiProvider.chat() (streaming)
 *      → if tool_call → AIToolExecutor → SecurityToolExecutor → Tauri backend
 *      → tool results fed back to provider for next turn
 *    → final text response → UI callback
 *    → LocalMemory.save()
 */

import { GeminiProvider } from './GeminiProvider';
import { ProviderRouter } from './providers/ProviderRouter';
import { TaskProfileBuilder } from './providers/TaskProfileBuilder';
import { AIToolExecutor } from './ToolExecutor';
import { ToolRegistry, BUILT_IN_TOOLS } from './ToolRegistry';
import { LocalMemory } from '../memory/LocalMemory';
import { BlenderProcessProvider } from './capabilities/providers/BlenderProcessProvider';
import type {
  AIProvider,
  Message,
  ToolCall,
  ToolResult,
  ToolDefinition,
} from './types';

// ─── Event types ──────────────────────────────────────────────────────────────

export type AgentEventType =
  | 'stream_start'
  | 'stream_text'
  | 'stream_tool_call'
  | 'stream_tool_result'
  | 'stream_end'
  | 'stream_error'
  | 'status_change';

export interface AgentEvent {
  type: AgentEventType;
  text?: string;
  toolCall?: ToolCall;
  toolResult?: ToolResult;
  error?: string;
  status?: AgentStatus;
}

export type AgentStatus = 'idle' | 'thinking' | 'streaming' | 'tool_executing' | 'error';

type AgentEventHandler = (event: AgentEvent) => void;

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum tool-call rounds per single user message (prevents infinite loops). */
const MAX_TOOL_ROUNDS = 5;

// ─── Implementation ───────────────────────────────────────────────────────────

class AgentCoreImpl {
  private provider: AIProvider = GeminiProvider;
  private listeners: Set<AgentEventHandler> = new Set();
  private conversationId: string | null = null;
  private status: AgentStatus = 'idle';
  private abortController: AbortController | null = null;
  private initialized = false;
  private activeSendPromise: Promise<string> | null = null;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * init
   *
   * Called once on app startup. Registers built-in tools and loads memory.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    // Register built-in tools
    ToolRegistry.registerMany(BUILT_IN_TOOLS);

    // Initialize Capability Providers
    const { CapabilityProviderRegistry } = await import('./capabilities/CapabilityProviderRegistry');
    const { ToolCapabilityAdapterProvider } = await import('./capabilities/ToolCapabilityAdapter');
    const { BuiltinProvider } = await import('./capabilities/providers/BuiltinProvider');
    const { FilesystemProvider } = await import('./capabilities/providers/FilesystemProvider');
    
    if (!CapabilityProviderRegistry.has('legacy-tool-adapter')) {
      CapabilityProviderRegistry.register(new ToolCapabilityAdapterProvider());
    }
    if (!CapabilityProviderRegistry.has('provider.builtin')) {
      CapabilityProviderRegistry.register(new BuiltinProvider());
    }
    if (!CapabilityProviderRegistry.has('filesystem')) {
      CapabilityProviderRegistry.register(FilesystemProvider);
    }
    if (!CapabilityProviderRegistry.has('blender_process_provider')) {
      CapabilityProviderRegistry.register(new BlenderProcessProvider());
    }

    // Initialize the dynamic application capability registry
    const { ApplicationCapabilityRegistry } = await import('./ApplicationCapabilityRegistry');
    await ApplicationCapabilityRegistry.init();

    // Load persistent memory
    await LocalMemory.load();

    if (import.meta.env?.DEV) {
      console.info(
        `[AgentCore] Initialized — ${ToolRegistry.size} tools registered, ` +
        `memory: ${LocalMemory.stats().conversations} conversations, ` +
        `${LocalMemory.stats().entries} entries`
      );
    }
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  /**
   * addEventHandler
   * Add a listener for agent events.
   */
  addEventHandler(handler: AgentEventHandler): void {
    this.listeners.add(handler);
  }

  /**
   * removeEventHandler
   * Remove a listener for agent events.
   */
  removeEventHandler(handler: AgentEventHandler): void {
    this.listeners.delete(handler);
  }

  /**
   * setEventHandler (legacy)
   * Provided for backward compatibility. Replaces all existing listeners.
   */
  setEventHandler(handler: AgentEventHandler | null): void {
    this.listeners.clear();
    if (handler) this.listeners.add(handler);
  }

  /**
   * getProvider
   * Returns current AI provider instance.
   */
  getProvider(): AIProvider {
    return this.provider;
  }

  /**
   * setProvider
   * Swap the AI provider at runtime (e.g. switch to Ollama).
   */
  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  /**
   * registerTool
   * Dynamically add a tool to the registry.
   */
  registerTool(tool: ToolDefinition): void {
    ToolRegistry.register(tool);
  }

  /** Returns the current agent status. */
  getStatus(): AgentStatus {
    return this.status;
  }

  /** Returns the current conversation ID (null if no active conversation). */
  getConversationId(): string | null {
    return this.conversationId;
  }

  // ── Conversation management ───────────────────────────────────────────────

  /**
   * startConversation
   * Creates a new conversation in memory.
   */
  startConversation(title?: string): string {
    this.conversationId = LocalMemory.createConversation(
      title ?? `Conversation ${new Date().toLocaleString()}`
    );
    return this.conversationId;
  }

  /**
   * loadConversation
   * Switches to an existing conversation by ID.
   */
  loadConversation(id: string): boolean {
    const conv = LocalMemory.getConversation(id);
    if (!conv) return false;
    this.conversationId = id;
    return true;
  }

  /**
   * getMessages
   * Returns messages for the current conversation.
   */
  getMessages(): Message[] {
    if (!this.conversationId) return [];
    return LocalMemory.getMessages(this.conversationId);
  }

  // ── Send message ──────────────────────────────────────────────────────────

  /**
   * send
   *
   * Main entry point. Sends a user message to the AI and streams the response.
   *
   * Flow:
   *  1. Append user message to conversation
   *  2. Stream AI response (text chunks + tool calls)
   *  3. If tool calls: execute via AIToolExecutor, append results, recurse
   *  4. Append final assistant message
   *  5. Persist to memory
   *
   * @param content  User message text
   * @returns        The complete assistant response text
   */
  async send(content: string, context?: import('../director/types').ContextSnapshot): Promise<string> {
    if (!this.initialized) await this.init();

    // R-01: Serialize sends. Wait for the previous send to fully settle
    // before starting the new one. This prevents two conversation loops
    // from concurrently mutating LocalMemory.
    if (this.activeSendPromise) {
      try {
        await this.activeSendPromise;
      } catch {
        // Previous send errored — that's fine, we still proceed.
      }
    }

    const sendPromise = this.executeSend(content, context);
    this.activeSendPromise = sendPromise;

    try {
      return await sendPromise;
    } finally {
      // Only clear if we are still the active send
      if (this.activeSendPromise === sendPromise) {
        this.activeSendPromise = null;
      }
    }
  }

  private async executeSend(content: string, context?: import('../director/types').ContextSnapshot): Promise<string> {
    if (context?.conversationId) {
      this.conversationId = context.conversationId;
    }

    // Ensure we have an active conversation
    if (!this.conversationId) {
      this.startConversation();
    }

    // Append user message
    const userMsg: Message = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    LocalMemory.appendMessage(this.conversationId!, userMsg);

    // Run the streaming conversation loop
    this.setStatus('thinking');
    this.abortController = new AbortController();

    try {
      const response = await this.conversationLoop(this.abortController.signal, context);
      await LocalMemory.save();
      return response;
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.setStatus('error');
      this.emit({ type: 'stream_error', error: errorMsg });
      return `Error: ${errorMsg}`;
    } finally {
      this.abortController = null;
      this.setStatus('idle');
    }
  }

  /**
   * abort
   * Cancels the current streaming response.
   */
  abort(): void {
    this.abortController?.abort();
    this.setStatus('idle');
  }

  // ── Conversation loop ─────────────────────────────────────────────────────

  /**
   * conversationLoop
   *
   * Handles the multi-round conversation with tool calls.
   * Each round: stream AI response → execute tool calls → feed results back.
   * Capped at MAX_TOOL_ROUNDS to prevent infinite loops.
   */
  private async conversationLoop(signal: AbortSignal, context?: import('../director/types').ContextSnapshot): Promise<string> {
    let finalText = '';
    
    // Import CapabilityRegistry dynamically to avoid initialization issues
    const { CapabilityRegistry } = await import('./capabilities/CapabilityRegistry');
    const tools = CapabilityRegistry.getAll();

    let systemPrompt: string | undefined;
    if (context?.experienceProfile) {
      const profile = context.experienceProfile;
      const behavior = profile.behavior;
      const prefs = profile.toolPreferences;
      
      systemPrompt = `You are Rezel, a dynamic AI assistant.

Mode: ${profile.displayName}
Style: ${behavior.communicationStyle}, ${behavior.verbosity}, humor: ${behavior.humorLevel}
Priorities: ${prefs.preferredCategories.join(', ')} / ${prefs.preferredCapabilities.join(', ')}
Behavior: ${behavior.planningStyle}
${behavior.systemPromptExtension}

Intent detected: ${context.intent} (confidence: ${context.intentConfidence.toFixed(2)})
${context.activeApplication ? `Active Application: ${context.activeApplication.appId} (${context.activeApplication.connectionStatus})` : ''}
${context.activeWorkflowId ? `Active Workflow: ${context.activeWorkflowId}` : ''}`;
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const messages = this.getMessages();

      this.setStatus(round === 0 ? 'streaming' : 'thinking');
      this.emit({ type: 'stream_start' });

      let roundText = '';
      const toolCalls: ToolCall[] = [];

      let category: import('./providers/types').TaskCategory = 'CONVERSATION';
      if (context?.intent === 'CREATIVE_AUTOMATION' || context?.intent === 'SYSTEM_TASK') {
        category = 'AUTOMATION';
      } else if (context?.intent === 'CODING') {
        category = 'CODING';
      }

      const taskProfile = TaskProfileBuilder.build({
        category,
        executionTarget: 'CHAT',
        requiresTools: tools.length > 0,
        messagesCount: messages.length,
      });

      const unifiedMessages = messages.map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
        toolCalls: m.toolCalls,
        toolResults: m.toolResults,
      }));

      console.info(`[CHAT_TRACE] { stage: 'agent_core_loop_round', round: ${round}, messageCount: ${unifiedMessages.length}, availableTools: ${tools.length} }`);

      // Stream the AI response through ProviderRouter
      const stream = ProviderRouter.chat(taskProfile, unifiedMessages, {
        tools: tools.length > 0 ? tools : undefined,
        systemPrompt,
        signal,
      });

      for await (const chunk of stream) {
        if (signal.aborted) break;

        switch (chunk.type) {
          case 'text':
            roundText += chunk.text ?? '';
            this.emit({ type: 'stream_text', text: chunk.text });
            break;

          case 'tool_call':
            if (chunk.toolCall) {
              console.info(`[CHAT_TRACE] { stage: 'gemini_yielded_tool_call', round: ${round}, toolName: '${chunk.toolCall.name}' }`);
              toolCalls.push(chunk.toolCall);
              this.emit({ type: 'stream_tool_call', toolCall: chunk.toolCall });
            }
            break;

          case 'error':
            console.error(`[CHAT_TRACE] { stage: 'stream_chunk_error', round: ${round}, error: '${chunk.error}' }`);
            throw new Error(chunk.error ?? 'Unknown streaming error');

          case 'done':
            break;
        }
      }

      // If no tool calls, this is the final response (or it was interrupted)
      if (toolCalls.length === 0 || signal.aborted) {
        finalText = roundText;
        console.info(`[CHAT_TRACE] { stage: 'agent_core_final_turn_completed', round: ${round}, responseLength: ${roundText.length} }`);

        const assistantMsg: Message = {
          role: 'assistant',
          content: roundText,
          timestamp: new Date().toISOString(),
        };
        
        if (signal.aborted) {
          assistantMsg.interrupted = true;
        }

        LocalMemory.appendMessage(this.conversationId!, assistantMsg);

        this.emit({ type: 'stream_end' });
        break;
      }

      // Append the assistant message with tool calls
      const assistantMsg: Message = {
        role: 'assistant',
        content: roundText,
        toolCalls,
        timestamp: new Date().toISOString(),
      };
      LocalMemory.appendMessage(this.conversationId!, assistantMsg);

      // Execute tool calls
      this.setStatus('tool_executing');
      const toolResults: ToolResult[] = [];

      for (const call of toolCalls) {
        console.info(`[CHAT_TRACE] { stage: 'executing_tool_call', round: ${round}, toolName: '${call.name}' }`);
        if (call.name === 'create_workflow_plan') {
          try {
            // Import dynamically to avoid circular dependencies if any
            const { PlanEngine } = await import('./Planner');
            const { WorkflowRuntime } = await import('./WorkflowRuntime');
            const plan = PlanEngine.createPlan(call.args);
            
            const workflow = WorkflowRuntime.start(plan);
            
            toolResults.push({
              callId: call.id,
              name: call.name,
              success: true,
              output: `Workflow started. Workflow ID: ${workflow.id}. Status: RUNNING`,
            });
          } catch (err: unknown) {
            toolResults.push({
              callId: call.id,
              name: call.name,
              success: false,
              output: `Failed to create or execute workflow plan: ${err instanceof Error ? err.message : String(err)}`,
            });
          }
          this.emit({ type: 'stream_tool_result', toolResult: toolResults[toolResults.length - 1] });
        } else {
          const { toolResult } = await AIToolExecutor.execute(call, { signal });
          console.info(`[CHAT_TRACE] { stage: 'tool_execution_returned', round: ${round}, toolName: '${call.name}', success: ${toolResult.success}, outputLength: ${toolResult.output.length} }`);
          toolResults.push(toolResult);
          this.emit({ type: 'stream_tool_result', toolResult });
        }
      }

      // Append tool results as a tool message
      const toolMsg: Message = {
        role: 'tool',
        content: toolResults.map((r) => `[${r.name}]: ${r.output}`).join('\n'),
        toolResults,
        timestamp: new Date().toISOString(),
      };
      LocalMemory.appendMessage(this.conversationId!, toolMsg);
      console.info(`[CHAT_TRACE] { stage: 'tool_message_appended', round: ${round}, toolCount: ${toolResults.length} }`);

      // Loop continues — provider will see the tool results and continue
    }

    return finalText;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private setStatus(status: AgentStatus): void {
    this.status = status;
    this.emit({ type: 'status_change', status });
  }

  private emit(event: AgentEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

/** Singleton — import and use directly. */
export const AgentCore = new AgentCoreImpl();
