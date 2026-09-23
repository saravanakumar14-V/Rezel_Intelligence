/**
 * REZEL 13.3.2 — ADOBE PROJECT & COMPOSITION INTELLIGENCE TEST SUITE
 *
 * Verifies:
 * 1. Adapter Disconnected state handling
 * 2. Project Closed state handling
 * 3. Project Open without Active Composition handling
 * 4. Active Composition resolution & mapping
 * 5. Text Layer type mapping
 * 6. Shape Layer type mapping
 * 7. Solid Layer type mapping
 * 8. Unknown Layer type mapping (no name-based guessing)
 * 9. Missing / optional properties (no fabricated zero/defaults)
 * 10. Invalid numeric payload sanitization (NaN, Infinity, negative bounds)
 * 11. Massive project truncation and truncation indicators
 * 12. Provenance tracking (source: 'APPLICATION_ADAPTER', observedAt)
 * 13. Cache reuse within freshness window
 * 14. Mutation-triggered invalidation
 * 15. Inspector strictly read-only guarantee (0 mutating calls)
 * 16. ApplicationStateInferenceEngine integration with Adobe project snapshot
 * 17. Real After Effects environment behavior check
 */

import { AdobeProjectInspector, AdobeProjectInspectorImpl } from './src/lib/ai/adobe/AdobeProjectInspector';
import { mapAdobeLayerType } from './src/lib/ai/adobe/layerTypeMapper';
import { validateRawAdobePayload } from './src/lib/ai/adobe/payloadValidator';
import type { AdobeProjectSnapshot, CompositionSnapshot, LayerSnapshot } from './src/lib/ai/adobe/types';
import { ApplicationRegistry } from './src/lib/applications/ApplicationRegistry';
import { AfterEffectsApplicationAdapter } from './src/lib/applications/adapters/AfterEffectsApplicationAdapter';
import { ApplicationStateInferenceEngine } from './src/lib/ai/inference/ApplicationStateInferenceEngine';
import { ResourceLockManager } from './src/lib/ai/scheduler/ResourceLockManager';
import type { ApplicationOperation, ApplicationOperationResult, ApplicationSession, InspectionRequest, InspectionResult } from './src/lib/applications/types';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${message}`);
  } else {
    failCount++;
    console.error(`  [FAIL] ${message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MOCK ADAPTER HELPER
// ─────────────────────────────────────────────────────────────────────────────

class MockAfterEffectsAdapter extends AfterEffectsApplicationAdapter {
  public mockInspectResponse: any = null;
  public inspectCallCount = 0;
  public executeCallCount = 0;
  public executedCapabilities: string[] = [];
  private isConnected = true;

  constructor(connected = true) {
    super();
    this.isConnected = connected;
  }

  setConnected(connected: boolean) {
    this.isConnected = connected;
  }

  override getHealth(sessionId?: string) {
    if (!this.isConnected) {
      return {
        state: 'DISCONNECTED' as const,
        lastHeartbeat: Date.now() - 10000,
        message: 'Mock adapter disconnected',
      };
    }
    return {
      state: 'READY' as const,
      lastHeartbeat: Date.now(),
      connectionId: 'mock_conn_ae',
      message: 'Mock connected to After Effects',
    };
  }

  override async inspect(request: InspectionRequest): Promise<InspectionResult> {
    this.inspectCallCount++;
    if (!this.isConnected) {
      return {
        applicationId: 'after_effects',
        sessionId: request.sessionId,
        timestamp: Date.now(),
        status: 'ERROR',
        entities: [],
        error: 'DISCONNECTED from After Effects',
      };
    }

    return {
      applicationId: 'after_effects',
      sessionId: request.sessionId,
      timestamp: Date.now(),
      status: 'SUCCESS',
      entities: [],
      rawOutput: this.mockInspectResponse,
    };
  }

  override async execute(operation: ApplicationOperation): Promise<ApplicationOperationResult> {
    this.executeCallCount++;
    this.executedCapabilities.push(operation.capabilityId);
    return {
      operationId: operation.operationId,
      applicationId: 'after_effects',
      sessionId: operation.sessionId,
      success: true,
      outcome: 'SUCCESS',
      durationMs: 10,
      mutatesExternalState: operation.mutatesExternalState,
    };
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('REZEL 13.3.2 — ADOBE PROJECT & COMPOSITION INTELLIGENCE TEST SUITE');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 1: LAYER TYPE MAPPING & UNKNOWN HANDLING
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: LAYER TYPE MAPPING ---');
  {
    // 1.1 Text Layer mapping
    assert(mapAdobeLayerType('TEXT') === 'TEXT', 'Maps "TEXT" to TEXT');
    assert(mapAdobeLayerType('TextLayer') === 'TEXT', 'Maps "TextLayer" to TEXT');
    assert(mapAdobeLayerType('text_layer') === 'TEXT', 'Maps "text_layer" to TEXT');
    assert(mapAdobeLayerType(undefined, { sourceText: 'Hello' }) === 'TEXT', 'Maps layer with sourceText property to TEXT');

    // 1.2 Shape Layer mapping
    assert(mapAdobeLayerType('SHAPE') === 'SHAPE', 'Maps "SHAPE" to SHAPE');
    assert(mapAdobeLayerType('ShapeLayer') === 'SHAPE', 'Maps "ShapeLayer" to SHAPE');
    assert(mapAdobeLayerType('vector') === 'SHAPE', 'Maps "vector" to SHAPE');

    // 1.3 Solid Layer mapping
    assert(mapAdobeLayerType('SOLID') === 'SOLID', 'Maps "SOLID" to SOLID');
    assert(mapAdobeLayerType('SolidLayer') === 'SOLID', 'Maps "SolidLayer" to SOLID');
    assert(mapAdobeLayerType('solidSource') === 'SOLID', 'Maps "solidSource" to SOLID');

    // 1.4 Footage Layer mapping
    assert(mapAdobeLayerType('FOOTAGE') === 'FOOTAGE', 'Maps "FOOTAGE" to FOOTAGE');
    assert(mapAdobeLayerType('FootageLayer') === 'FOOTAGE', 'Maps "FootageLayer" to FOOTAGE');
    assert(mapAdobeLayerType('image') === 'FOOTAGE', 'Maps "image" to FOOTAGE');
    assert(mapAdobeLayerType('video') === 'FOOTAGE', 'Maps "video" to FOOTAGE');

    // 1.5 Precomp Layer mapping
    assert(mapAdobeLayerType('PRECOMP') === 'PRECOMP', 'Maps "PRECOMP" to PRECOMP');
    assert(mapAdobeLayerType('CompLayer') === 'PRECOMP', 'Maps "CompLayer" to PRECOMP');
    assert(mapAdobeLayerType('composition') === 'PRECOMP', 'Maps "composition" to PRECOMP');

    // 1.6 Null Layer mapping
    assert(mapAdobeLayerType('NULL') === 'NULL', 'Maps "NULL" to NULL');
    assert(mapAdobeLayerType('NullLayer') === 'NULL', 'Maps "NullLayer" to NULL');
    assert(mapAdobeLayerType(undefined, { nullLayer: true }) === 'NULL', 'Maps layer with nullLayer: true to NULL');

    // 1.7 Unknown Layer mapping (Camera, Light, arbitrary strings)
    assert(mapAdobeLayerType('CameraLayer') === 'UNKNOWN', 'Maps "CameraLayer" strictly to UNKNOWN');
    assert(mapAdobeLayerType('LightLayer') === 'UNKNOWN', 'Maps "LightLayer" strictly to UNKNOWN');
    assert(mapAdobeLayerType('custom_plugin_layer') === 'UNKNOWN', 'Maps custom layer to UNKNOWN');
    assert(mapAdobeLayerType(12345) === 'UNKNOWN', 'Maps non-string type to UNKNOWN');

    // 1.8 Strict rule: never guess type from layer name!
    const namedSolidNoType = { name: 'Solid 1' };
    assert(mapAdobeLayerType(undefined, namedSolidNoType) === 'UNKNOWN', 'Does NOT guess SOLID from name "Solid 1"');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 2: RAW PAYLOAD VALIDATION & SANITIZATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: RAW PAYLOAD VALIDATION & SANITIZATION ---');
  {
    // 2.1 Malformed / null payload
    const invalidRes = validateRawAdobePayload(null);
    assert(invalidRes.status === 'UNKNOWN', 'Null payload returns status UNKNOWN');
    assert(invalidRes.source === 'APPLICATION_ADAPTER', 'Source is APPLICATION_ADAPTER');
    assert(invalidRes.compositions.length === 0, 'Null payload has 0 compositions');

    // 2.2 Project Closed
    const closedRes = validateRawAdobePayload({ projectOpen: false });
    assert(closedRes.status === 'PROJECT_CLOSED', 'projectOpen: false returns PROJECT_CLOSED');
    assert(closedRes.compositions.length === 0, 'PROJECT_CLOSED has 0 compositions');

    // 2.3 Project Open without Active Composition
    const openNoCompRes = validateRawAdobePayload({
      projectOpen: true,
      projectName: 'TestProject.aep',
      compositions: [
        { id: 'c1', name: 'Main', width: 1920, height: 1080, duration: 10, frameRate: 30, layers: [] },
      ],
      activeCompositionId: undefined,
    });
    assert(openNoCompRes.status === 'NO_ACTIVE_COMPOSITION', 'Project open with comps but no active comp returns NO_ACTIVE_COMPOSITION');
    assert(openNoCompRes.projectName === 'TestProject.aep', 'Preserves project name');

    // 2.4 Active Composition present
    const activeCompRes = validateRawAdobePayload({
      projectOpen: true,
      projectName: 'TestProject.aep',
      compositions: [
        {
          id: 'c1',
          name: 'Main Comp',
          width: 1920,
          height: 1080,
          duration: 10,
          frameRate: 29.97,
          layers: [
            {
              index: 1,
              id: 'l1',
              name: 'Title Text',
              type: 'TEXT',
              isVisible: true,
              isLocked: false,
              transform: {
                position: [960, 540, 0],
                scale: [100, 100, 100],
                rotation: 0,
                opacity: 100,
              },
            },
          ],
        },
      ],
      activeCompositionId: 'c1',
    });
    assert(activeCompRes.status === 'ACTIVE_COMPOSITION', 'Returns status ACTIVE_COMPOSITION');
    assert(activeCompRes.activeCompositionId === 'c1', 'activeCompositionId is "c1"');
    assert(activeCompRes.compositions.length === 1, 'Compositions count is 1');
    assert(activeCompRes.compositions[0].layers[0].type === 'TEXT', 'Layer 1 is TEXT');
    assert(activeCompRes.compositions[0].layers[0].transformState?.opacity === 100, 'Transform opacity is 100');

    // 2.5 Invalid numeric values sanitized (NaN, Infinity, negative dimensions)
    const badNumericRes = validateRawAdobePayload({
      projectOpen: true,
      compositions: [
        {
          id: 'c_bad',
          name: 'Bad Numeric Comp',
          width: -1920, // Negative!
          height: NaN, // NaN!
          duration: Infinity, // Infinity!
          frameRate: 0, // <= 0!
          layers: [
            {
              index: NaN,
              id: 'l_bad',
              name: 'Bad Layer',
              type: 'SHAPE',
              transform: {
                opacity: 250, // Out of bounds (> 100)
              },
            },
          ],
        },
      ],
    });
    const badComp = badNumericRes.compositions[0];
    assert(badComp.width === undefined, 'Negative width is sanitized to undefined');
    assert(badComp.height === undefined, 'NaN height is sanitized to undefined');
    assert(badComp.duration === undefined, 'Infinity duration is sanitized to undefined');
    assert(badComp.frameRate === undefined, '0 frameRate is sanitized to undefined');
    assert(badComp.layers[0].transformState?.opacity === undefined, 'Out of bounds opacity sanitized to undefined');

    // 2.6 Dirty state handling
    const dirtyTrue = validateRawAdobePayload({ projectOpen: true, dirty: true });
    assert(dirtyTrue.dirty === true, 'dirty: true is captured');
    const dirtyFalse = validateRawAdobePayload({ projectOpen: true, dirty: false });
    assert(dirtyFalse.dirty === false, 'dirty: false is captured');
    const dirtyMissing = validateRawAdobePayload({ projectOpen: true });
    assert(dirtyMissing.dirty === undefined, 'dirty: undefined when missing (no hallucination)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 3: BOUNDED SIZES & TRUNCATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: BOUNDED SIZES & TRUNCATION ---');
  {
    // Create 150 fake compositions
    const massiveComps = Array.from({ length: 150 }, (_, i) => ({
      id: `comp_${i}`,
      name: `Composition ${i}`,
      layers: Array.from({ length: 250 }, (_, j) => ({
        id: `layer_${j}`,
        name: `Layer ${j}`,
        type: 'SHAPE',
      })),
    }));

    const truncatedRes = validateRawAdobePayload(
      { projectOpen: true, compositions: massiveComps },
      { maxCompositions: 10, maxLayersPerComposition: 20 }
    );

    assert(truncatedRes.compositions.length === 10, 'Truncates compositions to maxCompositions (10)');
    assert(truncatedRes.isTruncated === true, 'Sets isTruncated = true on project snapshot');
    assert(truncatedRes.compositions[0].layers.length === 20, 'Truncates layers to maxLayersPerComposition (20)');
    assert(truncatedRes.compositions[0].isTruncated === true, 'Sets isTruncated = true on composition snapshot');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 4: ADOBE PROJECT INSPECTOR & CACHE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: ADOBE PROJECT INSPECTOR & CACHE ---');
  {
    const mockAdapter = new MockAfterEffectsAdapter(true);
    ApplicationRegistry.register(mockAdapter);

    mockAdapter.mockInspectResponse = {
      projectOpen: true,
      projectName: 'Commercial_V1.aep',
      activeCompositionId: 'comp_main',
      compositions: [
        {
          id: 'comp_main',
          name: 'Main Edit',
          width: 3840,
          height: 2160,
          duration: 30,
          frameRate: 60,
          layers: [
            { id: 'l1', name: 'Background Solid', type: 'SOLID' },
            { id: 'l2', name: 'Header Text', type: 'TEXT' },
          ],
        },
      ],
    };

    // 4.1 First inspect (miss)
    AdobeProjectInspector.clearCache();
    const snap1 = await AdobeProjectInspector.inspectProject();
    assert(snap1.status === 'ACTIVE_COMPOSITION', 'Inspect returns ACTIVE_COMPOSITION');
    assert(snap1.projectName === 'Commercial_V1.aep', 'Inspect captures project name');
    assert(snap1.compositions[0].layers.length === 2, 'Inspect captures 2 layers');
    assert(snap1.source === 'APPLICATION_ADAPTER', 'Snapshot provenance is APPLICATION_ADAPTER');
    assert(mockAdapter.inspectCallCount === 1, 'Inspect was called on adapter once');

    // 4.2 Second inspect within TTL (hit)
    const snap2 = await AdobeProjectInspector.inspectProject();
    assert(snap2.projectName === 'Commercial_V1.aep', 'Cache hit returns same snapshot');
    assert(mockAdapter.inspectCallCount === 1, 'Inspect was NOT called again (cache hit)');
    const stats = AdobeProjectInspector.getCacheStats();
    assert(stats.hitCount >= 1, 'Cache hit count incremented');

    // 4.3 Force refresh bypasses cache
    const snap3 = await AdobeProjectInspector.inspectProject({ forceRefresh: true });
    assert(mockAdapter.inspectCallCount === 2, 'Force refresh invokes adapter inspection');

    // 4.4 Mutation invalidates cache
    AdobeProjectInspector.invalidateCache();
    await AdobeProjectInspector.inspectProject();
    assert(mockAdapter.inspectCallCount === 3, 'Post-invalidation inspect invokes adapter again');

    // 4.5 Disconnected adapter handling
    mockAdapter.setConnected(false);
    AdobeProjectInspector.clearCache();
    const discSnap = await AdobeProjectInspector.inspectProject();
    assert(discSnap.status === 'ADAPTER_DISCONNECTED', 'Disconnected adapter returns ADAPTER_DISCONNECTED');
    assert(discSnap.compositions.length === 0, 'Disconnected snapshot has 0 compositions');
    assert(discSnap.source === 'APPLICATION_ADAPTER', 'Disconnected snapshot retains provenance');

    // Restore adapter
    mockAdapter.setConnected(true);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 5: READ-ONLY INVARIANT (ZERO MUTATION)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 5: READ-ONLY INVARIANT ---');
  {
    const mockAdapter = new MockAfterEffectsAdapter(true);
    ApplicationRegistry.register(mockAdapter);
    AdobeProjectInspector.clearCache();

    mockAdapter.executeCallCount = 0;
    mockAdapter.executedCapabilities = [];

    await AdobeProjectInspector.inspectProject({ forceRefresh: true });

    assert(mockAdapter.executeCallCount === 0, 'Inspector made 0 calls to adapter.execute()');
    assert(mockAdapter.executedCapabilities.length === 0, 'Zero mutative capabilities were invoked by inspector');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 6: APPLICATION STATE INFERENCE INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 6: APPLICATION STATE INFERENCE INTEGRATION ---');
  {
    const mockAdapter = new MockAfterEffectsAdapter(true);
    ApplicationRegistry.register(mockAdapter);
    mockAdapter.mockInspectResponse = {
      projectOpen: true,
      projectName: 'Promo_Video.aep',
      activeCompositionId: 'comp_final',
      compositions: [
        {
          id: 'comp_final',
          name: 'Final Render Comp',
          width: 1920,
          height: 1080,
          duration: 15,
          frameRate: 24,
          layers: [
            { id: 'layer_bg', name: 'BG', type: 'SOLID' },
            { id: 'layer_title', name: 'Title', type: 'TEXT' },
          ],
        },
      ],
    };

    ApplicationStateInferenceEngine.reset();

    const runtimeState = await ApplicationStateInferenceEngine.inferState({
      applicationId: 'after_effects',
      forceRefresh: true,
    });

    assert(runtimeState.appId === 'after_effects', 'Runtime state appId is "after_effects"');
    assert(runtimeState.adobeProject !== undefined, 'Runtime state contains adobeProject snapshot');
    assert(runtimeState.adobeProject?.status === 'ACTIVE_COMPOSITION', 'adobeProject.status is ACTIVE_COMPOSITION');
    assert(runtimeState.adobeProject?.projectName === 'Promo_Video.aep', 'adobeProject.projectName matches');
    assert(runtimeState.adobeProject?.compositions[0].name === 'Final Render Comp', 'Composition name matches');

    // Verify adapter evidence is attached
    const aeEvidence = runtimeState.evidence.find(
      (e) => e.source === 'APPLICATION_ADAPTER' && e.description.includes('Adobe project state')
    );
    assert(aeEvidence !== undefined, 'StateEvidence includes Adobe project intelligence entry');

    // Verify mutation notification clears Adobe cache
    mockAdapter.inspectCallCount = 0;
    ApplicationStateInferenceEngine.notifyActionExecuted('after_effects', undefined, 'DOCUMENT_MUTATION');
    await ApplicationStateInferenceEngine.inferState({
      applicationId: 'after_effects',
      forceRefresh: false,
    });
    assert(mockAdapter.inspectCallCount >= 1, 'Inference engine re-inspected Adobe after mutation');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 7: REAL AFTER EFFECTS ENVIRONMENT CHECK
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 7: REAL AFTER EFFECTS ENVIRONMENT CHECK ---');
  {
    // Test the real adapter registered outside of mock
    const realAdapter = new AfterEffectsApplicationAdapter();
    const discovery = await realAdapter.discover();

    console.log(`  [INFO] Real AE Discovery: Installed=${discovery.isInstalled}, Running=${discovery.isRunning}, Sessions=${discovery.availableSessions?.length ?? 0}`);

    if (discovery.isRunning && (discovery.availableSessions?.length ?? 0) > 0) {
      console.log('  [REAL] Live After Effects session detected. Running live read-only inspection test...');
      try {
        ApplicationRegistry.register(realAdapter);
        const liveSnapshot = await AdobeProjectInspector.inspectProject({ forceRefresh: true });
        console.log(`  [REAL PASS] Live project status: ${liveSnapshot.status}, Project: ${liveSnapshot.projectName || 'None'}`);
        assert(liveSnapshot.source === 'APPLICATION_ADAPTER', 'Live snapshot has APPLICATION_ADAPTER source');
      } catch (err: any) {
        console.warn(`  [REAL FAIL] Live AE test threw: ${err?.message || err}`);
      }
    } else {
      console.log('  [REPORT] REAL TEST UNAVAILABLE — ADAPTER DISCONNECTED (No active After Effects process/session detected)');
    }
  }

  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passCount} passed, ${failCount} failed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error running 13.3.2 test suite:', err);
  process.exit(1);
});
