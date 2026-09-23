import { invoke } from '@tauri-apps/api/core';
import type { StatResult, ListEntry, SearchOptions } from './types';

export const FileOperations = {
  async stat(path: string): Promise<StatResult> {
    return await invoke<StatResult>('fs_stat', { path });
  },

  async list(path: string): Promise<ListEntry[]> {
    return await invoke<ListEntry[]>('fs_list', { path });
  },

  async readText(path: string): Promise<string> {
    return await invoke<string>('fs_read_text', { path });
  },

  async createFolder(path: string): Promise<void> {
    await invoke<void>('fs_create_folder', { path });
  },

  async createFile(path: string): Promise<void> {
    await invoke<void>('fs_create_file', { path });
  },

  async copy(source: string, destination: string): Promise<void> {
    await invoke<void>('fs_copy', { source, destination });
  },

  async move(source: string, destination: string): Promise<void> {
    await invoke<void>('fs_move', { source, destination });
  },

  async deleteFile(path: string): Promise<void> {
    await invoke<void>('fs_delete', { path });
  },

  async search(path: string, pattern: string, options?: SearchOptions): Promise<ListEntry[]> {
    return await invoke<ListEntry[]>('fs_search', {
      path,
      pattern,
      maxResults: options?.maxResults,
      maxDepth: options?.maxDepth,
    });
  }
};
