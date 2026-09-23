import React, { useState, useEffect, useMemo } from 'react';
import { HardDrive, Search, Trash2, Plus, Database } from 'lucide-react';
import { LocalMemory } from '../../../lib/memory/LocalMemory';
import type { MemoryEntry } from '../../../lib/ai/types';
import { cn } from '../../../lib/cn';

type CategoryFilter = 'ALL' | 'context' | 'preference' | 'automation' | 'note';

export const MemoryForensicsWorkspace: React.FC = () => {
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('ALL');
  const [stats, setStats] = useState({ conversations: 0, entries: 0, version: 1 });
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [newCat, setNewCat] = useState<MemoryEntry['category']>('context');

  const refreshData = () => {
    LocalMemory.load().then(() => {
      setStats(LocalMemory.stats());
      const searchRes = LocalMemory.search('');
      setEntries(searchRes.entries);
    }).catch(() => {});
  };

  useEffect(() => {
    refreshData();
  }, []);

  const filteredEntries = useMemo(() => {
    let result = entries;
    if (activeCategory !== 'ALL') {
      result = result.filter((e) => e.category === activeCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
      );
    }
    return result;
  }, [entries, activeCategory, search]);

  const handleDelete = async (key: string) => {
    LocalMemory.deleteEntry(key);
    await LocalMemory.save();
    refreshData();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newVal.trim()) return;
    LocalMemory.setEntry(newKey.trim(), newVal.trim(), newCat);
    await LocalMemory.save();
    setNewKey('');
    setNewVal('');
    setIsAdding(false);
    refreshData();
  };

  return (
    <div className="flex flex-col h-full w-full min-h-[400px] p-2">
      {/* Stats & Search Header */}
      <div className="flex flex-col gap-2 p-3 bg-[#040C24]/80 border border-cyan-500/20 rounded-xl mb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database size={13} className="text-cyan-400" />
            <span className="font-mono text-[10px] tracking-wider text-cyan-300 uppercase font-bold">
              LOCAL MEMORY STORE · {stats.entries} ENTRIES · {stats.conversations} CONVERSATIONS
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsAdding((prev) => !prev)}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-mono text-[9px] tracking-wider uppercase transition-colors"
          >
            <Plus size={10} />
            <span>{isAdding ? 'CANCEL' : 'ADD ENTRY'}</span>
          </button>
        </div>

        {isAdding && (
          <form onSubmit={handleCreate} className="flex flex-col gap-2 pt-2 border-t border-cyan-500/10">
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                placeholder="Key (e.g. project_focus)"
                className="px-2 py-1 bg-black/40 border border-white/10 rounded text-xs text-white outline-none"
                required
              />
              <input
                type="text"
                value={newVal}
                onChange={(e) => setNewVal(e.target.value)}
                placeholder="Value (e.g. High-performance UI)"
                className="px-2 py-1 bg-black/40 border border-white/10 rounded text-xs text-white outline-none"
                required
              />
              <select
                value={newCat}
                onChange={(e) => setNewCat(e.target.value as any)}
                className="px-2 py-1 bg-black/60 border border-white/10 rounded text-xs text-cyan-300 outline-none"
              >
                <option value="context">context</option>
                <option value="preference">preference</option>
                <option value="automation">automation</option>
                <option value="note">note</option>
              </select>
            </div>
            <button
              type="submit"
              className="self-end px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-black font-mono text-[10px] font-bold rounded tracking-wider uppercase"
            >
              SAVE MEMORY
            </button>
          </form>
        )}

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 flex-1 px-2.5 py-1.5 bg-black/40 border border-white/10 rounded-lg">
            <Search size={12} className="text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search keys and values in memory..."
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 outline-none"
            />
          </div>

          <div className="flex items-center gap-1">
            {(['ALL', 'context', 'preference', 'automation', 'note'] as CategoryFilter[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  'px-2 py-1 rounded font-mono text-[9px] uppercase tracking-wider transition-colors',
                  activeCategory === cat
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-300'
                    : 'text-slate-400 hover:text-white bg-black/20'
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Entry Cards List */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
            <HardDrive size={24} className="text-slate-600" />
            <span className="font-mono text-xs text-slate-400 font-bold uppercase tracking-widest">
              NO MEMORIES FOUND
            </span>
            <p className="font-sans text-xs text-slate-500 max-w-[280px]">
              {search || activeCategory !== 'ALL'
                ? 'No memory entries match the current filter.'
                : 'Memory will appear as Rezel learns from your interactions.'}
            </p>
          </div>
        ) : (
          filteredEntries.map((entry) => (
            <div
              key={entry.key}
              className="flex items-start justify-between p-3 rounded-xl bg-[#060B1E]/60 border border-white/5 hover:border-cyan-500/30 transition-all group"
            >
              <div className="flex flex-col gap-1 min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-cyan-300 font-bold tracking-wide">
                    {entry.key}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-mono text-[8px] uppercase">
                    {entry.category}
                  </span>
                </div>
                <span className="font-sans text-xs text-slate-200 break-words">
                  {entry.value}
                </span>
                <span className="font-mono text-[9px] text-slate-500">
                  Updated: {new Date(entry.updatedAt).toLocaleDateString()} {new Date(entry.updatedAt).toLocaleTimeString()}
                </span>
              </div>

              <button
                type="button"
                onClick={() => handleDelete(entry.key)}
                className="p-1.5 rounded hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors shrink-0"
                title="Delete memory entry"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
