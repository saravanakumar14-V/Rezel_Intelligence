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
import { AIToolExecutor } from './ToolExecutor';
import { ToolRegistry, BUILT_IN_TOOLS } from './ToolRegistry';
import { LocalMemory } from '../memory/LocalMemory';
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
  private onEvent: AgentEventHandler | null = null;
  private conversationId: string | null = null;
  private status: AgentStatus = 'idle';
  private abortController: AbortController | null = null;
  private initialized = false;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * init
   *
   * Called once on app startup. Registers built-in tools and loads memory.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Register built-in tools
    ToolRegistry.registerMany(BUILT_IN_TOOLS);

    // Load persistent memory
    await LocalMemory.load();

    this.initialized = true;

    if (import.meta.env.DEV) {
      console.info(
        `[AgentCore] Initialized — ${ToolRegistry.size} tools registered, ` +
        `memory: ${LocalMemory.stats().conversations} conversations, ` +
        `${LocalMemory.stats().entries} entries`
      );
    }
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  /**
   * setEventHandler
   * Called by the React layer to receive streaming updates.
   */
  setEventHandler(handler: AgentEventHandler | null): void {
    this.onEvent = handler;
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
  async send(content: string): Promise<string> {
    if (!this.initialized) await this.init();

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
      const response = await this.conversationLoop(this.abortController.signal);
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
  private async conversationLoop(signal: AbortSignal): Promise<string> {
    let finalText = '';
    const tools = ToolRegistry.getAll();

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const messages = this.getMessages();

      this.setStatus(round === 0 ? 'streaming' : 'thinking');
      this.emit({ type: 'stream_start' });

      let roundText = '';
      const toolCalls: ToolCall[] = [];

      // Stream the AI response
      const stream = this.provider.chat(messages, {
        tools: tools.length > 0 ? tools : undefined,
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
              toolCalls.push(chunk.toolCall);
              this.emit({ type: 'stream_tool_call', toolCall: chunk.toolCall });
            }
            break;

          case 'error':
            throw new Error(chunk.error ?? 'Unknown streaming error');

          case 'done':
            break;
        }
      }

      // If no tool calls, this is the final response
      if (toolCalls.length === 0) {
        finalText = roundText;

        const assistantMsg: Message = {
          role: 'assistant',
          content: roundText,
          timestamp: new Date().toISOString(),
        };
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
        const { toolResult } = await AIToolExecutor.execute(call);
        toolResults.push(toolResult);
        this.emit({ type: 'stream_tool_result', toolResult });
      }

      // Append tool results as a tool message
      const toolMsg: Message = {
        role: 'tool',
        content: toolResults.map((r) => `[${r.name}]: ${r.output}`).join('\n'),
        toolResults,
        timestamp: new Date().toISOString(),
      };
      LocalMemory.appendMessage(this.conversationId!, toolMsg);

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
    this.onEvent?.(event);
  }
}

/** Singleton — import and use directly. */
export const AgentCore = new AgentCoreImpl();
