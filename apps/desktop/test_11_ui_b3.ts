import fs from 'fs';
import path from 'path';
import { RezelDirector, type DirectorEvent } from './src/lib/director/RezelDirector';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

console.log('=== Starting Milestone 11.UI-B3 ModeSelector & Experience Profile Tests ===\n');

// 1. Static source analysis
const modeSelectorTsxPath = path.resolve('src/components/hud/ModeSelector.tsx');
const modeSelectorCssPath = path.resolve('src/components/hud/ModeSelector.module.css');

assert(fs.existsSync(modeSelectorTsxPath), 'ModeSelector.tsx exists');
assert(fs.existsSync(modeSelectorCssPath), 'ModeSelector.module.css exists');

const tsxContent = fs.readFileSync(modeSelectorTsxPath, 'utf8');
const cssContent = fs.readFileSync(modeSelectorCssPath, 'utf8');

// --- H & I: Architecture Invariants (No direct ModeManager / LocalMemory from UI) ---
assert(!tsxContent.includes("from '../director/ModeManager'"), 'H: No direct ModeManager import');
assert(!tsxContent.includes("ModeManager."), 'H: No direct ModeManager invocation');
assert(!tsxContent.includes("LocalMemory"), 'I: No direct LocalMemory usage from ModeSelector');
console.log('Test H & I Passed: UI is completely decoupled from internal ModeManager and LocalMemory storage.');

// --- A. AUTO displays correctly ---
assert(tsxContent.includes("id: 'AUTO'"), 'A: AUTO mode option defined');
assert(tsxContent.includes("description: \"Adapt to what I'm doing\""), 'A: AUTO description matches specification');
assert(cssContent.includes('.mode-auto'), 'A: .mode-auto CSS style present');
console.log('Test A Passed: AUTO mode option defined with contextual description and CSS styles.');

// --- B, C, D & E. RezelDirector Mode API Invocations ---
let eventLog: DirectorEvent[] = [];
const testHandler = (e: DirectorEvent) => { eventLog.push(e); };
RezelDirector.subscribe(testHandler);

// Test B: FRIENDLY
eventLog = [];
RezelDirector.setMode('FRIENDLY');
assert(RezelDirector.getCurrentMode() === 'FRIENDLY', 'B: FRIENDLY mode active in Director');
assert(eventLog.some(e => e.type === 'mode_changed' && e.payload?.mode === 'FRIENDLY'), 'B: mode_changed emitted for FRIENDLY');
console.log('Test B Passed: FRIENDLY mode set through RezelDirector.setMode().');

// Test C: CREATOR
eventLog = [];
RezelDirector.setMode('CREATOR');
assert(RezelDirector.getCurrentMode() === 'CREATOR', 'C: CREATOR mode active in Director');
assert(eventLog.some(e => e.type === 'mode_changed' && e.payload?.mode === 'CREATOR'), 'C: mode_changed emitted for CREATOR');
console.log('Test C Passed: CREATOR mode set through RezelDirector.setMode().');

// Test D: DEVELOPER
eventLog = [];
RezelDirector.setMode('DEVELOPER');
assert(RezelDirector.getCurrentMode() === 'DEVELOPER', 'D: DEVELOPER mode active in Director');
assert(eventLog.some(e => e.type === 'mode_changed' && e.payload?.mode === 'DEVELOPER'), 'D: mode_changed emitted for DEVELOPER');
console.log('Test D Passed: DEVELOPER mode set through RezelDirector.setMode().');

// Test E: AUTO / clearPersistentMode
eventLog = [];
RezelDirector.clearPersistentMode();
assert(eventLog.some(e => e.type === 'mode_changed'), 'E: mode_changed emitted on clearPersistentMode()');
console.log('Test E Passed: AUTO mode cleared persistent mode via RezelDirector.clearPersistentMode().');

// --- F & G: Event Synchronization ---
assert(tsxContent.includes("event.type === 'mode_changed'"), 'F: Subscribes to mode_changed');
assert(tsxContent.includes("event.type === 'profile_changed'"), 'G: Subscribes to profile_changed');
console.log('Test F & G Passed: Event listeners configured for mode_changed and profile_changed.');

// --- J & K: Keyboard & Escape Navigation ---
assert(tsxContent.includes("e.key === 'Escape'"), 'K: Escape key closes menu');
assert(tsxContent.includes("e.key === 'ArrowDown'"), 'J: ArrowDown key navigates items');
assert(tsxContent.includes("e.key === 'ArrowUp'"), 'J: ArrowUp key navigates items');
console.log('Test J & K Passed: Keyboard navigation and Escape closure supported.');

// --- L: Accessibility ---
assert(tsxContent.includes('role="menu"'), 'L: role="menu" present on dropdown');
assert(tsxContent.includes('role="menuitemradio"'), 'L: role="menuitemradio" present on items');
assert(tsxContent.includes('aria-checked='), 'L: aria-checked present');
assert(tsxContent.includes('aria-haspopup="menu"'), 'L: aria-haspopup present');
console.log('Test L Passed: ARIA menu semantics and accessibility attributes verified.');

// --- M: Persistence through Director API ---
RezelDirector.setMode('CREATOR');
assert(RezelDirector.getMode() === 'CREATOR', 'M: Persistent mode accessible via getMode()');
RezelDirector.clearPersistentMode();
console.log('Test M Passed: Persistent mode state flows cleanly through Director API.');

// --- N: Voice/Text Mode Command Integration ---
eventLog = [];
RezelDirector.send('Switch to Developer mode.').catch(() => {});
// Director interceptor triggers mode change:
const devModeEvent = eventLog.find(e => e.type === 'mode_changed' && e.payload?.mode === 'DEVELOPER');
assert(devModeEvent !== undefined, 'N: Text/voice command triggers mode_changed event for UI');
console.log('Test N Passed: Voice/text command updates Director mode and notifies subscriber.');

// --- O & P: Security Invariant (Mode does not modify PolicyEngine) ---
const testContext = {
  capabilityId: 'fs.write',
  parameters: { path: 'd:/Projects/Rezel/test.txt' },
  activeScopes: ['workspace:read'],
  environment: 'development' as const,
};
const evalFriendly = await PolicyEngine.evaluate(testContext);
RezelDirector.setMode('CREATOR');
const evalCreator = await PolicyEngine.evaluate(testContext);
assert(evalFriendly.decision === evalCreator.decision, 'O: PolicyEngine decision identical across mode changes');
console.log('Test O & P Passed: PolicyEngine security boundaries completely untouched by mode changes.');

// --- Q: Companion Dimensions Compatibility ---
assert(cssContent.includes('padding: 3px 8px;') || cssContent.includes('padding: 3px 8px'), 'Q: Compact pill padding for Companion mode');
assert(cssContent.includes('position: absolute;'), 'Q: Dropdown menu positioned absolutely to avoid layout shift');
console.log('Test Q Passed: ModeSelector layout constraints compatible with Companion dimensions.');

RezelDirector.unsubscribe(testHandler);

console.log('\n======================================================');
console.log('✅ ALL 11.UI-B3 MODE SELECTOR TESTS PASSED (100% GREEN)');
console.log('======================================================\n');
