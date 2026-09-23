import { useState, useEffect, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Activity,
} from 'lucide-react';
import {
  AuditIntelligenceEngine,
  type UnifiedAuditEvent,
  type EventCategory,
} from '../../../lib/security/AuditIntelligenceEngine';
import { cn } from '../../../lib/cn';
import styles from './AuditIntelligenceDeck.module.css';

export interface AuditIntelligenceDeckProps {
  className?: string;
  defaultFilter?: EventCategory | 'ALL';
}

const CATEGORY_FILTERS: Array<{ id: EventCategory | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All Activity' },
  { id: 'SECURITY', label: 'Security & Policy' },
  { id: 'PERMISSION', label: 'Human Approvals' },
  { id: 'WORKFLOW', label: 'Workflows' },
  { id: 'APPLICATION', label: 'App Automation' },
  { id: 'PROVIDER', label: 'Providers & Failover' },
];

export default function AuditIntelligenceDeck({
  className,
  defaultFilter = 'ALL',
}: AuditIntelligenceDeckProps) {
  const [events, setEvents] = useState<UnifiedAuditEvent[]>(() =>
    AuditIntelligenceEngine.getEvents()
  );
  const [selectedFilter, setSelectedFilter] = useState<EventCategory | 'ALL'>(defaultFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = AuditIntelligenceEngine.subscribe((list) => {
      setEvents(list);
    });
    return () => unsub();
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const matchesFilter = selectedFilter === 'ALL' || e.category === selectedFilter;
      const matchesSearch =
        !searchQuery ||
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [events, selectedFilter, searchQuery]);

  const toggleExpand = (id: string) => {
    setExpandedEventId((prev) => (prev === id ? null : id));
  };

  return (
    <div
      className={cn(styles.deckRoot, className)}
      role="region"
      aria-label="Security and Audit Activity Intelligence"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <Activity size={14} className="text-[#00E5FF]" />
          <span className={styles.title}>Audit & Security Intelligence</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Omnibar Activity Search */}
          <div className="relative flex items-center">
            <Search size={11} className="absolute left-2 text-white/40" />
            <input
              type="text"
              placeholder="Search audit trail..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-black/30 border border-white/10 rounded-md pl-6 pr-2 py-0.5 text-[9px] font-mono text-white placeholder-white/30 focus:outline-none focus:border-[#00E5FF]/40 w-36"
            />
          </div>
        </div>
      </div>

      {/* ── Category Filters ───────────────────────────────────── */}
      <div className={styles.filterRow}>
        {CATEGORY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setSelectedFilter(f.id)}
            className={cn(
              styles.filterPill,
              selectedFilter === f.id && styles.filterPillActive
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Timeline Spine ─────────────────────────────────────── */}
      <div className={styles.timelineHost}>
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 opacity-40 font-mono text-[9px] text-[#7ECFFF]">
            NO RECORDED AUDIT EVENTS MATCHING FILTER
          </div>
        ) : (
          filteredEvents.map((evt) => {
            const isExpanded = expandedEventId === evt.eventId;
            const statusClass = styles[`status-${evt.status.toLowerCase()}`];

            return (
              <div
                key={evt.eventId}
                className={styles.timelineItem}
                onClick={() => toggleExpand(evt.eventId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && toggleExpand(evt.eventId)}
              >
                {/* Level 1 Summary */}
                <div className={styles.itemHeader}>
                  <div className={styles.itemMeta}>
                    <span className={styles.timeText}>{evt.timeFormatted}</span>
                    <span className={styles.categoryBadge}>{evt.category}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={cn(styles.statusPill, statusClass)}>
                      {evt.status}
                    </span>
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </div>
                </div>

                <span className={styles.eventTitle}>{evt.title}</span>
                <span className={styles.eventSummary}>{evt.summary}</span>

                {/* Level 2 & 3 Contextual Progressive Disclosure */}
                {isExpanded && (
                  <div className={styles.detailDrawer} onClick={(e) => e.stopPropagation()}>
                    {evt.context.workflowId && (
                      <div className={styles.detailField}>
                        <span className={styles.fieldLabel}>WORKFLOW ID</span>
                        <span className={styles.fieldValue}>{evt.context.workflowId}</span>
                      </div>
                    )}
                    {evt.context.toolName && (
                      <div className={styles.detailField}>
                        <span className={styles.fieldLabel}>CAPABILITY / TOOL</span>
                        <span className={styles.fieldValue}>{evt.context.toolName}</span>
                      </div>
                    )}
                    {evt.context.provider && (
                      <div className={styles.detailField}>
                        <span className={styles.fieldLabel}>AI PROVIDER</span>
                        <span className={styles.fieldValue}>{evt.context.provider}</span>
                      </div>
                    )}
                    {evt.context.applicationId && (
                      <div className={styles.detailField}>
                        <span className={styles.fieldLabel}>APPLICATION</span>
                        <span className={styles.fieldValue}>{evt.context.applicationId}</span>
                      </div>
                    )}
                    {evt.context.resourcePath && (
                      <div className={styles.detailField}>
                        <span className={styles.fieldLabel}>AFFECTED RESOURCE</span>
                        <span className={styles.fieldValue}>{evt.context.resourcePath}</span>
                      </div>
                    )}
                    {evt.context.failureReason && (
                      <div className={styles.detailField}>
                        <span className={styles.fieldLabel}>FAILURE REASON</span>
                        <span className={styles.fieldValue}>{evt.context.failureReason}</span>
                      </div>
                    )}
                    <div className={styles.detailField}>
                      <span className={styles.fieldLabel}>EVENT ID</span>
                      <span className={styles.fieldValue}>{evt.eventId}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
