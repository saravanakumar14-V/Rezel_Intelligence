/**
 * Rezel 13.2.2 — UIA Evidence Mapper
 *
 * Translates raw structured UI observations (UIAnalysisResult, UIElement, UIWindow)
 * into normalized verification entities (AppEntity[]) and structured StateEvidence records.
 *
 * Pure translation logic: does NOT perform state inference decisions or actions.
 */

import type { UIAnalysisResult } from '../ui/types';
import type { AppEntity, NormalizedObservation } from '../verification/types';
import type { StateEvidence } from './types';

export class UIAEvidenceMapper {
  /**
   * Converts a UIAnalysisResult into a NormalizedObservation for consumption by VerificationEngine.
   */
  static toNormalizedObservation(
    uiResult: UIAnalysisResult,
    appId: string,
    sessionId?: string
  ): NormalizedObservation {
    const entities = this.extractEntities(uiResult);

    return {
      appId,
      sessionId,
      timestamp: Date.now(),
      status: uiResult.elements.length > 0 || uiResult.windows.length > 0 ? 'READY' : 'EMPTY',
      entities,
      metadata: {
        observationId: uiResult.observationId,
        windowCount: uiResult.windows.length,
        elementCount: uiResult.elements.length,
        evidenceType: uiResult.evidenceType,
        source: uiResult.source,
      },
      sourceCapability: 'ui_automation_observation',
      isStale: false,
    };
  }

  /**
   * Extracts structured AppEntity items from windows, dialogs, and elements.
   */
  static extractEntities(uiResult: UIAnalysisResult): AppEntity[] {
    const entities: AppEntity[] = [];

    // 1. Windows
    for (const win of uiResult.windows || []) {
      entities.push({
        id: win.windowId,
        type: 'WINDOW',
        name: win.title || 'Window',
        properties: {
          windowId: win.windowId,
          applicationId: win.applicationId,
          processId: win.processId,
          title: win.title,
          focused: win.focused,
          visible: win.visible,
          minimized: win.minimized,
          maximized: win.maximized,
          className: win.className,
          handle: win.handle,
        },
      });
    }

    // 2. Dialogs
    for (const dlg of uiResult.dialogs || []) {
      entities.push({
        id: dlg.dialogId,
        type: 'DIALOG',
        name: dlg.title || 'Dialog',
        properties: {
          dialogId: dlg.dialogId,
          title: dlg.title,
          isModal: dlg.isModal ?? true,
          buttonElementIds: dlg.buttonElementIds,
        },
      });
    }

    // 3. Elements
    for (const el of uiResult.elements || []) {
      const typeStr = (el.type || el.role || 'UNKNOWN').toUpperCase();
      const nameStr = el.label || el.automationId || el.text || '';

      entities.push({
        id: el.elementId,
        type: typeStr,
        name: nameStr,
        properties: {
          elementId: el.elementId,
          automationId: el.automationId,
          className: el.className,
          role: el.role,
          label: el.label,
          text: el.text,
          value: el.value ?? el.text,
          enabled: el.enabled ?? el.state?.enabled ?? true,
          focused: el.focused ?? el.state?.focused ?? false,
          visible: el.visible ?? el.state?.visible ?? true,
          selected: el.selected ?? el.state?.selected ?? false,
          expanded: el.isExpanded ?? el.state?.expanded ?? false,
          toggleState: el.toggleState ?? el.state?.toggleState,
          supportedPatterns: el.supportedPatterns || [],
          windowId: el.windowId,
          processId: el.processId,
          handle: el.handle,
        },
      });

      // Special synthetic mapping: Document Editor Canvas
      if (
        typeStr === 'DOCUMENT' ||
        typeStr === 'EDIT' ||
        el.role === 'Document' ||
        el.className === 'Edit' ||
        el.className === 'RichEditD2DPT'
      ) {
        entities.push({
          id: `doc_${el.elementId}`,
          type: 'DOCUMENT',
          name: nameStr || 'Active Document',
          properties: {
            elementId: el.elementId,
            text: el.text ?? el.value ?? '',
            value: el.value ?? el.text ?? '',
            focused: el.focused ?? false,
            length: (el.text ?? el.value ?? '').length,
          },
        });
      }
    }

    return entities;
  }

  /**
   * Extracts structural evidence records from the UIA analysis result.
   */
  static extractStructuralEvidence(uiResult: UIAnalysisResult): StateEvidence[] {
    const evidence: StateEvidence[] = [];
    const now = Date.now();

    // Check Window structure
    if (uiResult.windows && uiResult.windows.length > 0) {
      const focusedWin = uiResult.windows.find((w) => w.focused) || uiResult.windows[0];
      evidence.push({
        source: 'WINDOW',
        description: `Active window '${focusedWin.title || focusedWin.windowId}' (class: ${
          focusedWin.className || 'unknown'
        })`,
        matchedElements: [focusedWin.windowId],
        confidence: 'HIGH',
        observedAt: now,
        details: {
          windowId: focusedWin.windowId,
          title: focusedWin.title,
          className: focusedWin.className,
          visible: focusedWin.visible,
          focused: focusedWin.focused,
        },
      });
    }

    // Check for Modal Dialogs
    const modalDialog = (uiResult.dialogs || []).find((d) => d.isModal);
    const modalWindow = (uiResult.windows || []).find(
      (w) => w.className === '#32770' || w.className?.includes('Dialog')
    );
    const modalElement = (uiResult.elements || []).find(
      (el) => el.type === 'DIALOG' || el.role === 'Dialog' || el.className === '#32770'
    );

    if (modalDialog || modalWindow || modalElement) {
      const matchedId =
        modalDialog?.dialogId || modalWindow?.windowId || modalElement?.elementId || 'modal_ui';
      evidence.push({
        source: 'UIA',
        description: 'Modal dialog or popup window detected in UI tree',
        matchedElements: [matchedId],
        confidence: 'HIGH',
        observedAt: now,
        details: {
          modalDialogId: modalDialog?.dialogId,
          modalWindowId: modalWindow?.windowId,
          modalElementId: modalElement?.elementId,
        },
      });
    }

    // Check for Document / Editor presence
    const editorElement = (uiResult.elements || []).find(
      (el) =>
        (el.type as string) === 'DOCUMENT' ||
        el.role === 'Document' ||
        el.className === 'Edit' ||
        el.className === 'RichEditD2DPT' ||
        el.automationId === '15' ||
        el.automationId === 'ContentControl'
    );

    if (editorElement) {
      evidence.push({
        source: 'UIA',
        description: `Document editor canvas detected (automationId: ${
          editorElement.automationId || editorElement.className || editorElement.elementId
        })`,
        matchedElements: [editorElement.elementId],
        confidence: 'HIGH',
        observedAt: now,
        details: {
          elementId: editorElement.elementId,
          automationId: editorElement.automationId,
          className: editorElement.className,
          textLength: (editorElement.text || editorElement.value || '').length,
        },
      });
    }

    return evidence;
  }
}
