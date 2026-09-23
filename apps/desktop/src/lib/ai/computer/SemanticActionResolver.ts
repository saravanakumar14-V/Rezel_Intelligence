/**
 * Rezel 13.1 — Semantic Action Resolver
 *
 * Resolves requested actions against target UI elements and applications
 * following the explicit 5-tier action hierarchy:
 *
 * 1. Application-Native Adapter (Blender / After Effects RPC)
 * 2. UIA Semantic Pattern (InvokePattern.Invoke, ValuePattern.SetValue, TogglePattern.Toggle, etc.)
 * 3. UIA Direct Element Interaction (IUIAutomationElement.SetFocus)
 * 4. Verified Native Input Fallback (DPI-normalized bounds center point + SendInput)
 * 5. Abort on Ambiguity (UNSUPPORTED / TARGET_AMBIGUOUS)
 */

import type { UIElement, UIWindow } from '../ui/types';
import type { ComputerAction, ComputerActionType } from './types';
import { ApplicationRegistry } from '../../applications/ApplicationRegistry';

export type ActionExecutionStrategy =
  | 'APPLICATION_ADAPTER'
  | 'UIA_SEMANTIC_PATTERN'
  | 'UIA_ELEMENT_INTERACTION'
  | 'NATIVE_INPUT_DISPATCH'
  | 'UNSUPPORTED';

export interface ResolvedActionPlan {
  readonly strategy: ActionExecutionStrategy;
  readonly actionType: ComputerActionType;
  readonly targetElement?: UIElement;
  readonly targetWindow?: UIWindow;
  readonly applicationAdapterId?: string;
  readonly uiaPatternName?: 'Invoke' | 'Value' | 'Toggle' | 'SelectionItem' | 'ExpandCollapse';
  readonly executionParameters: Record<string, unknown>;
  readonly riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  readonly isSupported: boolean;
  readonly reason?: string;
}

