import fs from 'fs';
import path from 'path';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${msg}`);
    process.exit(1);
  }
}

console.log('=== Starting Milestone 11.UI-B2 CommandOrb & Voice State Tests ===\n');

// Read source files directly for deterministic static and contract analysis
const commandOrbTsxPath = path.resolve('src/components/hud/CommandOrb.tsx');
const commandOrbCssPath = path.resolve('src/components/hud/CommandOrb.module.css');

assert(fs.existsSync(commandOrbTsxPath), 'CommandOrb.tsx exists');
assert(fs.existsSync(commandOrbCssPath), 'CommandOrb.module.css exists');

const tsxContent = fs.readFileSync(commandOrbTsxPath, 'utf8');
const cssContent = fs.readFileSync(commandOrbCssPath, 'utf8');

// --- A. IDLE mapping ---
assert(tsxContent.includes('idle: {') && tsxContent.includes('STANDBY'), 'A: IDLE state configuration defined');
assert(cssContent.includes('.state-idle'), 'A: .state-idle CSS rule present');
assert(cssContent.includes('--rz-voice-idle-color'), 'A: Uses --rz-voice-idle-color token');
assert(cssContent.includes('--rz-voice-idle-glow'), 'A: Uses --rz-voice-idle-glow token');
console.log('Test A Passed: IDLE visual class/state mapping verified.');

// --- B. LISTENING mapping ---
assert(tsxContent.includes('listening: {') && tsxContent.includes('LISTENING'), 'B: LISTENING state configuration defined');
assert(cssContent.includes('.state-listening'), 'B: .state-listening CSS rule present');
assert(cssContent.includes('--rz-voice-listening-color'), 'B: Uses --rz-voice-listening-color token');
assert(cssContent.includes('--rz-voice-listening-glow'), 'B: Uses --rz-voice-listening-glow token');
console.log('Test B Passed: LISTENING visual class/state mapping verified.');

// --- C. THINKING mapping ---
assert(tsxContent.includes('thinking: {') && tsxContent.includes('PROCESSING'), 'C: THINKING state configuration defined');
assert(cssContent.includes('.state-thinking'), 'C: .state-thinking CSS rule present');
assert(cssContent.includes('--rz-voice-thinking-color'), 'C: Uses --rz-voice-thinking-color token');
assert(cssContent.includes('--rz-voice-thinking-glow'), 'C: Uses --rz-voice-thinking-glow token');
console.log('Test C Passed: THINKING visual class/state mapping verified.');

// --- D. SPEAKING mapping ---
assert(tsxContent.includes('speaking: {') && tsxContent.includes('SPEAKING'), 'D: SPEAKING state configuration defined');
assert(cssContent.includes('.state-speaking'), 'D: .state-speaking CSS rule present');
assert(cssContent.includes('--rz-voice-speaking-color'), 'D: Uses --rz-voice-speaking-color token');
assert(cssContent.includes('--rz-voice-speaking-glow'), 'D: Uses --rz-voice-speaking-glow token');
console.log('Test D Passed: SPEAKING visual class/state mapping verified.');

// --- E. INTERRUPTED mapping ---
assert(tsxContent.includes('interrupted: {') && tsxContent.includes('INTERRUPTED'), 'E: INTERRUPTED state configuration defined');
assert(cssContent.includes('.state-interrupted'), 'E: .state-interrupted CSS rule present');
assert(cssContent.includes('--rz-voice-interrupted-color'), 'E: Uses --rz-voice-interrupted-color token');
assert(cssContent.includes('--rz-voice-interrupted-glow'), 'E: Uses --rz-voice-interrupted-glow token');
console.log('Test E Passed: INTERRUPTED visual class/state mapping verified.');

// --- F. Correct CSS token references ---
const requiredTokens = [
  '--rz-voice-idle-color',
  '--rz-voice-idle-glow',
  '--rz-voice-listening-color',
  '--rz-voice-listening-glow',
  '--rz-voice-thinking-color',
  '--rz-voice-thinking-glow',
  '--rz-voice-speaking-color',
  '--rz-voice-speaking-glow',
  '--rz-voice-interrupted-color',
  '--rz-voice-interrupted-glow',
  '--rz-border-color-focus',
  '--rz-duration-panel',
  '--rz-duration-fast',
  '--rz-ease-standard',
  '--rz-font-mono',
  '--rz-text-badge-size',
  '--rz-text-badge-weight',
  '--rz-text-badge-tracking'
];

for (const token of requiredTokens) {
  assert(cssContent.includes(token), `F: CSS module references token ${token}`);
}
console.log('Test F Passed: All required B1 CSS tokens referenced correctly in CommandOrb.module.css.');

// --- G. Reduced-motion behavior present ---
assert(cssContent.includes('@media (prefers-reduced-motion: reduce)'), 'G: prefers-reduced-motion media query present');
assert(cssContent.includes('animation: none !important'), 'G: Disables continuous animations under reduced motion');
console.log('Test G Passed: Reduced-motion accessibility behavior present and compliant.');

// --- H. Accessibility label/state output ---
assert(tsxContent.includes('aria-label='), 'H: aria-label defined');
assert(tsxContent.includes('aria-description='), 'H: aria-description defined');
assert(tsxContent.includes('role="button"'), 'H: role="button" defined');
assert(tsxContent.includes('onKeyDown'), 'H: onKeyDown keyboard handler defined');
console.log('Test H Passed: Accessibility labels and keyboard navigation supported.');

// --- I. No new voice state introduced ---
const orbStateMatch = tsxContent.match(/export type OrbState = (.*?);/);
assert(orbStateMatch !== null, 'I: OrbState type exported');
const stateTypes = orbStateMatch![1].replace(/"/g, '').split(' | ').map(s => s.trim());
assert(stateTypes.length === 5, 'I: Exactly 5 voice states configured');
const expectedStates = ['idle', 'listening', 'thinking', 'speaking', 'interrupted'];
for (const s of expectedStates) {
  assert(stateTypes.includes(s), `I: State '${s}' is in OrbState type`);
}
console.log('Test I Passed: Voice states strictly restricted to the 5 VoiceManager states.');

// --- J. Component does not import/use VoiceManager internals directly ---
assert(!tsxContent.includes('VoiceManager'), 'J: Does not import or reference VoiceManager directly');
assert(!tsxContent.includes('useVoice'), 'J: Does not tightly couple to useVoice hook internally');
console.log('Test J Passed: Component is completely decoupled from VoiceManager internals.');

// --- K. Component remains presentation-only ---
assert(tsxContent.includes('export default function CommandOrb'), 'K: Exports CommandOrb presentation component');
assert(!tsxContent.includes('setInterval'), 'K: No JS timers / animation loops in component');
assert(!tsxContent.includes('requestAnimationFrame'), 'K: Pure CSS animations used');
console.log('Test K Passed: CommandOrb is strictly presentation-only.');

console.log('\n======================================================');
console.log('✅ ALL 11.UI-B2 COMMANDORB TESTS PASSED (100% GREEN)');
console.log('======================================================\n');
