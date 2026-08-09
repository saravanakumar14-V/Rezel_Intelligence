/**
 * useChat
 *
 * React hook that wraps AgentCore for the Chat panel.
 *
 * Responsibilities:
 *  - Manages the current conversation messages (synced from AgentCore/LocalMemory)
 *  - Sends user messages via AgentCore.send()
 *  - Streams AI response text progressively via AgentCore events
 *  - Tracks sending/streaming/thinking state
 *  - Supports abort via AgentCore.abort()
 *  - Conversation creation and loading
 *
 * Event architecture:
 *  HomeScreen owns the AgentCore.setEventHandler() call (single handler).
 *  HomeScreen forwards events to useChat via the returned `handleAgentEvent`.
 *  This avoids the handler overwrite conflict between voice and chat.
 */

import { useState, useCallback, useRef } from 'react';
import { AgentCore } from '../lib/ai/AgentCore';
import type { AgentEvent, AgentStatus } from '../lib/ai/AgentCore';
import type { Message } from '../lib/ai/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseChatReturn {
  /** Current conversation messages. */
  messages: Message[];
  /** Text accumulated so far during streaming (partial assistant response). */
  streamingText: string;
  /** True while AgentCore is processing (thinking, streaming, or executing tools). */
  isProcessing: boolean;
  /** Current AgentCore status. */
  status: AgentStatus;
  /** Error message from the last failed send, or null. */
  error: string | null;
  /** Send a user message. */
  send: (content: string) => Promise<void>;
  /** Abort the current generation. */
  abort: () => void;
  /** Start a new conversation. */
  newConversation: () => void;
  /** Load an existing conversation by ID. */
  loadConversation: (id: string) => void;
  /** Current conversation ID, or null. */
  conversationId: string | null;
  /**
   * Forward AgentCore events into this hook.
   * HomeScreen calls this from its event handler so useChat can track
   * streaming text without owning the AgentCore event handler.
   */
  handleAgentEvent: (event: AgentEvent) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    AgentCore.getConversationId()
  );

  // Ref to accumulate streaming text without stale closure issues
  const streamAccRef = useRef('');

  // ── Sync messages from AgentCore ────────────────────────────────────────

  const refreshMessages = useCallback(() => {
    setMessages(AgentCore.getMessages());
  }, []);

  // ── Event handler (called by HomeScreen, not set directly on AgentCore) ─

  const handleAgentEvent = useCallback((event: AgentEvent) => {
    switch (event.type) {
      case 'stream_start':
        streamAccRef.current = '';
        setStreamingText('');
        setIsProcessing(true);
        break;

      case 'stream_text':
        if (event.text) {
          streamAccRef.current += event.text;
          setStreamingText(streamAccRef.current);
        }
        break;

      case 'stream_end':
        setStreamingText('');
        streamAccRef.current = '';
        refreshMessages();
        setIsProcessing(false);
        break;

      case 'stream_error':
        setError(event.error ?? 'Unknown error');
        setStreamingText('');
        streamAccRef.current = '';
        setIsProcessing(false);
        break;

      case 'status_change':
        if (event.status) {
          setStatus(event.status);
        }
        break;
    }
  }, [refreshMessages]);

  // ── Send ─────────────────────────────────────────────────────────────────

  const send = useCallback(async (content: string) => {
    if (!content.trim() || isProcessing) return;

    setError(null);

    // Optimistic: add user message to local state immediately
    const userMsg: Message = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      await AgentCore.send(content.trim());
      // After send completes, sync conversation ID if it was auto-created
      setConversationId(AgentCore.getConversationId());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  }, [isProcessing]);

  // ── Abort ────────────────────────────────────────────────────────────────

  const abort = useCallback(() => {
    AgentCore.abort();
    setStreamingText('');
    streamAccRef.current = '';
    setIsProcessing(false);
  }, []);

  // ── Conversation management ─────────────────────────────────────────────

  const newConversation = useCallback(() => {
    const id = AgentCore.startConversation();
    setConversationId(id);
    setMessages([]);
    setStreamingText('');
    setError(null);
  }, []);

  const loadConversation = useCallback((id: string) => {
    const ok = AgentCore.loadConversation(id);
    if (ok) {
      setConversationId(id);
      setMessages(AgentCore.getMessages());
      setStreamingText('');
      setError(null);
    }
  }, []);

  return {
    messages,
    streamingText,
    isProcessing,
    status,
    error,
    send,
    abort,
    newConversation,
    loadConversation,
    conversationId,
    handleAgentEvent,
  };
}
