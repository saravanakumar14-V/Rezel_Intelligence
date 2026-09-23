import { useState, useEffect, useCallback } from 'react';
import { Mic, Volume2 } from 'lucide-react';

/**
 * VoiceSection
 *
 * Read-only informational section for Voice Capabilities in Settings,
 * with a toggle for Global Auto TTS.
 */
export default function VoiceSection() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [autoTts, setAutoTts] = useState(() => {
    return localStorage.getItem('rezel_auto_tts') === 'true';
  });

  const toggleAutoTts = useCallback(() => {
    const newValue = !autoTts;
    setAutoTts(newValue);
    localStorage.setItem('rezel_auto_tts', String(newValue));
    window.dispatchEvent(new Event('rezel-tts-config-changed'));
  }, [autoTts]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const updateVoices = () => {
        setVoices(window.speechSynthesis.getVoices());
      };

      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;

      return () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.onvoiceschanged = null;
        }
      };
    }
  }, []);

  const sttAvailable =
    typeof window !== 'undefined' &&
    Boolean(
      (window as unknown as Record<string, unknown>).SpeechRecognition ||
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    );

  const ttsAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const defaultVoice =
    voices.find((v) => v.default)?.name ||
    (voices.length > 0 ? voices[0].name : ttsAvailable ? 'System Default' : 'N/A');

  return (
    <div className="flex flex-col gap-3 p-3 rounded-lg border border-[#00E5FF]/10 bg-[#050B14]/40 backdrop-blur-sm">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <Mic className="w-3.5 h-3.5 text-[#00E5FF]" />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            letterSpacing: '0.14em',
            color: '#7ECFFF',
          }}
          className="uppercase font-medium"
        >
          Voice Engine Status
        </span>
      </div>

      {/* Info Rows */}
      <div className="flex flex-col gap-2">
        {/* Auto TTS Toggle */}
        <div className="flex items-center justify-between gap-3 pb-2 border-b border-[#00E5FF]/10 mb-1">
          <div className="flex flex-col gap-0.5">
            <span style={{ fontSize: '10px', color: '#4BB8F0' }}>Auto TTS Responses</span>
            <span style={{ fontSize: '8px', color: '#7ECFFF', opacity: 0.6 }}>
              Speak all Agent replies automatically
            </span>
          </div>
          <button
            onClick={toggleAutoTts}
            className="relative w-8 h-4 rounded-full transition-colors duration-300"
            style={{
              background: autoTts ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${autoTts ? 'rgba(0,229,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            <div
              className="absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all duration-300 shadow-sm"
              style={{
                background: autoTts ? '#00E5FF' : '#4BB8F0',
                left: autoTts ? 'calc(100% - 12px)' : '3px',
                opacity: autoTts ? 1 : 0.4,
              }}
            />
          </button>
        </div>

        {/* STT Status */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Mic className="w-3 h-3 text-[#4BB8F0]" />
            <span style={{ fontSize: '10px', color: '#4BB8F0' }}>Speech-to-Text (STT)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                sttAvailable ? 'bg-[#00E5FF]' : 'bg-[#FF4D6A]'
              }`}
            />
            <span style={{ fontSize: '10px', color: '#E0F0FF' }}>
              {sttAvailable ? 'Available' : 'Not Available'}
            </span>
          </div>
        </div>

        {/* TTS Status */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Volume2 className="w-3 h-3 text-[#4BB8F0]" />
            <span style={{ fontSize: '10px', color: '#4BB8F0' }}>Text-to-Speech (TTS)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                ttsAvailable ? 'bg-[#00E5FF]' : 'bg-[#FF4D6A]'
              }`}
            />
            <span style={{ fontSize: '10px', color: '#E0F0FF' }}>
              {ttsAvailable ? 'Available' : 'Not Available'}
            </span>
          </div>
        </div>

        {/* Available Voices Count */}
        <div className="flex items-center justify-between gap-3">
          <span style={{ fontSize: '10px', color: '#4BB8F0' }}>Available Voices</span>
          <span style={{ fontSize: '10px', color: '#E0F0FF' }}>{voices.length}</span>
        </div>

        {/* Default Voice */}
        <div className="flex items-center justify-between gap-3">
          <span style={{ fontSize: '10px', color: '#4BB8F0' }}>Default Voice</span>
          <span
            style={{ fontSize: '10px', color: '#E0F0FF' }}
            className="truncate max-w-[180px]"
            title={defaultVoice}
          >
            {defaultVoice}
          </span>
        </div>

        {/* Active Language */}
        <div className="flex items-center justify-between gap-3">
          <span style={{ fontSize: '10px', color: '#4BB8F0' }}>Active Language</span>
          <span style={{ fontSize: '10px', color: '#E0F0FF' }}>en-US</span>
        </div>
      </div>
    </div>
  );
}
