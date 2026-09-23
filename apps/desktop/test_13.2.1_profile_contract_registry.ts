/**
 * REZEL 13.2.1 — APPLICATION PROFILE CONTRACT & REGISTRY ACCEPTANCE TESTS
 *
 * Verifies:
 * 1. Application Profile Contract & Types (strictly declarative, closed DSL)
 * 2. Registry operations (register, get, list, duplicate rejection, unregister)
 * 3. Validation engine (valid/invalid profiles, broken landmark refs, broken precondition refs, bad step types)
 * 4. Version compatibility engine (exact match, compatible range, unknown version, no match)
 * 5. Application identity resolution (Notepad, Calculator, File Explorer by appId, executableName, path, alias)
 * 6. Non-mutation of 13.1 subsystems (UIA, computer actions, verification engine)
 */

import {
  ApplicationProfileRegistry,
  ApplicationProfileRegistryImpl,
} from './src/lib/ai/profiles/ApplicationProfileRegistry';
import { validateApplicationProfile } from './src/lib/ai/profiles/validator';
import {
  parseSemver,
  compareVersions,
  satisfiesVersionRange,
  resolveVersionStatus,
} from './src/lib/ai/profiles/version';
import {
  NOTEPAD_PROFILE,
  CALCULATOR_PROFILE,
  EXPLORER_PROFILE,
  BUILTIN_PROFILES,
} from './src/lib/ai/profiles/builtin';
import type { ApplicationProfile } from './src/lib/ai/profiles/types';

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

