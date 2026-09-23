/**
 * REZEL 13.3.2 — Adobe Payload Validator & Parser
 *
 * Sanitizes and validates untrusted raw output returned from the After Effects
 * adapter / ExtendScript inspection bridge into a well-formed `AdobeProjectSnapshot`.
 *
 * Enforces:
 * - Numeric boundaries (no NaN, Infinity, negative dimensions)
 * - Array size limits (configurable composition & layer caps with truncation markers)
 * - Tri-state status determination (PROJECT_CLOSED, PROJECT_OPEN, NO_ACTIVE_COMPOSITION, ACTIVE_COMPOSITION, UNKNOWN)
 * - Provenance tracking (source = 'APPLICATION_ADAPTER', observedAt timestamp)
 */

import type {
  AdobeProjectSnapshot,
  AdobeProjectStatus,
  CompositionSnapshot,
  LayerSnapshot,
  LayerTransformState,
} from './types';
import { mapAdobeLayerType } from './layerTypeMapper';

export const DEFAULT_MAX_COMPOSITIONS = 100;
export const DEFAULT_MAX_LAYERS_PER_COMP = 200;

export interface ValidationOptions {
  readonly maxCompositions?: number;
  readonly maxLayersPerComposition?: number;
  readonly observedAt?: number;
}

/**
 * Validates a number is finite and strictly within [min, max] range.
 * Returns undefined if validation fails.
 */
function sanitizeNumber(val: unknown, min = 0, max = Infinity, integer = false): number | undefined {
  if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val)) {
    return undefined;
  }
  if (val < min || val > max) {
    return undefined;
  }
  return integer ? Math.floor(val) : val;
}

/**
 * Safely extracts a 3D coordinate tuple from raw array or object.
 */
function sanitizeCoordinateTuple(raw: unknown): readonly [number, number, number] | undefined {
  if (Array.isArray(raw)) {
    const x = sanitizeNumber(raw[0], -100000, 100000);
    const y = sanitizeNumber(raw[1], -100000, 100000);
    const z = sanitizeNumber(raw[2], -100000, 100000) ?? 0;
    if (x !== undefined && y !== undefined) {
      return [x, y, z] as const;
    }
  } else if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const x = sanitizeNumber(obj.x, -100000, 100000);
    const y = sanitizeNumber(obj.y, -100000, 100000);
    const z = sanitizeNumber(obj.z, -100000, 100000) ?? 0;
    if (x !== undefined && y !== undefined) {
      return [x, y, z] as const;
    }
  }
  return undefined;
}

/**
 * Sanitizes layer transform properties.
 */
function sanitizeTransformState(rawLayer: Record<string, unknown>): LayerTransformState | undefined {
  const rawTransform = (rawLayer.transform || rawLayer.transformState || rawLayer) as Record<string, unknown>;

  const position = sanitizeCoordinateTuple(rawTransform.position);
  const scale = sanitizeCoordinateTuple(rawTransform.scale);
  const rotation = sanitizeNumber(rawTransform.rotation, -360000, 360000);
  const opacity = sanitizeNumber(rawTransform.opacity, 0, 100);

  if (position === undefined && scale === undefined && rotation === undefined && opacity === undefined) {
    return undefined;
  }

  return {
    position,
    scale,
    rotation,
    opacity,
  };
}

/**
 * Parses and sanitizes a single raw layer item.
 */
function parseLayerSnapshot(
  rawLayer: unknown,
  fallbackIndex: number
): LayerSnapshot | undefined {
  if (!rawLayer || typeof rawLayer !== 'object') {
    return undefined;
  }

  const obj = rawLayer as Record<string, unknown>;
  const rawIndex = sanitizeNumber(obj.index ?? obj.layerIndex, 0, 100000, true);
  const index = rawIndex !== undefined ? rawIndex : fallbackIndex;

  const rawId = obj.id ?? obj.layerId ?? obj.name ?? `layer_${index}`;
  const id = typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId) : `layer_${index}`;
  const name = typeof obj.name === 'string' ? obj.name : `Layer ${index}`;

  const type = mapAdobeLayerType(obj.type ?? obj.layerType, obj);

  const isVisible = typeof obj.isVisible === 'boolean' ? obj.isVisible : typeof obj.enabled === 'boolean' ? obj.enabled : undefined;
  const isLocked = typeof obj.isLocked === 'boolean' ? obj.isLocked : typeof obj.locked === 'boolean' ? obj.locked : undefined;

  const transformState = sanitizeTransformState(obj);

  return {
    index,
    id,
    name,
    type,
    isVisible,
    isLocked,
    transformState,
  };
}

/**
 * Parses and sanitizes a single raw composition item.
 */
