import type { UniversalModelRecord } from './types';
import { HuggingFaceService } from './HuggingFaceService';
import { downloadManager } from './ModelDownloadManager';

export type ModelListListener = (models: UniversalModelRecord[]) => void;

export class ModelManagerImpl {
  private models: Map<string, UniversalModelRecord> = new Map();
  private activeModelId: string = 'gemini-1.5-pro';
  private listeners: Set<ModelListListener> = new Set();

  constructor() {
    this.initDefaultModels();
    downloadManager.subscribe((record) => {
      this.models.set(record.id, record);
      this.notify();
    });
  }

  private initDefaultModels(): void {
    const curated = HuggingFaceService.getCuratedModels();
    for (const m of curated) {
      this.models.set(m.id, m);
    }
  }

  subscribe(listener: ModelListListener): () => void {
    this.listeners.add(listener);
    listener(this.listModels());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const list = this.listModels();
    for (const listener of this.listeners) {
      try {
        listener(list);
      } catch (err) {
        console.error('[ModelManager] Listener error:', err);
      }
    }
  }

  listModels(): UniversalModelRecord[] {
    return Array.from(this.models.values());
  }

  getModel(id: string): UniversalModelRecord | undefined {
    return this.models.get(id);
  }

  getActiveModelId(): string {
    return this.activeModelId;
  }

  setActiveModel(id: string): boolean {
    const model = this.models.get(id);
    if (!model) return false;

    // Set old active to READY or DISCOVERED
    for (const [mId, m] of this.models.entries()) {
      if (m.state === 'ACTIVE') {
        this.models.set(mId, { ...m, state: 'READY' });
      }
    }

    this.activeModelId = id;
    this.models.set(id, { ...model, state: 'ACTIVE' });
    this.notify();
    return true;
  }

  async searchHuggingFace(query: string): Promise<UniversalModelRecord[]> {
    const results = await HuggingFaceService.searchModels(query);
    for (const res of results) {
      if (!this.models.has(res.id)) {
        this.models.set(res.id, res);
      }
    }
    this.notify();
    return this.listModels();
  }

  async acquireModel(modelId: string): Promise<void> {
    const model = this.models.get(modelId);
    if (!model) throw new Error(`Model not found: ${modelId}`);

    await downloadManager.downloadModel(model, (updated) => {
      this.models.set(updated.id, updated);
      this.notify();
    });
  }

  cancelAcquisition(modelId: string): void {
    downloadManager.cancelDownload(modelId);
  }
}

export const ModelManager = new ModelManagerImpl();
