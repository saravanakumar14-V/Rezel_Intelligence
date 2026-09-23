/**
 * GeminiProvider
 *
 * Unified Gemini API client with streaming support.
 *
 * Features:
 *  - Streaming via SSE (Server-Sent Events) with `alt=sse`
 *  - Function calling (tool use) support
 *  - Conversation history management (Gemini message format)
 *  - Automatic retry with exponential backoff (3 attempts)
 *  - API key retrieved from OS keyring via Tauri
 *
 * Provider interface compliance:
 *  Implements `AIProvider` from `./types.ts` so it can be swapped
 *  for Ollama, OpenAI, or any future provider.
 */

import { invoke } from '@tauri-apps/api/core';
import type {
  AIProvider,
  Message,
  ChatOptions,
  StreamChunk,
} from './types';

// ─── Constants ────────────────────────────────────────────────────────────────

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const DEFAULT_MODEL   = (import.meta.env?.VITE_GEMINI_MODEL_ID) || 'gemini-3.6-flash';
const MAX_RETRIES     = 3;
const RETRY_BASE_MS   = 800;

const DEFAULT_SYSTEM_PROMPT = `You are Rezel, a premium desktop AI operating intelligence.

You are not a chatbot. You are an advanced AI companion integrated directly
into the user's desktop environment. You can inspect system metrics, execute
safe commands, remember context across sessions, and plan multi-step tasks.

Behaviour guidelines:
- Be concise but thorough.
- When using tools, explain what you are doing and why.
- If a task requires multiple steps, outline the plan before executing.
- Never attempt destructive operations without explicit user confirmation.
- Prefer factual, actionable responses.`;

// ─── Gemini API types ─────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string;
  functionCall?: { 
    name: string; 
    args: Record<string, unknown>;
    thought_signature?: string;
  };
  thought_signature?: string; // Sibling fallback
  functionResponse?: { name: string; response: { result: string } };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
}

interface GeminiStreamChunk {
  candidates?: GeminiCandidate[];
  error?: { code: number; message: string };
}

// ─── Message format conversion ────────────────────────────────────────────────

function toGeminiContents(messages: Message[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue; // handled via systemInstruction

    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else if (msg.role === 'assistant') {
      const parts: GeminiPart[] = [];
      if (msg.content) parts.push({ text: msg.content });
      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          if (tc.rawPart) {
            parts.push(tc.rawPart as GeminiPart);
          } else {
            // Fallback for older messages without rawPart
            const functionCall: any = { name: tc.name, args: tc.args };
            if (tc.thoughtSignature) {
              functionCall.thought_signature = tc.thoughtSignature;
            }
            parts.push({ functionCall, thought_signature: tc.thoughtSignature });
          }
        }
      }
      if (parts.length > 0) contents.push({ role: 'model', parts });
    } else if (msg.role === 'tool' && msg.toolResults) {
      const parts: GeminiPart[] = msg.toolResults.map((tr) => ({
        functionResponse: {
          name: tr.name,
          response: { result: tr.output },
        },
      }));
      contents.push({ role: 'user', parts });
    }
  }

  return contents;
}

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  apiKey: string,
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, init);
      
      if (response.ok || response.status === 400) return response; // 400 = invalid request, don't retry

      if (response.status === 429) {
        const cloned = response.clone();
        const errText = await cloned.text();
        
        // Detect Daily Free-Tier Exhaustion
        if (errText.includes('GenerateRequestsPerDay') || errText.includes('FreeTier')) {
          throw new Error('Gemini daily API quota exhausted for this project. Please try again after the quota resets or configure another Gemini API project/key.');
        }

        // Otherwise, it's a temporary rate limit (e.g., per-minute).
        const safeErrText = errText.split(apiKey).join('***[API_KEY_HIDDEN]***');
        lastError = new Error(`Gemini API 429 Rate Limit: ${safeErrText}`);

        if (attempt < retries - 1) {
          const retryAfter = response.headers.get('Retry-After');
          const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_BASE_MS * Math.pow(2, attempt);
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw lastError;
      }

      if (response.status === 404) {
        const modelMatch = url.match(/\/models\/([^:]+):/);
        const modelName = modelMatch ? modelMatch[1] : 'unknown';
        throw new Error(`Gemini API 404 Not Found: The configured model '${modelName}' is unavailable or deprecated. Please update VITE_GEMINI_MODEL_ID in your configuration.`);
      }

      if (response.status >= 500) {
        lastError = new Error(`Gemini API ${response.status}: ${response.statusText}`);
      } else {
        return response; // 4xx (non-400, non-429) — return as-is
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err; // Fast-fail immediately on user abort
      }
      if (err instanceof Error && err.message.includes('daily API quota exhausted')) {
        throw err; // Fast-fail immediately on daily quota exhaustion
      }
      if (err instanceof Error && err.message.includes('404 Not Found')) {
        throw err; // Fast-fail immediately on unavailable model
      }
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < retries - 1) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastError ?? new Error('Gemini API request failed after retries');
}

