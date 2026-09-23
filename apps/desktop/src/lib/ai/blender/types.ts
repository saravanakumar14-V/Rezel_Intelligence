/**
 * Rezel 13.4 — Blender Scene Intelligence Types
 *
 * Strongly-typed models for Blender 3D scene topology, collections, objects,
 * transforms, and inspection state.
 *
 * STRICT INVARIANTS:
 * - Only trustworthy fields from native Blender IPC are exposed.
 * - Unknown object types fall back to 'UNKNOWN'.
 * - Provenance is always 'APPLICATION_ADAPTER'.
 */

// ─── 1. Object Types ─────────────────────────────────────────────────────────

export type BlenderObjectType =
  | 'MESH'
  | 'CURVE'
  | 'SURFACE'
  | 'META'
  | 'FONT'
  | 'ARMATURE'
  | 'LATTICE'
  | 'EMPTY'
  | 'CAMERA'
  | 'LIGHT'
  | 'GREASE_PENCIL'
  | 'UNKNOWN';

// ─── 2. Transforms ───────────────────────────────────────────────────────────

export interface BlenderTransform {
  readonly location: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number]; // Euler angles in radians
  readonly rotationOrder?: string; // e.g. 'XYZ'
  readonly scale?: readonly [number, number, number];
}

// ─── 3. Collection Snapshot ──────────────────────────────────────────────────

export interface BlenderCollectionSnapshot {
  readonly id: string;
  readonly name: string;
  readonly parentCollectionId?: string;
  readonly objectIds: readonly string[];
  readonly visible?: boolean;
}

// ─── 4. Object Snapshot ──────────────────────────────────────────────────────

export interface BlenderObjectSnapshot {
  readonly id: string;
  readonly name: string;
  readonly objectType: BlenderObjectType;
  readonly sceneId?: string;
  readonly collectionIds: readonly string[];
  readonly transform: BlenderTransform;
  readonly visible?: boolean;
  readonly selected?: boolean;
  readonly active?: boolean;
  readonly parentId?: string;
}

// ─── 5. Scene Snapshot ───────────────────────────────────────────────────────

export type BlenderSceneStatus =
  | 'ACTIVE_SCENE'
  | 'NO_ACTIVE_SCENE'
  | 'PROJECT_OPEN'
  | 'ADAPTER_DISCONNECTED'
  | 'UNKNOWN';

export interface BlenderSceneSnapshot {
  readonly source: 'APPLICATION_ADAPTER';
  readonly observedAt: number;
  readonly status: BlenderSceneStatus;

  readonly filePath?: string;
  readonly fileName?: string;
  readonly dirty?: boolean;

  readonly activeSceneId?: string;
  readonly activeSceneName?: string;

  readonly collections: readonly BlenderCollectionSnapshot[];
  readonly objects: readonly BlenderObjectSnapshot[];

  readonly activeObjectId?: string;
  readonly isTruncated?: boolean;
  readonly totalObjectCount?: number;
  readonly totalCollectionCount?: number;
}

// ─── 6. Inspection Options ───────────────────────────────────────────────────

export interface BlenderInspectionOptions {
  readonly sessionId?: string;
  readonly forceRefresh?: boolean;
  readonly maxObjects?: number;
  readonly maxCollections?: number;
  readonly workflowId?: string;
  readonly executionId?: string;
}

// ─── 7. Object Resolution ────────────────────────────────────────────────────

export interface BlenderObjectQuery {
  readonly id?: string;
  readonly name?: string;
  readonly objectType?: BlenderObjectType;
  readonly sceneId?: string;
  readonly collectionId?: string;
}

export type BlenderResolutionResult =
  | {
      readonly success: true;
      readonly object: BlenderObjectSnapshot;
      readonly matchType: 'ID' | 'EXACT_NAME_UNIQUE' | 'SCENE_EXACT_NAME' | 'TYPE_EXACT_NAME';
    }
  | {
      readonly success: false;
      readonly failureCode: 'TARGET_NOT_FOUND' | 'AMBIGUOUS_TARGET';
      readonly reason: string;
      readonly candidateObjects?: readonly BlenderObjectSnapshot[];
    };

// ─── 8. Mutation Parameter Types ─────────────────────────────────────────────

export interface BlenderCreateObjectParams {
  readonly name: string;
  readonly type?: 'CUBE' | 'SPHERE' | 'PLANE' | 'CYLINDER';
  readonly location?: readonly [number, number, number];
}

export interface BlenderCreateCameraParams {
  readonly name: string;
  readonly location?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
}

export interface BlenderTransformObjectParams {
  readonly objectId: string;
  readonly location?: readonly [number, number, number];
  readonly rotation?: readonly [number, number, number];
  readonly rotationMode?: string;
  readonly scale?: readonly [number, number, number];
}

export interface BlenderRenameObjectParams {
  readonly objectId: string;
  readonly newName: string;
}

export interface BlenderDeleteObjectParams {
  readonly objectId: string;
}

export interface BlenderCreateEmptyParams {
  readonly name: string;
  readonly emptyType?: string;
  readonly location?: readonly [number, number, number];
}

export interface BlenderCreateLightParams {
  readonly name: string;
  readonly type?: 'POINT' | 'SUN' | 'SPOT' | 'AREA';
  readonly location?: readonly [number, number, number];
  readonly energy?: number;
  readonly color?: readonly [number, number, number];
}

export interface BlenderSaveProjectParams {}

export interface BlenderSaveAsProjectParams {
  readonly filepath: string;
}

export interface BlenderCreateSceneParams {
  readonly name: string;
  readonly setActive?: boolean;
}

export interface BlenderSwitchSceneParams {
  readonly sceneName: string;
}

export interface BlenderCreateCollectionParams {
  readonly name: string;
  readonly parentCollection?: string;
}

export interface BlenderMoveToCollectionParams {
  readonly objectId: string;
  readonly targetCollection: string;
  readonly unlinkFromOthers?: boolean;
}

export interface BlenderDuplicateObjectParams {
  readonly objectId: string;
  readonly newName?: string;
}

export interface BlenderSetVisibilityParams {
  readonly objectId: string;
  readonly viewport?: boolean;
  readonly render?: boolean;
}

export interface BlenderSetActiveParams {
  readonly objectId: string;
  readonly selected?: boolean;
}

export interface BlenderParentObjectParams {
  readonly objectId: string;
  readonly parentId: string;
  readonly keepTransform?: boolean;
}

export interface BlenderUnparentObjectParams {
  readonly objectId: string;
  readonly keepTransform?: boolean;
}

export interface BlenderCreateMaterialParams {
  readonly name: string;
  readonly color?: readonly [number, number, number, number] | readonly [number, number, number];
}

export interface BlenderAssignMaterialParams {
  readonly objectId: string;
  readonly materialName: string;
}

export interface BlenderSetMaterialColorParams {
  readonly materialName: string;
  readonly color: readonly [number, number, number, number] | readonly [number, number, number];
}

export interface BlenderInsertKeyframeParams {
  readonly objectId: string;
  readonly property: 'location' | 'rotation_euler' | 'scale';
  readonly frame: number;
  readonly value?: readonly [number, number, number];
}

export interface BlenderRenderImageParams {
  readonly outputPath: string;
  readonly format?: string;
  readonly frame?: number;
}

export interface BlenderExportAssetParams {
  readonly outputPath: string;
  readonly format: 'GLTF' | 'FBX' | 'OBJ' | 'STL';
}

