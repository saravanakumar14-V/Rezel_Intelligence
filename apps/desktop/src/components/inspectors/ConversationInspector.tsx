import { useState, useCallback, useMemo } from 'react';
import { Search, X, MessageSquare, ArrowLeft, Play } from 'lucide-react';
import InspectorShell from './InspectorShell';
import ConversationList from '../panels/memory/ConversationList';
import MessageBubble from '../panels/chat/MessageBubble';
import { LocalMemory } from '../../lib/memory/LocalMemory';
import { RezelDirector } from '../../lib/director/RezelDirector';
import type { Message } from '../../lib/ai/types';
import styles from './ConversationInspector.module.css';

interface ConversationInspectorProps {
  onClose?: () => void;
}

export default function ConversationInspector({ onClose }: ConversationInspectorProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);

  const conversations = useMemo(() => {
    void refreshKey;
    return LocalMemory.listConversations();
  }, [refreshKey]);

  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConvId(id);
    setSelectedMessages(LocalMemory.getMessages(id));
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    LocalMemory.deleteConversation(id);
    LocalMemory.save().catch(console.error);
    if (selectedConvId === id) {
      setSelectedConvId(null);
      setSelectedMessages([]);
    }
    setRefreshKey((k) => k + 1);
  }, [selectedConvId]);

  const handleLoadIntoSession = useCallback((id: string) => {
    RezelDirector.loadConversation(id);
    onClose?.();
  }, [onClose]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const lower = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(lower) ||
        c.id.toLowerCase().includes(lower)
    );
  }, [conversations, searchQuery]);

  return (
    <InspectorShell
      title="Conversation Transcripts"
      subtitle={selectedConvId ? `Session: ${selectedConvId.slice(0, 18)}...` : 'Immutable Session History'}
      onClose={onClose}
    >
      <div className={styles.conversationRoot}>
        {/* Search Omnibar */}
        {!selectedConvId && (
          <div className={styles.searchBar}>
            <Search size={13} className="text-[#00E5FF]/60" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversation transcripts..."
              className={styles.searchInput}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="text-white/40 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Selected Conversation View or List */}
        <div className={styles.transcriptList}>
          {selectedConvId ? (
            <div className="flex flex-col gap-3">
              <div className={styles.sessionDetailHeader}>
                <button
                  type="button"
                  onClick={() => setSelectedConvId(null)}
                  className={styles.backBtn}
                >
                  <ArrowLeft size={11} />
                  <span>BACK TO TRANSCRIPTS</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadIntoSession(selectedConvId)}
                  className={styles.resumeBtn}
                >
                  <Play size={10} />
                  <span>RESUME SESSION</span>
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {selectedMessages.length === 0 ? (
                  <div className={styles.emptyState}>
                    <span>No recorded messages in this transcript session.</span>
                  </div>
                ) : (
                  selectedMessages.map((msg, i) => (
                    <MessageBubble key={i} message={msg} />
                  ))
                )}
              </div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className={styles.emptyState}>
              <MessageSquare size={24} className="text-[#7ECFFF]/30" />
              <span>NO RECORDED CONVERSATIONS</span>
              <span className="text-[10px] text-white/30 max-w-[220px]">
                Conversations with Rezel are automatically preserved as immutable transcripts.
              </span>
            </div>
          ) : (
            <ConversationList
              conversations={filteredConversations}
              selectedId={selectedConvId}
              onSelect={handleSelectConversation}
              onDelete={handleDeleteConversation}
            />
          )}
        </div>
      </div>
    </InspectorShell>
  );
}
