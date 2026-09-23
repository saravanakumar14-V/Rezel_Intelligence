export type SpatialSurfaceState =
  | 'spawning'
  | 'active'
  | 'background'
  | 'collapsed'
  | 'closing';

export interface SpatialActionItem {
  id: string;
  signature: string;
  humanLabel: string;
  technicalIdentity: string;
  description: string;
  shortcutHint?: string;
  targetSurfaceId: string;
  isPrimary?: boolean;
  whatIsIt?: string;
  whyUseIt?: string;
  whatCanIDo?: string;
}

export interface SpatialSurfaceDefinition {
  id: string;
  parentId: string | null;
  capabilityId: string;
  depth: number; // 1 = Capability level, 2 = Domain level, 3+ = Task level
  humanLabel: string;
  technicalIdentity: string;
  description: string;
  whatIsIt: string;
  whyUseIt: string;
  whatCanIDo: string;
  accentColor: string;
  glowColor: string;
  actions?: SpatialActionItem[];
  // If this is a Level 3 / Task surface, it can render dedicated rich task content
  taskType?:
    | 'code-editor'
    | 'visual-canvas'
    | 'chat-dialogue'
    | 'voice-room'
    | 'conversation-history'
    | 'workflow-runner'
    | 'provider-matrix'
    | 'telemetry-gauges'
    | 'memory-forensics'
    | 'model-catalog'
    | 'security-audit'
    | 'trust-gates'
    | 'persona-designer'
    | 'blender-bridge'
    | 'ae-bridge'
    | 'generic';
}

export interface SpatialSurfaceNode {
  id: string;
  parentId: string | null;
  capabilityId: string;
  routeId: string;
  depth: number;
  definition: SpatialSurfaceDefinition;
}

/**
 * REZEL SPATIAL SURFACE REGISTRY
 * Canonical single source of truth for all Spawned Spatial Surfaces across R7.
 * Eliminates duplicate destinations and replaces accidental redirects.
 */