export class SemanticActionResolverImpl {
  /**
   * Resolves the best execution strategy for an action and target following the 5-tier hierarchy.
   */
  resolveAction(
    action: ComputerAction,
    targetElement?: UIElement,
    targetWindow?: UIWindow
  ): ResolvedActionPlan {
    const actionType = action.type;
    const appId = action.target?.applicationId || targetWindow?.applicationId;

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 1: Application-Native Adapter (Blender / After Effects)
    // ─────────────────────────────────────────────────────────────────────────
    if (appId && (appId === 'blender' || appId === 'after_effects')) {
      const adapter = ApplicationRegistry.get(appId);
      if (adapter && action.target?.sessionId) {
        const health = adapter.getHealth(action.target.sessionId);
        if (health && health.state === 'READY') {
          return {
            strategy: 'APPLICATION_ADAPTER',
            actionType,
            targetElement,
            targetWindow,
            applicationAdapterId: appId,
            executionParameters: action.parameters || {},
            riskLevel: action.riskLevel,
            isSupported: true,
            reason: `Target application '${appId}' is actively managed by native ApplicationAdapter`,
          };
        }
      }
    }

    const patterns = targetElement?.supportedPatterns || [];

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 2: UIA Semantic Patterns (Invoke, Value, Toggle, SelectionItem, ExpandCollapse)
    // ─────────────────────────────────────────────────────────────────────────
    if (targetElement) {
      if ((actionType === 'CLICK' || actionType === 'DOUBLE_CLICK') && patterns.includes('Invoke')) {
        return {
          strategy: 'UIA_SEMANTIC_PATTERN',
          actionType,
          targetElement,
          targetWindow,
          uiaPatternName: 'Invoke',
          executionParameters: {
            window_id: targetElement.windowId || targetWindow?.windowId,
            element_id: targetElement.elementId,
            automation_id: targetElement.automationId,
            runtime_id: targetElement.runtimeId,
            action_type: 'INVOKE',
          },
          riskLevel: action.riskLevel,
          isSupported: true,
          reason: `Dispatched directly via UIA InvokePattern on '${targetElement.label || targetElement.automationId}'`,
        };
      }

      if (actionType === 'TYPE' && patterns.includes('Value')) {
        const textToSet = (action.parameters?.text as string) ?? action.target?.text ?? '';
        return {
          strategy: 'UIA_SEMANTIC_PATTERN',
          actionType,
          targetElement,
          targetWindow,
          uiaPatternName: 'Value',
          executionParameters: {
            window_id: targetElement.windowId || targetWindow?.windowId,
            element_id: targetElement.elementId,
            automation_id: targetElement.automationId,
            runtime_id: targetElement.runtimeId,
            action_type: 'SET_VALUE',
            value: textToSet,
          },
          riskLevel: action.riskLevel,
          isSupported: true,
          reason: `Set text value directly via UIA ValuePattern on '${targetElement.label || targetElement.automationId}'`,
        };
      }

      if (actionType === 'CLICK' && patterns.includes('Toggle')) {
        return {
          strategy: 'UIA_SEMANTIC_PATTERN',
          actionType,
          targetElement,
          targetWindow,
          uiaPatternName: 'Toggle',
          executionParameters: {
            window_id: targetElement.windowId || targetWindow?.windowId,
            element_id: targetElement.elementId,
            automation_id: targetElement.automationId,
            runtime_id: targetElement.runtimeId,
            action_type: 'TOGGLE',
          },
          riskLevel: action.riskLevel,
          isSupported: true,
          reason: `Toggled state directly via UIA TogglePattern on '${targetElement.label || targetElement.automationId}'`,
        };
      }

      if (actionType === 'SELECT' && patterns.includes('SelectionItem')) {
        return {
          strategy: 'UIA_SEMANTIC_PATTERN',
          actionType,
          targetElement,
          targetWindow,
          uiaPatternName: 'SelectionItem',
          executionParameters: {
            window_id: targetElement.windowId || targetWindow?.windowId,
            element_id: targetElement.elementId,
            automation_id: targetElement.automationId,
            runtime_id: targetElement.runtimeId,
            action_type: 'SELECT',
          },
          riskLevel: action.riskLevel,
          isSupported: true,
          reason: `Selected item directly via UIA SelectionItemPattern`,
        };
      }

      if (actionType === 'EXPAND' && patterns.includes('ExpandCollapse')) {
        return {
          strategy: 'UIA_SEMANTIC_PATTERN',
          actionType,
          targetElement,
          targetWindow,
          uiaPatternName: 'ExpandCollapse',
          executionParameters: {
            window_id: targetElement.windowId || targetWindow?.windowId,
            element_id: targetElement.elementId,
            automation_id: targetElement.automationId,
            runtime_id: targetElement.runtimeId,
            action_type: 'EXPAND',
          },
          riskLevel: action.riskLevel,
          isSupported: true,
          reason: `Expanded item directly via UIA ExpandCollapsePattern`,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 3: UIA Direct Element Interaction (SetFocus)
    // ─────────────────────────────────────────────────────────────────────────
    if (actionType === 'FOCUS') {
      return {
        strategy: 'UIA_ELEMENT_INTERACTION',
        actionType: 'FOCUS',
        targetElement,
        targetWindow,
        executionParameters: {
          window_id: targetElement?.windowId || targetWindow?.windowId,
          element_id: targetElement?.elementId,
          automation_id: targetElement?.automationId,
          runtime_id: targetElement?.runtimeId,
          action_type: 'SET_FOCUS',
          handle: targetElement?.handle || targetWindow?.handle,
        },
        riskLevel: 'LOW',
        isSupported: true,
        reason: `Target focused via UIA direct element interaction`,
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 4: Verified Native Input Fallback (DPI-normalized bounds center point + SendInput)
    // ─────────────────────────────────────────────────────────────────────────
    const parameters: Record<string, unknown> = { ...(action.parameters || {}) };

    if (targetElement?.bounds) {
      const b = targetElement.bounds;
      if (b.width > 0 && b.height > 0) {
        const centerX = Math.round(b.x + b.width / 2);
        const centerY = Math.round(b.y + b.height / 2);
        parameters.x = centerX;
        parameters.y = centerY;
        parameters.bounds = b;
      }
    }

    if (actionType === 'TYPE' || actionType === 'PASTE') {
      parameters.text = action.parameters?.text || action.target?.text;
    }

    // Ensure parameters are valid for dispatch
    const hasCoordinates = parameters.x !== undefined && parameters.y !== undefined;
    const isKeyboardAction = actionType === 'TYPE' || actionType === 'KEY_PRESS' || actionType === 'HOTKEY' || actionType === 'PASTE';

    if (hasCoordinates || isKeyboardAction) {
      return {
        strategy: 'NATIVE_INPUT_DISPATCH',
        actionType,
        targetElement,
        targetWindow,
        executionParameters: parameters,
        riskLevel: action.riskLevel,
        isSupported: true,
        reason: 'Fallback to verified DPI-normalized native Windows SendInput dispatch',
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TIER 5: Abort on Ambiguity
    // ─────────────────────────────────────────────────────────────────────────
    return {
      strategy: 'UNSUPPORTED',
      actionType,
      targetElement,
      targetWindow,
      executionParameters: {},
      riskLevel: action.riskLevel,
      isSupported: false,
      reason: `Cannot resolve semantic target or coordinates for action '${actionType}'`,
    };
  }
}

export const SemanticActionResolver = new SemanticActionResolverImpl();
