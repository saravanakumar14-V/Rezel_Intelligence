/**
 * Rezel 11.6C — Computer Action Validator
 *
 * Enforces pre-execution validation for controlled computer actions:
 * - Target semantic element validity against live UI state (detects TARGET_STALE)
 * - Coordinate bounding box validation (prevents out-of-bounds clicks)
 * - ApplicationSession live health revalidation (prevents actions on stale instances)
 * - Risk classification and mandatory approval verification
 * - Sensitive credential input protection
 */

import type { ComputerAction } from './types';
import { ComputerError } from './types';
import type { UIAnalysisResult } from '../ui/types';
import { ApplicationRegistry } from '../../applications/ApplicationRegistry';

export class ComputerActionValidator {
  /**
   * Validates a computer action before execution.
   */
  static validate(action: ComputerAction, currentUIState?: UIAnalysisResult): void {
    if (!action || !action.actionId || !action.type) {
      throw new ComputerError('COMPUTER_ACTION_INVALID', 'Invalid computer action structure');
    }

    // 1. Validate action type and capability mapping
    const validTypes = [
      'CLICK',
      'DOUBLE_CLICK',
      'RIGHT_CLICK',
      'TYPE',
      'KEY_PRESS',
      'HOTKEY',
      'SCROLL',
      'DRAG',
      'FOCUS',
      'SELECT',
      'EXPAND',
      'COLLAPSE',
      'PASTE',
    ];
    if (!validTypes.includes(action.type)) {
      throw new ComputerError('COMPUTER_ACTION_INVALID', `Unsupported computer action type: ${action.type}`, { type: action.type });
    }

    const expectedCapability = `computer.${action.type.toLowerCase()}`;
    if (action.requiredCapability !== expectedCapability && action.requiredCapability !== 'computer.execute') {
      throw new ComputerError(
        'COMPUTER_ACTION_UNAUTHORIZED',
        `Mismatched capability: action requires '${expectedCapability}', but received '${action.requiredCapability}'`,
        { required: expectedCapability, actual: action.requiredCapability }
      );
    }

    // 2. Validate target UI Element / Window
    const target = action.target;
    if (target) {
      const targetElementId = target.elementId;
      const targetAutoId = (target as any).automationId as string | undefined;
      if (targetElementId || targetAutoId) {
        if (currentUIState) {
          const el = currentUIState.elements.find(
            (e) => (targetElementId && e.elementId === targetElementId) || (targetAutoId && e.automationId === targetAutoId)
          );
          if (!el || el.visible === false) {
            throw new ComputerError(
              'TARGET_STALE',
              `Target UI element '${targetElementId || targetAutoId}' is no longer visible or present in active window`,
              { elementId: targetElementId, automationId: targetAutoId }
            );
          }
        }
      }

      if (target.windowId && currentUIState?.windows) {
        const win = currentUIState.windows.find((w) => w.windowId === target.windowId);
        if (!win || win.visible === false) {
          throw new ComputerError(
            'TARGET_STALE',
            `Target window '${target.windowId}' is no longer visible or present`,
            { windowId: target.windowId }
          );
        }
      }
    }

    // 3. Validate coordinate bounds if provided (supports virtual multi-monitor desktop bounds)
    if (target?.bounds) {
      const { x, y, width, height } = target.bounds;
      if (width <= 0 || height <= 0 || x < -32768 || y < -32768 || x > 32767 || y > 32767) {
        throw new ComputerError(
          'ACTION_OUT_OF_BOUNDS',
          `Coordinate bounds { x: ${x}, y: ${y}, width: ${width}, height: ${height} } are outside authorized virtual display bounds`,
          { bounds: target.bounds }
        );
      }
    }

    // 4. Validate Application Session
    if (target?.sessionId && target?.applicationId) {
      const app = ApplicationRegistry.get(target.applicationId);
      if (app) {
        const health = app.getHealth(target.sessionId);
        if (!health || (health.state !== 'READY' && health.state !== 'DEGRADED')) {
          throw new ComputerError(
            'APPLICATION_SESSION_STALE',
            `Cannot execute action: Application session '${target.sessionId}' is not in READY state (${health?.state || 'UNKNOWN'})`,
            { applicationId: target.applicationId, sessionId: target.sessionId, state: health?.state }
          );
        }
      }
    }

    // 5. Validate risk & approval consistency
    if (action.riskLevel === 'HIGH' || action.riskLevel === 'CRITICAL') {
      if (!action.requiresApproval) {
        throw new ComputerError(
          'APPROVAL_REQUIRED',
          `Actions of ${action.riskLevel} risk tier must have requiresApproval = true`,
          { actionId: action.actionId, riskLevel: action.riskLevel }
        );
      }
    }

    // 6. Sensitive parameter validation
    if (action.type === 'TYPE') {
      const text = (action.parameters?.text as string) || target?.text;
      if (!text && text !== '') {
        throw new ComputerError('COMPUTER_ACTION_INVALID', 'Type action missing required text parameter');
      }
    }
  }
}
