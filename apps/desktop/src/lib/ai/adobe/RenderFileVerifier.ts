/**
 * Rezel 13.3.7 — Render File Verifier
 *
 * Provides safe, non-mutating secondary evidence verification for Adobe render outputs.
 * Verifies that expected output files genuinely exist, have positive non-zero size,
 * lack temporary extensions, and were created/modified by the current render attempt.
 *
 * CRITICAL INVARIANTS:
 * - Read-only: NEVER mutates or overwrites filesystem state.
 * - Never infers success from old pre-existing files or unchanged timestamps.
 * - Returns UNKNOWN when evidence is ambiguous or incomplete.
 */

import { FileOperations } from '../capabilities/providers/filesystem/FileOperations';
import { RenderOutputPathValidator } from './RenderOutputPathValidator';

export interface RenderOutputBaseline {
  readonly outputPath: string;
  readonly normalizedPath: string;
  readonly existedBefore: boolean;
  readonly previousSize: number;
  readonly previousMtime: number;
  readonly renderAttemptStartTime: number;
}

export type RenderFileVerificationStatus =
  | 'VERIFIED'
  | 'NOT_VERIFIED'
  | 'UNKNOWN';

export interface RenderFileVerificationDetails {
  readonly fileExists: boolean;
  readonly currentSize: number;
  readonly currentMtime: number;
  readonly isTempFile: boolean;
  readonly hasSizeOrMtimeChanged: boolean;
  readonly isMtimeNewer: boolean;
}

export interface RenderFileVerificationResult {
  readonly status: RenderFileVerificationStatus;
  readonly error?: string;
  readonly details?: RenderFileVerificationDetails;
}

const TEMPORARY_EXTENSIONS = new Set([
  'tmp',
  'crdownload',
  'partial',
  'part',
  'downloading',
  'temp',
]);

export class RenderFileVerifier {
  /**
   * Captures the pre-render baseline of an expected output file.
   */
  static async capturePreRenderSnapshot(
    outputPath: string | null | undefined
  ): Promise<RenderOutputBaseline | undefined> {
    if (!outputPath || typeof outputPath !== 'string' || outputPath.trim().length === 0) {
      return undefined;
    }

    const syntaxRes = RenderOutputPathValidator.validateSyntax(outputPath);
    if (syntaxRes.status !== 'OUTPUT_PATH_SUPPORTED' || !syntaxRes.normalizedPath) {
      return undefined;
    }

    const normalizedPath = syntaxRes.normalizedPath;
    const now = Date.now();

    try {
      const stat = await FileOperations.stat(normalizedPath);
      return {
        outputPath,
        normalizedPath,
        existedBefore: true,
        previousSize: stat.size ?? 0,
        previousMtime: stat.modified ?? 0,
        renderAttemptStartTime: now,
      };
    } catch {
      return {
        outputPath,
        normalizedPath,
        existedBefore: false,
        previousSize: 0,
        previousMtime: 0,
        renderAttemptStartTime: now,
      };
    }
  }

  /**
   * Evaluates post-render filesystem evidence against the pre-render baseline.
   */
  static async verifyPostRenderFile(
    baseline: RenderOutputBaseline | undefined,
    options?: {
      targetPathOverride?: string;
      clockSkewToleranceMs?: number;
    }
  ): Promise<RenderFileVerificationResult> {
    if (!baseline) {
      return {
        status: 'UNKNOWN',
        error: 'No pre-render baseline available for filesystem verification.',
      };
    }

    const targetPath = options?.targetPathOverride || baseline.normalizedPath;
    const normalized = targetPath.replace(/\\/g, '/');
    const lastDot = normalized.lastIndexOf('.');
    const ext = lastDot !== -1 ? normalized.substring(lastDot + 1).toLowerCase() : '';

    // 1. Reject temporary file extensions
    if (TEMPORARY_EXTENSIONS.has(ext)) {
      return {
        status: 'UNKNOWN',
        error: `Temporary output extension '.${ext}' detected (incomplete render).`,
        details: {
          fileExists: true,
          currentSize: 0,
          currentMtime: 0,
          isTempFile: true,
          hasSizeOrMtimeChanged: false,
          isMtimeNewer: false,
        },
      };
    }

    const syntaxRes = RenderOutputPathValidator.validateSyntax(targetPath);
    if (syntaxRes.status !== 'OUTPUT_PATH_SUPPORTED' || !syntaxRes.normalizedPath) {
      return {
        status: 'UNKNOWN',
        error: `Target output path invalid: ${syntaxRes.error || 'Syntax error'}`,
      };
    }

    // 2. Query current filesystem stat
    let stat: { size: number; modified: number; isFile: boolean; isDir: boolean };
    try {
      stat = await FileOperations.stat(normalized);
    } catch {
      return {
        status: 'UNKNOWN',
        error: `Expected render output file does not exist at '${normalized}'.`,
        details: {
          fileExists: false,
          currentSize: 0,
          currentMtime: 0,
          isTempFile: false,
          hasSizeOrMtimeChanged: false,
          isMtimeNewer: false,
        },
      };
    }

    // 3. Must be a regular file with non-zero size
    if (stat.isDir) {
      return {
        status: 'UNKNOWN',
        error: `Render target '${normalized}' is a directory, not a file.`,
      };
    }

    if (stat.size <= 0) {
      return {
        status: 'UNKNOWN',
        error: `Render output file '${normalized}' has 0 bytes (empty file).`,
        details: {
          fileExists: true,
          currentSize: stat.size,
          currentMtime: stat.modified,
          isTempFile: false,
          hasSizeOrMtimeChanged: false,
          isMtimeNewer: false,
        },
      };
    }

    const skewTolerance = options?.clockSkewToleranceMs ?? 2000;
    const minAcceptableMtime = baseline.renderAttemptStartTime - skewTolerance;

    // 4. Verify modification timestamp freshness
    const isMtimeNewer = stat.modified >= minAcceptableMtime;
    if (!isMtimeNewer) {
      return {
        status: 'UNKNOWN',
        error: `Output file timestamp (${stat.modified}) is older than render attempt (${baseline.renderAttemptStartTime}). Pre-existing old file.`,
        details: {
          fileExists: true,
          currentSize: stat.size,
          currentMtime: stat.modified,
          isTempFile: false,
          hasSizeOrMtimeChanged: false,
          isMtimeNewer: false,
        },
      };
    }

    // 5. If file existed before, verify that size or timestamp genuinely changed
    if (baseline.existedBefore) {
      const sizeChanged = stat.size !== baseline.previousSize;
      const mtimeChanged = stat.modified > baseline.previousMtime;

      if (!sizeChanged && !mtimeChanged) {
        return {
          status: 'UNKNOWN',
          error: `Output file size and timestamp unchanged since render attempt start.`,
          details: {
            fileExists: true,
            currentSize: stat.size,
            currentMtime: stat.modified,
            isTempFile: false,
            hasSizeOrMtimeChanged: false,
            isMtimeNewer: true,
          },
        };
      }
    }

    // 6. Confirmed verified output file
    return {
      status: 'VERIFIED',
      details: {
        fileExists: true,
        currentSize: stat.size,
        currentMtime: stat.modified,
        isTempFile: false,
        hasSizeOrMtimeChanged: true,
        isMtimeNewer: true,
      },
    };
  }
}
