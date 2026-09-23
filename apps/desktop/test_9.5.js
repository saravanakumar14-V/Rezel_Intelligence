import { ToolRegistry } from './src/lib/ai/ToolRegistry.js';
import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import { CapabilityProviderRegistry } from './src/lib/ai/capabilities/CapabilityProviderRegistry.js';
import { ToolCapabilityAdapterProvider } from './src/lib/ai/capabilities/ToolCapabilityAdapter.js';
import { BuiltinProvider } from './src/lib/ai/capabilities/providers/BuiltinProvider.js';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor.js';
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor.js';
function assert(condition, message) {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
}
async function runTests() {
    console.log("Starting 9.5 Capability Abstraction Tests...");
    // Register a legacy tool
    ToolRegistry.register({
        name: 'legacy_test_tool',
        description: 'A legacy tool',
        parameters: {
            arg1: { type: 'string', description: 'test arg' }
        },
        category: 'system',
        risk: 'MEDIUM',
        toolGroup: 'system',
        mutatesExternalState: true,
        retryPolicy: 'NEVER'
    });
    // Test A & B: Provider registration
    console.log("--- Test A & B: Provider Registration ---");
    CapabilityProviderRegistry.clear();
    CapabilityRegistry.clear();
    CapabilityProviderRegistry.register(new ToolCapabilityAdapterProvider());
    CapabilityProviderRegistry.register(new BuiltinProvider());
    const legacyCap = CapabilityRegistry.get('legacy_test_tool');
    assert(!!legacyCap, "Legacy tool must be adapted and registered");
    assert(legacyCap.riskLevel === 'MEDIUM', "Legacy trusted metadata (risk) must be preserved");
    assert(legacyCap.mutatesExternalState === true, "Legacy trusted metadata (mutates) must be preserved");
    const nativeCap = CapabilityRegistry.get('builtin.ping');
    assert(!!nativeCap, "Native capability must be registered");
    assert(nativeCap.riskLevel === 'LOW', "Native trusted metadata (risk) must be preserved");
    assert(nativeCap.retryPolicy === 'AUTO', "Native trusted metadata (retry) must be preserved");
    // Test C: Duplicate ID throws error
    console.log("--- Test C: Duplicate ID ---");
    let caught = false;
    try {
        CapabilityRegistry.register(nativeCap); // Already registered
    }
    catch (e) {
        caught = true;
    }
    assert(caught, "Duplicate registration must throw error");
    // Test D & F: Provider Revocation
    console.log("--- Test D & F: Provider Revocation ---");
    const providerRevoked = CapabilityProviderRegistry.unregister('provider.builtin');
    assert(providerRevoked, "Provider unregistration must succeed");
    assert(!CapabilityRegistry.has('builtin.ping'), "Unregistering provider must revoke its capabilities");
    // Re-register for next tests
    CapabilityProviderRegistry.register(new BuiltinProvider());
    // Test E: Gemini Declarations
    console.log("--- Test E: Gemini Declarations ---");
    const decls = CapabilityRegistry.toGeminiFunctionDeclarations();
    const legacyDecl = decls.find(d => d.name === 'legacy_test_tool');
    assert(!!legacyDecl, "Legacy declaration must exist");
    assert(legacyDecl.parameters.properties.arg1.type === 'STRING', "Legacy parameters must be mapped to Gemini format");
    // Test V & W & X: Security Bridging
    console.log("--- Test V & W & X: Security Bridging ---");
    let securityExecutedTool = '';
    const originalExecute = SecurityToolExecutor.execute;
    SecurityToolExecutor.execute = async (tool, action, args, cmd, cb, executeImpl) => {
        securityExecutedTool = action;
        return executeImpl ? await executeImpl() : { success: true, output: "Mocked Tauri IPC" };
    };
    try {
        const context = {
            workflowId: 'test-wf',
            executionId: 'test-exec',
            scopes: [],
            metadata: {}
        };
        // Test Legacy via AIToolExecutor
        const legacyResult = await AIToolExecutor.executeCapability(CapabilityRegistry.get('legacy_test_tool'), { arg1: "test" }, context);
        assert(securityExecutedTool === 'legacy_test_tool', "Legacy tool must route through SecurityToolExecutor");
        assert(legacyResult.success, "Legacy tool succeeded");
        assert(legacyResult.output === "Mocked Tauri IPC", "Legacy tool returned mocked output");
        // Test Native via AIToolExecutor
        const nativeResult = await AIToolExecutor.executeCapability(CapabilityRegistry.get('builtin.ping'), {}, context);
        assert(securityExecutedTool === 'builtin.ping', "Native capability must route through SecurityToolExecutor");
        assert(nativeResult.success, "Native capability succeeded");
        assert(nativeResult.output === '"pong"', "Native capability returned true native logic execution output");
    }
    finally {
        SecurityToolExecutor.execute = originalExecute;
    }
    console.log("All 9.5 tests passed successfully!");
}
runTests().catch(e => {
    console.error("Test failed:", e);
    process.exit(1);
});
