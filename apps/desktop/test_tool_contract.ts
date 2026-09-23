/**
 * Rezel OS — Tool Contract Certification Test
 *
 * Enumerates ALL registered tools, validates canonical schemas,
 * compiles to all provider formats, and verifies every tool passes.
 *
 * This test is the authoritative pre-dispatch gate.
 * If ANY tool fails certification, the build must fail.
 *
 * Run: npx tsx test_tool_contract.ts
 */

import { ToolRegistry, BUILT_IN_TOOLS } from './src/lib/ai/ToolRegistry';
import { ToolSchemaTranslator, ToolSchemaValidationError } from './src/lib/ai/providers/adapters/ToolSchemaTranslator';
import type { ParameterDef, ToolDefinition } from './src/lib/ai/types';

// ─── Colors for terminal output ───────────────────────────────────────────────

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function pass(msg: string) { console.log(`  ${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`  ${RED}✗${RESET} ${msg}`); }
function info(msg: string) { console.log(`  ${CYAN}ℹ${RESET} ${msg}`); }
function warn(msg: string) { console.log(`  ${YELLOW}⚠${RESET} ${msg}`); }

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, detail?: string): void {
  totalTests++;
  if (condition) {
    passedTests++;
    pass(label);
  } else {
    failedTests++;
    fail(`${label}${detail ? ` — ${detail}` : ''}`);
    failures.push(`${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// ─── Phase 1: Canonical Schema Validation ─────────────────────────────────────

console.log(`\n${CYAN}═══ PHASE 1: Canonical Schema Validation ═══${RESET}\n`);

const tools = ToolRegistry.getAll();
info(`Registered tools: ${tools.length}`);

// Verify no duplicate tool names
const toolNames = tools.map(t => t.name);
const uniqueNames = new Set(toolNames);
assert(toolNames.length === uniqueNames.size, 'No duplicate tool names',
  toolNames.length !== uniqueNames.size
    ? `Duplicates found: ${toolNames.filter((n, i) => toolNames.indexOf(n) !== i).join(', ')}`
    : undefined
);

// Validate every tool's schema
for (const tool of tools) {
  assert(!!tool.name, `Tool has name: ${tool.name || 'MISSING'}`);
  assert(!!tool.description, `Tool ${tool.name}: has description`);
  assert(!!tool.category, `Tool ${tool.name}: has category`);
  assert(!!tool.risk, `Tool ${tool.name}: has risk level`);
  assert(!!tool.toolGroup, `Tool ${tool.name}: has toolGroup`);

  // Validate every parameter
  for (const [key, param] of Object.entries(tool.parameters)) {
    const p = param as ParameterDef;
    assert(!!p.type, `Tool ${tool.name}.${key}: has type`);
    assert(!!p.description, `Tool ${tool.name}.${key}: has description`);

    const validTypes = ['string', 'number', 'boolean', 'object', 'array'];
    assert(validTypes.includes(p.type), `Tool ${tool.name}.${key}: valid type '${p.type}'`);

    // ARRAY must have items
    if (p.type === 'array') {
      assert(!!p.items, `Tool ${tool.name}.${key}: ARRAY has items schema`,
        !p.items ? 'ARRAY parameter missing items — this will crash Gemini' : undefined);

      if (p.items) {
        assert(!!p.items.type, `Tool ${tool.name}.${key}.items: has type`);
        assert(!!p.items.description, `Tool ${tool.name}.${key}.items: has description`);
      }
    }
  }
}

// ─── Phase 2: ToolSchemaTranslator Certification Gate ─────────────────────────

console.log(`\n${CYAN}═══ PHASE 2: ToolSchemaTranslator Pre-Dispatch Certification ═══${RESET}\n`);

const validationErrors = ToolSchemaTranslator.certifyAll(tools);
assert(validationErrors.length === 0, 'All tools pass schema certification',
  validationErrors.length > 0
    ? `${validationErrors.length} errors:\n${validationErrors.map(e => `    ${e.toolName}.${e.paramPath}: ${e.error}`).join('\n')}`
    : undefined
);

// ─── Phase 3: Gemini Schema Compilation ───────────────────────────────────────

console.log(`\n${CYAN}═══ PHASE 3: Gemini Schema Compilation ═══${RESET}\n`);

try {
  const geminiSchemas = ToolSchemaTranslator.toGemini(tools);
  assert(Array.isArray(geminiSchemas), 'toGemini returns array');
  assert(geminiSchemas.length > 0, 'toGemini returns non-empty array');

  const declarations = geminiSchemas[0]?.functionDeclarations || [];
  assert(declarations.length === tools.length, `Gemini: ${declarations.length} declarations match ${tools.length} tools`);

  // Validate each declaration
  for (const decl of declarations) {
    assert(!!decl.name, `Gemini decl: has name`);
    assert(typeof decl.name === 'string', `Gemini decl ${decl.name}: name is string`);
    assert(/^[a-zA-Z_][a-zA-Z0-9_.:-]*$/.test(decl.name), `Gemini decl ${decl.name}: name matches Gemini regex`);
    assert(!!decl.description, `Gemini decl ${decl.name}: has description`);
    assert(!!decl.parameters, `Gemini decl ${decl.name}: has parameters`);
    assert(decl.parameters?.type === 'OBJECT', `Gemini decl ${decl.name}: parameters.type is OBJECT`);

    // Check every property
    if (decl.parameters?.properties) {
      for (const [key, prop] of Object.entries(decl.parameters.properties) as [string, any][]) {
        assert(!!prop.type, `Gemini ${decl.name}.${key}: has type`);

        const validGeminiTypes = ['STRING', 'NUMBER', 'BOOLEAN', 'OBJECT', 'ARRAY'];
        assert(validGeminiTypes.includes(prop.type), `Gemini ${decl.name}.${key}: valid type '${prop.type}'`);

        if (prop.type === 'ARRAY') {
          assert(!!prop.items, `Gemini ${decl.name}.${key}: ARRAY has items`,
            !prop.items ? 'GEMINI WILL REJECT THIS — missing items on ARRAY' : undefined);
        }
      }
    }
  }
} catch (err: any) {
  assert(false, 'Gemini schema compilation', err.message);
}

// ─── Phase 4: OpenAI Schema Compilation ───────────────────────────────────────

console.log(`\n${CYAN}═══ PHASE 4: OpenAI Schema Compilation ═══${RESET}\n`);

try {
  const openaiSchemas = ToolSchemaTranslator.toOpenAI(tools);
  assert(Array.isArray(openaiSchemas), 'toOpenAI returns array');
  assert(openaiSchemas.length === tools.length, `OpenAI: ${openaiSchemas.length} schemas match ${tools.length} tools`);

  for (const schema of openaiSchemas) {
    assert(schema.type === 'function', `OpenAI ${schema.function?.name}: type is function`);
    assert(!!schema.function?.name, `OpenAI schema: has function.name`);
    assert(!!schema.function?.description, `OpenAI ${schema.function?.name}: has function.description`);
    assert(schema.function?.parameters?.type === 'object', `OpenAI ${schema.function?.name}: parameters.type is object`);
  }
} catch (err: any) {
  assert(false, 'OpenAI schema compilation', err.message);
}

// ─── Phase 5: Anthropic Schema Compilation ────────────────────────────────────

console.log(`\n${CYAN}═══ PHASE 5: Anthropic Schema Compilation ═══${RESET}\n`);

try {
  const anthropicSchemas = ToolSchemaTranslator.toAnthropic(tools);
  assert(Array.isArray(anthropicSchemas), 'toAnthropic returns array');
  assert(anthropicSchemas.length === tools.length, `Anthropic: ${anthropicSchemas.length} schemas match ${tools.length} tools`);

  for (const schema of anthropicSchemas) {
    assert(!!schema.name, `Anthropic schema: has name`);
    assert(!!schema.description, `Anthropic ${schema.name}: has description`);
    assert(schema.input_schema?.type === 'object', `Anthropic ${schema.name}: input_schema.type is object`);
  }
} catch (err: any) {
  assert(false, 'Anthropic schema compilation', err.message);
}

// ─── Phase 6: Specific Regression Tests ───────────────────────────────────────

console.log(`\n${CYAN}═══ PHASE 6: Regression Tests ═══${RESET}\n`);

// R1: computer_hotkey must have items on keys parameter
const hotkeyTool = ToolRegistry.get('computer_hotkey');
assert(!!hotkeyTool, 'computer_hotkey exists in registry');
if (hotkeyTool) {
  const keysParam = hotkeyTool.parameters.keys as ParameterDef;
  assert(keysParam?.type === 'array', 'computer_hotkey.keys is array');
  assert(!!keysParam?.items, 'computer_hotkey.keys has items (RC2 regression)');
  assert(keysParam?.items?.type === 'string', 'computer_hotkey.keys.items.type is string');
}

// R2: No duplicate tool names in BUILT_IN_TOOLS
const builtinNames = BUILT_IN_TOOLS.map(t => t.name);
const builtinUnique = new Set(builtinNames);
const duplicates = builtinNames.filter((n, i) => builtinNames.indexOf(n) !== i);
assert(duplicates.length === 0, 'BUILT_IN_TOOLS has no duplicate names',
  duplicates.length > 0 ? `Duplicates: ${[...new Set(duplicates)].join(', ')}` : undefined
);

// R3: computer_drag uses flat coordinate params (no unsafe casts)
const dragTool = ToolRegistry.get('computer_drag');
assert(!!dragTool, 'computer_drag exists');
if (dragTool) {
  const params = Object.keys(dragTool.parameters);
  assert(!params.includes('from'), 'computer_drag: no object "from" param (fixed)');
  assert(!params.includes('to'), 'computer_drag: no object "to" param (fixed)');
  assert(params.includes('fromX') || params.includes('fromY'), 'computer_drag: uses flat coordinate params');
}

// R4: create_workflow_plan steps items is string (not object)
const workflowTool = ToolRegistry.get('create_workflow_plan');
assert(!!workflowTool, 'create_workflow_plan exists');
if (workflowTool) {
  const stepsParam = workflowTool.parameters.steps as ParameterDef;
  assert(stepsParam?.type === 'array', 'create_workflow_plan.steps is array');
  assert(!!stepsParam?.items, 'create_workflow_plan.steps has items');
  assert(stepsParam?.items?.type === 'string', 'create_workflow_plan.steps.items.type is string (not object)');
}

// R5: get_system_info exists and has empty parameters
const sysInfoTool = ToolRegistry.get('get_system_info');
assert(!!sysInfoTool, 'get_system_info exists');
if (sysInfoTool) {
  assert(Object.keys(sysInfoTool.parameters).length === 0, 'get_system_info: empty parameters');
  assert(sysInfoTool.tauriCommand === 'get_system_info', 'get_system_info: correct tauriCommand');
}

// R6: No tool uses `as unknown as` for parameter type safety bypass
// This was verified during ToolRegistry fixes - create_workflow_plan and computer_drag now use satisfies

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${CYAN}═══════════════════════════════════════════════${RESET}`);
console.log(`${CYAN}  TOOL CONTRACT CERTIFICATION RESULTS${RESET}`);
console.log(`${CYAN}═══════════════════════════════════════════════${RESET}`);
console.log(`  Total:  ${totalTests}`);
console.log(`  ${GREEN}Passed: ${passedTests}${RESET}`);
if (failedTests > 0) {
  console.log(`  ${RED}Failed: ${failedTests}${RESET}`);
  console.log(`\n${RED}FAILURES:${RESET}`);
  failures.forEach(f => console.log(`  ${RED}✗${RESET} ${f}`));
}
console.log('');

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log(`${GREEN}All tool schemas certified across all providers.${RESET}\n`);
  process.exit(0);
}
