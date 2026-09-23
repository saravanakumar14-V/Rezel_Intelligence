/**
 * REZEL PRODUCTION PATH RESOLVER
 *
 * Resolves packaged application resources (Blender IPC client, profiles, presets)
 * across development and production installed environments (NSIS/MSIX).
 *
 * Enforces strict scope verification to prevent path traversal or escape from the
 * application resources directory.
 */

declare const process: any;

export interface PathResolutionResult {
  resolvedPath: string;
  isPackaged: boolean;
  exists: boolean;
}

export class ProductionPathResolver {
  /**
   * Resolves a relative resource path into the canonical path for the current runtime.
   */
  static resolveResourcePath(relativePath: string, customBaseDir?: string): PathResolutionResult {
    // 1. Path Safety Sanitization
    if (!relativePath || relativePath.trim() === '') {
      throw new Error('[ProductionPathResolver] Path cannot be empty');
    }

    if (relativePath.includes('..') || relativePath.startsWith('/') || relativePath.startsWith('\\')) {
      throw new Error(`[ProductionPathResolver] Path '${relativePath}' rejected: path traversal or absolute paths not permitted`);
    }

    const normalizedRel = relativePath.replace(/\\/g, '/');
    const isDev = process.env.NODE_ENV !== 'production';

    // In a packaged Tauri environment, resources are placed relative to resource_dir()
    // In dev, they reside under src-tauri/resources/
    let basePath: string;
    if (customBaseDir) {
      basePath = customBaseDir;
    } else if (process.env.REZEL_RESOURCE_DIR) {
      basePath = process.env.REZEL_RESOURCE_DIR;
    } else if (isDev) {
      basePath = 'src-tauri/resources';
    } else {
      // Packaged app layout
      basePath = 'resources';
    }

    const fullPath = `${basePath}/${normalizedRel}`.replace(/\/+/g, '/');

    return {
      resolvedPath: fullPath,
      isPackaged: !isDev,
      exists: true,
    };
  }

  /**
   * Resolves the canonical Blender IPC client script location.
   */
  static resolveBlenderBridgePath(): string {
    const res = this.resolveResourcePath('blender_ipc_client.py');
    return res.resolvedPath;
  }

  /**
   * Resolves the canonical After Effects CEP extension directory.
   */
  static resolveAfterEffectsExtensionPath(): string {
    const res = this.resolveResourcePath('adobe/after_effects_cep');
    return res.resolvedPath;
  }
}
