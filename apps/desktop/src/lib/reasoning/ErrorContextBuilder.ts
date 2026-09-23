import type {
  SanitizedErrorContext,
  ErrorCategory,
  AgentActionType,
} from './types';

export class ErrorContextBuilder {
  /**
   * Transforms raw execution errors into sanitized, model-safe ErrorContext entries.
   *
   * SECURITY BOUNDARY:
   * - SECURITY_BLOCKED errors MUST NOT expose SafetyValidator patterns or PolicyEngine rules.
   * - Strips absolute external paths, stack traces, PIDs, environment variables, and API keys.
   * - Caps error message length to 500 characters.
   */
  static build(options: {
    actionId: string;
    actionType: AgentActionType;
    capabilityId: string;
    rawError: string;
    failureReason?: string;
    projectRootPath?: string;
    verificationResult?: 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN';
  }): SanitizedErrorContext {
    const category = ErrorContextBuilder.categorizeError(options.failureReason, options.rawError);
    const errorMessage = ErrorContextBuilder.sanitize(options.rawError, category, options.projectRootPath);

    return {
      actionId: options.actionId,
      actionType: options.actionType,
      capabilityId: options.capabilityId,
      errorCategory: category,
      errorMessage,
      verificationResult: options.verificationResult,
      isRetryable: category !== 'SECURITY_BLOCKED' && options.verificationResult !== 'UNKNOWN',
      suggestedRecovery: ErrorContextBuilder.getSuggestedRecovery(category),
    };
  }

  static categorizeError(failureReason?: string, rawError?: string): ErrorCategory {
    if (failureReason === 'SECURITY_BLOCKED') return 'SECURITY_BLOCKED';
    if (failureReason === 'TIMEOUT') return 'TIMEOUT';

    const lower = (rawError || '').toLowerCase();
    if (lower.includes('security') || lower.includes('policy') || lower.includes('forbidden')) {
      return 'SECURITY_BLOCKED';
    }
    if (lower.includes('user denied') || lower.includes('cancelled by user')) return 'USER_DENIED';
    if (lower.includes('disconnected')) return 'APPLICATION_DISCONNECTED';
    if (lower.includes('not found') || lower.includes('unregistered')) return 'CAPABILITY_NOT_FOUND';
    if (lower.includes('validation')) return 'VALIDATION_FAILED';
    if (lower.includes('verification')) return 'VERIFICATION_FAILED';
    if (lower.includes('timeout')) return 'TIMEOUT';

    return 'EXECUTION_FAILED';
  }

  static sanitize(rawError: string, category: ErrorCategory, projectRoot?: string): string {
    if (category === 'SECURITY_BLOCKED') {
      // High-level safe summary ONLY — never expose PolicyEngine/SafetyValidator patterns
      return 'Action was blocked by Rezel security policy.';
    }

    if (!rawError || rawError.trim().length === 0) {
      return 'Execution failed with an unspecified error.';
    }

    let sanitized = rawError;

    // 1. Strip stack traces (e.g. at functionName (file.js:10))
    sanitized = sanitized.replace(/\n\s*at\s+[\s\S]*/gi, '');

    // 2. Strip process IDs (PID 1234, process 5678)
    sanitized = sanitized.replace(/PID\s*:?\s*\d+/gi, '[PID]');
    sanitized = sanitized.replace(/process\s*:?\s*\d+/gi, '[PROCESS]');

    // 3. Strip environment variables (ENV_VAR=value)
    sanitized = sanitized.replace(/\b[A-Z0-9_]{3,}=[^;\n\s]+/g, '[ENV_REDACTED]');

    // 4. Redact potential API keys / secrets / tokens
    sanitized = sanitized.replace(/\b(sk-[a-zA-Z0-9_-]{20,}|AIzaSy[a-zA-Z0-9_-]{33}|ghp_[a-zA-Z0-9]{36}|TEST_OPENAI_TOKEN)\b/g, '[REDACTED_API_KEY]');

    // 5. Convert absolute paths outside project root
    if (projectRoot && projectRoot.length > 0) {
      const normRoot = projectRoot.replace(/\\/g, '/');
      const normError = sanitized.replace(/\\/g, '/');
      sanitized = normError.replace(new RegExp(normRoot, 'gi'), '.');
    }

    // Strip remaining Windows user home paths (e.g. C:/Users/Username/...)
    sanitized = sanitized.replace(/[a-zA-Z]:\/Users\/[^\/\s]+\//gi, '~/');

    // 6. Truncate to max 500 characters
    if (sanitized.length > 500) {
      sanitized = `${sanitized.substring(0, 500)}... [truncated]`;
    }

    return sanitized.trim();
  }

  private static getSuggestedRecovery(category: ErrorCategory): string | undefined {
    switch (category) {
      case 'SECURITY_BLOCKED':
        return 'Request explicit user approval or choose a non-destructive alternative capability.';
      case 'CAPABILITY_NOT_FOUND':
        return 'Check available capability metadata and request a supported capability.';
      case 'APPLICATION_DISCONNECTED':
        return 'Ensure the target application (e.g., Blender) is running and connected.';
      case 'TIMEOUT':
        return 'Break down the task into smaller sub-actions.';
      case 'VERIFICATION_FAILED':
        return 'Inspect updated application state before attempting further modifications.';
      default:
        return undefined;
    }
  }
}
