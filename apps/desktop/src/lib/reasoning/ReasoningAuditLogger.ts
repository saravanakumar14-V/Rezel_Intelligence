import type { ReasoningAuditEvent, ReasoningAuditEventType } from './types';

const MAX_AUDIT_EVENTS = 500;
const MAX_PAYLOAD_STRING_LENGTH = 500;

const SENSITIVE_KEY_PATTERNS = [
  /api[_-]?key/i,
  /token/i,
  /secret/i,
  /password/i,
  /authorization/i,
  /cookie/i,
  /env/i,
  /prompt/i,
  /raw[_-]?output/i,
  /raw[_-]?prompt/i,
  /raw[_-]?response/i,
  /screenshot/i,
  /image/i,
  /thought/i,
  /chain[_-]?of[_-]?thought/i,
  /cot/i,
  /stack/i,
];

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z-_]{35}/g,
  /sk-[a-zA-Z0-9]{20,}/g,
  /bearer\s+[a-zA-Z0-9._-]+/gi,
  /[a-zA-Z0-9_-]{32,}\.[a-zA-Z0-9_-]{32,}\.[a-zA-Z0-9_-]{32,}/g,
];

export interface LogEventParams {
  eventType: ReasoningAuditEventType;
  sessionId: string;
  cycleIndex?: number;
  workflowId?: string;
  actionId?: string;
  payload?: Record<string, unknown>;
}

export class ReasoningAuditLogger {
  private events: ReasoningAuditEvent[] = [];

  /**
   * Sanitizes a string value by redacting secrets, paths, and long strings.
   */
  private sanitizeString(val: string): string {
    let sanitized = val;
    for (const pat of SECRET_PATTERNS) {
      sanitized = sanitized.replace(pat, '[REDACTED_SECRET]');
    }

    // Sanitize local Windows/UNIX absolute paths
    sanitized = sanitized.replace(/[a-zA-Z]:\\[^:<>"|?*\n\r]+/g, '[PROJECT_PATH]');
    sanitized = sanitized.replace(/\/Users\/[^/\n\r]+/g, '[USER_DIR]');

    if (sanitized.length > MAX_PAYLOAD_STRING_LENGTH) {
      sanitized = `${sanitized.substring(0, MAX_PAYLOAD_STRING_LENGTH)}... [TRUNCATED]`;
    }
    return sanitized;
  }

  /**
   * Deeply sanitizes payload to prevent logging credentials, raw prompts, or hidden CoT.
   */
  private sanitizePayload(payload?: Record<string, unknown>): Record<string, unknown> {
    if (!payload) return {};

    const clean: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(payload)) {
      if (SENSITIVE_KEY_PATTERNS.some((pat) => pat.test(k))) {
        clean[k] = '[REDACTED]';
        continue;
      }

      if (typeof v === 'string') {
        clean[k] = this.sanitizeString(v);
      } else if (typeof v === 'number' || typeof v === 'boolean' || v === null || v === undefined) {
        clean[k] = v;
      } else if (Array.isArray(v)) {
        clean[k] = v.slice(0, 10).map((item) => {
          if (typeof item === 'string') return this.sanitizeString(item);
          if (typeof item === 'object' && item !== null) {
            return this.sanitizePayload(item as Record<string, unknown>);
          }
          return item;
        });
      } else if (typeof v === 'object') {
        clean[k] = this.sanitizePayload(v as Record<string, unknown>);
      }
    }

    return clean;
  }

  log(params: LogEventParams): void {
    try {
      const sanitizedPayload = this.sanitizePayload(params.payload);

      // Preserve correlation IDs safely
      if (params.workflowId) {
        sanitizedPayload.workflowId = params.workflowId;
      }
      if (params.actionId) {
        sanitizedPayload.actionId = params.actionId;
      }

      const event: ReasoningAuditEvent = {
        eventType: params.eventType,
        sessionId: params.sessionId,
        cycleIndex: params.cycleIndex,
        timestamp: new Date().toISOString(),
        payload: sanitizedPayload,
      };

      this.events.push(event);

      // Enforce bounded retention (FIFO pruning)
      if (this.events.length > MAX_AUDIT_EVENTS) {
        this.events.splice(0, this.events.length - MAX_AUDIT_EVENTS);
      }
    } catch {
      // Fail closed / silent logging failure so reasoning is never disrupted
    }
  }

  getEvents(sessionId?: string): ReasoningAuditEvent[] {
    if (sessionId) {
      return this.events.filter((e) => e.sessionId === sessionId);
    }
    return [...this.events];
  }

  getEventsByType(eventType: ReasoningAuditEventType, sessionId?: string): ReasoningAuditEvent[] {
    return this.events.filter((e) => {
      if (sessionId && e.sessionId !== sessionId) return false;
      return e.eventType === eventType;
    });
  }

  clear(): void {
    this.events = [];
  }
}

let globalLogger: ReasoningAuditLogger | null = null;

export function getReasoningAuditLogger(): ReasoningAuditLogger {
  if (!globalLogger) {
    globalLogger = new ReasoningAuditLogger();
  }
  return globalLogger;
}
