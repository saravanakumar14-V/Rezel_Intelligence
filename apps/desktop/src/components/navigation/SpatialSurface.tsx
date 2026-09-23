import React, { useState } from 'react';
import {
  X,
  ChevronRight,
  Info,
} from 'lucide-react';
import type {
  SpatialSurfaceDefinition,
  SpatialSurfaceState,
} from '../../lib/navigation/SpatialSurfaceRegistry';
import { CodeEditorWorkspace } from './workspaces/CodeEditorWorkspace';
import { VisualCanvasWorkspace } from './workspaces/VisualCanvasWorkspace';
import { ChatWorkspace } from './workspaces/ChatWorkspace';
import { ConversationHistoryWorkspace } from './workspaces/ConversationHistoryWorkspace';
import { WorkflowRunnerWorkspace } from './workspaces/WorkflowRunnerWorkspace';
import { ProviderMatrixWorkspace } from './workspaces/ProviderMatrixWorkspace';
import { TelemetryGaugesWorkspace } from './workspaces/TelemetryGaugesWorkspace';
import { MemoryForensicsWorkspace } from './workspaces/MemoryForensicsWorkspace';
import { ModelCatalogWorkspace } from './workspaces/ModelCatalogWorkspace';
import { TrustGatesWorkspace } from './workspaces/TrustGatesWorkspace';
import { SecurityAuditWorkspace } from './workspaces/SecurityAuditWorkspace';
import { PersonaDesignerWorkspace } from './workspaces/PersonaDesignerWorkspace';
import { BridgeWorkspace } from './workspaces/BridgeWorkspace';
import { GenericFallbackWorkspace } from './workspaces/GenericFallbackWorkspace';
import { cn } from '../../lib/cn';
import styles from './SpatialSurface.module.css';

export interface SpatialSurfaceProps {
  surface: SpatialSurfaceDefinition;
  state: SpatialSurfaceState;
  isCurrent: boolean;
  depth: number;
  onSelectAction: (targetSurfaceId: string) => void;
  onClose: () => void;
  onFocus: () => void;
  className?: string;
}

