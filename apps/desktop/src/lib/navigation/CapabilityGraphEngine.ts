import type { InspectorId } from '../../types/navigation';

export interface GraphNode {
  id: string;
  label: string;
  type: 'origin' | 'domain' | 'capability' | 'action' | 'app';
  target?: InspectorId;
  parentId?: string;
  depth: number;
  // Spatial coordinates in 2.5D space
  x: number;
  y: number;
  z: number;
  // Dynamic state
  structuralType: 'core' | 'creation' | 'waveform' | 'lattice' | 'spectral' | 'aperture' | 'mesh3d' | 'memory' | 'security' | 'router';
  state?: 'idle' | 'active' | 'connected' | 'degraded' | 'pulsing';
  childrenIds: string[];
  description?: string;
}

export interface GraphTrajectory {
  id: string;
  fromId: string;
  toId: string;
  isHistorical?: boolean;
  isActivePath?: boolean;
}

export interface TemporalTrace {
  id: string;
  nodeId: string;
  label: string;
  timestamp: number;
}

/**
 * REZEL CAPABILITY GRAPH ENGINE
 * Dynamically computes computational topology, active reasoning corridors,
 * temporal traces, and spatial depth projections.
 */
export class CapabilityGraphEngine {
  /**
   * Generates the dynamic capability graph based on current intent, active focus,
   * running workflows, and connected creative applications.
   */
  public static buildGraph(params: {
    activeNodeId: string | null;
    activeWorkflows: number;
    connectedApp: string | null;
    routingProfile: string | null;
    intentQuery?: string;
  }): { nodes: GraphNode[]; trajectories: GraphTrajectory[] } {
    const { activeNodeId, activeWorkflows, connectedApp, routingProfile, intentQuery } = params;

    const nodes: GraphNode[] = [];
    const trajectories: GraphTrajectory[] = [];

    // Root / Origin Node: CURRENT INTENT & QUANTUM CORE (Depth 0)
    const originNode: GraphNode = {
      id: 'origin',
      label: 'CURRENT INTENT',
      type: 'origin',
      depth: 0,
      x: 0,
      y: 0,
      z: 0,
      structuralType: 'core',
      state: activeWorkflows > 0 ? 'active' : 'idle',
      childrenIds: ['domain-create', 'domain-automate', 'domain-analyze', 'domain-converse', 'domain-inspect', 'domain-control'],
      description: 'QuantumCore Computational Origin',
    };
    nodes.push(originNode);

    // Level 1: Major Intent Domains (Unfolded dynamically from Origin)
    const domainDefs = [
      {
        id: 'domain-create',
        label: 'CREATE',
        structuralType: 'creation' as const,
        x: -160,
        y: -140,
        z: -20,
        target: 'workflow' as InspectorId,
        children: [
          { id: 'create-visuals', label: 'VISUAL SYNTHESIS', target: 'workflow' as InspectorId, desc: 'Generative concepts & art', struct: 'mesh3d' as const },
          { id: 'create-code', label: 'CODE ARCHITECTURE', target: 'workflow' as InspectorId, desc: 'AI software scripting', struct: 'lattice' as const },
          { id: 'create-composer', label: 'WORKFLOW COMPOSER', target: 'workflow' as InspectorId, desc: 'Visual pipeline nodes', struct: 'creation' as const },
        ],
      },
      {
        id: 'domain-automate',
        label: 'AUTOMATE',
        structuralType: 'lattice' as const,
        x: -180,
        y: 110,
        z: -10,
        target: 'workflow' as InspectorId,
        children: [
          { id: 'auto-engine', label: 'EXECUTION ENGINE', target: 'workflow' as InspectorId, desc: `${activeWorkflows} active graphs`, struct: 'lattice' as const },
          { id: 'auto-blender', label: 'BLENDER BRIDGE', target: 'workflow' as InspectorId, desc: connectedApp === 'blender' ? 'Live Session Active' : '3D workspace bridge', struct: 'mesh3d' as const },
          { id: 'auto-ae', label: 'AFTER EFFECTS', target: 'workflow' as InspectorId, desc: 'Motion graphics studio', struct: 'mesh3d' as const },
          { id: 'auto-agents', label: 'AUTONOMOUS AGENTS', target: 'workflow' as InspectorId, desc: 'Self-directed background agents', struct: 'aperture' as const },
        ],
      },
      {
        id: 'domain-analyze',
        label: 'ANALYZE',
        structuralType: 'spectral' as const,
        x: 180,
        y: -130,
        z: -15,
        target: 'providers' as InspectorId,
        children: [
          { id: 'analyze-network', label: 'ROUTING NETWORK', target: 'providers' as InspectorId, desc: routingProfile ? `Profile: ${routingProfile}` : 'Multi-LLM failover', struct: 'router' as const },
          { id: 'analyze-telemetry', label: 'SYSTEM TELEMETRY', target: 'system' as InspectorId, desc: 'Hardware & GPU telemetry', struct: 'spectral' as const },
          { id: 'analyze-memory', label: 'RECALL FORENSICS', target: 'memory' as InspectorId, desc: 'Vector space matrices', struct: 'memory' as const },
        ],
      },
      {
        id: 'domain-converse',
        label: 'CONVERSE',
        structuralType: 'waveform' as const,
        x: 210,
        y: 60,
        z: -25,
        target: 'conversations' as InspectorId,
        children: [
          { id: 'conv-voice', label: 'LIVE VOICE STREAM', target: 'conversations' as InspectorId, desc: 'Bidirectional low-latency audio', struct: 'waveform' as const },
          { id: 'conv-transcripts', label: 'TRANSCRIPT ARCHIVES', target: 'conversations' as InspectorId, desc: 'Full thread logs & search', struct: 'memory' as const },
          { id: 'conv-trace', label: 'REASONING TRACE', target: 'conversations' as InspectorId, desc: 'Cognitive reasoning trace', struct: 'spectral' as const },
        ],
      },
      {
        id: 'domain-inspect',
        label: 'INSPECT',
        structuralType: 'aperture' as const,
        x: -20,
        y: 200,
        z: -30,
        target: 'models' as InspectorId,
        children: [
          { id: 'inspect-models', label: 'MODEL CATALOG', target: 'models' as InspectorId, desc: 'Active weights & benchmarks', struct: 'aperture' as const },
          { id: 'inspect-providers', label: 'PROVIDER HEALTH', target: 'providers' as InspectorId, desc: 'Live provider latencies', struct: 'router' as const },
          { id: 'inspect-memory', label: 'KNOWLEDGE STORE', target: 'memory' as InspectorId, desc: 'Persistent neural store', struct: 'memory' as const },
          { id: 'inspect-trust', label: 'SECURITY AUDIT', target: 'trust' as InspectorId, desc: 'Attestation & sandbox', struct: 'security' as const },
        ],
      },
      {
        id: 'domain-control',
        label: 'CONTROL',
        structuralType: 'security' as const,
        x: 140,
        y: 190,
        z: -20,
        target: 'personalization' as InspectorId,
        children: [
          { id: 'ctrl-settings', label: 'PREFERENCES', target: 'personalization' as InspectorId, desc: 'Operating persona & style', struct: 'security' as const },
          { id: 'ctrl-trust', label: 'PERMISSIONS & GATES', target: 'trust' as InspectorId, desc: 'Autonomy authorization', struct: 'security' as const },
        ],
      },
    ];

    domainDefs.forEach((d) => {
      const isDomainActive = activeNodeId === d.id || d.children.some((c) => c.id === activeNodeId);

      const domainNode: GraphNode = {
        id: d.id,
        label: d.label,
        type: 'domain',
        parentId: 'origin',
        depth: 1,
        x: d.x,
        y: d.y,
        z: isDomainActive ? 20 : d.z,
        structuralType: d.structuralType,
        target: d.target,
        state: isDomainActive ? 'active' : 'idle',
        childrenIds: d.children.map((c) => c.id),
      };
      nodes.push(domainNode);

      trajectories.push({
        id: `traj-origin-${d.id}`,
        fromId: 'origin',
        toId: d.id,
        isActivePath: isDomainActive,
      });

      // Level 2 & 3: Unfold children nodes if domain is focused or queried
      if (isDomainActive || (intentQuery && intentQuery.length > 0)) {
        d.children.forEach((c, cIdx) => {
          const isActionActive = activeNodeId === c.id;
          const childSpreadX = d.x + (cIdx - (d.children.length - 1) / 2) * 95;
          const childSpreadY = d.y + (d.y >= 0 ? 80 : -80);

          const childNode: GraphNode = {
            id: c.id,
            label: c.label,
            type: 'action',
            parentId: d.id,
            depth: 2,
            x: childSpreadX,
            y: childSpreadY,
            z: isActionActive ? 40 : 0,
            structuralType: c.struct,
            target: c.target,
            description: c.desc,
            state: isActionActive ? 'active' : 'idle',
            childrenIds: [],
          };
          nodes.push(childNode);

          trajectories.push({
            id: `traj-${d.id}-${c.id}`,
            fromId: d.id,
            toId: c.id,
            isActivePath: isActionActive || isDomainActive,
          });
        });
      }
    });

    return { nodes, trajectories };
  }
}
