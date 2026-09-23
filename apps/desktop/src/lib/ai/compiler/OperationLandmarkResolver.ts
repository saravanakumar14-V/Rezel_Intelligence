/**
 * Rezel 13.2.3 — Operation Landmark Resolver
 *
 * Resolves declarative profile UILandmark definitions into physical ComputerActionTarget
 * descriptors using live UI observations from UIUnderstandingEngine.
 *
 * Strict Ambiguity Policy:
 *   0 matches  -> TARGET_NOT_FOUND
 *   >1 matches -> AMBIGUOUS_TARGET (never pick arbitrary elements)
 *   1 match    -> Successfully resolved target
 */

import type { UILandmark, UIMatcher } from '../profiles/types';
import type { UIAnalysisResult, UIElement, UIWindow } from '../ui/types';
import type { ComputerActionTarget } from '../computer/types';
import type { OperationFailureCode } from './types';

export interface LandmarkResolutionSuccess {
  readonly success: true;
  readonly landmarkId: string;
  readonly target: ComputerActionTarget;
  readonly matchedElement?: UIElement;
  readonly matchedWindow?: UIWindow;
}

export interface LandmarkResolutionFailure {
  readonly success: false;
  readonly landmarkId: string;
  readonly failureCode: OperationFailureCode;
  readonly reason: string;
}

export type LandmarkResolutionResult =
  | LandmarkResolutionSuccess
  | LandmarkResolutionFailure;

export class OperationLandmarkResolver {
  /**
   * Resolves a landmark by ID against active UI observation.
   */
  static resolve(
    landmarkId: string,
    landmarks: Readonly<Record<string, UILandmark>> = {},
    uiObservation?: UIAnalysisResult
  ): LandmarkResolutionResult {
    const landmark = landmarks[landmarkId];
    if (!landmark) {
      return {
        success: false,
        landmarkId,
        failureCode: 'TARGET_NOT_FOUND',
        reason: `Landmark '${landmarkId}' is not declared in application profile`,
      };
    }

    if (!uiObservation || (uiObservation.elements.length === 0 && uiObservation.windows.length === 0)) {
      return {
        success: false,
        landmarkId,
        failureCode: 'TARGET_NOT_FOUND',
        reason: `UI observation is empty or unavailable for landmark '${landmarkId}'`,
      };
    }

    const matchedElements: UIElement[] = [];
    const matchedWindows: UIWindow[] = [];

    // Evaluate matchers against UI elements
    for (const matcher of landmark.matchers) {
      for (const el of uiObservation.elements) {
        if (this.matchesElement(el, matcher)) {
          if (!matchedElements.some((m) => m.elementId === el.elementId)) {
            matchedElements.push(el);
          }
        }
      }

      // Check windows if matcher targets window
      if (matcher.role?.toUpperCase() === 'WINDOW' || matcher.className) {
        for (const win of uiObservation.windows) {
          if (this.matchesWindow(win, matcher)) {
            if (!matchedWindows.some((w) => w.windowId === win.windowId)) {
              matchedWindows.push(win);
            }
          }
        }
      }
    }

    const totalMatches = matchedElements.length + matchedWindows.length;

    if (totalMatches === 0) {
      return {
        success: false,
        landmarkId,
        failureCode: 'TARGET_NOT_FOUND',
        reason: `Landmark '${landmarkId}' (${landmark.description}) was not found in active UI tree`,
      };
    }

    if (totalMatches > 1) {
      const matchIds = [
        ...matchedElements.map((e) => e.elementId || e.automationId || 'el'),
        ...matchedWindows.map((w) => w.windowId || 'win'),
      ];
      return {
        success: false,
        landmarkId,
        failureCode: 'AMBIGUOUS_TARGET',
        reason: `Landmark '${landmarkId}' matched ${totalMatches} distinct UI entities: [${matchIds.join(', ')}]`,
      };
    }

    // Exactly 1 match
    if (matchedElements.length === 1) {
      const el = matchedElements[0];
      const target: ComputerActionTarget = {
        elementId: el.elementId,
        bounds: el.bounds,
        windowId: el.windowId,
        processId: el.processId,
        handle: el.handle,
        text: el.text || el.label || el.automationId,
      };

      return {
        success: true,
        landmarkId,
        target,
        matchedElement: el,
      };
    }

    const win = matchedWindows[0];
    const target: ComputerActionTarget = {
      windowId: win.windowId,
      bounds: win.bounds,
      processId: win.processId,
      handle: win.handle,
      text: win.title,
    };

    return {
      success: true,
      landmarkId,
      target,
      matchedWindow: win,
    };
  }

  private static matchesElement(el: UIElement, matcher: UIMatcher): boolean {
    if (matcher.automationId && el.automationId !== matcher.automationId) {
      return false;
    }
    if (matcher.className && el.className !== matcher.className) {
      return false;
    }
    if (matcher.role) {
      const elRole = (el.role || el.type || '').toUpperCase();
      if (elRole !== matcher.role.toUpperCase()) {
        return false;
      }
    }
    if (matcher.controlType) {
      const elType = (el.type || el.role || '').toUpperCase();
      if (elType !== matcher.controlType.toUpperCase()) {
        return false;
      }
    }
    if (matcher.name) {
      const name = el.label || el.text || el.automationId || '';
      if (name !== matcher.name && !name.toLowerCase().includes(matcher.name.toLowerCase())) {
        return false;
      }
    }
    return true;
  }

  private static matchesWindow(win: UIWindow, matcher: UIMatcher): boolean {
    if (matcher.className && win.className !== matcher.className) {
      return false;
    }
    if (matcher.name && win.title && !win.title.includes(matcher.name)) {
      return false;
    }
    return true;
  }
}
