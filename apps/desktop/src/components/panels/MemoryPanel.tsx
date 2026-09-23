import { useState, useCallback, useMemo, useEffect } from 'react';
import { Search, X, BookOpen, Brain, Sparkles, FolderGit2, Trash2 } from 'lucide-react';
import PanelShell from './PanelShell';
import ConversationList from './memory/ConversationList';
import MessageBubble from './chat/MessageBubble';
import MemoryProvenanceCard from './memory/MemoryProvenanceCard';
import KnowledgeIngestionDrawer from './memory/KnowledgeIngestionDrawer';
import { LocalMemory } from '../../lib/memory/LocalMemory';
import { GovernedMemoryStore } from '../../lib/ai/memory/GovernedMemoryStore';
import { KnowledgeIngestionManager } from '../../lib/ai/knowledge/KnowledgeIngestionManager';
import { ProjectContextManager } from '../../lib/ai/memory/project/ProjectContextManager';
import type { Message } from '../../lib/ai/types';
import type { GovernedMemoryEntry } from '../../lib/ai/memory/types';
import type { KnowledgeDocument } from '../../lib/ai/knowledge/types';
import { cn } from '../../lib/cn';

export default function MemoryPanel() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'knowledge' | 'memories' | 'project' | 'conversations'>('knowledge');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<Message[]>([]);
  const [inspectedMemory, setInspectedMemory] = useState<GovernedMemoryEntry | null>(null);

  // ── Long-term Governed Memories ───────────────────────────────────────────
  const [governedMemories, setGovernedMemories] = useState<GovernedMemoryEntry[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);

  useEffect(() => {
    // Sync governed memory entries
    setGovernedMemories(GovernedMemoryStore.search({}));
    const unsubDoc = KnowledgeIngestionManager.subscribe((docs) => setDocuments(docs));
    return () => unsubDoc();
  }, [refreshKey]);

  // ── Conversation Transcripts ──────────────────────────────────────────────
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

  const handleForgetMemory = useCallback((memoryId: string) => {
    GovernedMemoryStore.delete(memoryId);
    setInspectedMemory(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleDeleteDocument = useCallback((docId: string) => {
    KnowledgeIngestionManager.deleteDocument(docId);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleClearProject = useCallback(() => {
    try {
      const activeId = ProjectContextManager.resolveActiveProjectId();
      if (activeId) {
        GovernedMemoryStore.forgetScope('PROJECT', activeId);
        ProjectContextManager.deleteProject(activeId);
        setRefreshKey((k) => k + 1);
      }
    } catch {
      // Fallback
      GovernedMemoryStore.forgetScope('PROJECT', 'default');
      setRefreshKey((k) => k + 1);
    }
  }, []);

  // Filtered lists
  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return governedMemories;
    const lower = searchQuery.toLowerCase();
    return governedMemories.filter((m) => m.content.toLowerCase().includes(lower) || m.type.toLowerCase().includes(lower));
  }, [governedMemories, searchQuery]);

  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const lower = searchQuery.toLowerCase();
    return documents.filter((d) => d.title.toLowerCase().includes(lower) || d.sourcePath.toLowerCase().includes(lower));
  }, [documents, searchQuery]);

  return (
    <PanelShell title="Intelligence" subtitle="Memory & Knowledge System">
      <div className="flex flex-col gap-3.5 h-full">
        {/* ── Search & Filter Omnibar ─────────────────────────────────── */}
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-black/40 border border-[#00E5FF]/20">
          <Search size={13} className="text-[#00E5FF]/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search indexed knowledge, facts, and conversation history..."
            className="flex-1 bg-transparent border-none outline-none font-sans text-xs text-[#EAFBFF] placeholder:text-white/30"
          />
          {searchQuery && (
            <button type="button" onClick={() => setSearchQuery('')} className="text-white/40 hover:text-white">
              <X size={12} />
            </button>
          )}
        </div>

        {/* ── Mode Tabs ───────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {[
            { id: 'knowledge', label: 'KNOWLEDGE BASE', icon: BookOpen, count: documents.length },
            { id: 'memories', label: 'LONG-TERM MEMORY', icon: Brain, count: governedMemories.length },
            { id: 'project', label: 'PROJECT CONTEXT', icon: FolderGit2 },
            { id: 'conversations', label: 'TRANSCRIPTS', icon: Sparkles, count: conversations.length },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setSelectedConvId(null);
                  setInspectedMemory(null);
                }}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[9px] font-bold tracking-wider uppercase border transition-all cursor-pointer whitespace-nowrap',
                  isActive
                    ? 'bg-[#00E5FF]/18 text-[#00E5FF] border-[#00E5FF]/40 shadow-[0_0_8px_rgba(0,229,255,0.2)]'
                    : 'bg-white/5 text-white/50 border-white/10 hover:text-white/80 hover:bg-white/10'
                )}
              >
                <Icon size={11} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span className="opacity-50 text-[8px]">({tab.count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Inspector Drawer if inspecting memory ───────────────────── */}
        {inspectedMemory && (
          <MemoryProvenanceCard
            memory={inspectedMemory}
            onClose={() => setInspectedMemory(null)}
            onForget={() => handleForgetMemory(inspectedMemory.memoryId)}
          />
        )}

        {/* ── Tab Views ───────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {/* TAB 1: KNOWLEDGE SOURCES */}
          {activeTab === 'knowledge' && (
            <div className="flex flex-col gap-3">
              <KnowledgeIngestionDrawer onIngested={() => setRefreshKey((k) => k + 1)} />

              <div className="flex flex-col gap-1.5 mt-1">
                {filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#0A1024]/60 border border-white/5 hover:border-[#00E5FF]/30 transition-all"
                  >
                    <div className="flex flex-col gap-1 max-w-[75%]">
                      <span className="font-mono text-xs font-semibold text-[#EAFBFF] truncate">
                        {doc.title}
                      </span>
                      <span className="font-mono text-[9px] text-[#7ECFFF]/60 truncate">
                        {doc.sourcePath} • {doc.chunkCount} chunks indexed
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc.id)}
                      className="text-white/30 hover:text-[#FF3D71] p-1.5 rounded transition-colors"
                      title="Delete indexed source"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: LONG-TERM MEMORIES */}
          {activeTab === 'memories' && (
            <div className="flex flex-col gap-1.5">
              {filteredMemories.length === 0 ? (
                <div className="p-6 text-center text-white/40 font-mono text-xs">
                  No governed memories captured yet.
                </div>
              ) : (
                filteredMemories.map((mem) => (
                  <div
                    key={mem.memoryId}
                    onClick={() => setInspectedMemory(mem)}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#0A1024]/60 border border-white/5 hover:border-[#00E5FF]/30 transition-all cursor-pointer"
                  >
                    <div className="flex flex-col gap-1 max-w-[80%]">
                      <span className="font-sans text-xs text-[#EAFBFF] line-clamp-2">
                        "{mem.content}"
                      </span>
                      <div className="flex items-center gap-2 font-mono text-[8.5px] text-[#7ECFFF]/60">
                        <span>{mem.type}</span>
                        <span>•</span>
                        <span>{mem.scope}</span>
                      </div>
                    </div>
                    <span className="font-mono text-[8px] text-[#00E5FF] bg-[#00E5FF]/10 px-1.5 py-0.5 rounded border border-[#00E5FF]/25">
                      PROVENANCE
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: PROJECT CONTEXT */}
          {activeTab === 'project' && (
            <div className="flex flex-col gap-3 p-2 rounded-xl bg-[#060B1E]/60 border border-white/5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#EAFBFF]">
                  ACTIVE WORKSPACE CONTEXT
                </span>
                <button
                  type="button"
                  onClick={handleClearProject}
                  className="font-mono text-[9px] text-[#FF3D71] border border-[#FF3D71]/30 bg-[#FF3D71]/10 px-2 py-1 rounded hover:bg-[#FF3D71]/20 cursor-pointer"
                >
                  FORGET PROJECT CONTEXT
                </button>
              </div>
              <p className="font-sans text-xs text-white/60">
                Rezel retains project decisions, active scene metadata, and workflow checkpoints associated with your current creative environment.
              </p>
            </div>
          )}

          {/* TAB 4: CONVERSATIONS */}
          {activeTab === 'conversations' && (
            <div>
              {selectedConvId ? (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedConvId(null)}
                    className="font-mono text-xs text-[#00E5FF] hover:underline mb-1"
                  >
                    ← Back to transcripts
                  </button>
                  {selectedMessages.map((msg, i) => (
                    <MessageBubble key={i} message={msg} />
                  ))}
                </div>
              ) : (
                <ConversationList
                  conversations={conversations}
                  selectedId={selectedConvId}
                  onSelect={handleSelectConversation}
                  onDelete={handleDeleteConversation}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </PanelShell>
  );
}
