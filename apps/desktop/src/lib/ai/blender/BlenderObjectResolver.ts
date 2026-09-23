/**
 * Rezel 13.4 — Blender Object Resolver
 *
 * Resolves target Blender objects from snapshots based on semantic identity rules:
 * 1. Explicit stable object ID match
 * 2. Scene ID + exact object name match
 * 3. Exact name when globally unique
 * 4. Object type + exact name (if uniquely disambiguated)
 * 5. Fails with AMBIGUOUS_TARGET or TARGET_NOT_FOUND (NEVER silently picks first duplicate).
 */

import type {
  BlenderObjectQuery,
  BlenderResolutionResult,
  BlenderSceneSnapshot,
} from './types';

export class BlenderObjectResolver {
  /**
   * Resolves a single target object from a BlenderSceneSnapshot.
   */
  static resolveObject(
    snapshot: BlenderSceneSnapshot,
    query: BlenderObjectQuery
  ): BlenderResolutionResult {
    const objects = snapshot.objects;

    if (objects.length === 0) {
      return {
        success: false,
        failureCode: 'TARGET_NOT_FOUND',
        reason: 'Blender scene contains no objects',
      };
    }

    // 1. Explicit stable object ID match
    if (query.id) {
      const idMatch = objects.filter((o) => o.id === query.id);
      if (idMatch.length === 1) {
        return {
          success: true,
          object: idMatch[0],
          matchType: 'ID',
        };
      }
      if (idMatch.length > 1) {
        return {
          success: false,
          failureCode: 'AMBIGUOUS_TARGET',
          reason: `Multiple objects found with ID '${query.id}'`,
          candidateObjects: idMatch,
        };
      }
      // If query had explicit ID and it was not found, don't fall through silently unless other criteria specified
      if (!query.name && !query.objectType) {
        return {
          success: false,
          failureCode: 'TARGET_NOT_FOUND',
          reason: `No object found with ID '${query.id}'`,
        };
      }
    }

    // 2. Scene ID + exact object name match
    if (query.sceneId && query.name) {
      const sceneMatches = objects.filter(
        (o) => o.name === query.name && (o.sceneId === query.sceneId || snapshot.activeSceneId === query.sceneId)
      );
      if (sceneMatches.length === 1) {
        return {
          success: true,
          object: sceneMatches[0],
          matchType: 'SCENE_EXACT_NAME',
        };
      }
      if (sceneMatches.length > 1) {
        return {
          success: false,
          failureCode: 'AMBIGUOUS_TARGET',
          reason: `Multiple objects named '${query.name}' found in scene '${query.sceneId}'`,
          candidateObjects: sceneMatches,
        };
      }
    }

    // 3. Exact name match (when unique across scene)
    if (query.name) {
      const nameMatches = objects.filter((o) => o.name === query.name);
      if (nameMatches.length === 1) {
        return {
          success: true,
          object: nameMatches[0],
          matchType: 'EXACT_NAME_UNIQUE',
        };
      }

      if (nameMatches.length > 1) {
        // 4. Type + exact name disambiguation
        if (query.objectType) {
          const typeAndNameMatches = nameMatches.filter((o) => o.objectType === query.objectType);
          if (typeAndNameMatches.length === 1) {
            return {
              success: true,
              object: typeAndNameMatches[0],
              matchType: 'TYPE_EXACT_NAME',
            };
          }
          if (typeAndNameMatches.length > 1) {
            return {
              success: false,
              failureCode: 'AMBIGUOUS_TARGET',
              reason: `Ambiguous target: Multiple '${query.objectType}' objects with exact name '${query.name}' exist in the scene`,
              candidateObjects: typeAndNameMatches,
            };
          }
        }

        // Multiple name matches and cannot disambiguate
        return {
          success: false,
          failureCode: 'AMBIGUOUS_TARGET',
          reason: `Ambiguous target: Multiple (${nameMatches.length}) objects with exact name '${query.name}' exist in the scene`,
          candidateObjects: nameMatches,
        };
      }

      return {
        success: false,
        failureCode: 'TARGET_NOT_FOUND',
        reason: `No object named '${query.name}' found in Blender scene`,
      };
    }

    // Query by type only
    if (query.objectType) {
      const typeMatches = objects.filter((o) => o.objectType === query.objectType);
      if (typeMatches.length === 1) {
        return {
          success: true,
          object: typeMatches[0],
          matchType: 'TYPE_EXACT_NAME',
        };
      }
      if (typeMatches.length > 1) {
        return {
          success: false,
          failureCode: 'AMBIGUOUS_TARGET',
          reason: `Ambiguous target: Multiple (${typeMatches.length}) objects of type '${query.objectType}' exist in the scene`,
          candidateObjects: typeMatches,
        };
      }
      return {
        success: false,
        failureCode: 'TARGET_NOT_FOUND',
        reason: `No object of type '${query.objectType}' found in Blender scene`,
      };
    }

    return {
      success: false,
      failureCode: 'TARGET_NOT_FOUND',
      reason: 'Empty query criteria provided for Blender object resolution',
    };
  }
}
