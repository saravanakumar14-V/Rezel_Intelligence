import type {
  ReasoningProviderType,
  ReasoningProviderConfig,
  ReasoningSessionStatus,
  ReasoningWorkflowAssociationStatus,
  MutationFingerprint,
  UnknownMutationRecord,
  RejectionCode,
  ActionGraphValidationResult,
  ApprovalPolicyLevel,
  ApprovalPolicyConfig,
  ReasoningSessionRecord,
} from './src/lib/reasoning/types';

import type {
  ReasoningChannelType,
  ReasoningChannelAdapter,
} from './src/lib/reasoning/channels/types';

console.log('[Test 11.0B1] Starting type contract verification...');

// 1. Verify Provider Types
const providerTypes: ReasoningProviderType[] = ['OPENAI', 'GEMINI', 'QWEN', 'LOCAL', 'CUSTOM'];
console.assert(providerTypes.length === 5, 'ReasoningProviderType missing values');

const mockConfig: ReasoningProviderConfig = {
  id: 'test_provider',
  type: 'GEMINI',
  displayName: 'Test Gemini',
  maxContextTokens: 100000,
  supportsStructuredOutput: true,
  supportsStreaming: true,
  costTier: 'LOW',
  priority: 1,
};
console.assert(mockConfig.type === 'GEMINI', 'ReasoningProviderConfig instantiation failed');

// 2. Verify Session & Workflow Association Statuses
const sessionStatuses: ReasoningSessionStatus[] = [
  'INITIALIZED',
  'REASONING',
  'INTERPRETING',
  'EXECUTING',
  'OBSERVING',
  'AWAITING_APPROVAL',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'BUDGET_EXHAUSTED',
  'RECOVERY_REQUIRED',
];
console.assert(sessionStatuses.length === 11, 'ReasoningSessionStatus missing values');

const assocStatuses: ReasoningWorkflowAssociationStatus[] = [
  'NONE',
  'PENDING',
  'STARTED',
  'COMPLETED',
  'FAILED',
  'RECOVERY_REQUIRED',
];
console.assert(assocStatuses.length === 6, 'ReasoningWorkflowAssociationStatus missing values');

// 3. Verify UNKNOWN Mutation Fingerprint Contract
const mockFingerprint: MutationFingerprint = {
  capabilityId: 'blender.mutate_scene',
  canonicalArgs: { object: 'Cube', action: 'delete' },
  hash: 'abc123hash',
};

const mockUnknownRecord: UnknownMutationRecord = {
  fingerprint: mockFingerprint,
  workflowId: 'wf_123',
  cycleIndex: 1,
  timestamp: new Date().toISOString(),
  reason: 'Blender IPC timeout',
};
console.assert(mockUnknownRecord.fingerprint.hash === 'abc123hash', 'UnknownMutationRecord verification failed');

// 4. Verify Dependency Graph & Action Rejection Types
const rejectionCodes: RejectionCode[] = [
  'UNKNOWN_ACTION',
  'UNKNOWN_CAPABILITY',
  'INVALID_ARGUMENTS',
  'PATH_OUT_OF_SCOPE',
  'DEPENDENCY_ERROR',
  'DUPLICATE_ACTION_ID',
  'SECURITY_VALIDATION_FAILED',
  'UNKNOWN_MUTATION_BLOCKED',
];
console.assert(rejectionCodes.length === 8, 'RejectionCode enum missing values');

const graphValidation: ActionGraphValidationResult = {
  valid: false,
  reason: 'Circular dependency detected',
  cycleNodes: ['act_1', 'act_2'],
};
console.assert(graphValidation.valid === false, 'ActionGraphValidationResult check failed');

// 5. Verify Channel Adapter Abstraction
const mockAdapter: ReasoningChannelAdapter = {
  channelType: 'DIRECT_API',
  priority: 1,
  async isAvailable() { return true; },
  async sendAndReceive() {
    return {
      raw: '{}',
      tokenUsage: { input: 10, output: 20 },
      latencyMs: 100,
      providerId: 'test_provider',
    };
  },
};
console.assert(mockAdapter.channelType === 'DIRECT_API', 'ReasoningChannelAdapter contract failed');

// 6. Verify Approval Policy Level (ApprovalPolicy != PolicyEngine)
const approvalLevels: ApprovalPolicyLevel[] = ['SUPERVISED', 'BALANCED', 'AUTONOMOUS'];
const policyConfig: ApprovalPolicyConfig = {
  level: 'AUTONOMOUS',
  maxConsecutiveAutoCycles: 5,
};
console.assert(policyConfig.level === 'AUTONOMOUS', 'ApprovalPolicyConfig check failed');

// 7. Verify Sanitized Persistence Contract
const mockSessionRecord: ReasoningSessionRecord = {
  sessionId: 'sess_1001',
  goal: 'Create city in Blender',
  providerId: 'gemini-3.6',
  status: 'REASONING',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  maxCycles: 10,
  maxTotalTokens: 500000,
  timeoutMs: 600000,
  currentCycle: 1,
  totalTokensUsed: 1500,
  elapsedMs: 2500,
  cycles: [],
  approvalPolicy: 'BALANCED',
  workflowId: 'wf_999',
  associationStatus: 'PENDING',
};
console.assert(mockSessionRecord.associationStatus === 'PENDING', 'ReasoningSessionRecord check failed');

console.log('[Test 11.0B1] ✅ All type contracts and interfaces verified successfully!');
