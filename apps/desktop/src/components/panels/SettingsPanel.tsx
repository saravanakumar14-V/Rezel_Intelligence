import { lazy, Suspense } from 'react';
import PanelShell from './PanelShell';

// ─── Lazy-loaded settings sections ────────────────────────────────────────────

const PersonalizationSection = lazy(() => import('./settings/PersonalizationSection'));
const ModelIntelligenceSpace = lazy(() => import('./models/ModelIntelligenceSpace'));
const ProviderSettingsPanel   = lazy(() => import('./settings/ProviderSettingsPanel'));
const AuditIntelligenceDeck   = lazy(() => import('../hud/audit/AuditIntelligenceDeck'));
const VoiceSection            = lazy(() => import('./settings/VoiceSection'));
const SystemSection           = lazy(() => import('./settings/SystemSection'));
const PermissionsSection      = lazy(() => import('./settings/PermissionsSection'));
const AboutSection            = lazy(() => import('./settings/AboutSection'));

// ─── Divider ──────────────────────────────────────────────────────────────────

function SectionDivider() {
  return (
    <div
      className="mx-0 h-px my-1"
      style={{
        background:
          'linear-gradient(90deg, rgba(0,229,255,0.15), transparent 80%)',
      }}
      aria-hidden
    />
  );
}

// ─── Loading fallback ─────────────────────────────────────────────────────────

function SectionFallback() {
  return (
    <div className="flex items-center py-3 opacity-30">
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          color: '#4BB8F0',
          letterSpacing: '0.08em',
        }}
      >
        Loading...
      </span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * SettingsPanel — Milestone 7.5
 *
 * Functional settings interface exposing existing configuration capabilities.
 *
 * Sections:
 *  1. AI Configuration — API key management via Tauri keyring
 *  2. Voice Engine — STT/TTS capability status
 *  3. System Information — CPU/RAM from useSystemMetrics
 *  4. Permissions & Security — session grants + audit summary
 *  5. About / Runtime — version, provider, build info
 *
 * All sections reuse existing backend capabilities.
 * No new architecture is introduced.
 */
export default function SettingsPanel() {
  return (
    <PanelShell title="System" subtitle="Configuration & Intelligence">
      <div className="flex flex-col gap-4">
        <Suspense fallback={<SectionFallback />}>
          <PersonalizationSection />
        </Suspense>

        <SectionDivider />

        <Suspense fallback={<SectionFallback />}>
          <ModelIntelligenceSpace />
        </Suspense>

        <SectionDivider />

        <Suspense fallback={<SectionFallback />}>
          <ProviderSettingsPanel />
        </Suspense>

        <SectionDivider />

        <Suspense fallback={<SectionFallback />}>
          <VoiceSection />
        </Suspense>

        <SectionDivider />

        <Suspense fallback={<SectionFallback />}>
          <SystemSection />
        </Suspense>

        <SectionDivider />

        <Suspense fallback={<SectionFallback />}>
          <PermissionsSection />
        </Suspense>

        <SectionDivider />

        <Suspense fallback={<SectionFallback />}>
          <AuditIntelligenceDeck />
        </Suspense>

        <SectionDivider />

        <Suspense fallback={<SectionFallback />}>
          <AboutSection />
        </Suspense>
      </div>
    </PanelShell>
  );
}
