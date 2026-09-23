/**
 * Rezel 11.6B — UI & Window Understanding Types
 *
 * Defines contracts for normalized UI elements, windows, visual regions, dialogs,
 * UI analysis results, read-only queries, and error models.
 */

import type { ScreenBounds } from '../screen/types';
import type { ProviderVendor, ProviderRoute } from '../providers/types';

export type UIElementType =
  | 'WINDOW'
  | 'BUTTON'
  | 'TEXT'
  | 'INPUT'
  | 'CHECKBOX'
  | 'RADIO'
  | 'MENU'
  | 'MENU_ITEM'
  | 'TAB'
  | 'DIALOG'
  | 'LIST'
  | 'LIST_ITEM'
  | 'TABLE'
  | 'IMAGE'
  | 'ICON'
  | 'PANEL'
  | 'UNKNOWN';

export interface UIElementState {
  readonly enabled?: boolean;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly visible?: boolean;
  readonly expanded?: boolean;
  readonly toggleState?: number;
}

export interface UIElement {
  readonly elementId: string;
  readonly type: UIElementType;
  readonly role?: string;
  readonly label?: string;
  readonly text?: string;
  readonly value?: string;
  readonly state?: UIElementState;
  readonly bounds?: ScreenBounds;
  readonly visible?: boolean;
  readonly enabled?: boolean;
  readonly focused?: boolean;
  readonly selected?: boolean;
  readonly isExpanded?: boolean;
  readonly isSelected?: boolean;
  readonly toggleState?: number;
  readonly supportedPatterns?: string[];
  readonly dpi?: number;
  readonly confidence?: number;
  readonly evidenceType: 'VISUAL_EVIDENCE' | 'STRUCTURED_OS_STATE' | 'STRUCTURED_OS_UI_STATE';
  readonly parentId?: string;
  readonly children?: string[];
  readonly actions?: string[];
  readonly sourceObservationId: string;
  readonly automationId?: string;
  readonly runtimeId?: string;
  readonly handle?: number;
  readonly windowId?: string;
  readonly processId?: number;
  readonly className?: string;
}

export interface UIWindow {
  readonly windowId: string;
  readonly applicationId?: string;
  readonly sessionId?: string;
  readonly processId?: number;
  readonly title?: string;
  readonly bounds?: ScreenBounds;
  readonly focused?: boolean;
  readonly visible?: boolean;
  readonly minimized?: boolean;
  readonly maximized?: boolean;
  readonly source: 'OS' | 'VISUAL';
  readonly handle?: number;
  readonly className?: string;
  readonly dpi?: number;
}

export type UIRegionRole =
  | 'HEADER'
  | 'SIDEBAR'
  | 'CONTENT'
  | 'TOOLBAR'
  | 'FOOTER'
  | 'DIALOG'
  | 'NAVIGATION'
  | 'UNKNOWN';

export interface UIRegion {
  readonly regionId: string;
  readonly role?: UIRegionRole;
  readonly bounds: ScreenBounds;
  readonly childElementIds: string[];
  readonly confidence?: number;
}

export interface UIDialog {
  readonly dialogId: string;
  readonly title?: string;
  readonly bounds?: ScreenBounds;
  readonly buttonElementIds?: string[];
  readonly isModal?: boolean;
}

export interface UIAnalysisResult {
  readonly observationId: string;
  readonly windows: UIWindow[];
  readonly elements: UIElement[];
  readonly regions?: UIRegion[];
  readonly dialogs?: UIDialog[];
  readonly focusedElementId?: string;
  readonly focusedWindowId?: string;
  readonly confidence?: number;
  readonly evidenceType: 'VISUAL_EVIDENCE' | 'STRUCTURED_OS_UI_STATE';
  readonly source?: 'UI_AUTOMATION' | 'VISION_MODEL' | 'COMPOSITE';
  readonly provider?: ProviderVendor;
  readonly modelId?: string;
  readonly route?: ProviderRoute;
  readonly durationMs?: number;
}

export interface UIQueryFilter {
  readonly type?: UIElementType;
  readonly role?: string;
  readonly label?: string;
  readonly text?: string;
  readonly name?: string;
  readonly automationId?: string;
  readonly elementId?: string;
  readonly focused?: boolean;
  readonly visible?: boolean;
  readonly windowId?: string;
  readonly applicationId?: string;
}

export type UIErrorCode =
  | 'UI_ANALYSIS_FAILED'
  | 'UI_ELEMENT_NOT_FOUND'
  | 'UI_AMBIGUOUS_ELEMENT'
  | 'UI_WINDOW_NOT_FOUND'
  | 'UI_OBSERVATION_EXPIRED'
  | 'UI_CONTEXT_TOO_LARGE'
  | 'UI_CAPABILITY_UNAVAILABLE'
  | 'UI_STRUCTURE_INVALID'
  | 'UI_VISUAL_STATE_CONFLICT';

export class UIError extends Error {
  readonly code: UIErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: UIErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[UI::${code}] ${message}`);
    this.name = 'UIError';
    this.code = code;
    this.details = details;
  }
}
