import type { InspectorId } from '../../types/navigation';
import {
  CreateInsignia,
  ConverseInsignia,
  AutomateInsignia,
  AnalyzeInsignia,
  InspectInsignia,
  ControlInsignia,
  type InsigniaProps,
} from '../../components/navigation/CapabilityInsignia';
import React from 'react';

// Hero Visual Assets (High-Fidelity 2100-era cinematic objects)
const createImg = new URL('../../assets/capabilities/create.jpg', import.meta.url).href;
const converseImg = new URL('../../assets/capabilities/converse.jpg', import.meta.url).href;
const automateImg = new URL('../../assets/capabilities/automate.jpg', import.meta.url).href;
const analyzeImg = new URL('../../assets/capabilities/analyze.jpg', import.meta.url).href;
const inspectImg = new URL('../../assets/capabilities/inspect.jpg', import.meta.url).href;
const controlImg = new URL('../../assets/capabilities/control.jpg', import.meta.url).href;

export interface WorkspaceAction {
  id: string;
  signature: string;
  label: string;
  technicalIdentity?: string;
  target: InspectorId;
  targetSurfaceId: string;
  description: string;
  shortcutHint?: string;
  isPrimary?: boolean;
}

export interface CapabilityDefinition {
  id: string;
  keyNum: number;
  title: string;
  humanTitle: string;
  stateSummary: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  glowColor: string;
  insignia: React.ComponentType<InsigniaProps>;
  imageAsset: string;
  coords: { x: number; y: number };
  workspaceName: string;
  workspaceDescription: string;
  primaryInspector: InspectorId;
  primarySurfaceId: string;
  actions: WorkspaceAction[];
}

/**
 * REZEL CAPABILITY OWNERSHIP REGISTRY 2.2
 * Freestyle organic spatial distribution with intentional negative space,
 * Human-first titles, and direct links to Spawned Spatial Surfaces.
 */
