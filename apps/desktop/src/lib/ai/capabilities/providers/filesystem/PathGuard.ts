import { invoke } from '@tauri-apps/api/core';

export interface FilesystemScope {
  allowed_roots: string[];
  read_allowed: boolean;
  write_allowed: boolean;
  delete_allowed: boolean;
}

export class PathGuard {
  private static activeProjectRoot: string | null = null;

  static async setProjectRoot(rootPath?: string): Promise<void> {
    this.activeProjectRoot = rootPath ? rootPath.replace(/\\/g, '/') : null;
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        await invoke('fs_set_project_root', { rootPath: rootPath ?? null });
      }
    } catch (err) {
      console.warn('[PathGuard] Failed to update project root in Rust:', err);
    }
  }

  static async getRustScope(): Promise<FilesystemScope> {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        return await invoke<FilesystemScope>('fs_get_scope');
      }
    } catch {
      // In non-Tauri / test environments
    }

    const testRoots = [
      'C:/Users/test/AppData/Roaming/com.tauri.dev',
      '/tmp/rezel_tests',
      'C:/tmp/rezel_tests',
      'C:/rezel_tests',
    ];

    if (this.activeProjectRoot) {
      testRoots.push(this.activeProjectRoot);
    }

    return {
      allowed_roots: testRoots,
      read_allowed: true,
      write_allowed: true,
      delete_allowed: true,
    };
  }

  static async validate(
    rawPath: string,
    requiredAccess: 'READ' | 'WRITE' | 'DELETE'
  ): Promise<void> {
    if (!rawPath) {
      throw new Error('[Rezel Security] Path cannot be empty.');
    }

    if (rawPath.includes('..')) {
      throw new Error(`[Rezel Security] Access denied: Path traversal (..) is not allowed in '${rawPath}'`);
    }

    const scope = await this.getRustScope();

    if (requiredAccess === 'READ' && !scope.read_allowed) {
      throw new Error('[Rezel Security] Read access denied by policy.');
    }
    if (requiredAccess === 'WRITE' && !scope.write_allowed) {
      throw new Error('[Rezel Security] Write access denied by policy.');
    }
    if (requiredAccess === 'DELETE' && !scope.delete_allowed) {
      throw new Error('[Rezel Security] Delete access denied by policy.');
    }

    // Check if the path is explicitly allowed by any of the roots
    let isAllowed = false;
    const normalizedRaw = rawPath.replace(/\\/g, '/').toLowerCase();

    for (const root of scope.allowed_roots) {
      let normalizedRoot = root.replace(/\\/g, '/').toLowerCase();
      if (!normalizedRoot.endsWith('/')) {
        normalizedRoot += '/';
      }
      if (
        normalizedRaw === normalizedRoot.slice(0, -1) ||
        normalizedRaw.startsWith(normalizedRoot)
      ) {
        isAllowed = true;
        break;
      }
    }

    if (!isAllowed) {
      throw new Error(`[Rezel Security] Access denied: Target '${rawPath}' escapes authorized filesystem scope.`);
    }
  }
}
