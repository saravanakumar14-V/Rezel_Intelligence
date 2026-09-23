import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { RezelDirector, type DirectorEvent } from '../../lib/director/RezelDirector';
import { cn } from '../../lib/cn';
import styles from './ModeSelector.module.css';
import { MODE_OPTIONS, type SelectableMode } from './modeOptions';
import type { Mode } from '../../lib/director/types';

export { MODE_OPTIONS, type ModeOption, type SelectableMode } from './modeOptions';

export interface ModeSelectorProps {
  className?: string;
}

/**
 * ModeSelector
 *
 * User-facing presentation control for Rezel AI Experience Modes.
 * Subscribes to RezelDirector mode_changed and profile_changed events.
 * Relies strictly on RezelDirector for mode state and persistence.
 */
export default function ModeSelector({ className }: ModeSelectorProps) {
  const [effectiveMode, setEffectiveMode] = useState<Mode>(() => RezelDirector.getCurrentMode());
  const [isAuto, setIsAuto] = useState<boolean>(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuItemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Synchronize with RezelDirector events (including voice/text commands)
  useEffect(() => {
    const handler = (event: DirectorEvent) => {
      if (event.type === 'mode_changed' && event.payload?.mode) {
        setEffectiveMode(event.payload.mode);
      }
      if (event.type === 'profile_changed' && event.payload?.profile) {
        // Experience profile updated in Director
      }
    };

    RezelDirector.subscribe(handler);
    return () => RezelDirector.unsubscribe(handler);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!isMenuOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isMenuOpen]);

  const handleSelectMode = useCallback((modeId: SelectableMode) => {
    if (modeId === 'AUTO') {
      setIsAuto(true);
      RezelDirector.clearPersistentMode();
    } else {
      setIsAuto(false);
      RezelDirector.setMode(modeId);
    }
    setEffectiveMode(RezelDirector.getCurrentMode());
    setIsMenuOpen(false);
    triggerRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isMenuOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsMenuOpen(true);
        setFocusedIndex(0);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setIsMenuOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = (prev + 1) % MODE_OPTIONS.length;
        menuItemsRef.current[next]?.focus();
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => {
        const next = prev <= 0 ? MODE_OPTIONS.length - 1 : prev - 1;
        menuItemsRef.current[next]?.focus();
        return next;
      });
    }
  };

  const activeOption = isAuto
    ? MODE_OPTIONS[0]
    : MODE_OPTIONS.find((opt) => opt.id === effectiveMode) ?? MODE_OPTIONS[1];

  const CurrentIcon = activeOption.icon;
  const modeClassKey = isAuto
    ? 'mode-auto'
    : `mode-${effectiveMode.toLowerCase()}`;

  return (
    <div
      ref={containerRef}
      className={cn(styles.wrapper, className)}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Pill Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setIsMenuOpen((prev) => !prev);
          if (!isMenuOpen) setFocusedIndex(0);
        }}
        className={cn(styles.pillButton, styles[modeClassKey])}
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-label={`AI Experience Mode: ${activeOption.label}. Click to change.`}
        title={`AI Experience Mode: ${activeOption.label}`}
      >
        <span className={styles.icon} aria-hidden="true">
          <CurrentIcon size={12} />
        </span>
        <span className={styles.label}>
          {activeOption.badgeLabel}
        </span>
        <ChevronDown
          size={10}
          className={cn(styles.chevron, isMenuOpen && styles.chevronOpen)}
          aria-hidden="true"
        />
      </button>

      {/* Popover Menu */}
      {isMenuOpen && (
        <div
          className={styles.dropdownMenu}
          role="menu"
          aria-label="Select AI Experience Mode"
        >
          <div className={styles.menuHeader} aria-hidden="true">
            AI Experience Mode
          </div>

          {MODE_OPTIONS.map((opt, idx) => {
            const Icon = opt.icon;
            const isSelected = isAuto
              ? opt.id === 'AUTO'
              : opt.id === effectiveMode;

            return (
              <button
                key={opt.id}
                ref={(el) => { menuItemsRef.current[idx] = el; }}
                type="button"
                role="menuitemradio"
                aria-checked={isSelected}
                tabIndex={focusedIndex === idx ? 0 : -1}
                onClick={() => handleSelectMode(opt.id)}
                className={cn(
                  styles.menuItem,
                  styles[opt.classNameKey],
                  isSelected && styles.menuItemActive
                )}
              >
                <div className={styles.itemIconWrapper} aria-hidden="true">
                  <Icon size={13} />
                </div>
                <div className={styles.itemContent}>
                  <div className={styles.itemHeader}>
                    <span className={styles.itemLabel}>{opt.label}</span>
                    {isSelected && <span className={styles.activeDot} aria-hidden="true" />}
                  </div>
                  <span className={styles.itemDesc}>{opt.description}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
