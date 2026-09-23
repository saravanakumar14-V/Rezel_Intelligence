import type {
  ReasoningProviderResult,
  ReasoningResponse,
  ReasoningResponseStatus,
  AgentAction,
} from './types';

export class ResponseInterpreter {
  /**
   * Parses raw provider response string or ReasoningProviderResult into a sanitized ReasoningResponse.
   *
   * H-02 FALLBACK SAFETY:
   * If parsing fails or JSON is malformed/unstructured, returns ZERO actions with status 'NEED_INFO'.
   * NEVER regex-extracts executable actions from unstructured prose.
   */
  static parse(input: ReasoningProviderResult | string): ReasoningResponse {
    let rawText = '';
    let structuredInput: any = undefined;

    if (typeof input === 'string') {
      rawText = input;
    } else {
      rawText = input.raw || '';
      structuredInput = input.structured;
    }

    // 1. If structured output is already present and valid
    if (structuredInput && typeof structuredInput === 'object') {
      const sanitized = ResponseInterpreter.sanitizeResponseObject(structuredInput);
      if (sanitized) return sanitized;
    }

    // 2. Try parsing rawText directly
    if (rawText && rawText.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawText.trim());
        const sanitized = ResponseInterpreter.sanitizeResponseObject(parsed);
        if (sanitized) return sanitized;
      } catch {
        // Fallback to markdown fence extraction
      }

      // 3. Try extracting JSON from markdown fences (```json ... ``` or ``` ... ```)
      const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (fenceMatch && fenceMatch[1]) {
        try {
          const parsed = JSON.parse(fenceMatch[1].trim());
          const sanitized = ResponseInterpreter.sanitizeResponseObject(parsed);
          if (sanitized) return sanitized;
        } catch {
          // Fall through to H-02 fallback
        }
      }
    }

    // H-02 Fallback Safety: Return ZERO actions
    return {
      status: 'NEED_INFO',
      summary: 'Failed to parse structured reasoning response. Zero actions executed.',
      actions: [],
      questionsForUser: ['Reasoning model response was unstructured or unparseable. Please clarify.'],
    };
  }

  private static sanitizeResponseObject(obj: any): ReasoningResponse | null {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return null;
    }

    const validStatuses: ReasoningResponseStatus[] = [
      'ACTIONS',
      'COMPLETE',
      'NEED_INFO',
      'ERROR',
      'ABORT',
    ];

    let status: ReasoningResponseStatus = 'NEED_INFO';
    if (typeof obj.status === 'string' && validStatuses.includes(obj.status as ReasoningResponseStatus)) {
      status = obj.status as ReasoningResponseStatus;
    }

    const summary = typeof obj.summary === 'string' ? obj.summary : '';

    let actions: AgentAction[] = [];
    if (Array.isArray(obj.actions)) {
      actions = obj.actions.filter((a: any) => a && typeof a === 'object');
    }

    const questionsForUser = Array.isArray(obj.questionsForUser)
      ? obj.questionsForUser.filter((q: any) => typeof q === 'string')
      : undefined;

    const observationsNeeded = Array.isArray(obj.observationsNeeded)
      ? obj.observationsNeeded.filter((o: any) => typeof o === 'string')
      : undefined;


    const nextStepHint = typeof obj.nextStepHint === 'string' ? obj.nextStepHint : undefined;
    const confidence = typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : undefined;

    return {
      status,
      summary,
      actions,
      questionsForUser,
      observationsNeeded,
      verificationPredicates: Array.isArray(obj.verificationPredicates) ? obj.verificationPredicates : undefined,
      nextStepHint,
      confidence,
    };
  }
}
