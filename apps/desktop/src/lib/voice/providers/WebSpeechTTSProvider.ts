import type { TTSProvider, TTSProfile } from '../types.js';

export class WebSpeechTTSProvider implements TTSProvider {
  private supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  private utteranceSettled = true; // R-16: guard against double settlement

  speak(
    text: string, 
    profile: TTSProfile, 
    onStart: () => void, 
    onEnd: () => void, 
    onError: (err: string) => void
  ): void {
    if (!this.supported) {
      onError('TTS not supported');
      return;
    }

    this.cancel(); // Cancel any current speech just in case

    this.utteranceSettled = false; // Reset guard for new utterance

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = profile.pace;
    utterance.pitch = profile.pitch;
    
    // WebSpeech doesn't have a direct 'tone' setting, but we could select voices based on it if we wanted.
    // For now, we rely on pace and pitch to convey tone.

    utterance.onstart = () => {
      onStart();
    };

    utterance.onend = () => {
      if (this.utteranceSettled) return; // R-16: ignore duplicate settlement
      this.utteranceSettled = true;
      onEnd();
    };

    utterance.onerror = (event) => {
      if (this.utteranceSettled) return; // R-16: ignore duplicate settlement
      this.utteranceSettled = true;
      if (event.error === 'interrupted' || event.error === 'canceled') {
        // Expected on cancel, just trigger onEnd
        onEnd();
      } else {
        onError(event.error);
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  cancel(): void {
    if (this.supported) {
      window.speechSynthesis.cancel();
    }
  }
}
