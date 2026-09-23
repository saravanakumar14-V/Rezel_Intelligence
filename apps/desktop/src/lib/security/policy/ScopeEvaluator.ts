import type { ResourceScope, PolicyEvaluationContext } from './PolicyTypes';

export class ScopeEvaluator {
  /**
   * Evaluates if a given path is authorized by the current active scopes.
   * Returns a scope that authorizes the access, or null if denied.
   */
  static evaluatePath(path: string, requiredAccess: 'READ' | 'WRITE' | 'DELETE', ctx: PolicyEvaluationContext): ResourceScope | null {
    if (!path) return null;
    
    // Normalize path for string comparison
    const normalizedPath = path.replace(/\\/g, '/');

    // Default implicit allow/deny? The system must be default deny.
    // However, if there are NO active scopes provided in the context,
    // does the system deny everything? 
    // In our architecture, the Rust ScopeGuard is the final authority.
    // If ctx.activeScopes is empty, we could fall back to a baseline policy or deny.
    // For 9.7, we assume the PolicyStore or activeScopes provides the baseline.

    let matchedScope: ResourceScope | null = null;

    for (const scope of ctx.activeScopes) {
      // Check denied roots first
      if (scope.deniedRoots) {
        for (const denied of scope.deniedRoots) {
          const normDenied = denied.replace(/\\/g, '/');
          if (normalizedPath.startsWith(normDenied)) {
            return null; // Explicitly denied
          }
        }
      }

      // Check allowed roots
      let isAllowedRoot = false;
      for (const allowed of scope.allowedRoots) {
        const normAllowed = allowed.replace(/\\/g, '/');
        if (normalizedPath.startsWith(normAllowed)) {
          isAllowedRoot = true;
          break;
        }
      }

      if (isAllowedRoot) {
        // Check permissions
        if (requiredAccess === 'READ' && !scope.readAllowed) continue;
        if (requiredAccess === 'WRITE' && !scope.writeAllowed) continue;
        if (requiredAccess === 'DELETE' && !scope.deleteAllowed) continue;

        matchedScope = scope;
        break; // Found an authorizing scope
      }
    }

    return matchedScope;
  }
}
