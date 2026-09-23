import { SpatialNavigationEngine } from '../navigation/SpatialNavigationEngine';
import { AdaptiveWorkspaceManager } from '../workspace/multi-context/AdaptiveWorkspaceManager';
import { ApprovalBridge } from '../ai/approval/ApprovalBridge';
import { SystemIntelligenceEngine } from '../system/SystemIntelligenceEngine';
import { ProviderRouter } from '../ai/providers/ProviderRouter';
import { RezelDirector } from '../director/RezelDirector';
import { NotificationIntelligenceCenter } from '../notifications/NotificationIntelligenceCenter';
import { PersonalizationManager } from '../personalization/PersonalizationManager';

export interface VoiceDispatchResult {
  handled: boolean;
  action: string;
  response?: string;
}

export class VoiceMultimodalCoordinator {
  /**
   * Processes a voice transcript across all Rezel multimodal subsystems.
   */
  public static async processVoiceIntent(rawTranscript: string): Promise<VoiceDispatchResult> {
    const transcript = rawTranscript.trim();
    if (!transcript) {
      return { handled: false, action: 'EMPTY' };
    }

    const lower = transcript.toLowerCase();

    // 1. Voice Approvals & Trust Gates
    const pendingApprovals = ApprovalBridge.getPending ? ApprovalBridge.getPending() : [];
    if (pendingApprovals.length > 0) {
      const latest = pendingApprovals[0];
      if (/^(approve|yes|confirm|allow|yes approve|proceed)$/i.test(lower)) {
        await ApprovalBridge.approve(latest.approvalId);
        NotificationIntelligenceCenter.emit({
          title: 'Action Approved via Voice',
          summary: `Approved: ${latest.summary || latest.reason || latest.approvalId}`,
          severity: 'SUCCESS',
          source: 'SECURITY',
        });
        return {
          handled: true,
          action: 'APPROVAL_GRANTED',
          response: 'Action approved and resuming execution.',
        };
      } else if (/^(deny|reject|cancel|no|stop|do not allow)$/i.test(lower)) {
        await ApprovalBridge.deny(latest.approvalId);
        NotificationIntelligenceCenter.emit({
          title: 'Action Denied via Voice',
          summary: `Denied: ${latest.summary || latest.reason || latest.approvalId}`,
          severity: 'WARNING',
          source: 'SECURITY',
        });
        return {
          handled: true,
          action: 'APPROVAL_DENIED',
          response: 'Action denied.',
        };
      }
    }

    // 2. Cancellation Intent
    if (lower === 'cancel' || lower === 'cancel that' || lower === 'stop' || lower === 'abort') {
      RezelDirector.interrupt();
      NotificationIntelligenceCenter.emit({
        title: 'Execution Cancelled',
        summary: 'Active turn cancelled via voice command',
        severity: 'INFO',
        source: 'AGENT',
      });
      return {
        handled: true,
        action: 'CANCELLED',
        response: 'Execution stopped.',
      };
    }

    // 3. Multi-Context Workspace Queries
    if (lower.includes('what is running') || lower.includes("what's running") || lower.includes('what is in the background')) {
      const bg = AdaptiveWorkspaceManager.getBackgroundContexts();
      if (bg.length === 0) {
        return {
          handled: true,
          action: 'WORKSPACE_QUERY',
          response: 'No tasks are currently running in the background.',
        };
      }
      const summaries = bg.map((c) => `${c.title} (${Math.round(c.progress || 0)}%)`).join(', ');
      return {
        handled: true,
        action: 'WORKSPACE_QUERY',
        response: `Currently running: ${summaries}.`,
      };
    }

    if (lower.includes('what needs attention') || lower.includes('needs my attention')) {
      const att = AdaptiveWorkspaceManager.getAttentionContexts();
      if (att.length === 0) {
        return {
          handled: true,
          action: 'ATTENTION_QUERY',
          response: 'All background activities are operating normally with no items requiring attention.',
        };
      }
      const summaries = att.map((c) => `${c.title}: ${c.blockedReason || 'Requires attention'}`).join('; ');
      return {
        handled: true,
        action: 'ATTENTION_QUERY',
        response: `Attention needed: ${summaries}.`,
      };
    }

    // 4. Context Switching Intent
    if (lower.startsWith('switch to ') || lower.startsWith('go back to ') || lower.startsWith('focus ')) {
      const targetQuery = lower.replace(/^(switch to |go back to |focus )/, '').trim();
      const allContexts = AdaptiveWorkspaceManager.listContexts();
      const match = allContexts.find((c) => c.title.toLowerCase().includes(targetQuery) || c.type.toLowerCase().includes(targetQuery));
      if (match) {
        AdaptiveWorkspaceManager.focusContext(match.id);
        return {
          handled: true,
          action: 'CONTEXT_SWITCHED',
          response: `Switched focus to ${match.title}.`,
        };
      }
    }

    // 5. System Intelligence & Telemetry Queries
    if (lower.includes('how is my system') || lower.includes('system status') || lower.includes('how is my computer') || lower.includes('hardware status')) {
      const snapshot = SystemIntelligenceEngine.getSnapshot();
      const insight = snapshot.insight;
      return {
        handled: true,
        action: 'SYSTEM_TELEMETRY_QUERY',
        response: `System state is ${snapshot.state}. CPU is at ${snapshot.telemetry.cpuUsage}%, RAM is at ${snapshot.telemetry.memoryUsagePercent}%. ${insight}`,
      };
    }

    // 6. Provider Intelligence Queries
    if (lower.includes('which model are you using') || lower.includes('what model is active') || lower.includes('are you running locally')) {
      const profile = ProviderRouter.getRoutingProfile();
      const isLocal = profile === 'LOCAL';
      return {
        handled: true,
        action: 'PROVIDER_QUERY',
        response: `Currently routing reasoning using the ${profile} profile. Operating ${isLocal ? 'locally on-device' : 'via intelligent provider routing'}.`,
      };
    }

    // 7. Spatial Navigation Commands
    if (SpatialNavigationEngine.resolveCommand(transcript)) {
      const space = SpatialNavigationEngine.getCurrentSpace();
      return {
        handled: true,
        action: 'SPATIAL_NAVIGATION',
        response: `Navigated to ${space}.`,
      };
    }

    // 8. Personalization & Environment Settings Commands
    if (PersonalizationManager.resolveNaturalCommand(transcript)) {
      return {
        handled: true,
        action: 'PERSONALIZATION_UPDATED',
        response: 'Preferences updated.',
      };
    }

    // 9. Otherwise delegate to AgentCore / RezelDirector
    await RezelDirector.send(transcript);
    return {
      handled: true,
      action: 'DIRECTOR_EXECUTION',
    };
  }
}
