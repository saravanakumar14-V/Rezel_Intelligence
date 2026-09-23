import { ApplicationObserver } from './src/lib/ai/verification/ApplicationObserver';
import { VerificationEngine } from './src/lib/ai/verification/VerificationEngine';
import type { VerificationPredicate } from './src/lib/ai/verification/types';

const cubePredicate: VerificationPredicate = {
  operator: 'EQUALS',
  entityType: 'MESH',
  entityName: 'Rezel_Test_Cube_001',
  property: 'name',
  value: 'Rezel_Test_Cube_001',
};

const cameraPredicate: VerificationPredicate = {
  operator: 'EQUALS',
  entityType: 'CAMERA',
  entityName: 'Rezel_Test_Camera_001',
  property: 'name',
  value: 'Rezel_Test_Camera_001',
};

function normalize(raw: unknown) {
  return (ApplicationObserver as any).normalizeObservation(
    'blender',
    'blender.inspect_scene',
    raw,
    'identity-test',
  );
}

function assertSentinels(observation: ReturnType<typeof normalize>, label: string) {
  if (observation.entities.length !== 2) {
    throw new Error(`${label}: expected two normalized entities, got ${observation.entities.length}`);
  }
  if (VerificationEngine.verify(observation, cubePredicate) !== 'VERIFIED') {
    throw new Error(`${label}: cube predicate was not verified`);
  }
  if (VerificationEngine.verify(observation, cameraPredicate) !== 'VERIFIED') {
    throw new Error(`${label}: camera predicate was not verified`);
  }
}

const objects = [
  { name: 'Rezel_Test_Cube_001', type: 'MESH', location: [0, 0, 0] },
  { name: 'Rezel_Test_Camera_001', type: 'CAMERA', location: [1, 2, 3] },
];

assertSentinels(normalize({
  scene_name: 'Scene',
  blender_pid: 4242,
  object_count: 2,
  objects,
}), 'metadata object response');

assertSentinels(normalize(objects), 'legacy top-level array response');

console.log('PASS: Blender inspect-scene metadata and legacy array responses normalize and verify sentinel predicates.');