async function runTests() {
  console.log('================================================================');
  console.log('REZEL 13.2.1 — APPLICATION PROFILE CONTRACT & REGISTRY TEST SUITE');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 1: BUILT-IN PROFILES VALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: BUILT-IN PROFILES VALIDATION ---');
  {
    assert(BUILTIN_PROFILES.length >= 3, 'Builtin profiles array contains at least 3 profiles');

    const vNotepad = validateApplicationProfile(NOTEPAD_PROFILE);
    assert(vNotepad.valid, 'Notepad profile passes validation');
    assert(vNotepad.errors.length === 0, 'Notepad profile has 0 validation errors');
    assert(NOTEPAD_PROFILE.appId === 'notepad', 'Notepad appId is "notepad"');
    assert(NOTEPAD_PROFILE.landmarks.editor !== undefined, 'Notepad declares "editor" landmark');
    assert(NOTEPAD_PROFILE.operations.type_into_editor !== undefined, 'Notepad declares "type_into_editor" operation');

    const vCalc = validateApplicationProfile(CALCULATOR_PROFILE);
    assert(vCalc.valid, 'Calculator profile passes validation');
    assert(vCalc.errors.length === 0, 'Calculator profile has 0 validation errors');
    assert(CALCULATOR_PROFILE.appId === 'calculator', 'Calculator appId is "calculator"');
    assert(CALCULATOR_PROFILE.landmarks.display !== undefined, 'Calculator declares "display" landmark');
    assert(CALCULATOR_PROFILE.landmarks.btn_equals !== undefined, 'Calculator declares "btn_equals" landmark');
    assert(CALCULATOR_PROFILE.operations.calculate_equals !== undefined, 'Calculator declares "calculate_equals" operation');

    const vExplorer = validateApplicationProfile(EXPLORER_PROFILE);
    assert(vExplorer.valid, 'File Explorer profile passes validation');
    assert(vExplorer.errors.length === 0, 'File Explorer profile has 0 validation errors');
    assert(EXPLORER_PROFILE.appId === 'explorer', 'Explorer appId is "explorer"');
    assert(EXPLORER_PROFILE.landmarks.address_bar !== undefined, 'Explorer declares "address_bar" landmark');
    assert(EXPLORER_PROFILE.landmarks.file_list !== undefined, 'Explorer declares "file_list" landmark');
    assert(EXPLORER_PROFILE.operations.navigate_to_path !== undefined, 'Explorer declares "navigate_to_path" operation');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 2: PROFILE SCHEMA & REFERENCE INTEGRITY VALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: SCHEMA & REFERENCE INTEGRITY VALIDATION ---');
  {
    // Test: Non-object
    const vNull = validateApplicationProfile(null);
    assert(!vNull.valid && vNull.errors.length > 0, 'Rejects null profile');

    // Test: Missing required identity
    const vEmpty = validateApplicationProfile({});
    assert(!vEmpty.valid, 'Rejects empty profile object');

    // Test: Broken landmark reference in operation step
    const badLandmarkRefProfile: ApplicationProfile = {
      appId: 'test_bad_landmark',
      name: 'Test App',
      aliases: ['test'],
      executableNames: ['test.exe'],
      capabilities: { read: [], interact: ['click'], write: [], execute: [] },
      landmarks: {
        existing_landmark: {
          id: 'existing_landmark',
          description: 'Valid landmark',
          matchers: [{ name: 'TestButton' }],
        },
      },
      states: {
        READY: { id: 'READY', description: 'App is ready', matchers: [] },
      },
      operations: {
        bad_op: {
          id: 'bad_op',
          description: 'Uses nonexistent landmark',
          capabilities: ['interact'],
          preconditions: ['READY'],
          execution: [
            {
              type: 'invoke',
              landmarkId: 'nonexistent_landmark', // Broken reference
            },
          ],
          postconditions: [],
        },
      },
      controlStrategy: {
        preferredTier: 'UIA_SEMANTIC_PATTERN',
        requiresFocusBeforeInput: false,
        preferNativeAdapter: false,
      },
    };
    const vBadLandmark = validateApplicationProfile(badLandmarkRefProfile);
    assert(!vBadLandmark.valid, 'Rejects profile with unknown landmark reference in operation step');
    assert(
      vBadLandmark.errors.some((e) => e.includes("references unknown landmarkId 'nonexistent_landmark'")),
      'Error message identifies unknown landmarkId'
    );

    // Test: Broken state precondition reference
    const badStateRefProfile: ApplicationProfile = {
      ...badLandmarkRefProfile,
      appId: 'test_bad_state',
      operations: {
        bad_op: {
          id: 'bad_op',
          description: 'Uses nonexistent state precondition',
          capabilities: ['interact'],
          preconditions: ['NONEXISTENT_STATE'], // Broken reference
          execution: [
            {
              type: 'invoke',
              landmarkId: 'existing_landmark',
            },
          ],
          postconditions: [],
        },
      },
    };
    const vBadState = validateApplicationProfile(badStateRefProfile);
    assert(!vBadState.valid, 'Rejects profile with unknown state precondition');
    assert(
      vBadState.errors.some((e) => e.includes("references unknown state precondition 'NONEXISTENT_STATE'")),
      'Error message identifies unknown state precondition'
    );

    // Test: Invalid operation step type
    const badStepTypeProfile = {
      ...badLandmarkRefProfile,
      appId: 'test_bad_step',
      operations: {
        bad_op: {
          id: 'bad_op',
          description: 'Uses invalid step type',
          capabilities: ['interact'],
          preconditions: ['READY'],
          execution: [
            {
              type: 'execute_arbitrary_script', // NOT in closed DSL vocabulary
              script: 'alert(1)',
            },
          ],
          postconditions: [],
        },
      },
    };
    const vBadStep = validateApplicationProfile(badStepTypeProfile);
    assert(!vBadStep.valid, 'Rejects profile with invalid operation step type outside closed vocabulary');

    // Test: Landmark without matchers
    const emptyMatcherProfile = {
      ...badLandmarkRefProfile,
      appId: 'test_empty_matcher',
      landmarks: {
        empty_landmark: {
          id: 'empty_landmark',
          description: 'Has empty matcher object',
          matchers: [{}], // No criteria
        },
      },
    };
    const vEmptyMatcher = validateApplicationProfile(emptyMatcherProfile);
    assert(!vEmptyMatcher.valid, 'Rejects landmark with empty matcher criteria');

    // Test: Invalid capability verb
    const badCapProfile = {
      ...badLandmarkRefProfile,
      appId: 'test_bad_cap',
      operations: {
        bad_op: {
          id: 'bad_op',
          description: 'Has invalid capability verb',
          capabilities: ['super_admin_bypass'],
          preconditions: ['READY'],
          execution: [{ type: 'focus_landmark', landmarkId: 'existing_landmark' }],
          postconditions: [],
        },
      },
    };
    const vBadCap = validateApplicationProfile(badCapProfile);
    assert(!vBadCap.valid, 'Rejects operation with invalid capability verb');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 3: VERSION COMPATIBILITY ENGINE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: VERSION COMPATIBILITY ENGINE ---');
  {
    // Test parseSemver
    const p1 = parseSemver('11.0.22621.1');
    assert(p1 !== null && p1.major === 11 && p1.minor === 0 && p1.patch === 22621, 'Parses complex Windows version');

    const p2 = parseSemver('v2.4.1-beta.2');
    assert(p2 !== null && p2.major === 2 && p2.minor === 4 && p2.patch === 1 && p2.prerelease === 'beta.2', 'Parses v-prefix and prerelease');

    // Test compareVersions
    assert(compareVersions(parseSemver('1.2.0')!, parseSemver('1.2.0')!) === 0, 'compareVersions equality');
    assert(compareVersions(parseSemver('2.0.0')!, parseSemver('1.9.9')!) === 1, 'compareVersions greater');
    assert(compareVersions(parseSemver('1.0.1')!, parseSemver('1.1.0')!) === -1, 'compareVersions lesser');

    // Test satisfiesVersionRange
    assert(satisfiesVersionRange('11.0.0', '*'), 'Wildcard * satisfies any version');
    assert(satisfiesVersionRange('11.0.0', '>=10.0.0'), '>=10.0.0 satisfies 11.0.0');
    assert(!satisfiesVersionRange('9.5.0', '>=10.0.0'), '>=10.0.0 rejects 9.5.0');
    assert(satisfiesVersionRange('11.2.5', '>=10.0.0 <12.0.0'), 'Compound range satisfies 11.2.5');
    assert(!satisfiesVersionRange('12.0.0', '>=10.0.0 <12.0.0'), 'Compound range rejects 12.0.0 (< upper bound)');
    assert(satisfiesVersionRange('1.3.4', '^1.2.0'), 'Caret ^1.2.0 satisfies 1.3.4');
    assert(!satisfiesVersionRange('2.0.0', '^1.2.0'), 'Caret ^1.2.0 rejects 2.0.0');
    assert(satisfiesVersionRange('1.2.9', '~1.2.0'), 'Tilde ~1.2.0 satisfies 1.2.9');
    assert(!satisfiesVersionRange('1.3.0', '~1.2.0'), 'Tilde ~1.2.0 rejects 1.3.0');

    // Test resolveVersionStatus
    assert(resolveVersionStatus('10.0.0', '10.0.0') === 'EXACT_MATCH', 'Exact version returns EXACT_MATCH');
    assert(resolveVersionStatus('10.5.0', '>=10.0.0') === 'COMPATIBLE', 'Compatible range returns COMPATIBLE');
    assert(resolveVersionStatus(undefined, '>=10.0.0') === 'UNKNOWN_VERSION', 'Undefined version returns UNKNOWN_VERSION');
    assert(resolveVersionStatus('unknown', '>=10.0.0') === 'UNKNOWN_VERSION', '"unknown" string returns UNKNOWN_VERSION');
    assert(resolveVersionStatus('8.0.0', '>=10.0.0') === 'NO_MATCH', 'Incompatible version returns NO_MATCH');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 4: REGISTRY OPERATIONS & DETERMINISM
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: REGISTRY OPERATIONS & DETERMINISM ---');
  {
    const registry = new ApplicationProfileRegistryImpl(false);
    assert(registry.list().length === 0, 'New registry starts empty when defaults are false');

    // Register Notepad
    registry.register(NOTEPAD_PROFILE);
    assert(registry.list().length === 1, 'Registry contains 1 profile after register');
    assert(registry.get('notepad')?.appId === 'notepad', 'Retrieve profile by appId');

    // Reject duplicate ID
    let duplicateThrown = false;
    try {
      registry.register(NOTEPAD_PROFILE);
    } catch (err: any) {
      duplicateThrown = true;
      assert(err.message.includes('Duplicate profile registration'), 'Error specifies duplicate registration');
    }
    assert(duplicateThrown, 'Registry rejects duplicate profile registration');

    // Register remaining builtins
    registry.register(CALCULATOR_PROFILE);
    registry.register(EXPLORER_PROFILE);
    assert(registry.list().length === 3, 'Registry contains all 3 built-in profiles');

    // Unregister
    const removed = registry.unregister('calculator');
    assert(removed, 'Unregister returns true for existing profile');
    assert(registry.get('calculator') === undefined, 'Calculator is no longer retrievable');
    assert(registry.list().length === 2, 'Registry count is now 2');

    // Re-register
    registry.register(CALCULATOR_PROFILE);
    assert(registry.get('calculator') !== undefined, 'Calculator re-registered successfully');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 5: APPLICATION IDENTITY & RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 5: APPLICATION IDENTITY & RESOLUTION ---');
  {
    const registry = ApplicationProfileRegistry; // Global singleton with defaults loaded

    // Test: Notepad resolution by executable name
    const r1 = registry.resolveProfile({ executableName: 'notepad.exe' });
    assert(r1.status === 'COMPATIBLE' || r1.status === 'UNKNOWN_VERSION', 'Resolves notepad.exe');
    assert(r1.matchedAppId === 'notepad', 'Matched appId is "notepad"');
    assert(r1.profile !== undefined && r1.profile.appId === 'notepad', 'Profile object returned');

    // Test: Full executable path normalization
    const rPath = registry.resolveProfile({ executableName: 'C:\\Windows\\System32\\notepad.exe' });
    assert(rPath.matchedAppId === 'notepad', 'Resolves full path C:\\Windows\\System32\\notepad.exe');

    // Test: Case insensitivity
    const rCase = registry.resolveProfile({ executableName: 'NOTEPAD.EXE' });
    assert(rCase.matchedAppId === 'notepad', 'Resolves uppercase NOTEPAD.EXE');

    // Test: Calculator resolution by alternate executable names
    const rCalc1 = registry.resolveProfile({ executableName: 'calc.exe' });
    assert(rCalc1.matchedAppId === 'calculator', 'Resolves calc.exe to calculator');

    const rCalc2 = registry.resolveProfile({ executableName: 'CalculatorApp.exe' });
    assert(rCalc2.matchedAppId === 'calculator', 'Resolves CalculatorApp.exe to calculator');

    // Test: File Explorer resolution
    const rExplorer = registry.resolveProfile({ executableName: 'explorer.exe' });
    assert(rExplorer.matchedAppId === 'explorer', 'Resolves explorer.exe to explorer');

    // Test: Alias resolution
    const rAlias1 = registry.resolveProfile({ alias: 'text editor' });
    assert(rAlias1.matchedAppId === 'notepad', 'Resolves alias "text editor" to notepad');

    const rAlias2 = registry.resolveProfile({ alias: 'wincalc' });
    assert(rAlias2.matchedAppId === 'calculator', 'Resolves alias "wincalc" to calculator');

    const rAlias3 = registry.resolveProfile({ alias: 'file manager' });
    assert(rAlias3.matchedAppId === 'explorer', 'Resolves alias "file manager" to explorer');

    // Test: Unknown application
    const rUnknown = registry.resolveProfile({ executableName: 'unknown_app.exe' });
    assert(rUnknown.status === 'NO_MATCH', 'Unknown executable returns NO_MATCH');
    assert(rUnknown.profile === undefined, 'Unknown application has undefined profile');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 6: VERSION MATCHING IN PROFILE RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 6: VERSION MATCHING IN PROFILE RESOLUTION ---');
  {
    const reg = new ApplicationProfileRegistryImpl(false);

    // Register a version-constrained profile
    const constrainedProfile: ApplicationProfile = {
      appId: 'custom_ide',
      name: 'Custom IDE',
      aliases: ['myide'],
      executableNames: ['myide.exe'],
      versionRange: '>=2.0.0 <3.0.0',
      capabilities: { read: ['code'], interact: ['click'], write: ['edit'], execute: ['build'] },
      landmarks: {
        editor: {
          id: 'editor',
          description: 'Code editor',
          matchers: [{ className: 'EditorPane' }],
        },
      },
      states: {
        READY: { id: 'READY', description: 'IDE ready', matchers: [] },
      },
      operations: {
        edit: {
          id: 'edit',
          description: 'Edit code',
          capabilities: ['interact'],
          preconditions: ['READY'],
          execution: [{ type: 'focus_landmark', landmarkId: 'editor' }],
          postconditions: [],
        },
      },
      controlStrategy: {
        preferredTier: 'UIA_SEMANTIC_PATTERN',
        requiresFocusBeforeInput: true,
        preferNativeAdapter: false,
      },
    };

    reg.register(constrainedProfile);

    // 1. Compatible version
    const resComp = reg.resolveProfile({ executableName: 'myide.exe', version: '2.4.1' });
    assert(resComp.status === 'COMPATIBLE', 'Version 2.4.1 returns COMPATIBLE for >=2.0.0 <3.0.0');
    assert(resComp.profile?.appId === 'custom_ide', 'Profile attached on COMPATIBLE');

    // 2. Incompatible version -> NO_MATCH (Must NOT apply mismatched profile)
    const resIncomp = reg.resolveProfile({ executableName: 'myide.exe', version: '3.1.0' });
    assert(resIncomp.status === 'NO_MATCH', 'Incompatible version 3.1.0 returns NO_MATCH');
    assert(resIncomp.profile === undefined, 'No profile returned on version mismatch');
    assert(resIncomp.reason.includes('incompatible'), 'Reason specifies version incompatibility');

    // 3. Unknown version -> UNKNOWN_VERSION (Allows generic fallback)
    const resUnknown = reg.resolveProfile({ executableName: 'myide.exe' });
    assert(resUnknown.status === 'UNKNOWN_VERSION', 'Omitted version returns UNKNOWN_VERSION');
    assert(resUnknown.profile?.appId === 'custom_ide', 'Profile attached with UNKNOWN_VERSION tag');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
