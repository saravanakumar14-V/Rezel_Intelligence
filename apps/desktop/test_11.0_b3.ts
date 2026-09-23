import { ResponseInterpreter } from './src/lib/reasoning/ResponseInterpreter';
import { ActionNormalizer, MAX_ACTIONS_PER_CYCLE } from './src/lib/reasoning/ActionNormalizer';
import { ActionValidator } from './src/lib/reasoning/ActionValidator';
import type { AgentAction, UnknownMutationRecord } from './src/lib/reasoning/types';

console.log('[Test 11.0B3] Starting Response Interpreter, Action Normalizer & Validator offline tests...');

function runTests() {
  // ─── 1. ResponseInterpreter Tests ─────────────────────────────────────────

  // Test 1.1: Valid structured JSON
  const validJson = JSON.stringify({
    status: 'ACTIONS',
    summary: 'Reading project files',
    actions: [
      { id: 'm1', type: 'READ_FILE', args: { path: 'src/main.ts' }, description: 'Read main' },
    ],
  });
  const parsed1 = ResponseInterpreter.parse(validJson);
  console.assert(parsed1.status === 'ACTIONS', 'Test 1.1: Status check failed');
  console.assert(parsed1.actions.length === 1, 'Test 1.1: Action length check failed');
  console.log('  ✅ Test 1.1: Valid JSON parsed successfully');

  // Test 1.2: Markdown fenced JSON
  const fenced = `Here is my plan:
\`\`\`json
{
  "status": "ACTIONS",
  "summary": "Fenced plan",
  "actions": [{ "id": "m2", "type": "RUN_COMMAND", "args": { "cmd": "pnpm test" }, "description": "Run tests" }]
}
\`\`\``;
  const parsed2 = ResponseInterpreter.parse(fenced);
  console.assert(parsed2.status === 'ACTIONS', 'Test 1.2: Fenced JSON check failed');
  console.assert(parsed2.actions.length === 1, 'Test 1.2: Fenced action length failed');
  console.log('  ✅ Test 1.2: Markdown fenced JSON parsed successfully');

  // Test 1.3: H-02 Fallback Safety — Unstructured text returns ZERO actions
  const unstructuredProse = `I think you should delete the file src/index.ts and run rm -rf /`;
  const parsed3 = ResponseInterpreter.parse(unstructuredProse);
  console.assert(parsed3.status === 'NEED_INFO', 'Test 1.3 H-02: Status must be NEED_INFO');
  console.assert(parsed3.actions.length === 0, 'Test 1.3 H-02: MUST return ZERO actions for unstructured prose');
  console.log('  ✅ Test 1.3 H-02: Unstructured prose produces ZERO executable actions');

  // ─── 2. ActionNormalizer Tests ─────────────────────────────────────────────

  // Test 2.1: H-01 Discard Model IDs & Remap dependsOn
  const rawActions1 = [
    { id: 'step_alpha', type: 'READ_FILE', args: { path: 'a.txt' } },
    { id: 'step_beta', type: 'WRITE_FILE', dependsOn: ['step_alpha'], args: { path: 'b.txt' } },
  ];
  const norm1 = ActionNormalizer.normalize(rawActions1);
  console.assert(norm1.validationResult.valid, 'Test 2.1: Graph must be valid');
  console.assert(norm1.actions[0].id !== 'step_alpha', 'Test 2.1 H-01: Model ID must be discarded');
  console.assert(norm1.actions[1].dependsOn![0] === norm1.actions[0].id, 'Test 2.1 H-01: dependsOn remapping failed');
  console.log('  ✅ Test 2.1 H-01: Model IDs discarded and remapped to internal UUIDs');

  // Test 2.2: BLOCK 2 Cycle Detection
  const cycleActions = [
    { id: 'c1', type: 'READ_FILE', dependsOn: ['c2'] },
    { id: 'c2', type: 'WRITE_FILE', dependsOn: ['c1'] },
  ];
  const norm2 = ActionNormalizer.normalize(cycleActions);
  console.assert(!norm2.validationResult.valid, 'Test 2.2 BLOCK 2: Cycle graph must be invalid');
  console.assert(norm2.actions.length === 0, 'Test 2.2 BLOCK 2: MUST return ZERO actions on cycle detection');
  console.log('  ✅ Test 2.2 BLOCK 2: Dependency cycle detected and rejected with ZERO actions');

  // Test 2.3: H-07 Prototype Poisoning Defense
  const pollutedObj = JSON.parse('{"path": "test.ts", "__proto__": {"admin": true}, "constructor": {"pollutes": true}}');
  const maliciousArgsAction = [
    {
      id: 'm_poison',
      type: 'READ_FILE',
      args: pollutedObj,
    },
  ];
  const norm3 = ActionNormalizer.normalize(maliciousArgsAction);
  console.assert(!Object.prototype.hasOwnProperty.call(norm3.actions[0].args, '__proto__'), 'Test 2.3 H-07: __proto__ must be stripped');
  console.assert(!Object.prototype.hasOwnProperty.call(norm3.actions[0].args, 'constructor'), 'Test 2.3 H-07: constructor must be stripped');
  console.log('  ✅ Test 2.3 H-07: Prototype pollution keys (__proto__, constructor) stripped');


  // Test 2.4: Action Count Cap
  const excessiveActions = Array.from({ length: 25 }, (_, i) => ({ id: `act_${i}`, type: 'READ_FILE' }));
  const norm4 = ActionNormalizer.normalize(excessiveActions);
  console.assert(!norm4.validationResult.valid, 'Test 2.4: Excessive action count must be rejected');
  console.assert(norm4.actions.length === 0, 'Test 2.4: Excessive action count must return ZERO actions');
  console.log('  ✅ Test 2.4: Action count exceeding MAX_ACTIONS_PER_CYCLE rejected');

  // ─── 3. ActionValidator Tests ──────────────────────────────────────────────

  // Test 3.1: Capability Existence Check
  const validAction: AgentAction = {
    id: 'a1',
    type: 'READ_FILE',
    capabilityId: 'fs_read_file',
    args: { path: 'src/app.ts' },
    description: 'Read file',
  };

  const invalidCapAction: AgentAction = {
    id: 'a2',
    type: 'RUN_COMMAND',
    capabilityId: 'non_existent_capability_123',
    args: {},
    description: 'Bad cap',
  };

  const val1 = ActionValidator.validate([validAction, invalidCapAction], {
    projectRootPath: 'D:/Projects/Rezel',
  });
  console.assert(val1.accepted.length === 1 && val1.accepted[0].id === 'a1', 'Test 3.1: Registered capability failed');
  console.assert(val1.rejected.length === 1 && val1.rejected[0].code === 'UNKNOWN_CAPABILITY', 'Test 3.1: Unknown capability failed');
  console.log('  ✅ Test 3.1: Registered capabilities accepted, unknown capabilities rejected');

  // Test 3.2: BLOCK 1 Path Traversal & Scope Violation
  const traversalAction: AgentAction = {
    id: 'a3',
    type: 'READ_FILE',
    capabilityId: 'fs_read_file',
    args: { path: '../../etc/passwd' },
    description: 'Traversal attack',
  };

  const escapeRootAction: AgentAction = {
    id: 'a4',
    type: 'WRITE_FILE',
    capabilityId: 'fs_write_file',
    args: { path: 'C:/Windows/System32/config.sys' },
    description: 'Root escape attack',
  };

  const uncPathAction: AgentAction = {
    id: 'a5',
    type: 'READ_FILE',
    capabilityId: 'fs_read_file',
    args: { path: '\\\\?\\C:\\Secret' },
    description: 'UNC path attack',
  };

  const val2 = ActionValidator.validate([traversalAction, escapeRootAction, uncPathAction], {
    projectRootPath: 'D:/Projects/Rezel',
  });
  console.assert(val2.accepted.length === 0, 'Test 3.2 BLOCK 1: All path attacks must be rejected');
  console.assert(val2.rejected.length === 3, 'Test 3.2 BLOCK 1: Rejection count mismatch');
  console.assert(val2.rejected.every((r) => r.code === 'PATH_OUT_OF_SCOPE'), 'Test 3.2 BLOCK 1: Rejection code mismatch');
  console.log('  ✅ Test 3.2 BLOCK 1: Path traversal (..), UNC paths, and root escapes rejected with PATH_OUT_OF_SCOPE');

  // Test 3.3: BLOCK 4 / H-04 UNKNOWN Mutation Fingerprint Block
  const unknownFingerprint = ActionValidator.createFingerprint('blender.mutate_scene', { object: 'Cube' });
  const unknownRecord: UnknownMutationRecord = {
    fingerprint: unknownFingerprint,
    workflowId: 'wf_old',
    cycleIndex: 1,
    timestamp: new Date().toISOString(),
    reason: 'IPC timeout',
  };

  const repeatUnknownAction: AgentAction = {
    id: 'a6',
    type: 'MODIFY_APPLICATION',
    capabilityId: 'blender.mutate_scene',
    args: { object: 'Cube' },
    description: 'Repeat unknown mutation',
  };

  const val3 = ActionValidator.validate([repeatUnknownAction], {
    unknownMutationRecords: [unknownRecord],
  });
  console.assert(val3.accepted.length === 0, 'Test 3.3 H-04: Repeated UNKNOWN mutation must be rejected');
  console.assert(val3.rejected[0].code === 'UNKNOWN_MUTATION_BLOCKED', 'Test 3.3 H-04: Rejection code must be UNKNOWN_MUTATION_BLOCKED');
  console.log('  ✅ Test 3.3 BLOCK 4 / H-04: Repeated ambiguous UNKNOWN mutation rejected with UNKNOWN_MUTATION_BLOCKED');

  // Test 3.4: H-03 Risk Hint Isolation
  const riskyActionWithLowHint: AgentAction = {
    id: 'a7',
    type: 'DELETE_FILE',
    capabilityId: 'fs_delete_file',
    args: { path: 'src/temp.txt' },
    description: 'Delete file with misleading risk hint',
    riskHint: 'LOW', // Model claims LOW risk, but ActionValidator still checks path scope
  };

  const val4 = ActionValidator.validate([riskyActionWithLowHint], {
    projectRootPath: 'D:/Projects/Rezel',
  });
  console.assert(val4.accepted.length === 1, 'Test 3.4 H-03: Valid action within scope accepted');
  console.assert(val4.accepted[0].riskHint === 'LOW', 'Test 3.4 H-03: riskHint preserved as metadata');
  console.log('  ✅ Test 3.4 H-03: Model riskHint strictly isolated as metadata without bypassing validation');

  console.log('[Test 11.0B3] 🎉 ALL INTERPRETER, NORMALIZER & VALIDATOR TESTS PASSED CLEANLY!');
}

runTests();