export const SpatialSurface: React.FC<SpatialSurfaceProps> = ({
  surface,
  state,
  isCurrent,
  depth,
  onSelectAction,
  onClose,
  onFocus,
  className,
}) => {
  const [showInfoDrawer, setShowInfoDrawer] = useState(false);

  const getDepthClass = () => {
    if (depth === 1) return styles.surfaceDepthL1;
    if (depth === 2) return styles.surfaceDepthL2;
    return styles.surfaceDepthL3;
  };

  const getStateClass = () => {
    switch (state) {
      case 'spawning':
        return styles.stateSpawning;
      case 'active':
        return styles.stateActive;
      case 'background':
        return styles.stateBackground;
      case 'collapsed':
        return styles.stateCollapsed;
      case 'closing':
        return styles.stateClosing;
      default:
        return styles.stateActive;
    }
  };

  const renderTaskWorkspace = () => {
    if (surface.taskType === 'code-editor') {
      return <CodeEditorWorkspace />;
    }
    if (surface.taskType === 'visual-canvas') {
      return <VisualCanvasWorkspace />;
    }
    if (surface.taskType === 'chat-dialogue') {
      return <ChatWorkspace />;
    }
    if (surface.taskType === 'conversation-history') {
      return <ConversationHistoryWorkspace />;
    }
    if (surface.taskType === 'workflow-runner') {
      return <WorkflowRunnerWorkspace />;
    }
    if (surface.taskType === 'provider-matrix') {
      return <ProviderMatrixWorkspace />;
    }
    if (surface.taskType === 'telemetry-gauges') {
      return <TelemetryGaugesWorkspace />;
    }
    if (surface.taskType === 'memory-forensics') {
      return <MemoryForensicsWorkspace />;
    }
    if (surface.taskType === 'model-catalog') {
      return <ModelCatalogWorkspace />;
    }
    if (surface.taskType === 'security-audit' || surface.id === 'inspect-security-audit') {
      return <SecurityAuditWorkspace />;
    }
    if (surface.taskType === 'trust-gates') {
      return <TrustGatesWorkspace />;
    }
    if (surface.taskType === 'persona-designer') {
      return <PersonaDesignerWorkspace />;
    }
    if (surface.taskType === 'blender-bridge' || surface.id === 'auto-blender') {
      return <BridgeWorkspace appName="Blender" />;
    }
    if (surface.taskType === 'ae-bridge' || surface.id === 'auto-ae') {
      return <BridgeWorkspace appName="After Effects" />;
    }
    return <GenericFallbackWorkspace surface={surface} />;
  };

  return (
    <aside
      style={
        {
          '--surf-accent': surface.accentColor,
          '--surf-glow': surface.glowColor,
          '--surf-depth-offset': `${(depth - 1) * 12}px`,
        } as React.CSSProperties
      }
      className={cn(
        styles.spatialSurfaceContainer,
        getDepthClass(),
        getStateClass(),
        isCurrent ? styles.surfaceFocused : styles.surfaceUnfocused,
        className
      )}
      onClick={onFocus}
      role="region"
      aria-label={`${surface.humanLabel} Spatial Surface`}
    >
      {/* Spectral Capability Edge Lens (1px Restrained) */}
      <div className={styles.spectralEdgeBeam} aria-hidden="true" />
      <div className={styles.innerGlassHighlight} aria-hidden="true" />

      {/* Surface Header (Dual Typography: Display Title + Monospace Tech ID) */}
      <header className={styles.surfaceHeader}>
        <div className={styles.headerTitleGroup}>
          <div className={styles.headerCategoryRow}>
            <span className={styles.depthBadge}>L{depth}</span>
            <span className={styles.technicalIdentityTag}>
              {surface.technicalIdentity}
            </span>
          </div>

          <h2 className={styles.surfaceHumanTitle}>
            {surface.humanLabel}
          </h2>

          <p className={styles.surfaceDescription}>
            {surface.description}
          </p>
        </div>

        <div className={styles.headerControls}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowInfoDrawer((prev) => !prev);
            }}
            className={cn(
              styles.headerIconButton,
              showInfoDrawer && styles.headerIconButtonActive
            )}
            title="3-Question Micro Guide"
            aria-label="Toggle Guide"
          >
            <Info size={13} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={styles.headerCloseButton}
            title={`Close ${surface.humanLabel} (Esc)`}
            aria-label="Close Surface"
          >
            <X size={13} />
          </button>
        </div>
      </header>

      {/* Progressive Disclosure: 3-Question Micro-Guide Drawer */}
      {showInfoDrawer && (
        <div className={styles.infoDrawer} onClick={(e) => e.stopPropagation()}>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>WHAT IS IT?</span>
            <span className={styles.infoVal}>{surface.whatIsIt}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>WHY USE IT?</span>
            <span className={styles.infoVal}>{surface.whyUseIt}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>WHAT CAN I DO?</span>
            <span className={styles.infoVal}>{surface.whatCanIDo}</span>
          </div>
        </div>
      )}

      {/* Surface Main Body */}
      <div className={styles.surfaceContentBody}>
        {/* ── MODE A: LEVEL 1 / 2 ACTION DECK ── */}
        {surface.actions && surface.actions.length > 0 && (
          <div className={styles.actionIslandList} role="menu">
            {surface.actions.map((act) => (
              <button
                key={act.id}
                type="button"
                className={cn(
                  styles.actionIslandRow,
                  act.isPrimary && styles.actionIslandRowPrimary
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectAction(act.targetSurfaceId);
                }}
                role="menuitem"
              >
                <div className={styles.actionIslandLeft}>
                  <div className={styles.actionIslandHeading}>
                    <span className={styles.actionSignature}>{act.signature}</span>
                    <span className={styles.actionHumanLabel}>{act.humanLabel}</span>
                    {act.isPrimary && (
                      <span className={styles.primaryPill}>PRIMARY</span>
                    )}
                  </div>
                  <span className={styles.actionTechnicalId}>
                    {act.technicalIdentity}
                  </span>
                  <p className={styles.actionDescText}>{act.description}</p>
                </div>

                <div className={styles.actionIslandRight}>
                  {act.shortcutHint && (
                    <span className={styles.actionShortcutBadge}>
                      [{act.shortcutHint}]
                    </span>
                  )}
                  <ChevronRight size={15} className={styles.actionChevron} />
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── MODE B: LEVEL 3 OPERATING TASK WORKSPACES ── */}
        {surface.depth >= 3 && (
          <div className={styles.operatingTaskStage}>
            {renderTaskWorkspace()}
          </div>
        )}
      </div>

      {/* Surface Status Footer */}
      <footer className={styles.surfaceFooter}>
        <span className={styles.surfaceStatusIndicator}>
          ● READY · {surface.technicalIdentity}
        </span>
        <span className={styles.surfaceDepthHint}>
          [ESC] OUTWARD · [CLICK] FOCUS
        </span>
      </footer>
    </aside>
  );
};