export const SPATIAL_SURFACE_REGISTRY: Record<string, SpatialSurfaceDefinition> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. CREATE CAPABILITY FAMILY (Amber Glow)
  // ═══════════════════════════════════════════════════════════════════════════
  create: {
    id: 'create',
    parentId: null,
    capabilityId: 'create',
    depth: 1,
    humanLabel: 'CREATE',
    technicalIdentity: 'GENERATIVE SYNTHESIS STUDIO',
    description: 'Create visuals, concepts, software, and sandboxed computation modules.',
    whatIsIt: 'The creative generation and computational coding hub of Rezel.',
    whyUseIt: 'Synthesize spatial concepts or build and execute software in an isolated sandbox.',
    whatCanIDo: 'Generate 2D/3D visual concepts, author AI software, and execute sandboxed code.',
    accentColor: '#FFB300',
    glowColor: 'rgba(255, 179, 0, 0.45)',
    actions: [
      {
        id: 'act-create-generate',
        signature: '◈',
        humanLabel: 'Generate',
        technicalIdentity: 'Visual Synthesis Studio',
        description: 'Create visuals, concepts, and high-fidelity art.',
        shortcutHint: '1',
        targetSurfaceId: 'create-generate',
        isPrimary: true,
        whatIsIt: 'Generative visual concept studio.',
        whyUseIt: 'Prepare and dispatch high-fidelity concept prompts.',
        whatCanIDo: 'Configure prompt parameters, style anchors, and resolution.',
      },
      {
        id: 'act-create-code',
        signature: '◇',
        humanLabel: 'Code',
        technicalIdentity: 'Code Architecture',
        description: 'Build scripts, modules, and software with AI.',
        shortcutHint: '2',
        targetSurfaceId: 'create-code',
        whatIsIt: 'Sandboxed AI software engineering workspace.',
        whyUseIt: 'Develop codebases, execute scripts, and inspect syntax ASTs safely.',
        whatCanIDo: 'Write code, analyze delimiters, and execute scripts in a secure WebWorker sandbox.',
      },
    ],
  },

  'create-generate': {
    id: 'create-generate',
    parentId: 'create',
    capabilityId: 'create',
    depth: 2,
    humanLabel: 'Generate',
    technicalIdentity: 'Visual Synthesis Studio',
    description: 'Synthesize 2D/3D concept art, spatial textures, and multi-modal generative concepts.',
    whatIsIt: 'Generative visual studio with prompt refinement and style controls.',
    whyUseIt: 'Create visual assets and spatial concepts on demand.',
    whatCanIDo: 'Input prompts, adjust aspect ratio, select style anchors, and verify generation prerequisites.',
    accentColor: '#FFB300',
    glowColor: 'rgba(255, 179, 0, 0.45)',
    actions: [
      {
        id: 'act-gen-studio',
        signature: '◈',
        humanLabel: 'Synthesis Canvas',
        technicalIdentity: 'Concept Generation Canvas',
        description: 'Launch interactive concept generation and style parameters.',
        shortcutHint: '1',
        targetSurfaceId: 'create-generate-canvas',
        isPrimary: true,
      },
    ],
  },

  'create-generate-canvas': {
    id: 'create-generate-canvas',
    parentId: 'create-generate',
    capabilityId: 'create',
    depth: 3,
    humanLabel: 'Visual Canvas',
    technicalIdentity: 'Concept Generation Canvas',
    description: 'Interactive visual synthesis studio with real-time prompt generation and provider verification.',
    whatIsIt: 'Operational generative canvas.',
    whyUseIt: 'Generate high-resolution visual concept art.',
    whatCanIDo: 'Adjust resolution, style anchors, and verify image endpoint connectivity.',
    accentColor: '#FFB300',
    glowColor: 'rgba(255, 179, 0, 0.45)',
    taskType: 'visual-canvas',
  },

  'create-code': {
    id: 'create-code',
    parentId: 'create',
    capabilityId: 'create',
    depth: 2,
    humanLabel: 'Code',
    technicalIdentity: 'Code Architecture',
    description: 'AI software engineering, programmatic scripting, and AST architecture inspection.',
    whatIsIt: 'Full software development environment powered by isolated sandboxing.',
    whyUseIt: 'Rapidly architect applications, automate tasks with JavaScript, and execute code safely.',
    whatCanIDo: 'Generate modules, run AST syntax analysis, debug issues, and execute sandboxed code.',
    accentColor: '#FFB300',
    glowColor: 'rgba(255, 179, 0, 0.45)',
    actions: [
      {
        id: 'act-code-arch',
        signature: '◈',
        humanLabel: 'Code Workspace',
        technicalIdentity: 'Programmatic Workspace',
        description: 'Open code editor, AST inspector, and sandboxed execution runner.',
        shortcutHint: '1',
        targetSurfaceId: 'create-code-arch',
        isPrimary: true,
      },
    ],
  },

  'create-code-arch': {
    id: 'create-code-arch',
    parentId: 'create-code',
    capabilityId: 'create',
    depth: 3,
    humanLabel: 'Code Workspace',
    technicalIdentity: 'Programmatic Workspace',
    description: 'Integrated code editor, language model generator, AST tree viewer, and execution sandbox.',
    whatIsIt: 'Full AI code generation and editing interface.',
    whyUseIt: 'Build scripts, refactor functions, and execute software tools with real-time feedback.',
    whatCanIDo: 'Edit code, trigger AI code completions, run syntax checks, and execute safe scripts.',
    accentColor: '#FFB300',
    glowColor: 'rgba(255, 179, 0, 0.45)',
    taskType: 'code-editor',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. CONVERSE CAPABILITY FAMILY (Ice Blue / Cyan Glow)
  // ═══════════════════════════════════════════════════════════════════════════
  converse: {
    id: 'converse',
    parentId: null,
    capabilityId: 'converse',
    depth: 1,
    humanLabel: 'CONVERSE',
    technicalIdentity: 'MULTIMODAL NEURAL STREAM',
    description: 'Engage in live dialogue, review thoughts, search transcripts, and manage sessions.',
    whatIsIt: 'The conversational and dialogue intelligence center of Rezel.',
    whyUseIt: 'Talk with Rezel naturally using text or voice with full reasoning visibility.',
    whatCanIDo: 'Chat with AI, hold live voice sessions, and search past conversation history.',
    accentColor: '#7ECFFF',
    glowColor: 'rgba(126, 207, 255, 0.45)',
    actions: [
      {
        id: 'act-conv-chat',
        signature: '◈',
        humanLabel: 'Chat',
        technicalIdentity: 'Cognitive Dialogue Stream',
        description: 'Talk with Rezel, explore ideas, and inspect reasoning steps.',
        shortcutHint: '1',
        targetSurfaceId: 'conv-chat',
        isPrimary: true,
      },
      {
        id: 'act-conv-voice',
        signature: '◇',
        humanLabel: 'Voice',
        technicalIdentity: 'Live Voice Stream Studio',
        description: 'Have live low-latency neural voice conversations.',
        shortcutHint: '2',
        targetSurfaceId: 'conv-voice',
      },
      {
        id: 'act-conv-history',
        signature: '◌',
        humanLabel: 'History',
        technicalIdentity: 'Neural Transcript Archives',
        description: 'Review previous conversations, transcripts, and voice logs.',
        shortcutHint: '3',
        targetSurfaceId: 'conv-history',
      },
    ],
  },

  'conv-chat': {
    id: 'conv-chat',
    parentId: 'converse',
    capabilityId: 'converse',
    depth: 2,
    humanLabel: 'Chat',
    technicalIdentity: 'Cognitive Dialogue Stream',
    description: 'Multimodal conversation surface with step-by-step cognitive chain-of-thought.',
    whatIsIt: 'Full text and reasoning dialogue environment.',
    whyUseIt: 'Solve complex problems with AI while viewing thought processes in real-time.',
    whatCanIDo: 'Send prompts, inspect tool execution, view reasoning traces, and branch conversations.',
    accentColor: '#7ECFFF',
    glowColor: 'rgba(126, 207, 255, 0.45)',
    actions: [
      {
        id: 'act-chat-stream',
        signature: '◈',
        humanLabel: 'Dialogue Canvas',
        technicalIdentity: 'Live Reasoning Stream',
        description: 'Open conversation dialogue canvas with thought traces.',
        shortcutHint: '1',
        targetSurfaceId: 'conv-chat-canvas',
        isPrimary: true,
      },
    ],
  },

  'conv-chat-canvas': {
    id: 'conv-chat-canvas',
    parentId: 'conv-chat',
    capabilityId: 'converse',
    depth: 3,
    humanLabel: 'Dialogue Stream',
    technicalIdentity: 'Live Reasoning Stream',
    description: 'Active conversation session with step-by-step cognitive thought visualization and tool output.',
    whatIsIt: 'Full conversation interface connected to AgentCore.',
    whyUseIt: 'Directly converse with Rezel.',
    whatCanIDo: 'Send inputs, review thoughts, inspect tool actions, and stream responses.',
    accentColor: '#7ECFFF',
    glowColor: 'rgba(126, 207, 255, 0.45)',
    taskType: 'chat-dialogue',
  },

  'conv-voice': {
    id: 'conv-voice',
    parentId: 'converse',
    capabilityId: 'converse',
    depth: 2,
    humanLabel: 'Voice',
    technicalIdentity: 'Live Voice Stream Studio',
    description: 'Bidirectional low-latency neural voice streaming with audio visualization.',
    whatIsIt: 'Real-time voice conversation interface with acoustic frequency monitoring.',
    whyUseIt: 'Speak hands-free with natural conversational turn-taking and low latency.',
    whatCanIDo: 'Connect microphone, adjust voice model, toggle acoustic feedback, and talk.',
    accentColor: '#7ECFFF',
    glowColor: 'rgba(126, 207, 255, 0.45)',
    actions: [
      {
        id: 'act-voice-room',
        signature: '◈',
        humanLabel: 'Voice Studio',
        technicalIdentity: 'Acoustic Resonance Studio',
        description: 'Launch real-time voice stream room with waveform feedback.',
        shortcutHint: '1',
        targetSurfaceId: 'conv-voice-room',
        isPrimary: true,
      },
    ],
  },

  'conv-voice-room': {
    id: 'conv-voice-room',
    parentId: 'conv-voice',
    capabilityId: 'converse',
    depth: 3,
    humanLabel: 'Live Voice Room',
    technicalIdentity: 'Acoustic Resonance Studio',
    description: 'Real-time bidirectional voice room with live spectrum visualizer and microphone telemetry.',
    whatIsIt: 'Interactive voice session.',
    whyUseIt: 'Speak directly with Rezel.',
    whatCanIDo: 'Toggle microphone, monitor input level, and review live transcript stream.',
    accentColor: '#7ECFFF',
    glowColor: 'rgba(126, 207, 255, 0.45)',
    taskType: 'voice-room',
  },

  'conv-history': {
    id: 'conv-history',
    parentId: 'converse',
    capabilityId: 'converse',
    depth: 2,
    humanLabel: 'History',
    technicalIdentity: 'Neural Transcript Archives',
    description: 'Searchable historical transcripts, past sessions, and persistent memory records.',
    whatIsIt: 'Archive of past dialog sessions and transcripts stored in LocalMemory.',
    whyUseIt: 'Find previous answers, retrieve discussed code, or resume earlier sessions.',
    whatCanIDo: 'Search transcripts by keyword, filter by date, and resume conversation history.',
    accentColor: '#7ECFFF',
    glowColor: 'rgba(126, 207, 255, 0.45)',
    actions: [
      {
        id: 'act-history-archive',
        signature: '◈',
        humanLabel: 'Transcript Index',
        technicalIdentity: 'Searchable Neural Index',
        description: 'Browse and search past conversation transcripts.',
        shortcutHint: '1',
        targetSurfaceId: 'conv-history-archive',
        isPrimary: true,
      },
    ],
  },

  'conv-history-archive': {
    id: 'conv-history-archive',
    parentId: 'conv-history',
    capabilityId: 'converse',
    depth: 3,
    humanLabel: 'Conversation Archives',
    technicalIdentity: 'Searchable Neural Index',
    description: 'Persistent conversation index querying LocalMemory on disk.',
    whatIsIt: 'Conversation history manager.',
    whyUseIt: 'Browse and resume previous sessions.',
    whatCanIDo: 'Filter conversations, inspect message counts, and load active context.',
    accentColor: '#7ECFFF',
    glowColor: 'rgba(126, 207, 255, 0.45)',
    taskType: 'conversation-history',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. AUTOMATE CAPABILITY FAMILY (Emerald Green Glow)
  // ═══════════════════════════════════════════════════════════════════════════
  automate: {
    id: 'automate',
    parentId: null,
    capabilityId: 'automate',
    depth: 1,
    humanLabel: 'AUTOMATE',
    technicalIdentity: 'AUTONOMOUS EXECUTION DECK',
    description: 'Run multi-step workflows, creative app bridges, and graph execution pipelines.',
    whatIsIt: 'The automation and workflow execution engine of Rezel.',
    whyUseIt: 'Automate multi-step tool pipelines or bridge with Blender and After Effects.',
    whatCanIDo: 'Monitor workflow executions, sync 3D scenes with Blender, and automate render scripts.',
    accentColor: '#00E676',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    actions: [
      {
        id: 'act-auto-workflows',
        signature: '◈',
        humanLabel: 'Workflows',
        technicalIdentity: 'Workflow Execution Engine',
        description: 'Run multi-step automated pipelines and graph tasks.',
        shortcutHint: '1',
        targetSurfaceId: 'auto-workflows',
        isPrimary: true,
      },
      {
        id: 'act-auto-blender',
        signature: '◇',
        humanLabel: 'Blender',
        technicalIdentity: 'Blender 3D Bridge',
        description: 'Control 3D scenes, objects, and node workflows.',
        shortcutHint: '2',
        targetSurfaceId: 'auto-blender',
      },
      {
        id: 'act-auto-ae',
        signature: '◌',
        humanLabel: 'After Effects',
        technicalIdentity: 'After Effects Studio Bridge',
        description: 'Control creative motion graphics and render queues.',
        shortcutHint: '3',
        targetSurfaceId: 'auto-ae',
      },
    ],
  },

  'auto-workflows': {
    id: 'auto-workflows',
    parentId: 'automate',
    capabilityId: 'automate',
    depth: 2,
    humanLabel: 'Workflows',
    technicalIdentity: 'Workflow Execution Engine',
    description: 'Real-time DAG task scheduling, live node executions, and step-by-step progress tracking.',
    whatIsIt: 'Automation runner for multi-step task graphs.',
    whyUseIt: 'Execute complex multi-tool tasks without manual supervision.',
    whatCanIDo: 'Launch workflow executions, monitor node states, pause/resume tasks, and view output logs.',
    accentColor: '#00E676',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    actions: [
      {
        id: 'act-auto-wf-engine',
        signature: '◈',
        humanLabel: 'Execution Engine',
        technicalIdentity: 'DAG Task Scheduler',
        description: 'Open live workflow execution deck and queue monitor.',
        shortcutHint: '1',
        targetSurfaceId: 'auto-workflows-engine',
        isPrimary: true,
      },
    ],
  },

  'auto-workflows-engine': {
    id: 'auto-workflows-engine',
    parentId: 'auto-workflows',
    capabilityId: 'automate',
    depth: 3,
    humanLabel: 'Workflow Runner',
    technicalIdentity: 'DAG Task Scheduler',
    description: 'Live task scheduler displaying active node executions, concurrency queues, and step latencies.',
    whatIsIt: 'Operational workflow dashboard connected to WorkflowRuntime.',
    whyUseIt: 'Monitor live automation tasks.',
    whatCanIDo: 'Inspect active tasks, view registered tools, and monitor execution state.',
    accentColor: '#00E676',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    taskType: 'workflow-runner',
  },

  'auto-blender': {
    id: 'auto-blender',
    parentId: 'automate',
    capabilityId: 'automate',
    depth: 2,
    humanLabel: 'Blender',
    technicalIdentity: 'Blender 3D Bridge',
    description: 'Bidirectional sync bridge with local Blender instance for mesh generation and camera sync.',
    whatIsIt: 'Creative software integration bridge.',
    whyUseIt: 'Control Blender scenes directly using AI commands and programmatic scripts.',
    whatCanIDo: 'Inspect connected Blender port, send Python operators, sync camera, and generate materials.',
    accentColor: '#00E676',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    actions: [
      {
        id: 'act-auto-blender-bridge',
        signature: '◈',
        humanLabel: 'Blender Bridge',
        technicalIdentity: '3D Scene Synchronizer',
        description: 'Monitor active Blender connection and send 3D commands.',
        shortcutHint: '1',
        targetSurfaceId: 'auto-blender-bridge',
        isPrimary: true,
      },
    ],
  },

  'auto-blender-bridge': {
    id: 'auto-blender-bridge',
    parentId: 'auto-blender',
    capabilityId: 'automate',
    depth: 3,
    humanLabel: 'Blender Controller',
    technicalIdentity: '3D Scene Synchronizer',
    description: 'Live Blender bridge interface displaying connection status, socket port 9090 telemetry, and scene synchronizer.',
    whatIsIt: 'Blender 3D communication deck.',
    whyUseIt: 'Control 3D viewport and render parameters.',
    whatCanIDo: 'Inspect socket connection status and view setup instructions.',
    accentColor: '#00E676',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    taskType: 'blender-bridge',
  },

  'auto-ae': {
    id: 'auto-ae',
    parentId: 'automate',
    capabilityId: 'automate',
    depth: 2,
    humanLabel: 'After Effects',
    technicalIdentity: 'After Effects Studio Bridge',
    description: 'Motion graphics script bridge for keyframe generation, layer rigging, and render exports.',
    whatIsIt: 'Video & motion design automation bridge.',
    whyUseIt: 'Automate repetitive keyframe creation and multi-layer composition updates.',
    whatCanIDo: 'Send ExtendScript snippets, inspect compositions, and trigger render jobs.',
    accentColor: '#00E676',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    actions: [
      {
        id: 'act-auto-ae-bridge',
        signature: '◈',
        humanLabel: 'AE Bridge',
        technicalIdentity: 'Motion Graphics Engine',
        description: 'Manage After Effects composition bridge and script executions.',
        shortcutHint: '1',
        targetSurfaceId: 'auto-ae-bridge',
        isPrimary: true,
      },
    ],
  },

  'auto-ae-bridge': {
    id: 'auto-ae-bridge',
    parentId: 'auto-ae',
    capabilityId: 'automate',
    depth: 3,
    humanLabel: 'After Effects Controller',
    technicalIdentity: 'Motion Graphics Engine',
    description: 'ExtendScript IPC bridge interface for Adobe After Effects composition automation.',
    whatIsIt: 'After Effects communication deck.',
    whyUseIt: 'Automate motion graphics compositions.',
    whatCanIDo: 'Check IPC status and view connection instructions.',
    accentColor: '#00E676',
    glowColor: 'rgba(0, 230, 118, 0.45)',
    taskType: 'ae-bridge',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. ANALYZE CAPABILITY FAMILY (Cyan Glow)
  // ═══════════════════════════════════════════════════════════════════════════
  analyze: {
    id: 'analyze',
    parentId: null,
    capabilityId: 'analyze',
    depth: 1,
    humanLabel: 'ANALYZE',
    technicalIdentity: 'SIGNAL & PROVIDER INTELLIGENCE',
    description: 'Compare AI models, inspect compute telemetry, and explore memory forensics.',
    whatIsIt: 'The signal intelligence and telemetry analysis center of Rezel.',
    whyUseIt: 'Understand AI model latencies, token costs, system health, and memory recall.',
    whatCanIDo: 'Compare AI providers, monitor CPU/GPU telemetry, and search persistent memory.',
    accentColor: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.45)',
    actions: [
      {
        id: 'act-analyze-providers',
        signature: '◈',
        humanLabel: 'AI Providers',
        technicalIdentity: 'Provider Routing Intelligence',
        description: 'Compare health, latency, token costs, and multi-LLM routing.',
        shortcutHint: '1',
        targetSurfaceId: 'analyze-providers',
        isPrimary: true,
      },
      {
        id: 'act-analyze-system',
        signature: '◇',
        humanLabel: 'System',
        technicalIdentity: 'System Compute Telemetry',
        description: 'Understand CPU, GPU, VRAM, and runtime health.',
        shortcutHint: '2',
        targetSurfaceId: 'analyze-system',
      },
      {
        id: 'act-analyze-memory',
        signature: '⬡',
        humanLabel: 'Memory',
        technicalIdentity: 'Memory Recall Forensics',
        description: 'Explore what Rezel remembers and why it was retrieved.',
        shortcutHint: '3',
        targetSurfaceId: 'analyze-memory',
      },
    ],
  },

  'analyze-providers': {
    id: 'analyze-providers',
    parentId: 'analyze',
    capabilityId: 'analyze',
    depth: 2,
    humanLabel: 'AI Providers',
    technicalIdentity: 'Provider Routing Intelligence',
    description: 'Multi-LLM dynamic routing, token cost tracking, daily budget caps, and provider health states.',
    whatIsIt: 'AI provider management and routing optimization hub.',
    whyUseIt: 'Ensure lowest latency, cost efficiency, and automated failover between AI models.',
    whatCanIDo: 'Configure routing profiles (AUTO, SPEED, COST_SAVER, QUALITY, LOCAL) and inspect health.',
    accentColor: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.45)',
    actions: [
      {
        id: 'act-prov-matrix',
        signature: '◈',
        humanLabel: 'Provider Matrix',
        technicalIdentity: 'Latency & Routing Deck',
        description: 'View active provider matrix, daily limits, and routing profile status.',
        shortcutHint: '1',
        targetSurfaceId: 'analyze-providers-matrix',
        isPrimary: true,
      },
    ],
  },

  'analyze-providers-matrix': {
    id: 'analyze-providers-matrix',
    parentId: 'analyze-providers',
    capabilityId: 'analyze',
    depth: 3,
    humanLabel: 'Provider Router',
    technicalIdentity: 'Latency & Routing Deck',
    description: 'Live provider telemetry deck showing dynamic routing profiles, health states, and daily caps.',
    whatIsIt: 'Operational provider intelligence interface.',
    whyUseIt: 'Optimize AI speed, costs, and reliability.',
    whatCanIDo: 'Switch routing profiles and view enabled providers.',
    accentColor: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.45)',
    taskType: 'provider-matrix',
  },

  'analyze-system': {
    id: 'analyze-system',
    parentId: 'analyze',
    capabilityId: 'analyze',
    depth: 2,
    humanLabel: 'System',
    technicalIdentity: 'System Compute Telemetry',
    description: 'Real-time CPU compute threads, GPU device identification, and system memory allocation.',
    whatIsIt: 'Hardware and runtime compute monitoring.',
    whyUseIt: 'Verify that local GPU/VRAM hardware is operating nominally without bottlenecks.',
    whatCanIDo: 'Inspect GPU utilization, monitor system memory, and observe active workloads.',
    accentColor: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.45)',
    actions: [
      {
        id: 'act-sys-telemetry',
        signature: '◈',
        humanLabel: 'Compute Gauges',
        technicalIdentity: 'Hardware Telemetry Monitor',
        description: 'Real-time CPU/GPU and system memory resource gauges.',
        shortcutHint: '1',
        targetSurfaceId: 'analyze-system-gauges',
        isPrimary: true,
      },
    ],
  },

  'analyze-system-gauges': {
    id: 'analyze-system-gauges',
    parentId: 'analyze-system',
    capabilityId: 'analyze',
    depth: 3,
    humanLabel: 'Compute Telemetry',
    technicalIdentity: 'Hardware Telemetry Monitor',
    description: 'Real-time hardware compute gauges displaying GPU utilization, VRAM usage, thread counts, and memory footprint.',
    whatIsIt: 'Hardware monitoring panel connected to SystemIntelligenceEngine.',
    whyUseIt: 'Check compute availability and system load.',
    whatCanIDo: 'Monitor live CPU threads, GPU hardware, and memory allocation.',
    accentColor: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.45)',
    taskType: 'telemetry-gauges',
  },

  'analyze-memory': {
    id: 'analyze-memory',
    parentId: 'analyze',
    capabilityId: 'analyze',
    depth: 2,
    humanLabel: 'Memory',
    technicalIdentity: 'Memory Recall Forensics',
    description: 'Searchable memory repository, category indexing, and persistent knowledge entries.',
    whatIsIt: 'Forensic inspection tool for persistent agent memory.',
    whyUseIt: 'Search and inspect stored memories, preferences, and context records.',
    whatCanIDo: 'Search memory entries, filter by category, and manage saved records.',
    accentColor: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.45)',
    actions: [
      {
        id: 'act-mem-strata',
        signature: '◈',
        humanLabel: 'Memory Forensics',
        technicalIdentity: 'Memory Search & Catalog',
        description: 'Search persistent memory entries and category metadata.',
        shortcutHint: '1',
        targetSurfaceId: 'analyze-memory-strata',
        isPrimary: true,
      },
    ],
  },

  'analyze-memory-strata': {
    id: 'analyze-memory-strata',
    parentId: 'analyze-memory',
    capabilityId: 'analyze',
    depth: 3,
    humanLabel: 'Recall Forensics',
    technicalIdentity: 'Memory Search & Catalog',
    description: 'Live memory browser querying LocalMemory with keyword search and category breakdown.',
    whatIsIt: 'Memory search and inspection interface.',
    whyUseIt: 'Verify and curate saved memory entries.',
    whatCanIDo: 'Search memories, filter categories (context, preference, automation, note), and delete entries.',
    accentColor: '#00E5FF',
    glowColor: 'rgba(0, 229, 255, 0.45)',
    taskType: 'memory-forensics',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. INSPECT CAPABILITY FAMILY (Violet Glow)
  // ═══════════════════════════════════════════════════════════════════════════
  inspect: {
    id: 'inspect',
    parentId: null,
    capabilityId: 'inspect',
    depth: 1,
    humanLabel: 'INSPECT',
    technicalIdentity: 'DEEP OBSERVABILITY & AUDIT',
    description: 'Explore available models, inspect service endpoints, explore knowledge graphs, and review security gates.',
    whatIsIt: 'The deep observability and security inspection center of Rezel.',
    whyUseIt: 'Audit AI models, verify connected services, query knowledge DBs, and inspect security records.',
    whatCanIDo: 'Inspect local/cloud models, check endpoint status, browse knowledge entries, and review trust gates.',
    accentColor: '#9D4EDD',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    actions: [
      {
        id: 'act-inspect-models',
        signature: '◈',
        humanLabel: 'Models',
        technicalIdentity: 'Model Weights Catalog',
        description: 'Explore available local and cloud AI models and hardware compatibility.',
        shortcutHint: '1',
        targetSurfaceId: 'inspect-models',
        isPrimary: true,
      },
      {
        id: 'act-inspect-providers',
        signature: '◇',
        humanLabel: 'Providers',
        technicalIdentity: 'Provider Endpoint Latencies',
        description: 'Inspect connected AI services, quotas, and health.',
        shortcutHint: '2',
        targetSurfaceId: 'inspect-providers',
      },
      {
        id: 'act-inspect-knowledge',
        signature: '◌',
        humanLabel: 'Knowledge',
        technicalIdentity: 'Knowledge Store & Memory Index',
        description: 'Explore persistent knowledge entries and memory categories.',
        shortcutHint: '3',
        targetSurfaceId: 'inspect-knowledge',
      },
      {
        id: 'act-inspect-security',
        signature: '⬡',
        humanLabel: 'Security',
        technicalIdentity: 'Cryptographic Trust Audit',
        description: 'Review trust verification, tool access, and autonomy gates.',
        shortcutHint: '4',
        targetSurfaceId: 'inspect-security',
      },
    ],
  },

  'inspect-models': {
    id: 'inspect-models',
    parentId: 'inspect',
    capabilityId: 'inspect',
    depth: 2,
    humanLabel: 'Models',
    technicalIdentity: 'Model Weights Catalog',
    description: 'Catalog of active local GGUF/Ollama weights, cloud LLMs, token pricing, and RAM requirements.',
    whatIsIt: 'Model inventory and compatibility registry.',
    whyUseIt: 'Compare capabilities across Claude, Gemini, GPT, and local models.',
    whatCanIDo: 'Search models, check RAM/VRAM compatibility, and select the active reasoning model.',
    accentColor: '#9D4EDD',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    actions: [
      {
        id: 'act-models-bench',
        signature: '◈',
        humanLabel: 'Model Catalog',
        technicalIdentity: 'Model Compatibility & Weights',
        description: 'Explore model specifications, RAM compatibility, and active providers.',
        shortcutHint: '1',
        targetSurfaceId: 'inspect-models-bench',
        isPrimary: true,
      },
    ],
  },

  'inspect-models-bench': {
    id: 'inspect-models-bench',
    parentId: 'inspect-models',
    capabilityId: 'inspect',
    depth: 3,
    humanLabel: 'Model Explorer',
    technicalIdentity: 'Model Compatibility & Weights',
    description: 'Comprehensive model inventory with active context lengths, pricing, and hardware compatibility evaluations.',
    whatIsIt: 'Model catalog and selector interface connected to ModelManager.',
    whyUseIt: 'Evaluate and select AI models for specific coding or reasoning tasks.',
    whatCanIDo: 'Search and filter models by category (Cloud, Local, Coding, Reasoning) and inspect specs.',
    accentColor: '#9D4EDD',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    taskType: 'model-catalog',
  },

  'inspect-providers': {
    id: 'inspect-providers',
    parentId: 'inspect',
    capabilityId: 'inspect',
    depth: 2,
    humanLabel: 'Providers',
    technicalIdentity: 'Provider Endpoint Latencies',
    description: 'Inspect connected AI services, auth tokens, daily budgets, and endpoint health.',
    whatIsIt: 'Provider status and health monitoring.',
    whyUseIt: 'Check API credentials and routing latency.',
    whatCanIDo: 'View authenticated providers and set routing profiles.',
    accentColor: '#9D4EDD',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    actions: [
      {
        id: 'act-inspect-prov-matrix',
        signature: '◈',
        humanLabel: 'Provider Deck',
        technicalIdentity: 'Provider Health & Limits',
        description: 'View active AI provider matrix and authorization status.',
        shortcutHint: '1',
        targetSurfaceId: 'inspect-providers-matrix',
        isPrimary: true,
      },
    ],
  },

  'inspect-providers-matrix': {
    id: 'inspect-providers-matrix',
    parentId: 'inspect-providers',
    capabilityId: 'inspect',
    depth: 3,
    humanLabel: 'Provider Status',
    technicalIdentity: 'Provider Health & Limits',
    description: 'Operational provider health, daily caps, and authentication monitoring.',
    whatIsIt: 'Provider inspector interface.',
    whyUseIt: 'Inspect provider status.',
    whatCanIDo: 'View authentication and health telemetry across all providers.',
    accentColor: '#9D4EDD',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    taskType: 'provider-matrix',
  },

  'inspect-knowledge': {
    id: 'inspect-knowledge',
    parentId: 'inspect',
    capabilityId: 'inspect',
    depth: 2,
    humanLabel: 'Knowledge',
    technicalIdentity: 'Knowledge Store & Memory Index',
    description: 'Explore persistent knowledge entries, system context, and saved preferences.',
    whatIsIt: 'Knowledge store viewer.',
    whyUseIt: 'Review what Rezel has recorded in local persistent storage.',
    whatCanIDo: 'Search entries and view key-value records.',
    accentColor: '#9D4EDD',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    actions: [
      {
        id: 'act-knowledge-store',
        signature: '◈',
        humanLabel: 'Knowledge Matrix',
        technicalIdentity: 'Persistent Store Deck',
        description: 'Browse all knowledge records saved in LocalMemory.',
        shortcutHint: '1',
        targetSurfaceId: 'inspect-knowledge-store',
        isPrimary: true,
      },
    ],
  },

  'inspect-knowledge-store': {
    id: 'inspect-knowledge-store',
    parentId: 'inspect-knowledge',
    capabilityId: 'inspect',
    depth: 3,
    humanLabel: 'Knowledge Store',
    technicalIdentity: 'Persistent Store Deck',
    description: 'Direct inspection of LocalMemory entries across all categories.',
    whatIsIt: 'Knowledge entry browser.',
    whyUseIt: 'Search and inspect system context entries.',
    whatCanIDo: 'Filter entries and review stored information.',
    accentColor: '#9D4EDD',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    taskType: 'memory-forensics',
  },

  'inspect-security': {
    id: 'inspect-security',
    parentId: 'inspect',
    capabilityId: 'inspect',
    depth: 2,
    humanLabel: 'Security',
    technicalIdentity: 'Cryptographic Trust Audit',
    description: 'Cryptographic trust verification, active session grants, risk governance tiers, and sandbox process boundary observability.',
    whatIsIt: 'Security posture and session attestation monitor.',
    whyUseIt: 'Verify that sandboxing, risk tiers, and session boundaries are securely enforced.',
    whatCanIDo: 'Inspect active session grants, review risk rules, and audit process isolation.',
    accentColor: '#9D4EDD',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    actions: [
      {
        id: 'act-sec-audit',
        signature: '◈',
        humanLabel: 'Security Audit',
        technicalIdentity: 'Trust & Governance Attestation',
        description: 'Review security posture, active session grants, and risk governance tiers.',
        shortcutHint: '1',
        targetSurfaceId: 'inspect-security-audit',
        isPrimary: true,
      },
    ],
  },

  'inspect-security-audit': {
    id: 'inspect-security-audit',
    parentId: 'inspect-security',
    capabilityId: 'inspect',
    depth: 3,
    humanLabel: 'Security Audit',
    technicalIdentity: 'Trust & Governance Attestation',
    description: 'Observability dashboard for cryptographic trust, ephemeral session grants, risk tiers, and tool sandboxing boundaries.',
    whatIsIt: 'Security posture and session attestation monitor.',
    whyUseIt: 'Verify that sandboxing, risk tiers, and session boundaries are securely enforced.',
    whatCanIDo: 'Inspect active session grants, review risk rules, and audit process isolation.',
    accentColor: '#9D4EDD',
    glowColor: 'rgba(157, 78, 221, 0.45)',
    taskType: 'security-audit',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. CONTROL CAPABILITY FAMILY (Electric Purple / Indigo Glow)
  // ═══════════════════════════════════════════════════════════════════════════
  control: {
    id: 'control',
    parentId: null,
    capabilityId: 'control',
    depth: 1,
    humanLabel: 'CONTROL',
    technicalIdentity: 'GOVERNANCE & PERMISSION DECK',
    description: 'Customize persona style, response tone, and configure autonomy permission gates.',
    whatIsIt: 'The governance, personalization, and permission deck of Rezel.',
    whyUseIt: 'Tailor Rezel to your working style and set boundaries for what Rezel is allowed to do.',
    whatCanIDo: 'Configure operating personas and set interactive autonomy permission gates.',
    accentColor: '#7A5CFF',
    glowColor: 'rgba(122, 92, 255, 0.45)',
    actions: [
      {
        id: 'act-ctrl-personalization',
        signature: '◈',
        humanLabel: 'Personalization',
        technicalIdentity: 'Operating Persona & Style',
        description: 'Customize how Rezel behaves, speaks, and looks.',
        shortcutHint: '1',
        targetSurfaceId: 'ctrl-personalization',
        isPrimary: true,
      },
      {
        id: 'act-ctrl-permissions',
        signature: '◇',
        humanLabel: 'Permissions',
        technicalIdentity: 'Autonomy Permission Gates',
        description: 'Control what Rezel is allowed to access, modify, or execute.',
        shortcutHint: '2',
        targetSurfaceId: 'ctrl-permissions',
      },
    ],
  },

  'ctrl-personalization': {
    id: 'ctrl-personalization',
    parentId: 'control',
    capabilityId: 'control',
    depth: 2,
    humanLabel: 'Personalization',
    technicalIdentity: 'Operating Persona & Style',
    description: 'Operating persona tone, response brevity, reasoning depth, and visual atmosphere themes.',
    whatIsIt: 'Persona and environment customization studio.',
    whyUseIt: 'Adapt Rezel to your specific communication style and UI aesthetic preferences.',
    whatCanIDo: 'Switch visual themes, adjust persona verbosity, and set reasoning depth.',
    accentColor: '#7A5CFF',
    glowColor: 'rgba(122, 92, 255, 0.45)',
    actions: [
      {
        id: 'act-persona-customizer',
        signature: '◈',
        humanLabel: 'Persona Designer',
        technicalIdentity: 'Persona & Theme Configurator',
        description: 'Configure operating persona, response tone, and visual environment theme.',
        shortcutHint: '1',
        targetSurfaceId: 'ctrl-personalization-designer',
        isPrimary: true,
      },
    ],
  },

  'ctrl-personalization-designer': {
    id: 'ctrl-personalization-designer',
    parentId: 'ctrl-personalization',
    capabilityId: 'control',
    depth: 3,
    humanLabel: 'Persona Designer',
    technicalIdentity: 'Persona & Theme Configurator',
    description: 'Interactive persona studio with tone sliders, visual theme switches (Soft / Holographic / Terminal), and custom prompt guidelines.',
    whatIsIt: 'Personalization studio connected to RezelDirector and LocalMemory.',
    whyUseIt: 'Customize Rezel to your liking.',
    whatCanIDo: 'Choose themes, adjust response brevity, and set reasoning depth.',
    accentColor: '#7A5CFF',
    glowColor: 'rgba(122, 92, 255, 0.45)',
    taskType: 'persona-designer',
  },

  'ctrl-permissions': {
    id: 'ctrl-permissions',
    parentId: 'control',
    capabilityId: 'control',
    depth: 2,
    humanLabel: 'Permissions',
    technicalIdentity: 'Autonomy Permission Gates',
    description: 'Granular file-system, terminal execution, and external network approval gates.',
    whatIsIt: 'Permission and execution boundary configuration.',
    whyUseIt: 'Control exactly which actions require human confirmation before execution.',
    whatCanIDo: 'Toggle confirmation gates for file writes, shell commands, and outbound requests.',
    accentColor: '#7A5CFF',
    glowColor: 'rgba(122, 92, 255, 0.45)',
    actions: [
      {
        id: 'act-perm-gates',
        signature: '◈',
        humanLabel: 'Permission Gates',
        technicalIdentity: 'Autonomy Security Boundary',
        description: 'Configure approval requirements for file access, commands, and network requests.',
        shortcutHint: '1',
        targetSurfaceId: 'ctrl-permissions-gates',
        isPrimary: true,
      },
    ],
  },

  'ctrl-permissions-gates': {
    id: 'ctrl-permissions-gates',
    parentId: 'ctrl-permissions',
    capabilityId: 'control',
    depth: 3,
    humanLabel: 'Permission Gates',
    technicalIdentity: 'Autonomy Security Boundary',
    description: 'Granular autonomy control deck with interactive toggles for file-system writes, terminal execution, and API requests.',
    whatIsIt: 'Security boundary deck connected to PermissionManager.',
    whyUseIt: 'Set safe boundaries for AI autonomy.',
    whatCanIDo: 'Configure human-in-the-loop policies for every tool category.',
    accentColor: '#7A5CFF',
    glowColor: 'rgba(122, 92, 255, 0.45)',
    taskType: 'trust-gates',
  },
};

/**
 * Registry Helper Methods
 */
export function getSpatialSurface(id: string): SpatialSurfaceDefinition | null {
  return SPATIAL_SURFACE_REGISTRY[id] || null;
}

export function getChildrenSurfaces(parentId: string): SpatialSurfaceDefinition[] {
  return Object.values(SPATIAL_SURFACE_REGISTRY).filter((s) => s.parentId === parentId);
}

export function getCapabilitySurfaces(capabilityId: string): SpatialSurfaceDefinition[] {
  return Object.values(SPATIAL_SURFACE_REGISTRY).filter((s) => s.capabilityId === capabilityId);
}

/**
 * Validates that all surface actions point to existing destinations
 */
export function validateSpatialSurfaceRegistry(): {
  valid: boolean;
  totalSurfaces: number;
  totalActions: number;
  unresolvedTargets: string[];
} {
  const unresolvedTargets: string[] = [];
  let totalActions = 0;

  for (const surface of Object.values(SPATIAL_SURFACE_REGISTRY)) {
    if (surface.actions) {
      for (const action of surface.actions) {
        totalActions++;
        if (!SPATIAL_SURFACE_REGISTRY[action.targetSurfaceId]) {
          unresolvedTargets.push(`${surface.id} -> ${action.targetSurfaceId}`);
        }
      }
    }
  }

  return {
    valid: unresolvedTargets.length === 0,
    totalSurfaces: Object.keys(SPATIAL_SURFACE_REGISTRY).length,
    totalActions,
    unresolvedTargets,
  };
}
