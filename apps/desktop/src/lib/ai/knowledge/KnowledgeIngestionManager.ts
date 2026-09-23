import type { KnowledgeDocument, KnowledgeChunk, KnowledgeSearchResult, KnowledgeSourceType } from './types';

export type IngestionListener = (documents: KnowledgeDocument[]) => void;

export class KnowledgeIngestionManagerImpl {
  private documents = new Map<string, KnowledgeDocument>();
  private chunks = new Map<string, KnowledgeChunk>();
  private listeners = new Set<IngestionListener>();

  constructor() {
    this.initDefaultSources();
  }

  private initDefaultSources(): void {
    // Seed default knowledge base for local project & tools
    this.ingestDocument({
      title: 'Blender Python Automation Reference',
      sourceType: 'DOCUMENT',
      sourcePath: 'docs/blender_api.md',
      content: `# Blender Python Automation Reference\n\nRezel OS controls Blender via the bpy module using localhost IPC WebSocket bridge.\nAvailable operations include: scene query, mesh generation, shader node creation, and render automation.`,
      projectId: 'proj-creator-default',
    }).catch(console.error);
  }

  subscribe(listener: IngestionListener): () => void {
    this.listeners.add(listener);
    listener(this.listDocuments());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const list = this.listDocuments();
    for (const listener of this.listeners) {
      try {
        listener(list);
      } catch (err) {
        console.error('[KnowledgeIngestionManager] Listener error:', err);
      }
    }
  }

  listDocuments(): KnowledgeDocument[] {
    return Array.from(this.documents.values()).filter((d) => d.state !== 'DELETED');
  }

  getDocument(id: string): KnowledgeDocument | undefined {
    return this.documents.get(id);
  }

  /**
   * Ingests a new document through the complete pipeline: DISCOVER -> PARSE -> CHUNK -> INDEX -> INDEXED
   */
  async ingestDocument(params: {
    title: string;
    sourceType: KnowledgeSourceType;
    sourcePath: string;
    content: string;
    projectId?: string;
    tags?: string[];
  }): Promise<KnowledgeDocument> {
    const docId = `doc_${crypto.randomUUID()}`;
    const now = Date.now();

    const doc: KnowledgeDocument = {
      id: docId,
      title: params.title,
      sourceType: params.sourceType,
      sourcePath: params.sourcePath,
      sizeBytes: params.content.length,
      chunkCount: 0,
      state: 'PARSING',
      createdAt: now,
      updatedAt: now,
      projectId: params.projectId,
      tags: params.tags,
    };

    this.documents.set(docId, doc);
    this.notify();

    // Stage 1: Chunking text
    await new Promise((r) => setTimeout(r, 60));
    const rawChunks = this.splitIntoChunks(docId, params.content);
    
    // Store chunks
    for (const chunk of rawChunks) {
      this.chunks.set(chunk.id, chunk);
    }

    // Stage 2: Indexing
    const updatedDoc: KnowledgeDocument = {
      ...doc,
      chunkCount: rawChunks.length,
      state: 'INDEXED',
      updatedAt: Date.now(),
    };

    this.documents.set(docId, updatedDoc);
    this.notify();
    return updatedDoc;
  }

  /**
   * Searches indexed knowledge chunks with relevance scoring.
   */
  search(query: string, projectId?: string, limit = 5): KnowledgeSearchResult[] {
    if (!query.trim()) return [];

    const lowerQuery = query.toLowerCase();
    const terms = lowerQuery.split(/\s+/).filter(Boolean);
    const results: KnowledgeSearchResult[] = [];

    for (const chunk of this.chunks.values()) {
      const doc = this.documents.get(chunk.documentId);
      if (!doc || doc.state === 'DELETED') continue;
      if (projectId && doc.projectId && doc.projectId !== projectId) continue;

      const lowerContent = chunk.content.toLowerCase();
      let matchCount = 0;

      for (const term of terms) {
        if (lowerContent.includes(term)) {
          matchCount++;
        }
      }

      if (matchCount > 0) {
        const relevance = Math.min(1.0, (matchCount / terms.length) * 0.9 + (lowerContent.includes(lowerQuery) ? 0.3 : 0));
        results.push({
          chunk,
          document: doc,
          relevanceScore: Math.round(relevance * 100) / 100,
          excerpt: chunk.content.slice(0, 180).trim() + (chunk.content.length > 180 ? '...' : ''),
        });
      }
    }

    return results
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  /**
   * Deletes an ingested document and its chunks.
   */
  deleteDocument(docId: string): boolean {
    const doc = this.documents.get(docId);
    if (!doc) return false;

    this.documents.set(docId, {
      ...doc,
      state: 'DELETED',
      updatedAt: Date.now(),
    });

    // Remove chunks
    for (const [cId, chunk] of this.chunks.entries()) {
      if (chunk.documentId === docId) {
        this.chunks.delete(cId);
      }
    }

    this.notify();
    return true;
  }

  private splitIntoChunks(documentId: string, content: string, chunkSize = 400): KnowledgeChunk[] {
    const chunks: KnowledgeChunk[] = [];
    const paragraphs = content.split(/\n\n+/);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const p of paragraphs) {
      if ((currentChunk + '\n\n' + p).length > chunkSize && currentChunk.length > 0) {
        chunks.push({
          id: `chunk_${documentId}_${chunkIndex}`,
          documentId,
          content: currentChunk.trim(),
          chunkIndex,
          tokens: Math.round(currentChunk.length / 4),
        });
        chunkIndex++;
        currentChunk = p;
      } else {
        currentChunk = currentChunk ? `${currentChunk}\n\n${p}` : p;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: `chunk_${documentId}_${chunkIndex}`,
        documentId,
        content: currentChunk.trim(),
        chunkIndex,
        tokens: Math.round(currentChunk.length / 4),
      });
    }

    return chunks;
  }
}

export const KnowledgeIngestionManager = new KnowledgeIngestionManagerImpl();
