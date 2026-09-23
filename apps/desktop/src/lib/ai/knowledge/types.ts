export type KnowledgeSourceType = 'FILE' | 'DOCUMENT' | 'PDF' | 'CODE' | 'NOTE' | 'WORKSPACE';

export type IngestionLifecycleState =
  | 'DISCOVERED'
  | 'PARSING'
  | 'CHUNKING'
  | 'INDEXING'
  | 'INDEXED'
  | 'FAILED'
  | 'DELETED';

export interface KnowledgeChunk {
  readonly id: string;
  readonly documentId: string;
  readonly content: string;
  readonly chunkIndex: number;
  readonly tokens: number;
  readonly sectionTitle?: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

export interface KnowledgeDocument {
  readonly id: string;
  readonly title: string;
  readonly sourceType: KnowledgeSourceType;
  readonly sourcePath: string;
  readonly sizeBytes: number;
  readonly chunkCount: number;
  readonly state: IngestionLifecycleState;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly projectId?: string;
  readonly tags?: string[];
  readonly checksum?: string;
  readonly error?: string;
}

export interface KnowledgeSearchResult {
  readonly chunk: KnowledgeChunk;
  readonly document: KnowledgeDocument;
  readonly relevanceScore: number;
  readonly excerpt: string;
}
