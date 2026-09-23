/**
 * Rezel 13.2.4 — Application Intent Resolver
 *
 * Translates natural language user prompts into typed ApplicationOperationIntent objects.
 * Identifies explicit application targets and extracts candidate parameters deterministically.
 *
 * Security & Architectural Invariants:
 * - Pure lexical parsing & pattern normalization.
 * - NEVER inspects the active UI tree or formulates ComputerActions.
 * - Parameter extraction is non-evaluating and schema-neutral.
 */

import { ApplicationProfileRegistry } from '../../profiles/ApplicationProfileRegistry';
import type { ApplicationOperationIntent } from './types';

export class ApplicationIntentResolver {
  /**
   * Resolves a user prompt into a structured ApplicationOperationIntent.
   */
  static resolveIntent(
    query: string,
    source: 'USER' | 'VOICE' | 'COMMAND' | 'WORKFLOW' = 'USER',
    explicitAppOverride?: string,
    initialParameters: Readonly<Record<string, unknown>> = {}
  ): ApplicationOperationIntent {
    const rawQuery = query.trim();
    let cleanQuery = rawQuery;
    let explicitAppId = explicitAppOverride;

    const parameters: Record<string, unknown> = { ...initialParameters };

    // ─── 1. Identify Explicit Application Reference ───────────────────────────
    if (!explicitAppId) {
      const detected = this.detectApplicationFromQuery(rawQuery);
      if (detected) {
        explicitAppId = detected.appId;
        cleanQuery = detected.cleanedQuery;
      }
    }

    // ─── 2. Parameter Extraction ──────────────────────────────────────────────
    // 2.1 Extract Windows / UNIX absolute path
    const pathMatch = rawQuery.match(/([a-zA-Z]:\\[^\s"'\n\r\t<>|?*]+|[a-zA-Z]:\/[^\s"'\n\r\t<>|?*]+|\/[a-zA-Z0-9_\-./]+)/);
    if (pathMatch && !parameters.path) {
      parameters.path = pathMatch[1].trim();
    }

    // 2.2 Extract Quoted Strings: "..." or '...'
    const quotedMatch = rawQuery.match(/["']([^"']+)["']/);
    if (quotedMatch && !parameters.text && !parameters.path) {
      parameters.text = quotedMatch[1];
    }

    // 2.3 Extract "Type <text> into/in ..." patterns
    if (!parameters.text) {
      const typeMatch = rawQuery.match(/^type\s+([^\s].*?)(?:\s+(?:into|in|to|on)\s+.*)?$/i);
      if (typeMatch && typeMatch[1]) {
        let extractedText = typeMatch[1].trim();
        // Remove trailing "into <app>" if present
        extractedText = extractedText.replace(/\s+(?:into|in|to)\s+(?:notepad|calculator|file explorer|explorer|after effects|aftereffects)$/i, '').trim();
        if (extractedText) {
          parameters.text = extractedText;
        }
      }
    }

    // 2.4 Extract "saying <text>" or "with text <text>"
    if (!parameters.text) {
      const sayingMatch = rawQuery.match(/(?:saying|with text|with content)\s+([^\s"'\n\r\t].*?)(?:\s+(?:in|into|to|using|with|on)\s+(?:after effects|aftereffects|notepad|ae))?$/i);
      if (sayingMatch && sayingMatch[1]) {
        const extracted = sayingMatch[1].trim();
        if (extracted) {
          parameters.text = extracted;
        }
      }
    }

    // 2.5 Extract "named <name>" or "name <name>" for comp creation
    if (!parameters.name) {
      const nameMatch = rawQuery.match(/(?:named|name|called)\s+["']?([a-zA-Z0-9_\-\s]+?)["']?(?:\s+(?:in|into|to|using)\s+.*)?$/i);
      if (nameMatch && nameMatch[1]) {
        const extractedName = nameMatch[1].trim();
        if (extractedName && !extractedName.toLowerCase().startsWith('after')) {
          parameters.name = extractedName;
        }
      }
    }

    return {
      explicitAppId,
      operationQuery: cleanQuery,
      parameters,
      source,
    };
  }

  /**
   * Scans registered profiles for matching names or aliases in the user query.
   */
  private static detectApplicationFromQuery(
    query: string
  ): { appId: string; cleanedQuery: string } | undefined {
    const lower = query.toLowerCase();
    const profiles = ApplicationProfileRegistry.list();

    // Sort by name length descending so multi-word aliases match first (e.g. "file explorer" before "explorer")
    const candidates: Array<{ appId: string; matchToken: string }> = [];

    for (const profile of profiles) {
      candidates.push({ appId: profile.appId, matchToken: profile.name.toLowerCase() });
      candidates.push({ appId: profile.appId, matchToken: profile.appId.toLowerCase() });
      for (const alias of profile.aliases) {
        candidates.push({ appId: profile.appId, matchToken: alias.toLowerCase() });
      }
    }

    candidates.sort((a, b) => b.matchToken.length - a.matchToken.length);

    for (const cand of candidates) {
      // Look for app reference prepositions: "in <app>", "to <app>", "into <app>", "with <app>", "using <app>", "<app> <operation>"
      const patterns = [
        new RegExp(`(?:\\s+|^)(?:in|to|into|with|using|for|on)\\s+${this.escapeRegex(cand.matchToken)}(?:\\b|$)`, 'i'),
        new RegExp(`^${this.escapeRegex(cand.matchToken)}\\s+(?:to\\s+|:\\s*)?`, 'i'),
      ];

      for (const pattern of patterns) {
        if (pattern.test(lower)) {
          const cleaned = query.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
          return {
            appId: cand.appId,
            cleanedQuery: cleaned.length > 0 ? cleaned : cand.matchToken,
          };
        }
      }
    }

    return undefined;
  }

  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
