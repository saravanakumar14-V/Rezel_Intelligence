import { useState } from 'react';
import { BookOpen, Plus, Check } from 'lucide-react';
import { KnowledgeIngestionManager } from '../../../lib/ai/knowledge/KnowledgeIngestionManager';
import { AdaptiveWorkspaceManager } from '../../../lib/workspace/multi-context/AdaptiveWorkspaceManager';

export interface KnowledgeIngestionDrawerProps {
  onIngested?: () => void;
}

export default function KnowledgeIngestionDrawer({ onIngested }: KnowledgeIngestionDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [content, setContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim() || isProcessing) return;

    setIsProcessing(true);
    const ctx = AdaptiveWorkspaceManager.registerContext({
      type: 'KNOWLEDGE_INDEX',
      title: `Indexing ${title.trim()}`,
      summary: `Parsing and chunking knowledge source for semantic retrieval`,
      progress: 30,
      targetSpace: 'MEMORY',
    });

    try {
      await KnowledgeIngestionManager.ingestDocument({
        title: title.trim(),
        sourcePath: sourcePath.trim() || 'notes/manual_entry.md',
        sourceType: 'DOCUMENT',
        content: content.trim(),
      });
      AdaptiveWorkspaceManager.completeContext(ctx.id);
      setTitle('');
      setSourcePath('');
      setContent('');
      setIsOpen(false);
      onIngested?.();
    } catch (err) {
      console.error('Ingestion failed:', err);
      AdaptiveWorkspaceManager.cancelContext(ctx.id);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#00E5FF]/30 bg-[#00E5FF]/10 text-[#00E5FF] font-mono text-[10px] font-semibold tracking-wider hover:bg-[#00E5FF]/20 transition-all cursor-pointer"
      >
        <Plus size={11} />
        <span>INGEST KNOWLEDGE SOURCE</span>
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 p-3.5 rounded-xl border border-[#00E5FF]/25 bg-[#060B1E]/80 backdrop-blur-md"
    >
      <div className="flex items-center justify-between border-b border-white/10 pb-2">
        <div className="flex items-center gap-2">
          <BookOpen size={13} className="text-[#00E5FF]" />
          <span className="font-mono text-xs font-bold text-[#EAFBFF] tracking-wider">
            INGEST KNOWLEDGE INTO REZEL
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-white/40 hover:text-white text-xs font-mono"
        >
          CANCEL
        </button>
      </div>

      <input
        type="text"
        placeholder="Document Title (e.g. Pipeline Specs, Project Guidelines)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-[#EAFBFF] outline-none focus:border-[#00E5FF]/50"
        required
      />

      <input
        type="text"
        placeholder="Source Path / File URI (optional, e.g. docs/specs.md)"
        value={sourcePath}
        onChange={(e) => setSourcePath(e.target.value)}
        className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-[#EAFBFF] outline-none focus:border-[#00E5FF]/50"
      />

      <textarea
        placeholder="Document content, API definitions, or technical notes to index..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={4}
        className="px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-[#EAFBFF] outline-none focus:border-[#00E5FF]/50 resize-none"
        required
      />

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={isProcessing}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#00E5FF]/20 border border-[#00E5FF]/40 text-[#00E5FF] font-mono text-[10px] font-bold tracking-wider hover:bg-[#00E5FF]/30 transition-all cursor-pointer"
        >
          {isProcessing ? 'INDEXING CHUNKS...' : <><Check size={11} /> INDEX SOURCE</>}
        </button>
      </div>
    </form>
  );
}
