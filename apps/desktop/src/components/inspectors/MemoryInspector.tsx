import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Search,
  X,
  BookOpen,
  Brain,
  FolderGit2,
  Trash2,
  Sparkles,
  Edit3,
  Check,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import InspectorShell from './InspectorShell';
import KnowledgeIngestionDrawer from '../panels/memory/KnowledgeIngestionDrawer';
import { GovernedMemoryStore } from '../../lib/ai/memory/GovernedMemoryStore';
import { KnowledgeIngestionManager } from '../../lib/ai/knowledge/KnowledgeIngestionManager';
import { ProjectContextManager } from '../../lib/ai/memory/project/ProjectContextManager';
import type { GovernedMemoryEntry } from '../../lib/ai/memory/types';
import type { KnowledgeDocument } from '../../lib/ai/knowledge/types';
import type { InspectorId } from '../../types/navigation';
import { cn } from '../../lib/cn';
import styles from './MemoryInspector.module.css';

interface MemoryInspectorProps {
  onClose?: () => void;
  onOpenInspector?: (id: InspectorId) => void;
}

export default function MemoryInspector({ onClose, onOpenInspector }: MemoryInspectorProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState<'memories' | 'knowledge' | 'project'>('memories');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [inspectedMemory, setInspectedMemory] = useState<GovernedMemoryEntry | null>(null);

  // Correction state
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');

  // ── Long-term Governed Memories & Knowledge Documents ───────────────────────
  const [governedMemories, setGovernedMemories] = useState<GovernedMemoryEntry[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);

  useEffect(() => {
    setGovernedMemories(GovernedMemoryStore.search({}));
    const unsubDoc = KnowledgeIngestionManager.subscribe((docs) => setDocuments(docs));
    return () => unsubDoc();
  }, [refreshKey]);

  const handleForgetMemory = useCallback((memoryId: string) => {
    GovernedMemoryStore.delete(memoryId);
    setInspectedMemory(null);
    setEditingMemoryId(null);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleSaveCorrection = useCallback((memory: GovernedMemoryEntry) => {
    if (!editContent.trim()) return;
    GovernedMemoryStore.update(memory.memoryId, {
      content: editContent.trim(),
      source: 'USER',
    });
    setEditingMemoryId(null);
    setInspectedMemory(null);
    setRefreshKey((k) => k + 1);
  }, [editContent]);

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
      GovernedMemoryStore.forgetScope('PROJECT', 'default');
      setRefreshKey((k) => k + 1);
    }
  }, []);

  // Filtered Memories
  const filteredMemories = useMemo(() => {
    return governedMemories.filter((m) => {
      const matchSearch =
        !searchQuery.trim() ||
        m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.source && m.source.toLowerCase().includes(searchQuery.toLowerCase()));

      if (!matchSearch) return false;
      if (selectedCategory !== 'ALL' && m.type !== selectedCategory) return false;
      return true;
    });
  }, [governedMemories, searchQuery, selectedCategory]);

  // Filtered Knowledge Documents
  const filteredDocs = useMemo(() => {
    if (!searchQuery.trim()) return documents;
    const lower = searchQuery.toLowerCase();
    return documents.filter(
      (d) => d.title.toLowerCase().includes(lower) || d.sourcePath.toLowerCase().includes(lower)
    );
  }, [documents, searchQuery]);

  return (
    <InspectorShell
      title="Intelligence & Memory"
      subtitle={activeTab === 'memories' ? 'Governed Long-Term Memory' : activeTab === 'knowledge' ? 'Knowledge Sources & Retrieval' : 'Active Project Bindings'}
      onClose={onClose}
    >
      <div className={styles.memoryRoot}>
        {/* ── Mode Switcher Tabs ───────────────────────────────────── */}
        <div className={styles.modeTabs}>
          {[
            { id: 'memories', label: 'GOVERNED MEMORY', icon: Brain, count: governedMemories.length },
            { id: 'knowledge', label: 'KNOWLEDGE BASE', icon: BookOpen, count: documents.length },
            { id: 'project', label: 'PROJECT CONTEXT', icon: FolderGit2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setInspectedMemory(null);
                  setEditingMemoryId(null);
                }}
                className={cn(
                  styles.modeTab,
                  isActive && styles.modeTabActive
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

        {/* ── Search Bar ───────────────────────────────────────────── */}
        <div className={styles.searchBar}>
          <Search size={13} className="text-[#00E5FF]/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'memories'
                ? 'Search governed memories, preferences, and facts...'
                : 'Search indexed documents and technical knowledge...'
            }
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

        {/* ── Filter Pills for Governed Memory ─────────────────────── */}
        {activeTab === 'memories' && (
          <div className={styles.filterRow}>
            {(['ALL', 'PREFERENCE', 'FACT', 'DECISION', 'TECHNICAL', 'RULE'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  styles.filterPill,
                  selectedCategory === cat && styles.filterPillActive
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* ── Deep Provenance Modal / Focus Card ───────────────────── */}
        {inspectedMemory && (
          <div className={styles.provenanceFocusCard}>
            <div className={styles.provHeader}>
              <div className={styles.provTitleGroup}>
                <Sparkles size={12} />
                <span>MEMORY PROVENANCE & ORIGIN</span>
              </div>
              <button
                type="button"
                onClick={() => setInspectedMemory(null)}
                className="text-white/40 hover:text-white"
              >
                <X size={12} />
              </button>
            </div>

            <div className={styles.provContentBox}>
              "{inspectedMemory.content}"
            </div>

            <div className={styles.provGrid}>
              <div className={styles.provGridCell}>
                <span className={styles.provLabel}>CATEGORY</span>
                <span className={styles.provVal}>{inspectedMemory.type}</span>
              </div>
              <div className={styles.provGridCell}>
                <span className={styles.provLabel}>SCOPE</span>
                <span className={styles.provVal}>{inspectedMemory.scope}</span>
              </div>
              <div className={styles.provGridCell}>
                <span className={styles.provLabel}>SOURCE PROVENANCE</span>
                <span className={styles.provVal}>{inspectedMemory.source}</span>
              </div>
              <div className={styles.provGridCell}>
                <span className={styles.provLabel}>CAPTURED AT</span>
                <span className={styles.provVal}>
                  {new Date(inspectedMemory.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>

            <div className={styles.provActions}>
              <button
                type="button"
                onClick={() => {
                  setEditingMemoryId(inspectedMemory.memoryId);
                  setEditContent(inspectedMemory.content);
                }}
                className="flex items-center gap-1 font-mono text-[8.5px] text-[#00E5FF] hover:underline"
              >
                <Edit3 size={10} />
                <span>CORRECT FACT</span>
              </button>

              <button
                type="button"
                onClick={() => handleForgetMemory(inspectedMemory.memoryId)}
                className={styles.forgetBtn}
              >
                <Trash2 size={10} />
                <span>FORGET THIS MEMORY</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Content Stream ───────────────────────────────────────── */}
        <div className={styles.contentList}>
          {/* TAB 1: GOVERNED MEMORIES */}
          {activeTab === 'memories' && (
            <>
              {filteredMemories.length === 0 ? (
                <div className={styles.emptyState}>
                  <Brain size={24} className="text-[#7ECFFF]/30" />
                  <span>NO GOVERNED MEMORIES RECORDED</span>
                  <span className="text-[10px] text-white/30 max-w-[220px]">
                    Rezel automatically captures user preferences, architectural rules, and project decisions as you converse.
                  </span>
                </div>
              ) : (
                filteredMemories.map((mem) => {
                  const isEditing = editingMemoryId === mem.memoryId;

                  return (
                    <div
                      key={mem.memoryId}
                      className={cn(
                        styles.memoryCard,
                        inspectedMemory?.memoryId === mem.memoryId && styles.memoryCardSelected
                      )}
                    >
                      <div className={styles.cardHeader}>
                        <div className="flex items-center gap-1.5">
                          <span className={styles.typeBadge}>{mem.type}</span>
                          <span className={styles.scopeBadge}>[{mem.scope}]</span>
                        </div>
                        <span className="font-mono text-[8px] text-[#00E676] flex items-center gap-1">
                          <ShieldCheck size={9} /> GOVERNED
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="flex flex-col gap-2 pt-1">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            rows={2}
                            className="p-2 rounded bg-black/50 border border-[#00E5FF]/40 text-xs text-[#EAFBFF] outline-none font-sans"
                          />
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingMemoryId(null)}
                              className="font-mono text-[8.5px] text-white/40 hover:text-white"
                            >
                              CANCEL
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveCorrection(mem)}
                              className="flex items-center gap-1 font-mono text-[8.5px] font-bold text-[#00E5FF] bg-[#00E5FF]/15 border border-[#00E5FF]/40 px-2 py-0.5 rounded"
                            >
                              <Check size={9} /> SAVE CORRECTION
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span className={styles.memoryContent}>"{mem.content}"</span>
                      )}

                      <div className={styles.cardFooter}>
                        <span>ORIGIN: {mem.source.slice(0, 28)}</span>
                        <div className={styles.cardActions}>
                          <span
                            onClick={() => setInspectedMemory(mem)}
                            className={styles.actionLink}
                          >
                            PROVENANCE
                          </span>
                          <span>•</span>
                          <span
                            onClick={() => handleForgetMemory(mem.memoryId)}
                            className={cn(styles.actionLink, styles.actionDanger)}
                          >
                            FORGET
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          )}

          {/* TAB 2: KNOWLEDGE SOURCES */}
          {activeTab === 'knowledge' && (
            <div className="flex flex-col gap-3">
              <KnowledgeIngestionDrawer onIngested={() => setRefreshKey((k) => k + 1)} />

              <div className="flex flex-col gap-1.5 mt-1">
                {filteredDocs.length === 0 ? (
                  <div className={styles.emptyState}>
                    <BookOpen size={24} className="text-[#7ECFFF]/30" />
                    <span>NO KNOWLEDGE DOCUMENTS INDEXED</span>
                    <span className="text-[10px] text-white/30 max-w-[220px]">
                      Index project specifications, API schemas, or reference manuals above.
                    </span>
                  </div>
                ) : (
                  filteredDocs.map((doc) => (
                    <div key={doc.id} className={styles.docCard}>
                      <div className={styles.docInfo}>
                        <span className={styles.docTitle}>{doc.title}</span>
                        <span className={styles.docMeta}>
                          {doc.sourcePath} • {doc.chunkCount} chunks indexed
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="text-white/30 hover:text-[#FF5252] p-1.5 rounded transition-colors"
                        title="Delete indexed source"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: PROJECT CONTEXT */}
          {activeTab === 'project' && (
            <div className="flex flex-col gap-3 p-3 rounded-xl bg-[#060B1E]/60 border border-white/5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-[#EAFBFF]">
                  ACTIVE WORKSPACE PROJECT BINDINGS
                </span>
                <button
                  type="button"
                  onClick={handleClearProject}
                  className="font-mono text-[9px] text-[#FF5252] border border-[#FF5252]/30 bg-[#FF5252]/10 px-2 py-1 rounded hover:bg-[#FF5252]/20 cursor-pointer"
                >
                  FORGET PROJECT CONTEXT
                </button>
              </div>
              <p className="font-sans text-xs text-white/60 leading-relaxed">
                Rezel retains project architectural decisions, scene properties, and active tool checkpoints associated with your current workspace directory.
              </p>
            </div>
          )}
        </div>

        {/* ── Conversation Transcripts Discovery Banner ─────────────── */}
        {onOpenInspector && (
          <div className={styles.transcriptBanner}>
            <div className={styles.transcriptBannerLeft}>
              <MessageSquare size={13} className="text-[#00E5FF]" />
              <span className={styles.transcriptBannerText}>
                Need past chat transcripts? Conversations are saved separately.
              </span>
            </div>
            <button
              type="button"
              onClick={() => onOpenInspector('conversations')}
              className="flex items-center gap-1 font-mono text-[8.5px] font-bold text-[#00E5FF] hover:underline cursor-pointer"
            >
              <span>OPEN TRANSCRIPTS</span>
              <ExternalLink size={10} />
            </button>
          </div>
        )}
      </div>
    </InspectorShell>
  );
}
