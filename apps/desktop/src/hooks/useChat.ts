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

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

import type { AgentStatus } from '../lib/ai/AgentCore';
import { RezelDirector, type DirectorEvent } from '../lib/director/RezelDirector';
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
  handleAgentEvent: (event: DirectorEvent) => void;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<AgentStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(
    RezelDirector.getConversationId()
  );

  // Ref to accumulate streaming text without stale closure issues
  const streamAccRef = useRef('');
  const isProcessingRef = useRef(isProcessing);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useEffect(() => {
    setMessages(RezelDirector.getMessages());
  }, []);

  // ── Sync messages from AgentCore ────────────────────────────────────────

  const refreshMessages = useCallback(() => {
    setMessages(RezelDirector.getMessages());
  }, []);

  // ── Event handler (called by HomeScreen, not set directly on AgentCore) ─

  const handleAgentEvent = useCallback((event: DirectorEvent) => {
    switch (event.type) {
      case 'stream_start':
        console.info(`[CHAT_TRACE] { stage: 'use_chat_stream_start' }`);
        streamAccRef.current = '';
        setStreamingText('');
        setIsProcessing(true);
        break;

      case 'stream_text':
        if (event.payload?.text) {
          streamAccRef.current += event.payload.text;
          setStreamingText(streamAccRef.current);
        }
        break;

      case 'stream_end':
        console.info(`[CHAT_TRACE] { stage: 'use_chat_stream_end', totalStreamedLength: ${streamAccRef.current.length} }`);
        setStreamingText('');
        streamAccRef.current = '';
        refreshMessages();
        setIsProcessing(false);
        break;

      case 'error':
        console.error(`[CHAT_TRACE] { stage: 'use_chat_error_event', error: '${event.payload?.error}' }`);
        setError(event.payload?.error ?? 'Unknown error');
        setStreamingText('');
        streamAccRef.current = '';
        setIsProcessing(false);
        break;

      case 'status_change':
        if (event.payload?.status) {
          setStatus(event.payload.status);
        }
        break;
    }
  }, [refreshMessages]);

  // ── Send ─────────────────────────────────────────────────────────────────

  const send = useCallback(async (content: string) => {
    if (!content.trim() || isProcessingRef.current) return;

    setError(null);
    console.info(`[CHAT_TRACE] { stage: 'use_chat_send_dispatched', messageLength: ${content.trim().length} }`);

    // Optimistic: add user message to local state immediately
    const userMsg: Message = {
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const response = await RezelDirector.send(content.trim());
      console.info(`[CHAT_TRACE] { stage: 'use_chat_send_completed', responseLength: ${response?.length || 0} }`);
      // After send completes, sync conversation ID if it was auto-created
      setConversationId(RezelDirector.getConversationId());
      setMessages(RezelDirector.getMessages());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[CHAT_TRACE] { stage: 'use_chat_send_failed', error: '${msg}' }`);
      setError(msg);
      setMessages(RezelDirector.getMessages());
    }
  }, []);

  // ── Abort ────────────────────────────────────────────────────────────────

  const abort = useCallback(() => {
    RezelDirector.interrupt();
    setStreamingText('');
    streamAccRef.current = '';
    setIsProcessing(false);
  }, []);

  // ── Conversation management ─────────────────────────────────────────────

  const newConversation = useCallback(() => {
    const id = RezelDirector.startConversation();
    setConversationId(id);
    setMessages([]);
    setStreamingText('');
    setError(null);
  }, []);

  const loadConversation = useCallback((id: string) => {
    const ok = RezelDirector.loadConversation(id);
    if (ok) {
      setConversationId(id);
      setMessages(RezelDirector.getMessages());
      setStreamingText('');
      setError(null);
    }
  }, []);

  return useMemo(() => ({
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
  }), [
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
    handleAgentEvent
  ]);
}
