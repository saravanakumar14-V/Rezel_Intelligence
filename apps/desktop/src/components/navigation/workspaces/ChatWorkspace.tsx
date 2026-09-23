import React, { useEffect, useMemo } from 'react';
import { Sparkles, Plus, AlertCircle, Cpu } from 'lucide-react';
import { useChat } from '../../../hooks/useChat';
import { RezelDirector, type DirectorEvent } from '../../../lib/director/RezelDirector';
import { ModelManager } from '../../../lib/ai/models/ModelManager';
import { ProviderAuthManager } from '../../../lib/ai/providers/ProviderAuthManager';
import MessageList from '../../panels/chat/MessageList';
import ChatInput from '../../panels/chat/ChatInput';

export const ChatWorkspace: React.FC = () => {
  const chat = useChat();

  useEffect(() => {
    const handler = (event: DirectorEvent) => {
      chat.handleAgentEvent(event);
    };
    RezelDirector.subscribe(handler);
    return () => RezelDirector.unsubscribe(handler);
  }, [chat]);

  const activeModelId = useMemo(() => {
    return ModelManager.getActiveModelId() || 'gemini-2.5-flash';
  }, []);

  const hasAnyKey = useMemo(() => {
    const gemini = ProviderAuthManager.getAuthorization('GEMINI');
    const openai = ProviderAuthManager.getAuthorization('OPENAI');
    const anthropic = ProviderAuthManager.getAuthorization('ANTHROPIC');
    const ollama = ProviderAuthManager.getAuthorization('OLLAMA');
    return gemini.enabled || openai.enabled || anthropic.enabled || ollama.enabled;
  }, []);

  return (
    <div className="flex flex-col h-full w-full min-h-[420px] max-h-[680px]">
      {/* Top Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-cyan-500/20 bg-[#040C24]/60 backdrop-blur-md rounded-t-xl shrink-0">
        <div className="flex items-center gap-2">
          <Cpu size={12} className="text-cyan-400" />
          <span className="font-mono text-[10px] tracking-wider text-cyan-300 uppercase">
            MODEL: {activeModelId}
          </span>
        </div>

        <button
          type="button"
          onClick={chat.newConversation}
          disabled={chat.isProcessing}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-cyan-200 font-mono text-[9px] tracking-widest uppercase cursor-pointer transition-all disabled:opacity-40"
          title="Start fresh conversation"
        >
          <Plus size={11} />
          <span>NEW CHAT</span>
        </button>
      </div>

      {!hasAnyKey && (
        <div className="flex items-center gap-2 mx-3 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 font-sans text-xs">
          <AlertCircle size={13} className="shrink-0 text-amber-400" />
          <span>No AI providers connected. Configure keys in <strong>INSPECT → Providers</strong> or connect local Ollama.</span>
        </div>
      )}

      {/* Message List */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {chat.messages.length === 0 && !chat.streamingText && !chat.isProcessing ? (
          <div className="flex flex-col items-center justify-center h-full py-12 gap-3 text-center">
            <Sparkles size={28} className="text-cyan-400/40 animate-pulse" />
            <span className="font-mono text-xs text-cyan-300/80 font-bold uppercase tracking-widest">
              Cognitive Dialogue Stream Ready
            </span>
            <p className="font-sans text-xs text-slate-400 max-w-[320px]">
              Ask questions, brainstorm architecture, or command tools with reasoning visibility.
            </p>
          </div>
        ) : (
          <MessageList
            messages={chat.messages}
            streamingText={chat.streamingText}
            isProcessing={chat.isProcessing}
          />
        )}
      </div>

      {/* Error Message */}
      {chat.error && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 font-sans text-xs">
          {chat.error}
        </div>
      )}

      {/* Bottom Input */}
      <div className="px-3 pb-3 pt-1 shrink-0">
        <ChatInput
          onSend={chat.send}
          onAbort={chat.abort}
          isProcessing={chat.isProcessing}
        />
      </div>
    </div>
  );
};