// ─── Provider implementation ──────────────────────────────────────────────────

class GeminiProviderImpl implements AIProvider {
  readonly name = 'gemini';
  private apiKey: string | null = null;
  private model: string = DEFAULT_MODEL;

  setModel(model: string): void {
    this.model = model;
  }

  /**
   * clearApiKey
   * Clears the cached API key so it is forced to re-fetch on the next request.
   */
  clearApiKey(): void {
    this.apiKey = null;
  }

  /**
   * isAvailable
   * Checks if an API key is stored in the OS keyring.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const key = await invoke<string>('get_api_key');
      this.apiKey = key;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ensureApiKey
   * Loads the API key from keyring if not already cached.
   */
  private async ensureApiKey(): Promise<string> {
    if (this.apiKey) {
      return this.apiKey;
    }
    try {
      this.apiKey = await invoke<string>('get_api_key');
      return this.apiKey;
    } catch (err) {
      console.error("[GeminiProvider] ensureApiKey: get_api_key failed with:", err);
      throw new Error(
        'No Gemini API key configured. Use the settings panel or ' +
        'ToolExecutor to save one via save_api_key.'
      );
    }
  }

  /**
   * chat
   *
   * Streams a Gemini response as an async generator of `StreamChunk` objects.
   * Supports function calling — tool calls arrive as `type: 'tool_call'` chunks.
   *
   * @param messages  Conversation history
   * @param options   Temperature, max tokens, system prompt, tools, abort signal
   */
  async *chat(
    messages: Message[],
    options: ChatOptions = {}
  ): AsyncGenerator<StreamChunk> {
    const apiKey = await this.ensureApiKey();
    const url = `${GEMINI_BASE_URL}/models/${this.model}:streamGenerateContent?alt=sse`;

    const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
    const contents = toGeminiContents(messages);

    const body: Record<string, unknown> = {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 8192,
      },
    };

    // Attach tools for function calling
    if (options.tools && options.tools.length > 0) {
      const { CapabilityRegistry } = await import('./capabilities/CapabilityRegistry');
      const functionDeclarations = CapabilityRegistry.toGeminiFunctionDeclarations();
      body.tools = [{
        functionDeclarations,
      }];
    }

    let response: Response;
    try {
      response = await fetchWithRetry(
        url,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey
          },
          body: JSON.stringify(body),
          signal: options.signal,
        },
        apiKey
      );
    } catch (err) {
      yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
      return;
    }

    if (!response.ok) {
      let errText = await response.text();
      if (apiKey) {
        errText = errText.split(apiKey).join('***[API_KEY_HIDDEN]***');
      }
      yield { type: 'error', error: `Gemini API error (${response.status}): ${errText}` };
      return;
    }

    // Parse SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body from Gemini API' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          const jsonStr = trimmed.slice(6); // Remove "data: " prefix
          if (jsonStr === '[DONE]') {
            yield { type: 'done' };
            return;
          }

          let chunk: GeminiStreamChunk;
          try {
            chunk = JSON.parse(jsonStr) as GeminiStreamChunk;
          } catch {
            continue; // Skip malformed JSON lines
          }

          if (chunk.error) {
            yield { type: 'error', error: chunk.error.message };
            return;
          }

          const candidate = chunk.candidates?.[0];
          if (!candidate?.content?.parts) continue;

          for (const part of candidate.content.parts) {
            if (part.text) {
              yield { type: 'text', text: part.text };
            }
            if (part.functionCall) {
              yield {
                type: 'tool_call',
                toolCall: {
                  id: crypto.randomUUID(),
                  name: part.functionCall.name,
                  args: part.functionCall.args,
                  thoughtSignature: (part.functionCall as any).thought_signature || (part as any).thought_signature,
                  rawPart: part,
                },
              };
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }
}

/** Singleton — import and use directly. */
export const GeminiProvider = new GeminiProviderImpl();
