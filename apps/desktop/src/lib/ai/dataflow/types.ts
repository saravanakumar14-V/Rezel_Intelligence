/**
 * Rezel 11.4B — Runtime Variables, Step Outputs & Workflow Data Flow Types
 *
 * Defines contracts for typed runtime variables, step outputs, variable provenance,
 * input bindings, dependency graphs, and classified data-flow errors.
 */

export type VariableType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';

export type VariableSourceType = 'PARAMETER' | 'STEP_OUTPUT' | 'WORKFLOW_VARIABLE' | 'SYSTEM';

export interface VariableProvenance {
  readonly workflowId: string;
  readonly stepId?: string;
  readonly sourceType: VariableSourceType;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface WorkflowVariable {
  readonly name: string;
  readonly type: VariableType;
  readonly value: unknown;
  readonly source: VariableProvenance;
  readonly isSensitive?: boolean;
}

export interface WorkflowStepOutputDefinition {
  readonly name: string;
  readonly type: VariableType;
  readonly description?: string;
  readonly isSensitive?: boolean;
}

export type DataFlowErrorCode =
  | 'VARIABLE_NOT_FOUND'
  | 'VARIABLE_TYPE_MISMATCH'
  | 'INVALID_BINDING'
  | 'OUTPUT_NOT_AVAILABLE'
  | 'OUTPUT_SOURCE_FAILED'
  | 'OUTPUT_SOURCE_UNKNOWN'
  | 'CIRCULAR_DATA_DEPENDENCY'
  | 'SENSITIVE_VALUE_EXPOSURE';

export class DataFlowError extends Error {
  readonly code: DataFlowErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: DataFlowErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[DataFlow::${code}] ${message}`);
    this.name = 'DataFlowError';
    this.code = code;
    this.details = details;
  }
}

export interface DataDependencyGraph {
  readonly steps: string[];
  readonly dataDependencies: Map<string, Set<string>>; // consumerStepId -> Set of producerStepIds
  readonly circularDependencies: string[][]; // Cycles detected if any
}

export interface DataFlowPreview {
  readonly declaredOutputs: Record<string, WorkflowStepOutputDefinition[]>;
  readonly bindings: Record<string, Record<string, string>>;
  readonly dataDependencies: Record<string, string[]>;
  readonly hasCycles: boolean;
  readonly cycles: string[][];
}
