import PanelShell from './PanelShell';
import { Settings } from 'lucide-react';

/**
 * SettingsPanel — Milestone 7.5 stub
 *
 * Will contain: API key management (Tauri save_api_key/get_api_key),
 * voice configuration, system info via useSystemMetrics,
 * permission grants viewer.
 */
export default function SettingsPanel() {
  return (
    <PanelShell title="System" subtitle="Configuration">
      <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
        <Settings size={28} strokeWidth={1} style={{ color: '#00E5FF' }} />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            letterSpacing: '0.14em',
            color: '#7ECFFF',
          }}
        >
          INTERFACE PENDING
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#4BB8F0',
            textAlign: 'center',
            lineHeight: 1.6,
            maxWidth: '240px',
          }}
        >
          System panel will provide API configuration, voice settings, and permission management.
        </span>
      </div>
    </PanelShell>
  );
}