function parseCompositionSnapshot(
  rawComp: unknown,
  fallbackIndex: number,
  maxLayers: number
): CompositionSnapshot | undefined {
  if (!rawComp || typeof rawComp !== 'object') {
    return undefined;
  }

  const obj = rawComp as Record<string, unknown>;
  const rawId = obj.id ?? obj.compId ?? obj.name ?? `comp_${fallbackIndex}`;
  const id = typeof rawId === 'string' || typeof rawId === 'number' ? String(rawId) : `comp_${fallbackIndex}`;
  const name = typeof obj.name === 'string' ? obj.name : `Comp ${fallbackIndex}`;

  const width = sanitizeNumber(obj.width, 1, 32768, true);
  const height = sanitizeNumber(obj.height, 1, 32768, true);
  const duration = sanitizeNumber(obj.duration, 0, 86400);
  const frameRate = sanitizeNumber(obj.frameRate ?? obj.fps, 0.01, 120);

  const rawLayers = Array.isArray(obj.layers) ? obj.layers : [];
  const isTruncated = rawLayers.length > maxLayers;
  const boundedLayers = isTruncated ? rawLayers.slice(0, maxLayers) : rawLayers;

  const layers: LayerSnapshot[] = [];
  for (let i = 0; i < boundedLayers.length; i++) {
    const layer = parseLayerSnapshot(boundedLayers[i], i + 1);
    if (layer) {
      layers.push(layer);
    }
  }

  return {
    id,
    name,
    width,
    height,
    duration,
    frameRate,
    layers,
    isTruncated: isTruncated ? true : undefined,
  };
}

/**
 * Validates untrusted payload and converts to canonical `AdobeProjectSnapshot`.
 */
export function validateRawAdobePayload(
  raw: unknown,
  options?: ValidationOptions
): AdobeProjectSnapshot {
  const observedAt = options?.observedAt ?? Date.now();
  const maxComps = options?.maxCompositions ?? DEFAULT_MAX_COMPOSITIONS;
  const maxLayers = options?.maxLayersPerComposition ?? DEFAULT_MAX_LAYERS_PER_COMP;

  // 1. Handle non-object or invalid payload
  if (!raw || typeof raw !== 'object') {
    return {
      status: 'UNKNOWN',
      compositions: [],
      source: 'APPLICATION_ADAPTER',
      observedAt,
    };
  }

  const payload = raw as Record<string, unknown>;

  // Unwrap potential nested structure { success: true, output: ... }
  const root = (payload.output && typeof payload.output === 'object' ? payload.output : payload) as Record<string, unknown>;

  // 2. Check for explicit project closed indicators
  if (root.projectOpen === false || root.isProjectOpen === false || root.project === null) {
    return {
      status: 'PROJECT_CLOSED',
      compositions: [],
      source: 'APPLICATION_ADAPTER',
      observedAt,
    };
  }

  // 3. Extract project metadata
  const projectName = typeof root.projectName === 'string' ? root.projectName : typeof root.name === 'string' ? root.name : undefined;
  const projectPath = typeof root.projectPath === 'string' ? root.projectPath : typeof root.path === 'string' ? root.path : undefined;
  const dirty = typeof root.dirty === 'boolean' ? root.dirty : typeof root.isDirty === 'boolean' ? root.isDirty : undefined;

  // 4. Extract compositions
  let rawComps: unknown[] = [];
  if (Array.isArray(root.compositions)) {
    rawComps = root.compositions;
  } else if (Array.isArray(root.comps)) {
    rawComps = root.comps;
  } else if (root.activeComp && typeof root.activeComp === 'object') {
    rawComps = [root.activeComp];
  } else if (Array.isArray(raw)) {
    rawComps = raw;
  }

  const isProjectTruncated = rawComps.length > maxComps;
  const boundedComps = isProjectTruncated ? rawComps.slice(0, maxComps) : rawComps;

  const compositions: CompositionSnapshot[] = [];
  for (let i = 0; i < boundedComps.length; i++) {
    const comp = parseCompositionSnapshot(boundedComps[i], i + 1, maxLayers);
    if (comp) {
      compositions.push(comp);
    }
  }

  // 5. Determine active composition ID
  let activeCompositionId: string | undefined = undefined;
  if (typeof root.activeCompositionId === 'string' || typeof root.activeCompositionId === 'number') {
    activeCompositionId = String(root.activeCompositionId);
  } else if (typeof root.activeCompId === 'string' || typeof root.activeCompId === 'number') {
    activeCompositionId = String(root.activeCompId);
  } else if (root.activeComp && typeof root.activeComp === 'object') {
    const activeCompObj = root.activeComp as Record<string, unknown>;
    const rawId = activeCompObj.id ?? activeCompObj.compId ?? activeCompObj.name;
    if (rawId !== undefined && rawId !== null) {
      activeCompositionId = String(rawId);
    }
  }

  // 6. Resolve Project Status
  let status: AdobeProjectStatus;

  // If status is explicitly provided and matches valid status
  if (
    typeof root.status === 'string' &&
    ['PROJECT_CLOSED', 'PROJECT_OPEN', 'NO_ACTIVE_COMPOSITION', 'ACTIVE_COMPOSITION', 'ADAPTER_DISCONNECTED', 'UNKNOWN'].includes(root.status)
  ) {
    status = root.status as AdobeProjectStatus;
  } else {
    // Determine status from project & composition presence
    if (root.projectOpen === true || projectName !== undefined || projectPath !== undefined || compositions.length > 0) {
      if (activeCompositionId) {
        status = 'ACTIVE_COMPOSITION';
      } else if (compositions.length > 0) {
        status = 'NO_ACTIVE_COMPOSITION';
      } else {
        status = 'PROJECT_OPEN';
      }
    } else {
      status = 'UNKNOWN';
    }
  }

  return {
    status,
    projectName,
    projectPath,
    dirty,
    compositions,
    activeCompositionId,
    isTruncated: isProjectTruncated ? true : undefined,
    source: 'APPLICATION_ADAPTER',
    observedAt,
  };
}
