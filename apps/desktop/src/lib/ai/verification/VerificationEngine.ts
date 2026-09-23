import type { NormalizedObservation, VerificationPredicate, VerificationResult, AppEntity } from './types';

export class VerificationEngineImpl {
  verify(observation: NormalizedObservation, predicate: VerificationPredicate): VerificationResult {
    try {
      if (observation.status === 'UNKNOWN' || observation.isStale) {
        return 'UNKNOWN';
      }

      const matches = this.findMatchingEntities(observation.entities, predicate);

      switch (predicate.operator) {
        case 'EXISTS':
          return matches.length > 0 ? 'VERIFIED' : 'NOT_VERIFIED';
        case 'COUNT':
          return matches.length === (predicate.value as number) ? 'VERIFIED' : 'NOT_VERIFIED';
        case 'GREATER_THAN':
          return matches.length > (predicate.value as number) ? 'VERIFIED' : 'NOT_VERIFIED';
        case 'GREATER_THAN_OR_EQUAL':
          return matches.length >= (predicate.value as number) ? 'VERIFIED' : 'NOT_VERIFIED';
        case 'LESS_THAN':
          return matches.length < (predicate.value as number) ? 'VERIFIED' : 'NOT_VERIFIED';
        case 'LESS_THAN_OR_EQUAL':
          return matches.length <= (predicate.value as number) ? 'VERIFIED' : 'NOT_VERIFIED';
        case 'EQUALS':
        case 'NOT_EQUALS':
        case 'MATCHES':
          // For property matching on existence
          if (matches.length === 0) return 'NOT_VERIFIED';
          
          if (predicate.property && predicate.value !== undefined) {
             const allMatch = matches.every(m => {
                const val = m.properties?.[predicate.property!];
                if (predicate.operator === 'EQUALS') return val === predicate.value;
                if (predicate.operator === 'NOT_EQUALS') return val !== predicate.value;
                if (predicate.operator === 'MATCHES') {
                   if (typeof val === 'string' && typeof predicate.value === 'string') {
                      return val.includes(predicate.value) || new RegExp(predicate.value).test(val);
                   }
                   return val === predicate.value;
                }
                return false;
             });
             return allMatch ? 'VERIFIED' : 'NOT_VERIFIED';
          }
          
          return 'VERIFIED';
        default:
          console.warn(`Unsupported predicate operator: ${predicate.operator}`);
          return 'NOT_VERIFIED';
      }
    } catch (err) {
      console.error('Verification evaluation failed:', err);
      return 'UNKNOWN';
    }
  }

  private findMatchingEntities(entities: AppEntity[], predicate: VerificationPredicate): AppEntity[] {
    return entities.filter(entity => {
      if (predicate.entityType) {
        const pType = predicate.entityType.toUpperCase();
        const eType = (entity.type || '').toUpperCase();

        let typeMatches = (eType === pType);
        if (!typeMatches) {
          if (pType === 'LAYER' && ['LAYER', 'TEXT', 'SOLID', 'SHAPE', 'FOOTAGE', 'NULL', 'CAMERA', 'LIGHT', 'AV'].includes(eType)) {
            typeMatches = true;
          } else if (pType === 'MESH' && ['MESH', 'CUBE', 'SPHERE', 'PLANE', 'CYLINDER', 'CONE', 'TORUS', 'GRID', 'OBJECT'].includes(eType)) {
            typeMatches = true;
          } else if (pType === 'OBJECT' && ['OBJECT', 'MESH', 'CAMERA', 'LIGHT', 'CURVE', 'ARMATURE', 'EMPTY', 'CUBE', 'SPHERE', 'PLANE', 'CYLINDER'].includes(eType)) {
            typeMatches = true;
          } else if (pType === 'DOCUMENT' && ['DOCUMENT', 'SCENE', 'PROJECT', 'COMPOSITION'].includes(eType)) {
            typeMatches = true;
          }
        }
        if (!typeMatches) {
          return false;
        }
      }
      if (predicate.entityName && entity.name !== predicate.entityName) {
        return false;
      }
      return true;
    });
  }
}

export const VerificationEngine = new VerificationEngineImpl();
