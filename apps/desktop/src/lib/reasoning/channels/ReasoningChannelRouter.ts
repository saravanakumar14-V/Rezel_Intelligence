import {
  ReasoningChannelError,
  type ReasoningChannelAdapter,
  type ReasoningChannelType,
} from './types';

export class ReasoningChannelRouter {
  /**
   * Selects the highest-priority available channel.
   *
   * CHANNEL PRIORITY:
   * 1. DIRECT_API
   * 2. STRUCTURED_UI
   * 3. CLIPBOARD
   * 4. SCREEN_OCR
   *
   * CRITICAL RULE:
   * SCREEN_OCR is last-resort only and is NEVER automatically selected as a silent fallback
   * from API failure unless explicitly requested by the user.
   */
  static async selectChannel(
    channels: ReasoningChannelAdapter[],
    preferredType?: ReasoningChannelType
  ): Promise<ReasoningChannelAdapter> {
    if (preferredType) {
      const preferred = channels.find((c) => c.channelType === preferredType);
      if (preferred && (await preferred.isAvailable())) {
        return preferred;
      }
    }

    // Sort available channels by priority ascending (1 is highest)
    const sorted = [...channels].sort((a, b) => a.priority - b.priority);

    for (const channel of sorted) {
      // SCREEN_OCR is never selected automatically as generic fallback
      if (channel.channelType === 'SCREEN_OCR' && preferredType !== 'SCREEN_OCR') {
        continue;
      }

      if (await channel.isAvailable()) {
        return channel;
      }
    }

    throw new ReasoningChannelError(
      'CHANNEL_UNAVAILABLE',
      preferredType || 'DIRECT_API',
      'No transport channel is currently available to communicate with reasoning provider'
    );
  }
}
