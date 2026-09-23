/**
 * WorkspaceStateStore
 *
 * Lightweight in-memory & session-persisted workspace state cache.
 * Ensures user drafts (code editor, prompt drafts, selected models) survive:
 * - Surface close and reopen
 * - Navigating between capabilities (e.g. CREATE -> ANALYZE -> CREATE)
 */

interface CodeWorkspaceDraft {
  codeContent: string;
  selectedModelId: string;
  astStatus: string;
  lastOutput: string | null;
}

interface WorkspaceState {
  codeWorkspace?: CodeWorkspaceDraft;
  [key: string]: any;
}

class WorkspaceStateStoreImpl {
  private state: WorkspaceState = {};

  constructor() {
    this.loadFromSession();
  }

  private loadFromSession(): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        const raw = window.sessionStorage.getItem('rezel_workspace_drafts');
        if (raw) {
          this.state = JSON.parse(raw);
        }
      }
    } catch {
      this.state = {};
    }
  }

  private persistToSession(): void {
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem('rezel_workspace_drafts', JSON.stringify(this.state));
      }
    } catch {
      // Ignore quota/storage errors
    }
  }

  public getCodeDraft(): CodeWorkspaceDraft | undefined {
    return this.state.codeWorkspace;
  }

  public setCodeDraft(draft: Partial<CodeWorkspaceDraft>): void {
    this.state.codeWorkspace = {
      codeContent: draft.codeContent ?? this.state.codeWorkspace?.codeContent ?? '// Rezel OS — Computational Module\nfunction computeSpatialTension(nodes) {\n  return nodes.reduce((acc, val, idx) => acc + val * Math.sin(idx * 0.5), 0);\n}\n\nreturn computeSpatialTension([12, 45, 78, 34, 89]);',
      selectedModelId: draft.selectedModelId ?? this.state.codeWorkspace?.selectedModelId ?? 'gemini-3.6-flash',
      astStatus: draft.astStatus ?? this.state.codeWorkspace?.astStatus ?? 'SYNTAX NOMINAL · AST READY',
      lastOutput: draft.lastOutput ?? this.state.codeWorkspace?.lastOutput ?? null,
    };
    this.persistToSession();
  }
}

export const WorkspaceStateStore = new WorkspaceStateStoreImpl();
