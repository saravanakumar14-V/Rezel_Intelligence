/**
 * LocalMemory
 *
 * Persistent memory store for Rezel.
 *
 * Current backend: JSON file via Tauri `read_app_file` / `write_app_file`.
 * Future backend: SQLite via Tauri plugin (interface is stable).
 *
 * Features:
 *  - Conversation storage (full message history)
 *  - Key-value entries with categories (preference, context, automation, note)
 *  - Text search across entries and conversation titles
 *  - Session persistence (auto-load on init, explicit save)
 *  - Memory pruning (configurable max conversations)
 *
 * All mutations are in-memory until `save()` is called.
 * AgentCore calls `save()` after each conversation turn.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  MemoryStore,
  ConversationRecord,
  MemoryEntry,
  Message,
} from '../ai/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const MEMORY_FILE = 'rezel_memory.json';
const STORE_VERSION = 1;
const MAX_CONVERSATIONS = 50;
const MAX_ENTRIES = 200;

function emptyStore(): MemoryStore {
  return { conversations: [], entries: [], version: STORE_VERSION };
}

// ─── Implementation ───────────────────────────────────────────────────────────

class LocalMemoryImpl {
  private store: MemoryStore = emptyStore();
  private loaded = false;
  private dirty = false;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  private loadPromise: Promise<void> | null = null;

  /**
   * load
   * Reads the memory file from the Tauri app data directory.
   * Safe to call multiple times — only loads once unless `forceReload` is true.
   */
  async load(forceReload = false): Promise<void> {
    if (this.loaded && !forceReload) return;
    if (this.loadPromise && !forceReload) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        const raw = await invoke<string>('read_app_file', { path: MEMORY_FILE });
        const parsed = JSON.parse(raw) as MemoryStore;

        // Version migration point — currently only v1
        if (parsed.version === STORE_VERSION) {
          this.store = parsed;
        } else {
          console.warn('[LocalMemory] Unknown store version, starting fresh');
          this.store = emptyStore();
        }
      } catch (err) {
        const msg = String(err).toLowerCase();
        // File doesn't exist yet — start fresh
        if (msg.includes('not found') || msg.includes('no such file') || msg.includes('cannot find the file')) {
          this.store = emptyStore();
        } else {
          console.error('[LocalMemory] Failed to load memory file:', err);
          return; // Do not mark as successfully loaded or allow save to overwrite
        }
      }

      this.loaded = true;
      this.dirty = false;
    })();

    return this.loadPromise;
  }

  /**
   * save
   * Writes the current in-memory store to the Tauri app data directory.
   * No-op if nothing has changed since last save.
   */
  async save(): Promise<void> {
    if (!this.dirty) return;

    this.dirty = false; // Reset before async IPC to avoid race conditions
    try {
      const json = JSON.stringify(this.store, null, 2);
      await invoke('write_app_file', { path: MEMORY_FILE, content: json });
    } catch (err) {
      this.dirty = true; // Re-flag on error
      console.error('[LocalMemory] Save failed:', err);
    }
  }

  // ── Conversations ─────────────────────────────────────────────────────────

  /**
   * createConversation
   * Creates a new conversation record with an initial title.
   * Returns the conversation ID.
   */
  createConversation(title: string): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    this.store.conversations.unshift({
      id,
      title,
      messages: [],
      createdAt: now,
      updatedAt: now,
    });

    // Prune oldest conversations
    if (this.store.conversations.length > MAX_CONVERSATIONS) {
      this.store.conversations = this.store.conversations.slice(0, MAX_CONVERSATIONS);
    }

    this.dirty = true;
    return id;
  }

  /**
   * getConversation
   * Returns a conversation by ID, or undefined if not found.
   */
  getConversation(id: string): ConversationRecord | undefined {
    return this.store.conversations.find((c) => c.id === id);
  }

  /**
   * appendMessage
   * Adds a message to a conversation and updates the timestamp.
   */
  appendMessage(conversationId: string, message: Message): void {
    const conv = this.getConversation(conversationId);
    if (!conv) return;

    conv.messages.push(message);
    conv.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  /**
   * getMessages
   * Returns all messages in a conversation, or empty array if not found.
   */
  getMessages(conversationId: string): Message[] {
    return this.getConversation(conversationId)?.messages ?? [];
  }

  /**
   * listConversations
   * Returns conversation metadata (without full message bodies) for the UI.
   */
  listConversations(): Array<{
    id: string;
    title: string;
    messageCount: number;
    updatedAt: string;
  }> {
    return this.store.conversations.map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c.messages.length,
      updatedAt: c.updatedAt,
    }));
  }

  /**
   * deleteConversation
   * Removes a conversation by ID. Returns true if it existed.
   */
  deleteConversation(id: string): boolean {
    const before = this.store.conversations.length;
    this.store.conversations = this.store.conversations.filter((c) => c.id !== id);
    if (this.store.conversations.length < before) {
      this.dirty = true;
      return true;
    }
    return false;
  }

  // ── Key-Value Entries ─────────────────────────────────────────────────────

  /**
   * setEntry
   * Stores or updates a key-value entry with a category.
   */
  setEntry(
    key: string,
    value: string,
    category: MemoryEntry['category'] = 'context'
  ): void {
    const now = new Date().toISOString();
    const existing = this.store.entries.find((e) => e.key === key);

    if (existing) {
      existing.value = value;
      existing.category = category;
      existing.updatedAt = now;
    } else {
      this.store.entries.push({
        key,
        value,
        category,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Prune oldest entries
    if (this.store.entries.length > MAX_ENTRIES) {
      this.store.entries = this.store.entries.slice(-MAX_ENTRIES);
    }

    this.dirty = true;
  }

  /**
   * getEntry
   * Returns an entry by key, or undefined.
   */
  getEntry(key: string): MemoryEntry | undefined {
    return this.store.entries.find((e) => e.key === key);
  }

  /**
   * getEntriesByCategory
   * Returns all entries matching a category.
   */
  getEntriesByCategory(category: MemoryEntry['category']): MemoryEntry[] {
    return this.store.entries.filter((e) => e.category === category);
  }

  /**
   * deleteEntry
   * Removes an entry by key. Returns true if it existed.
   */
  deleteEntry(key: string): boolean {
    const before = this.store.entries.length;
    this.store.entries = this.store.entries.filter((e) => e.key !== key);
    if (this.store.entries.length < before) {
      this.dirty = true;
      return true;
    }
    return false;
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * search
   *
   * Text search across conversation titles and entry keys/values.
   * Returns matching items grouped by type.
   *
   * Future: replace with vector similarity search when SQLite + embeddings
   * are available.
   */
  search(query: string): {
    conversations: ConversationRecord[];
    entries: MemoryEntry[];
  } {
    const q = query.toLowerCase();

    const conversations = this.store.conversations.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.messages.some((m) => m.content.toLowerCase().includes(q))
    );

    const entries = this.store.entries.filter(
      (e) =>
        e.key.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q)
    );

    return { conversations, entries };
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  /** Returns total count of conversations and entries. */
  stats(): { conversations: number; entries: number; version: number } {
    return {
      conversations: this.store.conversations.length,
      entries: this.store.entries.length,
      version: this.store.version,
    };
  }

  /** Wipes all data. Does NOT auto-save — call `save()` to persist. */
  clear(): void {
    this.store = emptyStore();
    this.dirty = true;
  }
}

/** Singleton — import and use directly. */
export const LocalMemory = new LocalMemoryImpl();
