import { LocalMemory } from '../memory/LocalMemory.js';
import { WorkspaceManager } from '../workspace/WorkspaceManager.js';
import { ProjectManager } from '../workspace/ProjectManager.js';

export class ConversationManager {
  private activeConversationId: string | null = null;

  startConversation(title?: string, projectId?: string): string {
    const convId = LocalMemory.createConversation(
      title ?? `Conversation ${new Date().toLocaleString()}`
    );
    this.activeConversationId = convId;

    // Associate with provided or active project
    const targetProjectId = projectId ?? WorkspaceManager.getActiveProject()?.id;
    if (targetProjectId) {
      ProjectManager.associateConversation(targetProjectId, convId);
    }

    return this.activeConversationId;
  }

  loadConversation(id: string): boolean {
    const conv = LocalMemory.getConversation(id);
    if (!conv) return false;
    this.activeConversationId = id;
    return true;
  }

  getActiveConversationId(): string | null {
    return this.activeConversationId;
  }
}
