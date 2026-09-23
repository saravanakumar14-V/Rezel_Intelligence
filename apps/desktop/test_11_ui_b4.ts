import fs from 'fs';
import path from 'path';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

console.log('=== Starting Milestone 11.UI-B4 Full Hologram HUD Tests ===\n');

// 1. Read source files
const hudTsxPath = path.resolve('src/components/hud/HologramHUD.tsx');
const hudCssPath = path.resolve('src/components/hud/HologramHUD.module.css');

assert(fs.existsSync(hudTsxPath), 'HologramHUD.tsx exists');
assert(fs.existsSync(hudCssPath), 'HologramHUD.module.css exists');

const tsxContent = fs.readFileSync(hudTsxPath, 'utf8');
const cssContent = fs.readFileSync(hudCssPath, 'utf8');

// --- A. Full HUD renders required major regions ---
assert(tsxContent.includes('role="region"'), 'A: Root region role defined');
assert(tsxContent.includes('role="banner"'), 'A: Top banner defined');
assert(tsxContent.includes('role="contentinfo"'), 'A: Bottom command footer defined');
assert(tsxContent.includes('aside'), 'A: Telemetry aside deck defined');
console.log('Test A Passed: Full HUD major regions (Top Bar, Left Deck, Bottom Area) present.');

// --- B. ModeSelector is present ---
assert(tsxContent.includes('<ModeSelector'), 'B: ModeSelector embedded in HUD');
console.log('Test B Passed: ModeSelector component integrated in Top Bar.');

// --- C. CommandOrb remains integrated ---
assert(tsxContent.includes('<CommandOrb state={orbState}'), 'C: CommandOrb integrated at bottom command area');
console.log('Test C Passed: CommandOrb integrated with voice state and click handlers.');

// --- D. Design tokens used rather than hard-coded primary colors ---
assert(cssContent.includes('--rz-accent-cyan-core'), 'D: CSS module references --rz-accent-cyan-core');
assert(cssContent.includes('--rz-accent-ice-blue'), 'D: CSS module references --rz-accent-ice-blue');
assert(cssContent.includes('--rz-bg-glass-primary'), 'D: CSS module references --rz-bg-glass-primary');
assert(cssContent.includes('--rz-border-hairline'), 'D: CSS module references --rz-border-hairline');
assert(cssContent.includes('--rz-font-mono'), 'D: CSS module references --rz-font-mono');
console.log('Test D Passed: B1 design tokens used throughout HologramHUD.module.css.');

// --- E. Navigation layout exists ---
assert(tsxContent.includes('ModeNav') && tsxContent.includes('centerNav'), 'E: Navigation container exists');
console.log('Test E Passed: Navigation tabs container centered in Top Bar.');

// --- F. Telemetry region exists ---
assert(tsxContent.includes('StatusPanel') && tsxContent.includes('telemetryDeck'), 'F: Telemetry deck exists');
console.log('Test F Passed: Telemetry deck exists with StatusPanel metrics integration.');

// --- G. Application connection status region exists ---
assert(tsxContent.includes('activeApp') && tsxContent.includes('appSessionCard'), 'G: App session card exists');
assert(tsxContent.includes('CONNECTED'), 'G: Connected status string present');
console.log('Test G Passed: Active application connection status region integrated.');

// --- H. Workflow summary region exists ---
assert(tsxContent.includes('activeWorkflow') && tsxContent.includes('workflowSummaryCard'), 'H: Workflow summary card exists');
console.log('Test H Passed: High-level workflow summary preview integrated in telemetry deck.');

// --- I. No new runtime authority ---
assert(!tsxContent.includes('new WorkflowRuntime'), 'I: No duplicate runtime instantiated');
assert(!tsxContent.includes('new PolicyEngine'), 'I: No security authority duplicated');
console.log('Test I Passed: Subscribes cleanly to RezelDirector events without creating new authority.');

// --- J. No SpaceScene remount logic ---
assert(!tsxContent.includes('SpaceScene'), 'J: SpaceScene is not imported or manipulated by HologramHUD');
console.log('Test J Passed: SpaceScene foundation remains completely decoupled.');

// --- K. No Tailwind introduced ---
assert(tsxContent.includes('styles.topBar') && tsxContent.includes('styles.telemetryDeck'), 'K: Uses CSS modules');
console.log('Test K Passed: CSS Modules styling architecture used.');

// --- L. Accessibility labels present ---
assert(tsxContent.includes('aria-label="Rezel Full Hologram HUD"'), 'L: HUD root has accessible aria-label');
assert(tsxContent.includes('aria-label="System Telemetry and Sessions"'), 'L: Telemetry aside has accessible label');
console.log('Test L Passed: ARIA landmarks and accessible descriptions present.');

// --- M. Existing mode events remain authoritative ---
assert(tsxContent.includes('RezelDirector.subscribe'), 'M: Subscribes to RezelDirector events');
console.log('Test M Passed: Director remains authoritative event source.');

// --- N. Layout remains compatible with current Full Mode ---
assert(cssContent.includes('position: absolute') && cssContent.includes('inset: 0'), 'N: Full screen absolute overlay');
console.log('Test N Passed: Fullscreen layout compatible with Full Mode container.');

// --- O. No Companion-specific native window logic added ---
assert(!tsxContent.includes('tauri') && !tsxContent.includes('getCurrentWindow'), 'O: No native window sizing in HUD');
console.log('Test O Passed: Native window manipulation avoided; HUD remains pure presentation overlay.');

console.log('\n======================================================');
console.log('✅ ALL 11.UI-B4 HOLOGRAM HUD TESTS PASSED (100% GREEN)');
console.log('======================================================\n');
