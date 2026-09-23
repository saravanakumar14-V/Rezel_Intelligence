export type VerificationResult = 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN';

export interface AppEntity {
  id?: string;
  type: string;
  name?: string;
  properties?: Record<string, any>;
}

export interface NormalizedObservation {
  appId: string;
  sessionId?: string;
  timestamp: number;
  status: string;
  entities: AppEntity[];
  metadata: Record<string, any>;
  sourceCapability: string;
  executionId?: string;
  isStale?: boolean;
}

export type PredicateOperator =
  | 'EXISTS'
  | 'COUNT'
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'GREATER_THAN'
  | 'GREATER_THAN_OR_EQUAL'
  | 'LESS_THAN'
  | 'LESS_THAN_OR_EQUAL'
  | 'MATCHES';

export interface VerificationPredicate {
  operator: PredicateOperator;
  entityType?: string;
  entityName?: string;
  property?: string;
  value?: any;
}
