import { Sparkles, Trash2, X } from 'lucide-react';
import type { GovernedMemoryEntry } from '../../../lib/ai/memory/types';
import styles from './MemoryProvenanceCard.module.css';

export interface MemoryProvenanceCardProps {
  memory: GovernedMemoryEntry;
  onForget?: () => void;
  onClose?: () => void;
}

export default function MemoryProvenanceCard({
  memory,
  onForget,
  onClose,
}: MemoryProvenanceCardProps) {
  const formattedDate = new Date(memory.createdAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className={styles.cardRoot}>
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <Sparkles size={13} className="text-[#00E5FF]" />
          <span className={styles.title}>Memory Provenance & Origin</span>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="text-white/40 hover:text-white p-1 rounded transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className={styles.contentBox}>
        "{memory.content}"
      </div>

      <div className={styles.provenanceGrid}>
        <div className={styles.provCell}>
          <span className={styles.provLabel}>CATEGORY</span>
          <span className={styles.provValue}>{memory.type}</span>
        </div>
        <div className={styles.provCell}>
          <span className={styles.provLabel}>SCOPE</span>
          <span className={styles.provValue}>{memory.scope}</span>
        </div>
        <div className={styles.provCell}>
          <span className={styles.provLabel}>SOURCE PROVENANCE</span>
          <span className={styles.provValue}>{memory.source}</span>
        </div>
        <div className={styles.provCell}>
          <span className={styles.provLabel}>CAPTURED AT</span>
          <span className={styles.provValue}>{formattedDate}</span>
        </div>
        {memory.projectId && (
          <div className={styles.provCell}>
            <span className={styles.provLabel}>PROJECT BINDING</span>
            <span className={styles.provValue}>{memory.projectId}</span>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        {onForget && (
          <button
            type="button"
            onClick={onForget}
            className={styles.forgetBtn}
          >
            <Trash2 size={10} className="inline mr-1" />
            FORGET THIS MEMORY
          </button>
        )}
      </div>
    </div>
  );
}
