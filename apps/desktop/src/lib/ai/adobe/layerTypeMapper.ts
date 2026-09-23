/**
 * REZEL 13.3.2 — Adobe Layer Type Mapper
 *
 * Deterministically maps raw Adobe After Effects / ExtendScript layer type
 * identifiers to the canonical `AdobeLayerType` semantic enum.
 *
 * MAPPING MATRIX:
 * ┌─────────────────────────────────────────────────────────────┬─────────────────┐
 * │ Adobe Native Type / ExtendScript Identifier                 │ Semantic Type   │
 * ├─────────────────────────────────────────────────────────────┼─────────────────┤
 * │ 'TEXT', 'text', 'TextLayer', 'text_layer', 'AVTextLayer'    │ TEXT            │
 * │ 'SHAPE', 'shape', 'ShapeLayer', 'shape_layer'               │ SHAPE           │
 * │ 'SOLID', 'solid', 'SolidLayer', 'solid_layer', 'solidSource'│ SOLID           │
 * │ 'FOOTAGE', 'footage', 'FootageLayer', 'footage_layer', 'AV' │ FOOTAGE         │
 * │ 'PRECOMP', 'precomp', 'CompLayer', 'composition', 'comp'   │ PRECOMP         │
 * │ 'NULL', 'null', 'NullLayer', 'null_layer' (nullLayer: true) │ NULL            │
 * │ CameraLayer, LightLayer, GuideLayer, Unknown, Malformed     │ UNKNOWN         │
 * └─────────────────────────────────────────────────────────────┴─────────────────┘
 *
 * Invariant: Never infer a layer's type solely from its user-facing name.
 */

import type { AdobeLayerType } from './types';

export function mapAdobeLayerType(
  rawType: unknown,
  rawLayer?: Record<string, unknown>
): AdobeLayerType {
  // 1. Check explicit null layer indicator on raw object
  if (rawLayer && typeof rawLayer === 'object') {
    if (rawLayer.nullLayer === true || rawLayer.isNull === true) {
      return 'NULL';
    }
  }

  // 2. Check string type identifiers
  if (typeof rawType === 'string') {
    const normalized = rawType.trim().toUpperCase();

    // Text layers
    if (
      normalized === 'TEXT' ||
      normalized === 'TEXTLAYER' ||
      normalized === 'TEXT_LAYER' ||
      normalized === 'AVTEXTLAYER' ||
      normalized === 'SOURCE_TEXT'
    ) {
      return 'TEXT';
    }

    // Shape layers
    if (
      normalized === 'SHAPE' ||
      normalized === 'SHAPELAYER' ||
      normalized === 'SHAPE_LAYER' ||
      normalized === 'VECTOR'
    ) {
      return 'SHAPE';
    }

    // Solid layers
    if (
      normalized === 'SOLID' ||
      normalized === 'SOLIDLAYER' ||
      normalized === 'SOLID_LAYER' ||
      normalized === 'SOLIDSOURCE' ||
      normalized === 'SOLID_SOURCE'
    ) {
      return 'SOLID';
    }

    // Footage layers
    if (
      normalized === 'FOOTAGE' ||
      normalized === 'FOOTAGELAYER' ||
      normalized === 'FOOTAGE_LAYER' ||
      normalized === 'IMAGE' ||
      normalized === 'VIDEO' ||
      normalized === 'AUDIO'
    ) {
      return 'FOOTAGE';
    }

    // Precomposition layers
    if (
      normalized === 'PRECOMP' ||
      normalized === 'PRECOMPOSITION' ||
      normalized === 'COMPLAYER' ||
      normalized === 'COMP_LAYER' ||
      normalized === 'COMP' ||
      normalized === 'COMPOSITION'
    ) {
      return 'PRECOMP';
    }

    // Null layers
    if (
      normalized === 'NULL' ||
      normalized === 'NULLLAYER' ||
      normalized === 'NULL_LAYER'
    ) {
      return 'NULL';
    }
  }

  // 3. Fallback check on structural properties of rawLayer (without name guessing)
  if (rawLayer && typeof rawLayer === 'object') {
    if ('sourceText' in rawLayer || 'text' in rawLayer) {
      return 'TEXT';
    }
    if ('solidColor' in rawLayer || 'isSolid' in rawLayer) {
      return 'SOLID';
    }
  }

  // 4. Default: All unknown / future native types map strictly to UNKNOWN
  return 'UNKNOWN';
}
