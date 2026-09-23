import { FileOperations } from '../../ai/capabilities/providers/filesystem/FileOperations';

export interface ResourceInfo {
  exists: boolean;
  isDir: boolean;
  isFile: boolean;
  size: number;
  itemCount: number;
}

export class TrustedResourceInspector {
  /**
   * Safely inspects a filesystem path to gather trusted metrics.
   * Relies on the trusted Rust backend (via FileOperations) to enforce
   * path guards and scope containment.
   */
  static async inspectFilesystem(path: string): Promise<ResourceInfo> {
    try {
      const stat = await FileOperations.stat(path);
      
      let itemCount = 1;
      let totalSize = stat.size;

      if (stat.isDir) {
        // Recursive count to estimate affected items
        const { count, size } = await this.scanDirectory(path);
        itemCount = count;
        totalSize = size;
      }

      return {
        exists: true,
        isDir: stat.isDir,
        isFile: stat.isFile,
        size: totalSize,
        itemCount
      };
    } catch (err) {
      // If stat fails (doesn't exist, permission denied, or outside scope)
      return {
        exists: false,
        isDir: false,
        isFile: false,
        size: 0,
        itemCount: 0
      };
    }
  }

  private static async scanDirectory(path: string): Promise<{ count: number; size: number }> {
    let count = 0;
    let size = 0;
    
    // We do a shallow scan or up to a limit to prevent unbounded execution in policy checks.
    // For a real production system we might have a dedicated Rust command `fs_dir_size`
    // but for 9.7 we can approximate using `fs.search` or `fs.list` recursively.
    try {
      // Since fs.search has maxDepth, we can use it to get items safely
      const items = await FileOperations.search(path, '', { maxDepth: 5, maxResults: 10000 });
      count = items.length;
      
      // We could stat each to get exact size, but that's 10,000 IPC calls. 
      // For now, if it's a directory, we count the items. Size is harder without a dedicated rust command.
      // We will leave size as 0 for directories unless we stat them. 
      // Actually, since we want to avoid 10k IPC calls, let's just use the item count.
    } catch {
      // Ignore
    }

    return { count, size };
  }
}
