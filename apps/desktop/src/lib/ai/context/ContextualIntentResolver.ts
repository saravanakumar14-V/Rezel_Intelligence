import { SpatialNavigationEngine } from '../../navigation/SpatialNavigationEngine';
import { AdaptiveWorkspaceManager } from '../../workspace/multi-context/AdaptiveWorkspaceManager';
import { ApprovalBridge } from '../approval/ApprovalBridge';
import { ProviderRouter } from '../providers/ProviderRouter';
import { RezelDirector } from '../../director/RezelDirector';
import { NotificationIntelligenceCenter } from '../../notifications/NotificationIntelligenceCenter';
import { PersonalizationManager } from '../../personalization/PersonalizationManager';
import { KnowledgeIngestionManager } from '../knowledge/KnowledgeIngestionManager';
import type { InspectorId } from '../../../types/navigation';

export interface ContextualIntentResult {
  handled: boolean;
  type: 'INSPECTOR' | 'ACTION' | 'NAVIGATION' | 'CONVERSATION' | 'WORKFLOW_CONTROL' | 'MEMORY';
  targetInspector?: InspectorId;
  actionSummary?: string;
  responseText?: string;
}

/**
 * ContextualIntentResolver
 *
 * Unified multimodal intent resolver that translates both text and spoken intents
 * against the live workspace state, focused inspector, active workflow, and system telemetry.
 */
