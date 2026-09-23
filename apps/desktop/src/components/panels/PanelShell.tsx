import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import styles from './PanelShell.module.css';

interface PanelShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
}

export default function PanelShell({
  title,
  subtitle,
  children,
  className,
}: PanelShellProps) {
  return (
    <div className={cn(styles.panel, 'rz-glass-panel', className)}>
      <div className={styles.header}>
        <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
        <div className={styles.titleWrapper}>
          <span className={styles.title}>{title}</span>
          {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
        </div>
      </div>

      <div className={styles.divider} aria-hidden />

      <div className={styles.content}>
        {children}
      </div>

      <div className={styles.cornerTL} aria-hidden />
      <div className={styles.cornerBR} aria-hidden />
      <div className={styles.scanline} aria-hidden />
    </div>
  );
}
