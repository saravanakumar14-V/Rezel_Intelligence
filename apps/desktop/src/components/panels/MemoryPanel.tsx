import { useState, useCallback, useMemo } from 'react';
import { Search, X, RefreshCw, Database } from 'lucide-react';
import PanelShell from './PanelShell';
import ConversationList from './memory/ConversationList';
import EntryList from './memory/EntryList';
import MessageBubble from './chat/MessageBubble';
import { LocalMemory } from '../../lib/memory/LocalMemory';
import type { Message, MemoryEntry } from '../../lib/ai/types';

/**
 * MemoryPanel
 *
 * Knowledge/memory console for Rezel.
 *
 * Uses the existing LocalMemory singleton exclusively:
 *  - listConversations() for conversation browser
 *  - getMessages() for selected conversation viewer
 *  - deleteConversation() for deletion
 *  - search() for text search
 *  - stats() for statistics display
 *  - store.entries for key-value entries
 *
 * Does NOT create a second memory system or introduce polling.
 */
export default function MemoryPanel() {
  // ── Data state ────────────────────────────────────────────────────────────
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'conversations' | 'entries'>('conversations');

  // ── Load data from LocalMemory ────────────────────────────────────────────
  const conversations = useMemo(() => {
    void refreshKey;
    return LocalMemory.listConversations();
  }, [refreshKey]);

  const memStats = useMemo(() => {
    void refreshKey;
    return LocalMemory.stats();
  }, [refreshKey]);

  const allEntries = useMemo(() => {
    void refreshKey;
    return [
      ...LocalMemory.getEntriesByCategory('preference'),
      ...LocalMemory.getEntriesByCategory('context'),
      ...LocalMemory.getEntriesByCategory('automation'),
      ...LocalMemory.getEntriesByCategory('note'),
    ];
  }, [refreshKey]);

  // ── Search ────────────────────────────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    return LocalMemory.search(searchQuery.trim());
  }, [searchQuery, refreshKey]);

  // ── Conversation selection ────────────────────────────────────────────────
  const handleSelectConversation = useCallback((id: string) => {
    setSelectedConvId(id);
    setSelectedMessages(LocalMemory.getMessages(id));
  }, []);

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback((id: string) => {
    LocalMemory.deleteConversation(id);
    LocalMemory.save().catch(console.error);
    if (selectedConvId === id) {
      setSelectedConvId(null);
      setSelectedMessages([]);
    }
    setRefreshKey((k) => k + 1);
  }, [selectedConvId]);

  // ── Refresh ───────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    await LocalMemory.load(true);
    setRefreshKey((k) => k + 1);
  }, []);

  // ── Clear search ──────────────────────────────────────────────────────────
  const clearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  // ── Back from message view ────────────────────────────────────────────────
  const handleBack = useCallback(() => {
    setSelectedConvId(null);
    setSelectedMessages([]);
  }, []);

  // Displayed conversations (filtered by search or all)
  const displayedConversations = searchResults
    ? searchResults.conversations.map((c) => ({
        id: c.id,
        title: c.title,
        messageCount: c.messages.length,
        updatedAt: c.updatedAt,
      }))
    : conversations;

  const displayedEntries: MemoryEntry[] = searchResults
    ? searchResults.entries
    : allEntries;

  return (
    <PanelShell title="Memory" subtitle={`${memStats.conversations} conv · ${memStats.entries} entries`}>
      <div className="flex flex-col gap-3 h-full">

        {/* ── Stats bar ──────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Database size={11} color="#00E5FF" strokeWidth={1.5} />
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: '#4BB8F0',
                opacity: 0.5,
              }}
            >
              v{memStats.version}
            </span>
          </div>
          <div className="flex-1" />
          <button
            onClick={handleRefresh}
            aria-label="Refresh memory"
            className="flex items-center justify-center w-6 h-6 rounded cursor-pointer transition-opacity hover:opacity-80 active:scale-95"
            style={{
              background: 'rgba(0,229,255,0.06)',
              border: '1px solid rgba(0,229,255,0.12)',
            }}
          >
            <RefreshCw size={11} color="#00E5FF" strokeWidth={1.5} />
          </button>
        </div>

        {/* ── Search ─────────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
          style={{
            background: 'rgba(2,6,18,0.50)',
            border: '1px solid rgba(0,229,255,0.08)',
          }}
        >
          <Search size={12} color="#4BB8F0" strokeWidth={1.5} style={{ opacity: 0.4 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search memory..."
            className="flex-1 outline-none bg-transparent"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '12px',
              color: '#EAFBFF',
            }}
          />
          {searchQuery && (
            <button
              onClick={clearSearch}
              aria-label="Clear search"
              className="cursor-pointer opacity-40 hover:opacity-70 transition-opacity"
              style={{ background: 'none', border: 'none' }}
            >
              <X size={12} color="#7ECFFF" strokeWidth={2} />
            </button>
          )}
        </div>

        {/* ── Search result count ────────────────────────────────────── */}
        {searchResults && (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8px',
              color: '#4BB8F0',
              opacity: 0.5,
              letterSpacing: '0.10em',
            }}
          >
            {searchResults.conversations.length} conv + {searchResults.entries.length} entries found
          </span>
        )}

        {/* ── Message viewer (when conversation selected) ────────────── */}
        {selectedConvId && (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBack}
                className="cursor-pointer transition-opacity hover:opacity-80"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  color: '#00E5FF',
                  background: 'rgba(0,229,255,0.06)',
                  border: '1px solid rgba(0,229,255,0.15)',
                  borderRadius: '6px',
                  padding: '2px 8px',
                  letterSpacing: '0.10em',
                }}
              >
                ← BACK
              </button>
              <span
                className="truncate"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '11px',
                  color: '#7ECFFF',
                  opacity: 0.6,
                }}
              >
                {conversations.find((c) => c.id === selectedConvId)?.title ?? 'Conversation'}
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto -mx-5 px-5">
              {selectedMessages.length === 0 ? (
                <div className="flex items-center justify-center py-8 opacity-30">
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '9px',
                      color: '#7ECFFF',
                    }}
                  >
                    EMPTY CONVERSATION
                  </span>
                </div>
              ) : (
                <div className="flex flex-col">
                  {selectedMessages.map((msg, i) => (
                    <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Browse mode (no conversation selected) ─────────────────── */}
        {!selectedConvId && (
          <>
            {/* Tab switcher */}
            <div className="flex gap-1">
              <TabButton
                label={`CONVERSATIONS (${displayedConversations.length})`}
                isActive={activeTab === 'conversations'}
                onClick={() => setActiveTab('conversations')}
              />
              <TabButton
                label={`ENTRIES (${displayedEntries.length})`}
                isActive={activeTab === 'entries'}
                onClick={() => setActiveTab('entries')}
              />
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-y-auto -mx-5 px-5">
              {activeTab === 'conversations' ? (
                <ConversationList
                  conversations={displayedConversations}
                  selectedId={selectedConvId}
                  onSelect={handleSelectConversation}
                  onDelete={handleDelete}
                />
              ) : (
                <EntryList entries={displayedEntries} />
              )}
            </div>
          </>
        )}
      </div>
    </PanelShell>
  );
}

// ─── TabButton ────────────────────────────────────────────────────────────────

function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1 rounded-md cursor-pointer transition-all duration-200 outline-none"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '8px',
        letterSpacing: '0.12em',
        color: isActive ? '#00E5FF' : '#4BB8F0',
        background: isActive ? 'rgba(0,229,255,0.08)' : 'transparent',
        border: isActive ? '1px solid rgba(0,229,255,0.18)' : '1px solid transparent',
        opacity: isActive ? 1 : 0.45,
      }}
    >
      {label}
    </button>
  );
}