export const CAPABILITY_REGISTRY: CapabilityDefinition[] = [
  {
    id: 'create',
    keyNum: 1,
    title: 'CREATE',
    humanTitle: 'Generate & Build',
    stateSummary: 'GENERATIVE SYSTEM',
    subtitle: 'Visual Synthesis & Sandboxed Code',
    primaryColor: '#FFB300',
    secondaryColor: '#FFF8E1',
    glowColor: 'rgba(255, 179, 0, 0.45)',
    insignia: CreateInsignia,
    imageAsset: createImg,
    coords: { x: 20, y: -260 },
    workspaceName: 'CREATE',
    workspaceDescription: 'Generative visual synthesis, multi-modal code architecture, and sandboxed script execution.',
    primaryInspector: 'workflow',
    primarySurfaceId: 'create',
    actions: [
      { id: 'create-visuals', signature: '◈', label: 'Generate', technicalIdentity: 'Visual Synthesis Studio', target: 'workflow', targetSurfaceId: 'create-generate', description: 'Create visuals, concepts, and high-fidelity art', shortcutHint: '1', isPrimary: true },
      { id: 'create-code', signature: '◇', label: 'Code', technicalIdentity: 'Code Architecture', target: 'workflow', targetSurfaceId: 'create-code', description: 'Build scripts, modules, and software with AI', shortcutHint: '2' },
    ],
  },
  {
    id: 'analyze',
    keyNum: 2,
    title: 'ANALYZE',
    humanTitle: 'Signal Intelligence',
    stateSummary: 'SIGNAL INTELLIGENCE',
    subtitle: 'Providers, Compute & Memory',
    primaryColor: '#00E5FF',
    secondaryColor: '#E0F7FA',
    glowColor: 'rgba(0, 229, 255, 0.45)',
    insignia: AnalyzeInsignia,
    imageAsset: analyzeImg,
    coords: { x: 330, y: -150 },
    workspaceName: 'ANALYZE',
    workspaceDescription: 'Provider routing intelligence, hardware compute telemetry, and semantic memory forensics.',
    primaryInspector: 'providers',
    primarySurfaceId: 'analyze',
    actions: [
      { id: 'analyze-routing', signature: '◈', label: 'AI Providers', technicalIdentity: 'Provider Routing Intelligence', target: 'providers', targetSurfaceId: 'analyze-providers', description: 'Compare health, latency, token costs, and routing', shortcutHint: '1', isPrimary: true },
      { id: 'analyze-telemetry', signature: '◇', label: 'System', technicalIdentity: 'System Compute Telemetry', target: 'system', targetSurfaceId: 'analyze-system', description: 'Understand CPU, GPU, VRAM, and runtime health', shortcutHint: '2' },
      { id: 'analyze-memory', signature: '⬡', label: 'Memory', technicalIdentity: 'Memory Recall Forensics', target: 'memory', targetSurfaceId: 'analyze-memory', description: 'Explore what Rezel remembers and why it was retrieved', shortcutHint: '3' },
    ],
  },
  {
    id: 'converse',
    keyNum: 3,
    title: 'CONVERSE',
    humanTitle: 'Neural Stream',
    stateSummary: 'NEURAL STREAM',
    subtitle: 'Voice, Chat & Thought',
    primaryColor: '#7ECFFF',
    secondaryColor: '#E0F7FA',
    glowColor: 'rgba(126, 207, 255, 0.45)',
    insignia: ConverseInsignia,
    imageAsset: converseImg,
    coords: { x: 290, y: 160 },
    workspaceName: 'CONVERSE',
    workspaceDescription: 'Low-latency voice streams, neural transcript archives, and cognitive reasoning inspection.',
    primaryInspector: 'conversations',
    primarySurfaceId: 'converse',
    actions: [
      { id: 'conv-chat', signature: '◈', label: 'Chat', technicalIdentity: 'Cognitive Dialogue Stream', target: 'conversations', targetSurfaceId: 'conv-chat', description: 'Talk with Rezel, explore ideas, and inspect thoughts', shortcutHint: '1', isPrimary: true },
      { id: 'conv-voice', signature: '◇', label: 'Voice', technicalIdentity: 'Live Voice Stream Studio', target: 'conversations', targetSurfaceId: 'conv-voice', description: 'Have live low-latency neural voice conversations', shortcutHint: '2' },
      { id: 'conv-transcripts', signature: '◌', label: 'History', technicalIdentity: 'Neural Transcript Archives', target: 'conversations', targetSurfaceId: 'conv-history', description: 'Review previous conversations and transcripts', shortcutHint: '3' },
    ],
  },
  {
    id: 'control',
    keyNum: 4,
    title: 'CONTROL',
    humanTitle: 'Governance & Settings',
    stateSummary: 'GOVERNANCE REACTOR',
    subtitle: 'Permissions & Personalization',
    primaryColor: '#7A5CFF',
    secondaryColor: '#EDE7F6',
    glowColor: 'rgba(122, 92, 255, 0.45)',
    insignia: ControlInsignia,
    imageAsset: controlImg,
    coords: { x: -50, y: 270 },
    workspaceName: 'CONTROL',
    workspaceDescription: 'Operating personas, custom appearance, and autonomy permission gates.',
    primaryInspector: 'personalization',
    primarySurfaceId: 'control',
    actions: [
      { id: 'ctrl-persona', signature: '◈', label: 'Personalization', technicalIdentity: 'Operating Persona & Style', target: 'personalization', targetSurfaceId: 'ctrl-personalization', description: 'Customize how Rezel behaves, speaks, and looks', shortcutHint: '1', isPrimary: true },
      { id: 'ctrl-gates', signature: '◇', label: 'Permissions', technicalIdentity: 'Autonomy Permission Gates', target: 'trust', targetSurfaceId: 'ctrl-permissions', description: 'Control what Rezel is allowed to access and execute', shortcutHint: '2' },
    ],
  },
  {
    id: 'inspect',
    keyNum: 5,
    title: 'INSPECT',
    humanTitle: 'Observability & Trust',
    stateSummary: 'DEEP OBSERVABILITY',
    subtitle: 'Models, Knowledge & Security',
    primaryColor: '#9D4EDD',
    secondaryColor: '#F3E5F5',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    insignia: InspectInsignia,
    imageAsset: inspectImg,
    coords: { x: -330, y: 150 },
    workspaceName: 'INSPECT',
    workspaceDescription: 'Model weights catalog, live endpoint latencies, persistent knowledge store, and security audits.',
    primaryInspector: 'models',
    primarySurfaceId: 'inspect',
    actions: [
      { id: 'inspect-models', signature: '◈', label: 'Models', technicalIdentity: 'Model Weights Catalog', target: 'models', targetSurfaceId: 'inspect-models', description: 'Explore available local and cloud AI models', shortcutHint: '1', isPrimary: true },
      { id: 'inspect-endpoints', signature: '◇', label: 'Providers', technicalIdentity: 'Provider Endpoint Latencies', target: 'providers', targetSurfaceId: 'inspect-providers', description: 'Inspect connected AI services, quotas, and health', shortcutHint: '2' },
      { id: 'inspect-knowledge', signature: '◌', label: 'Knowledge', technicalIdentity: 'Knowledge Store & Vector DB', target: 'memory', targetSurfaceId: 'inspect-knowledge', description: 'Explore persistent knowledge embeddings and memory graphs', shortcutHint: '3' },
      { id: 'inspect-audit', signature: '⬡', label: 'Security', technicalIdentity: 'Cryptographic Trust Audit', target: 'trust', targetSurfaceId: 'inspect-security', description: 'Review trust verification, tool access, and audit records', shortcutHint: '4' },
    ],
  },
  {
    id: 'automate',
    keyNum: 6,
    title: 'AUTOMATE',
    humanTitle: 'Autonomous Execution',
    stateSummary: 'EXECUTION ENGINE',
    subtitle: 'Workflows & Creative Bridges',
    primaryColor: '#00E676',
    secondaryColor: '#B9F6CA',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    insignia: AutomateInsignia,
    imageAsset: automateImg,
    coords: { x: -310, y: -160 },
    workspaceName: 'AUTOMATE',
    workspaceDescription: 'Graph execution engine, live 3D workspace bridges, and creative motion graphics.',
    primaryInspector: 'workflow',
    primarySurfaceId: 'automate',
    actions: [
      { id: 'auto-engine', signature: '◈', label: 'Workflows', technicalIdentity: 'Workflow Execution Engine', target: 'workflow', targetSurfaceId: 'auto-workflows', description: 'Run multi-step automated pipelines and graph tasks', shortcutHint: '1', isPrimary: true },
      { id: 'auto-blender', signature: '◇', label: 'Blender', technicalIdentity: 'Blender 3D Bridge', target: 'workflow', targetSurfaceId: 'auto-blender', description: 'Control 3D scenes, objects, and node workflows', shortcutHint: '2' },
      { id: 'auto-ae', signature: '◌', label: 'After Effects', technicalIdentity: 'After Effects Studio Bridge', target: 'workflow', targetSurfaceId: 'auto-ae', description: 'Control creative motion graphics and render queues', shortcutHint: '3' },
    ],
  },
];

/**
 * Validates unique capability ownership (Zero route collision)
 */
export function validateCapabilityRegistry(): boolean {
  const ids = new Set<string>();
  const actionIds = new Set<string>();

  for (const cap of CAPABILITY_REGISTRY) {
    if (ids.has(cap.id)) {
      console.error(`Duplicate capability ID: ${cap.id}`);
      return false;
    }
    ids.add(cap.id);

    for (const action of cap.actions) {
      if (actionIds.has(action.id)) {
        console.error(`Duplicate action ID in registry: ${action.id}`);
        return false;
      }
      actionIds.add(action.id);
    }
  }

  return true;
}
