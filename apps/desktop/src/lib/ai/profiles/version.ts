/**
 * Rezel 13.2.1 — Application Profile Version Matching Engine
 *
 * Deterministic, standalone semver and version range compatibility resolver.
 * Evaluates whether a target application version matches a declared ApplicationProfile versionRange.
 */

import type { ProfileResolutionStatus } from './types';

export interface ParsedVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease?: string;
  readonly raw: string;
}

/**
 * Parses a semantic version string (e.g. "1.2.3", "v11.0.22621.1", "10.0.0-beta.1") into structured components.
 */
export function parseSemver(versionStr: string): ParsedVersion | null {
  if (!versionStr || typeof versionStr !== 'string') return null;
  const clean = versionStr.trim().replace(/^v/i, '');
  if (!clean) return null;

  // Match major.minor.patch or major.minor or major
  const match = clean.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;

  const major = parseInt(match[1], 10);
  const minor = match[2] !== undefined ? parseInt(match[2], 10) : 0;
  const patch = match[3] !== undefined ? parseInt(match[3], 10) : 0;
  const prerelease = match[4];

  return {
    major: isNaN(major) ? 0 : major,
    minor: isNaN(minor) ? 0 : minor,
    patch: isNaN(patch) ? 0 : patch,
    prerelease,
    raw: clean,
  };
}

/**
 * Compares two parsed versions.
 * Returns:
 *  -1 if v1 < v2
 *   0 if v1 === v2
 *   1 if v1 > v2
 */
export function compareVersions(v1: ParsedVersion, v2: ParsedVersion): number {
  if (v1.major !== v2.major) return v1.major > v2.major ? 1 : -1;
  if (v1.minor !== v2.minor) return v1.minor > v2.minor ? 1 : -1;
  if (v1.patch !== v2.patch) return v1.patch > v2.patch ? 1 : -1;
  return 0;
}

/**
 * Evaluates a single version constraint token (e.g. ">=10.0.0", "^1.2.0", "~1.0.0", "<12.0.0", "11.x", "*").
 */
function evaluateToken(version: ParsedVersion, token: string): boolean {
  const t = token.trim();
  if (!t || t === '*' || t === 'any' || t.toLowerCase() === 'x') {
    return true;
  }

  // Wildcards: e.g. "11.*", "11.x", "11.2.*"
  if (t.includes('*') || t.toLowerCase().includes('x')) {
    const parts = t.split('.');
    if (parts[0] !== '*' && parts[0].toLowerCase() !== 'x') {
      if (version.major !== parseInt(parts[0], 10)) return false;
    }
    if (parts.length > 1 && parts[1] !== '*' && parts[1].toLowerCase() !== 'x') {
      if (version.minor !== parseInt(parts[1], 10)) return false;
    }
    if (parts.length > 2 && parts[2] !== '*' && parts[2].toLowerCase() !== 'x') {
      if (version.patch !== parseInt(parts[2], 10)) return false;
    }
    return true;
  }

  // Caret ranges: ^1.2.3 -> >=1.2.3 <2.0.0
  if (t.startsWith('^')) {
    const base = parseSemver(t.slice(1));
    if (!base) return false;
    if (compareVersions(version, base) < 0) return false;
    if (base.major > 0) {
      return version.major === base.major;
    }
    if (base.minor > 0) {
      return version.minor === base.minor;
    }
    return version.patch === base.patch;
  }

  // Tilde ranges: ~1.2.3 -> >=1.2.3 <1.3.0
  if (t.startsWith('~')) {
    const base = parseSemver(t.slice(1));
    if (!base) return false;
    if (compareVersions(version, base) < 0) return false;
    return version.major === base.major && version.minor === base.minor;
  }

  // Greater than or equal
  if (t.startsWith('>=')) {
    const base = parseSemver(t.slice(2));
    return base ? compareVersions(version, base) >= 0 : false;
  }

  // Greater than
  if (t.startsWith('>')) {
    const base = parseSemver(t.slice(1));
    return base ? compareVersions(version, base) > 0 : false;
  }

  // Less than or equal
  if (t.startsWith('<=')) {
    const base = parseSemver(t.slice(2));
    return base ? compareVersions(version, base) <= 0 : false;
  }

  // Less than
  if (t.startsWith('<')) {
    const base = parseSemver(t.slice(1));
    return base ? compareVersions(version, base) < 0 : false;
  }

  // Equals
  if (t.startsWith('=')) {
    const base = parseSemver(t.slice(1));
    return base ? compareVersions(version, base) === 0 : false;
  }

  // Direct version equality
  const direct = parseSemver(t);
  if (direct) {
    return compareVersions(version, direct) === 0;
  }

  return version.raw === t;
}

/**
 * Checks whether an application version matches a declared versionRange expression.
 * Supports compound ranges separated by space (AND), e.g. ">=10.0.0 <12.0.0".
 */
export function satisfiesVersionRange(appVersion: string, versionRange?: string): boolean {
  if (!versionRange || versionRange === '*' || versionRange === 'any') {
    return true;
  }

  const parsedApp = parseSemver(appVersion);
  if (!parsedApp) {
    // If it cannot be parsed as semver, do string match
    return appVersion.trim() === versionRange.trim();
  }

  // Tokens separated by spaces are AND-ed together
  const tokens = versionRange.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  return tokens.every((token) => evaluateToken(parsedApp, token));
}

/**
 * Resolves the specific ProfileResolutionStatus for a given version query against a profile's declared range.
 */
export function resolveVersionStatus(
  queriedVersion?: string,
  declaredRange?: string
): ProfileResolutionStatus {
  if (!queriedVersion || queriedVersion === 'unknown') {
    return 'UNKNOWN_VERSION';
  }

  if (!declaredRange || declaredRange === '*' || declaredRange === 'any') {
    return 'COMPATIBLE';
  }

  const cleanQuery = queriedVersion.trim().replace(/^v/i, '');
  const cleanRange = declaredRange.trim().replace(/^v/i, '');

  // Exact literal equality
  if (cleanQuery === cleanRange || cleanRange === `=${cleanQuery}`) {
    return 'EXACT_MATCH';
  }

  const matches = satisfiesVersionRange(queriedVersion, declaredRange);
  if (!matches) {
    return 'NO_MATCH';
  }

  // If matches and query matches the exact semver target of a simple version range
  const parsedQ = parseSemver(queriedVersion);
  const parsedR = parseSemver(declaredRange);
  if (parsedQ && parsedR && compareVersions(parsedQ, parsedR) === 0 && !declaredRange.startsWith('^') && !declaredRange.startsWith('~') && !declaredRange.startsWith('>')) {
    return 'EXACT_MATCH';
  }

  return 'COMPATIBLE';
}
