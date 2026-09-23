import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import styles from './InspectorShell.module.css';

export interface InspectorShellProps {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  headerActions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function InspectorShell({
  title,
  subtitle,
  onClose,
  headerActions,
  children,
  className,
}: InspectorShellProps) {
  return (
    <aside
      className={cn(styles.panel, 'rz-glass-panel', className)}
      role="region"
      aria-label={`${title} Inspector`}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
          <div className={styles.titleWrapper}>
            <span className={styles.title}>{title}</span>
            {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          </div>
        </div>

        <div className={styles.headerActions}>
          {headerActions}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={styles.closeBtn}
              title="Close Inspector (Esc)"
              aria-label="Close Inspector"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className={styles.divider} aria-hidden />

      <div className={styles.content}>
        {children}
      </div>

      <div className={styles.cornerTL} aria-hidden />
      <div className={styles.cornerBR} aria-hidden />
      <div className={styles.scanline} aria-hidden />
    </aside>
  );
}
