/**
 * Rezel 13.3.6 — Adobe Render Output Path Validator
 *
 * Dedicated deterministic output-path validation layer that guarantees safety,
 * canonical normalization, traversal prevention, format validation, and
 * strict integration with PathGuard filesystem authorization scope.
 */

import { PathGuard } from '../capabilities/providers/filesystem/PathGuard';

export type OutputPathValidationStatus =
  | 'OUTPUT_PATH_SUPPORTED'
  | 'INVALID_OUTPUT_PATH'
  | 'OUTPUT_PATH_NOT_AUTHORIZED';

export interface OutputPathValidationResult {
  readonly status: OutputPathValidationStatus;
  readonly normalizedPath?: string;
  readonly error?: string;
}

const SUPPORTED_EXTENSIONS = new Set([
  'mov',
  'mp4',
  'avi',
  'mkv',
  'm4v',
  'wmv',
  'png',
  'jpg',
  'jpeg',
  'exr',
  'dpx',
  'tif',
  'tiff',
  'wav',
  'aif',
  'aiff',
  'mp3',
  'm4a',
]);

export class RenderOutputPathValidator {
  /**
   * Deterministically validates an export/render destination path.
   * Distinguishes syntax/formatting errors from filesystem authorization failures.
   */
  static async validate(rawPath: string | null | undefined): Promise<OutputPathValidationResult> {
    // 1. Reject empty, null, or whitespace-only paths
    if (!rawPath || typeof rawPath !== 'string' || rawPath.trim().length === 0) {
      return {
        status: 'INVALID_OUTPUT_PATH',
        error: 'Output path cannot be empty or whitespace.',
      };
    }

    const trimmed = rawPath.trim();

    // 2. Reject control characters and null bytes
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      return {
        status: 'INVALID_OUTPUT_PATH',
        error: 'Output path contains invalid control characters.',
      };
    }

    // 3. Reject directory traversal attempts
    if (trimmed.includes('..')) {
      return {
        status: 'INVALID_OUTPUT_PATH',
        error: "Path traversal ('..') is strictly prohibited.",
      };
    }

    // 4. Normalize path separators to forward slashes
    let normalized = trimmed.replace(/\\/g, '/');

    // 5. Must be an absolute path (Windows drive letter C:/ or Unix root /)
    const isWindowsAbsolute = /^[a-zA-Z]:\//.test(normalized);
    const isUnixAbsolute = normalized.startsWith('/');
    if (!isWindowsAbsolute && !isUnixAbsolute) {
      return {
        status: 'INVALID_OUTPUT_PATH',
        error: 'Output path must be an absolute path with a valid filesystem root.',
      };
    }

    // 6. Verify filename and extension
    const lastSlash = normalized.lastIndexOf('/');
    const fileName = normalized.substring(lastSlash + 1);
    if (!fileName || fileName.length === 0) {
      return {
        status: 'INVALID_OUTPUT_PATH',
        error: 'Output path must target a filename, not a directory.',
      };
    }

    // Reject illegal characters in filename portion on Windows (<>:"|?*)
    if (/[<>:"|?*]/.test(fileName)) {
      return {
        status: 'INVALID_OUTPUT_PATH',
        error: 'Filename portion contains illegal characters (<>:"|?*).',
      };
    }

    // Validate extension
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1 || lastDot === fileName.length - 1) {
      return {
        status: 'INVALID_OUTPUT_PATH',
        error: 'Output path missing valid file extension.',
      };
    }

    const ext = fileName.substring(lastDot + 1).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return {
        status: 'INVALID_OUTPUT_PATH',
        error: `Unsupported render output extension '.${ext}'.`,
      };
    }

    // 7. Verify allowed filesystem scope via PathGuard (Authorization check)
    try {
      await PathGuard.validate(normalized, 'WRITE');
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      return {
        status: 'OUTPUT_PATH_NOT_AUTHORIZED',
        normalizedPath: normalized,
        error: errMsg.includes('[Rezel Security]') ? errMsg : `Output path not authorized: ${errMsg}`,
      };
    }

    return {
      status: 'OUTPUT_PATH_SUPPORTED',
      normalizedPath: normalized,
    };
  }

  /**
   * Synchronous basic syntax check without async PathGuard resolution (for fast validation)
   */
  static validateSyntax(rawPath: string | null | undefined): OutputPathValidationResult {
    if (!rawPath || typeof rawPath !== 'string' || rawPath.trim().length === 0) {
      return { status: 'INVALID_OUTPUT_PATH', error: 'Output path cannot be empty or whitespace.' };
    }
    const trimmed = rawPath.trim();
    if (/[\x00-\x1F\x7F]/.test(trimmed)) {
      return { status: 'INVALID_OUTPUT_PATH', error: 'Output path contains invalid control characters.' };
    }
    if (trimmed.includes('..')) {
      return { status: 'INVALID_OUTPUT_PATH', error: "Path traversal ('..') is strictly prohibited." };
    }
    const normalized = trimmed.replace(/\\/g, '/');
    const isWindowsAbsolute = /^[a-zA-Z]:\//.test(normalized);
    const isUnixAbsolute = normalized.startsWith('/');
    if (!isWindowsAbsolute && !isUnixAbsolute) {
      return { status: 'INVALID_OUTPUT_PATH', error: 'Output path must be an absolute path.' };
    }
    const lastSlash = normalized.lastIndexOf('/');
    const fileName = normalized.substring(lastSlash + 1);
    if (!fileName || fileName.length === 0 || /[<>:"|?*]/.test(fileName)) {
      return { status: 'INVALID_OUTPUT_PATH', error: 'Invalid filename portion.' };
    }
    const lastDot = fileName.lastIndexOf('.');
    if (lastDot === -1 || lastDot === fileName.length - 1) {
      return { status: 'INVALID_OUTPUT_PATH', error: 'Missing file extension.' };
    }
    const ext = fileName.substring(lastDot + 1).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      return { status: 'INVALID_OUTPUT_PATH', error: `Unsupported extension '.${ext}'.` };
    }
    return { status: 'OUTPUT_PATH_SUPPORTED', normalizedPath: normalized };
  }
}
