/**
 * Rezel 13.4 — Blender Payload Validator & Sanitizer
 *
 * Validates untrusted raw JSON payloads from the Blender WebSocket IPC bridge.
 * Enforces bounded traversal, strict numeric sanitization, type-safe enum mapping,
 * and provenance tracking.
 */

import type {
  BlenderCollectionSnapshot,
  BlenderObjectSnapshot,
  BlenderObjectType,
  BlenderSceneSnapshot,
  BlenderSceneStatus,
  BlenderTransform,
} from './types';

export interface PayloadValidationOptions {
  readonly maxObjects?: number;
  readonly maxCollections?: number;
  readonly observedAt?: number;
}

const DEFAULT_MAX_OBJECTS = 500;
const DEFAULT_MAX_COLLECTIONS = 100;

/**
 * Maps raw Blender type string to canonical BlenderObjectType enum.
 */
export function mapBlenderObjectType(rawType: unknown): BlenderObjectType {
  if (typeof rawType !== 'string') {
    return 'UNKNOWN';
  }

  const normalized = rawType.trim().toUpperCase();
  switch (normalized) {
    case 'MESH':
      return 'MESH';
    case 'CURVE':
      return 'CURVE';
    case 'SURFACE':
      return 'SURFACE';
    case 'META':
    case 'MBALL':
      return 'META';
    case 'FONT':
    case 'TEXT':
      return 'FONT';
    case 'ARMATURE':
      return 'ARMATURE';
    case 'LATTICE':
      return 'LATTICE';
    case 'EMPTY':
      return 'EMPTY';
    case 'CAMERA':
      return 'CAMERA';
    case 'LIGHT':
    case 'LAMP':
      return 'LIGHT';
    case 'GREASEPENCIL':
    case 'GREASE_PENCIL':
    case 'GPENCIL':
      return 'GREASE_PENCIL';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Validates and sanitizes a 3D coordinate vector [x, y, z].
 * Returns [x, y, z] with finite numbers, or default if malformed.
 */
export function sanitizeVector3(
  raw: unknown,
  fallback: readonly [number, number, number] = [0, 0, 0]
): readonly [number, number, number] {
  if (!Array.isArray(raw) || raw.length < 3) {
    return fallback;
  }

  const x = Number(raw[0]);
  const y = Number(raw[1]);
  const z = Number(raw[2]);

  const safeX = Number.isFinite(x) ? x : fallback[0];
  const safeY = Number.isFinite(y) ? y : fallback[1];
  const safeZ = Number.isFinite(z) ? z : fallback[2];

  return [safeX, safeY, safeZ];
}

/**
 * Validates and sanitizes a transform object.
 */
export function sanitizeTransform(raw: unknown): BlenderTransform {
  if (!raw || typeof raw !== 'object') {
    return { location: [0, 0, 0] };
  }

  const rawObj = raw as Record<string, unknown>;
  const location = sanitizeVector3(rawObj.location, [0, 0, 0]);

  let rotation: readonly [number, number, number] | undefined = undefined;
  if (rawObj.rotation_euler !== undefined || rawObj.rotation !== undefined) {
    rotation = sanitizeVector3(rawObj.rotation_euler ?? rawObj.rotation, [0, 0, 0]);
  }

  let rotationOrder: string | undefined = undefined;
  if (typeof rawObj.rotation_order === 'string' && rawObj.rotation_order.length >= 3) {
    rotationOrder = rawObj.rotation_order.toUpperCase();
  }

  let scale: readonly [number, number, number] | undefined = undefined;
  if (rawObj.scale !== undefined) {
    scale = sanitizeVector3(rawObj.scale, [1, 1, 1]);
  }

  return {
    location,
    ...(rotation ? { rotation } : {}),
    ...(rotationOrder ? { rotationOrder } : {}),
    ...(scale ? { scale } : {}),
  };
}

/**
 * Validates raw Blender IPC payload into canonical BlenderSceneSnapshot.
 */
export function validateRawBlenderPayload(
  raw: unknown,
  options?: PayloadValidationOptions
): BlenderSceneSnapshot {
  const observedAt = options?.observedAt || Date.now();
  const maxObjects = options?.maxObjects ?? DEFAULT_MAX_OBJECTS;
  const maxCollections = options?.maxCollections ?? DEFAULT_MAX_COLLECTIONS;

  if (!raw || typeof raw !== 'object') {
    return {
      source: 'APPLICATION_ADAPTER',
      observedAt,
      status: 'UNKNOWN',
      collections: [],
      objects: [],
      isTruncated: false,
    };
  }

  const payload = raw as Record<string, unknown>;

  // Check if error status
  if (payload.success === false) {
    const errorMsg = String(payload.error || '');
    const isDisconnected =
      errorMsg.includes('DISCONNECTED') ||
      errorMsg.includes('blender_ipc_timeout') ||
      errorMsg.includes('Connection closed');

    return {
      source: 'APPLICATION_ADAPTER',
      observedAt,
      status: isDisconnected ? 'ADAPTER_DISCONNECTED' : 'UNKNOWN',
      collections: [],
      objects: [],
      isTruncated: false,
    };
  }

  // Determine scene status
  const sceneName = typeof payload.scene_name === 'string'
    ? payload.scene_name
    : typeof payload.active_scene_name === 'string'
      ? payload.active_scene_name
      : undefined;

  let status: BlenderSceneStatus = 'ACTIVE_SCENE';
  if (!sceneName || sceneName === 'Unknown' || sceneName === '') {
    status = 'NO_ACTIVE_SCENE';
  }

  // Parse Collections
  const rawCollections = Array.isArray(payload.collections) ? payload.collections : [];
  const totalCollectionCount = rawCollections.length;
  let isCollectionsTruncated = false;

  const collectionsToProcess = rawCollections.slice(0, maxCollections);
  if (rawCollections.length > maxCollections) {
    isCollectionsTruncated = true;
  }

  const collections: BlenderCollectionSnapshot[] = collectionsToProcess.map((c, idx) => {
    if (!c || typeof c !== 'object') {
      return {
        id: `collection_${idx}`,
        name: `Collection_${idx}`,
        objectIds: [],
      };
    }
    const cObj = c as Record<string, unknown>;
    const name = typeof cObj.name === 'string' && cObj.name.trim().length > 0
      ? cObj.name.trim()
      : `Collection_${idx}`;
    const id = typeof cObj.id === 'string' && cObj.id.length > 0
      ? cObj.id
      : name;

    const rawObjIds = Array.isArray(cObj.object_ids)
      ? cObj.object_ids
      : Array.isArray(cObj.object_names)
        ? cObj.object_names
        : [];

    const objectIds: string[] = rawObjIds
      .filter((oid): oid is string => typeof oid === 'string' && oid.length > 0);

    const parentCollectionId = typeof cObj.parent === 'string' && cObj.parent.length > 0
      ? cObj.parent
      : typeof cObj.parentCollectionId === 'string' && cObj.parentCollectionId.length > 0
        ? cObj.parentCollectionId
        : undefined;

    const visible = typeof cObj.visible === 'boolean' ? cObj.visible : undefined;

    return {
      id,
      name,
      ...(parentCollectionId ? { parentCollectionId } : {}),
      objectIds,
      ...(visible !== undefined ? { visible } : {}),
    };
  });

  // Parse Objects
  const rawObjects = Array.isArray(payload.objects)
    ? payload.objects
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];

  const totalObjectCount = rawObjects.length;
  let isObjectsTruncated = false;

  const objectsToProcess = rawObjects.slice(0, maxObjects);
  if (rawObjects.length > maxObjects) {
    isObjectsTruncated = true;
  }

  const objects: BlenderObjectSnapshot[] = objectsToProcess.map((o, idx) => {
    if (!o || typeof o !== 'object') {
      return {
        id: `object_${idx}`,
        name: `Object_${idx}`,
        objectType: 'UNKNOWN',
        collectionIds: [],
        transform: { location: [0, 0, 0] },
      };
    }

    const oObj = o as Record<string, unknown>;
    const name = typeof oObj.name === 'string' && oObj.name.trim().length > 0
      ? oObj.name.trim()
      : `Object_${idx}`;
    const id = typeof oObj.id === 'string' && oObj.id.length > 0
      ? oObj.id
      : name;

    const objectType = mapBlenderObjectType(oObj.type ?? oObj.objectType);

    const rawColIds = Array.isArray(oObj.collection_names)
      ? oObj.collection_names
      : Array.isArray(oObj.collectionIds)
        ? oObj.collectionIds
        : [];

    const collectionIds: string[] = rawColIds
      .filter((cid): cid is string => typeof cid === 'string' && cid.length > 0);

    // Transform parsing
    let transform: BlenderTransform;
    if (oObj.transform && typeof oObj.transform === 'object') {
      transform = sanitizeTransform(oObj.transform);
    } else {
      transform = sanitizeTransform({
        location: oObj.location,
        rotation_euler: oObj.rotation_euler ?? oObj.rotation,
        rotation_order: oObj.rotation_order,
        scale: oObj.scale,
      });
    }

    const visible = typeof oObj.visible === 'boolean' ? oObj.visible : undefined;
    const selected = typeof oObj.selected === 'boolean' ? oObj.selected : typeof oObj.select === 'boolean' ? oObj.select : undefined;
    const active = typeof oObj.active === 'boolean' ? oObj.active : undefined;
    const parentId = typeof oObj.parent === 'string' && oObj.parent.length > 0
      ? oObj.parent
      : typeof oObj.parentId === 'string' && oObj.parentId.length > 0
        ? oObj.parentId
        : undefined;

    return {
      id,
      name,
      objectType,
      ...(sceneName ? { sceneId: sceneName } : {}),
      collectionIds,
      transform,
      ...(visible !== undefined ? { visible } : {}),
      ...(selected !== undefined ? { selected } : {}),
      ...(active !== undefined ? { active } : {}),
      ...(parentId ? { parentId } : {}),
    };
  });

  const filePath = typeof payload.file_path === 'string' && payload.file_path.length > 0
    ? payload.file_path
    : typeof payload.filePath === 'string' && payload.filePath.length > 0
      ? payload.filePath
      : undefined;

  const fileName = typeof payload.file_name === 'string' && payload.file_name.length > 0
    ? payload.file_name
    : typeof payload.fileName === 'string' && payload.fileName.length > 0
      ? payload.fileName
      : undefined;

  const dirty = typeof payload.is_dirty === 'boolean'
    ? payload.is_dirty
    : typeof payload.dirty === 'boolean'
      ? payload.dirty
      : undefined;

  const activeObjectId = typeof payload.active_object_name === 'string' && payload.active_object_name.length > 0
    ? payload.active_object_name
    : typeof payload.activeObjectId === 'string' && payload.activeObjectId.length > 0
      ? payload.activeObjectId
      : undefined;

  const isTruncated = isCollectionsTruncated || isObjectsTruncated || Boolean(payload.is_truncated);

  return {
    source: 'APPLICATION_ADAPTER',
    observedAt,
    status,
    ...(filePath ? { filePath } : {}),
    ...(fileName ? { fileName } : {}),
    ...(dirty !== undefined ? { dirty } : {}),
    ...(sceneName ? { activeSceneId: sceneName, activeSceneName: sceneName } : {}),
    collections,
    objects,
    ...(activeObjectId ? { activeObjectId } : {}),
    isTruncated,
    totalObjectCount,
    totalCollectionCount,
  };
}
