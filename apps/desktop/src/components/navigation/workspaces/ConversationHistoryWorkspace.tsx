import React, { useState, useEffect, useMemo } from 'react';
import { MessageSquare, Trash2, Search, ArrowRight, Clock } from 'lucide-react';
import { LocalMemory } from '../../../lib/memory/LocalMemory';
import { RezelDirector } from '../../../lib/director/RezelDirector';

interface ConversationMeta {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

export const ConversationHistoryWorkspace: React.FC = () => {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [search, setSearch] = useState('');
  const [activeId, setActiveId] = useState<string | null>(() => RezelDirector.getConversationId());

  const loadData = () => {
    LocalMemory.load().then(() => {
      setConversations(LocalMemory.listConversations());
      setActiveId(RezelDirector.getConversationId());
    }).catch(() => {});
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(
      (c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q)
    );
  }, [conversations, search]);

  const handleSelectConversation = (id: string) => {
    RezelDirector.loadConversation(id);
    setActiveId(id);
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    LocalMemory.deleteConversation(id);
    await LocalMemory.save();
    loadData();
  };

  return (
    <div className="flex flex-col h-full w-full min-h-[380px] p-2">
      {/* Search Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#040C24]/80 border border-cyan-500/20 rounded-xl mb-3 shrink-0">
        <Search size={14} className="text-cyan-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search transcripts by title or keyword..."
          className="w-full bg-transparent text-xs text-white placeholder-slate-500 outline-none font-sans"
        />
        <span className="font-mono text-[10px] text-cyan-300/60 uppercase shrink-0">
          {filtered.length} TOTAL
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
            <MessageSquare size={24} className="text-slate-600" />
            <span className="font-mono text-xs text-slate-400 font-bold uppercase tracking-widest">
              NO CONVERSATIONS YET
            </span>
            <p className="font-sans text-xs text-slate-500 max-w-[260px]">
              {search ? 'No conversations match your search filter.' : 'Your conversations will appear here.'}
            </p>
          </div>
        ) : (
          filtered.map((c) => {
            const isActive = c.id === activeId;
            const dateStr = new Date(c.updatedAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={c.id}
                onClick={() => handleSelectConversation(c.id)}
                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group ${
                  isActive
                    ? 'bg-cyan-500/15 border-cyan-500/40 shadow-lg'
                    : 'bg-[#060B1E]/60 border-white/5 hover:border-cyan-500/30 hover:bg-[#060B1E]/90'
                }`}
              >
                <div className="flex flex-col gap-1 min-w-0 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="font-sans text-xs font-medium text-white truncate group-hover:text-cyan-200">
                      {c.title || 'Untitled Session'}
                    </span>
                    {isActive && (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-400/20 text-cyan-300 font-mono text-[8px] tracking-wider uppercase font-bold">
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[10px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      {dateStr}
                    </span>
                    <span>·</span>
                    <span>{c.messageCount} messages</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete transcript"
                  >
                    <Trash2 size={12} />
                  </button>
                  <ArrowRight size={14} className="text-slate-600 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
