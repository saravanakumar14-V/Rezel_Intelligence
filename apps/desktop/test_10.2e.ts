function assert(condition: boolean, message?: string) {
  if (!condition) throw new Error(`Assertion failed`);
}
import { GeminiSchemaNormalizer } from './src/lib/ai/SchemaNormalizer.js';
import { ToolRegistry, BUILT_IN_TOOLS } from './src/lib/ai/ToolRegistry.js';
import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import type { ParameterDef } from './src/lib/ai/types.js';

async function runTests() {
  console.log(`Starting 10.2 Phase E Schema Validation Tests...`);

  console.log(`--- A. ARRAY with items ? accepted ---`);
  const validArray: ParameterDef = { type: 'array', description: 'Valid', items: { type: 'string', description: 'String' } };
  const resA = GeminiSchemaNormalizer.convertParam(validArray, 'A');
  assert(resA.type === 'ARRAY');
  assert(resA.items !== undefined && resA.items.type === 'STRING');

  console.log(`--- B. ARRAY missing items ? rejected ---`);
  const invalidArray: ParameterDef = { type: 'array', description: 'Invalid' };
  let errorB = false;
  try {
    GeminiSchemaNormalizer.convertParam(invalidArray, 'B');
  } catch (err: any) {
    errorB = true;
    assert(err.message.includes('requires an `items` schema'));
  }
  assert(errorB);

  console.log(`--- C. ARRAY nested object items ? accepted ---`);
  const validNestedObject: ParameterDef = { type: 'array', description: 'Valid', items: { type: 'object', description: 'Obj' } };
  const resC = GeminiSchemaNormalizer.convertParam(validNestedObject, 'C');
  assert(resC.type === 'ARRAY' && resC.items?.type === 'OBJECT');

  console.log(`--- D. ARRAY nested array items ? recursively validated ---`);
  const validNestedArray: ParameterDef = { type: 'array', description: 'Valid', items: { type: 'array', description: 'Inner', items: { type: 'number', description: 'Num' } } };
  const resD = GeminiSchemaNormalizer.convertParam(validNestedArray, 'D');
  assert(resD.type === 'ARRAY' && resD.items?.type === 'ARRAY' && resD.items?.items?.type === 'NUMBER');

  console.log(`--- E. invalid nested items schema ? rejected ---`);
  const invalidNestedArray: ParameterDef = { type: 'array', description: 'Valid', items: { type: 'array', description: 'Inner missing items' } };
  let errorE = false;
  try {
    GeminiSchemaNormalizer.convertParam(invalidNestedArray, 'E');
  } catch (err: any) {
    errorE = true;
  }
  assert(errorE);

  console.log(`--- G & H. existing run_system_command & create_workflow_plan array ? unchanged ---`);
  ToolRegistry.registerMany(BUILT_IN_TOOLS);
  const builtInDecls = ToolRegistry.toGeminiFunctionDeclarations();
  const sysCmd = builtInDecls.find(d => d.name === 'run_system_command');
  const wfPlan = builtInDecls.find(d => d.name === 'create_workflow_plan');
  assert(sysCmd?.parameters.properties['args'].type === 'ARRAY');
  assert(sysCmd?.parameters.properties['args'].items?.type === 'STRING');
  assert(wfPlan?.parameters.properties['steps'].type === 'ARRAY');
  assert(wfPlan?.parameters.properties['steps'].items?.type === 'OBJECT');

  console.log(`--- I. malformed dynamic external capability ? does not reach Gemini ---`);
  CapabilityRegistry.register({
    id: 'malformed.test',
    description: 'Bad',
    parameters: {
      bad: { type: 'array', description: 'Missing items' }
    },
    action: async () => ({ success: true })
  } as any);

  const capDeclsI = CapabilityRegistry.toGeminiFunctionDeclarations();
  assert(!capDeclsI.find(d => d.name === 'malformed.test'), 'Malformed capability should be excluded from declarations');

  console.log(`--- J. valid dynamic Blender capabilities ? successfully appear in Gemini declarations ---`);
  CapabilityRegistry.register({
    id: 'blender.create_object',
    description: 'Good',
    parameters: {
      location: { type: 'array', description: 'Loc', items: { type: 'number', description: '' } }
    },
    action: async () => ({ success: true })
  } as any);

  const capDeclsJ = CapabilityRegistry.toGeminiFunctionDeclarations();
  const blenderObj = capDeclsJ.find(d => d.name === 'blender.create_object');
  assert(blenderObj !== undefined);
  assert(blenderObj.parameters.properties['location'].type === 'ARRAY');
  assert(blenderObj.parameters.properties['location'].items?.type === 'NUMBER');

  console.log(`All 10.2e Schema Validation Tests Passed! Success`);
}

runTests().catch(err => {
  console.error(`Test failed:`, err);
  process.exit(1);
});