export class ContextualIntentResolver {
  /**
   * Resolves an arbitrary intent string contextually.
   */
  public static async resolveIntent(userQuery: string): Promise<ContextualIntentResult> {
    const query = userQuery.trim();
    if (!query) {
      return { handled: false, type: 'CONVERSATION' };
    }

    const lower = query.toLowerCase();

    // 0. Universal Spatial Navigation & Discoverability: "show capabilities", "what can you do?", "explore rezel", "access field"
    if (
      lower.includes('show capabilities') ||
      lower.includes('what can you do') ||
      lower.includes('explore rezel') ||
      lower.includes('show me what rezel can do') ||
      lower.includes('capabilities') ||
      lower.includes('access field') ||
      lower === '/menu' ||
      lower === '/explore' ||
      lower === '/nav' ||
      lower === '/help'
    ) {
      return {
        handled: true,
        type: 'ACTION',
        actionSummary: 'ACCESS_FIELD_OPENED',
        responseText: 'Opening Rezel Universal Access Field. Hover or select any capability node to explore.',
      };
    }

    // 1. Navigation & Hierarchy: "go back", "back", "escape"
    if (/^(go back|back|return|previous screen|close inspector)$/i.test(lower)) {
      if (SpatialNavigationEngine.canGoBack()) {
        SpatialNavigationEngine.goBack();
        return {
          handled: true,
          type: 'NAVIGATION',
          actionSummary: 'NAVIGATED_BACK',
          responseText: 'Returned to previous context.',
        };
      }
    }

    // 2. Cancellation: "cancel that", "stop", "abort"
    if (/^(cancel that|cancel|stop|abort|halt|stop that)$/i.test(lower)) {
      RezelDirector.interrupt();
      NotificationIntelligenceCenter.emit({
        title: 'Operation Cancelled',
        summary: 'Cancelled active turn and execution',
        severity: 'INFO',
        source: 'AGENT',
      });
      return {
        handled: true,
        type: 'ACTION',
        actionSummary: 'CANCELLED',
        responseText: 'Operation cancelled.',
      };
    }

    // 3. Continuation & Approval: "continue", "proceed", "approve", "confirm", "yes"
    const pendingApprovals = ApprovalBridge.getPending ? ApprovalBridge.getPending() : [];
    if (pendingApprovals.length > 0) {
      const latest = pendingApprovals[0];
      if (/^(approve|yes|confirm|allow|proceed|continue|yes approve)$/i.test(lower)) {
        await ApprovalBridge.approve(latest.approvalId);
        return {
          handled: true,
          type: 'ACTION',
          actionSummary: 'APPROVAL_GRANTED',
          responseText: `Approved: ${latest.summary || latest.reason || 'Action'}. Continuing execution.`,
        };
      } else if (/^(deny|reject|do not allow|disallow|no)$/i.test(lower)) {
        await ApprovalBridge.deny(latest.approvalId);
        return {
          handled: true,
          type: 'ACTION',
          actionSummary: 'APPROVAL_DENIED',
          responseText: `Action denied.`,
        };
      }
    }

    // 4. Workflow Continuation / Retry: "continue", "retry", "try again"
    if (/^(retry|try again|restart step|re-run)$/i.test(lower)) {
      const activeCtx = AdaptiveWorkspaceManager.getActiveContext();
      if (activeCtx && activeCtx.type === 'WORKFLOW') {
        NotificationIntelligenceCenter.emit({
          title: 'Retrying Workflow Step',
          summary: `Retrying execution for ${activeCtx.title}`,
          severity: 'INFO',
          source: 'WORKFLOW',
        });
        return {
          handled: true,
          type: 'WORKFLOW_CONTROL',
          actionSummary: 'WORKFLOW_RETRY',
          responseText: `Retrying active step for ${activeCtx.title}.`,
        };
      }
    }

    // 5. Deep Contextual Queries: "why?", "what happened?", "why did this fail?", "why did you switch models?"
    if (lower.includes('why did you switch') || lower.includes('why switch models') || lower.includes('router reason')) {
      SpatialNavigationEngine.navigate('CORE', { subContext: 'providers' });
      const routingProfile = ProviderRouter.getRoutingProfile();
      return {
        handled: true,
        type: 'INSPECTOR',
        targetInspector: 'providers',
        responseText: `Provider router evaluated latency and failure rates. Operating on ${routingProfile} profile.`,
      };
    }

    if (/why.*(workflow|step|task|this|action).*fail|why did this fail|why did.*fail|what failed/i.test(lower)) {
      SpatialNavigationEngine.navigate('CORE', { subContext: 'workflow' });
      return {
        handled: true,
        type: 'INSPECTOR',
        targetInspector: 'workflow',
        responseText: 'Opening Workflow Inspector at failed step execution log.',
      };
    }

    if (lower.includes('why do you remember') || lower.includes('why remember that') || lower.includes('memory provenance')) {
      SpatialNavigationEngine.navigate('CORE', { subContext: 'memory' });
      return {
        handled: true,
        type: 'INSPECTOR',
        targetInspector: 'memory',
        responseText: 'Opening Memory Inspector showing knowledge provenance and attribution.',
      };
    }

    // 6. Direct Inspector Opening Intents
    if (/^(show|open|view)?\s*(my models|models|model catalog|catalog)$/i.test(lower) || lower === '/models') {
      return { handled: true, type: 'INSPECTOR', targetInspector: 'models', responseText: 'Opening Model Intelligence Inspector.' };
    }
    if (/^(show|open|view)?\s*(providers|provider router|router|failover|network)$/i.test(lower) || lower === '/providers') {
      return { handled: true, type: 'INSPECTOR', targetInspector: 'providers', responseText: 'Opening Provider Intelligence Inspector.' };
    }
    if (/^(show|open|view)?\s*(memory|knowledge|provenance|mem)$/i.test(lower) || lower === '/memory' || lower === '/mem') {
      return { handled: true, type: 'INSPECTOR', targetInspector: 'memory', responseText: 'Opening Memory & Knowledge Inspector.' };
    }
    if (/^(show|open|view)?\s*(workflows|workflow|automation|automations|auto)$/i.test(lower) || lower === '/workflow' || lower === '/auto') {
      return { handled: true, type: 'INSPECTOR', targetInspector: 'workflow', responseText: 'Opening Workflow Intelligence Inspector.' };
    }
    if (/^(show|open|view)?\s*(conversations|transcripts|history|chat history)$/i.test(lower) || lower === '/conversations') {
      return { handled: true, type: 'INSPECTOR', targetInspector: 'conversations', responseText: 'Opening Conversation Transcripts.' };
    }
    if (/^(show|open|view)?\s*(system|system status|system telemetry|hardware|telemetry|metrics|sys)$/i.test(lower) || lower.includes('system telemetry') || lower === '/system' || lower === '/sys') {
      return { handled: true, type: 'INSPECTOR', targetInspector: 'system', responseText: 'Opening System Telemetry Inspector.' };
    }
    if (/^(show|open|view)?\s*(trust|security|audit|permissions|access)$/i.test(lower) || lower === '/trust') {
      return { handled: true, type: 'INSPECTOR', targetInspector: 'trust', responseText: 'Opening Trust & Security Inspector.' };
    }
    if (/^(show|open|view)?\s*(preferences|personalization|settings|config)$/i.test(lower) || lower === '/settings') {
      return { handled: true, type: 'INSPECTOR', targetInspector: 'personalization', responseText: 'Opening Personalization & Preferences.' };
    }

    // 7. Workspace State Inquiries: "what is running?", "what needs attention?"
    if (lower.includes('what is running') || lower.includes("what's running") || lower.includes('background tasks')) {
      const bg = AdaptiveWorkspaceManager.getBackgroundContexts();
      if (bg.length === 0) {
        return {
          handled: true,
          type: 'ACTION',
          responseText: 'No background workflows are currently executing.',
        };
      }
      const summary = bg.map((c) => `${c.title} (${Math.round(c.progress || 0)}%)`).join(', ');
      return {
        handled: true,
        type: 'ACTION',
        responseText: `Currently running in background: ${summary}.`,
      };
    }

    if (lower.includes('what needs attention') || lower.includes('needs my attention') || lower.includes('pending items')) {
      const att = AdaptiveWorkspaceManager.getAttentionContexts();
      if (att.length === 0 && pendingApprovals.length === 0) {
        return {
          handled: true,
          type: 'ACTION',
          responseText: 'All systems and background activities are operating normally. No items require attention.',
        };
      }
      const items = [
        ...pendingApprovals.map((p) => `Approval: ${p.summary || p.reason || p.approvalId}`),
        ...att.map((c) => `Attention: ${c.title} (${c.blockedReason || 'blocked'})`),
      ];
      return {
        handled: true,
        type: 'ACTION',
        responseText: `Items requiring attention: ${items.join('; ')}.`,
      };
    }

    // 8. Memory Commands: "remember this ...", "forget that"
    if (lower.startsWith('remember this') || lower.startsWith('save memory')) {
      const memContent = query.replace(/^(remember this:?|save memory:?)/i, '').trim();
      if (memContent) {
        KnowledgeIngestionManager.ingestDocument({
          title: `User Note: ${memContent.substring(0, 32)}`,
          sourceType: 'DOCUMENT',
          sourcePath: 'user/memory.txt',
          content: memContent,
        }).catch(console.error);
        return {
          handled: true,
          type: 'MEMORY',
          responseText: `Saved to memory: "${memContent}".`,
        };
      }
    }

    // 9. Personalization Natural Commands
    if (PersonalizationManager.resolveNaturalCommand(query)) {
      return {
        handled: true,
        type: 'ACTION',
        responseText: 'Preferences updated.',
      };
    }

    // 10. Spatial Navigation System
    if (SpatialNavigationEngine.resolveCommand(query)) {
      return {
        handled: true,
        type: 'NAVIGATION',
        responseText: `Navigated to ${SpatialNavigationEngine.getCurrentSpace()}.`,
      };
    }

    return {
      handled: false,
      type: 'CONVERSATION',
    };
  }
}
