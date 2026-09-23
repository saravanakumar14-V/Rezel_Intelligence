export interface StatResult {
  isFile: boolean;
  isDir: boolean;
  size: number;
  modified: number;
}

export interface ListEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface SearchOptions {
  maxResults?: number;
  maxDepth?: number;
}
