import './mock_tauri_core.js';
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

import { WorkspaceStore, DEFAULT_WORKSPACE_ID } from './src/lib/workspace/WorkspaceStore.js';
import { WorkspaceManager } from './src/lib/workspace/WorkspaceManager.js';
import { ProjectManager } from './src/lib/workspace/ProjectManager.js';
import { ProjectContextResolver } from './src/lib/workspace/ProjectContextResolver.js';
import { RezelDirector } from './src/lib/director/RezelDirector.js';
import { WorkflowRuntime } from './src/lib/ai/WorkflowRuntime.js';
import { ResourceLockManager } from './src/lib/ai/scheduler/ResourceLockManager.js';
import type { ApplicationSession } from './src/lib/director/types.js';

async function runTests() {
  console.log('--- RUNNING MILESTONE 10.10 PHASE B WORKSPACE & PROJECT CONTEXT TESTS ---\n');

  await WorkspaceManager.initialize();
  WorkspaceStore.reset();

  // ====================================================================
  // Part 1: Default Workspace & Workspace CRUD (Tests A, B)
  // ====================================================================

  console.log('Test A: Default workspace initialization');
  {
    const defaultWs = WorkspaceManager.getActiveWorkspace();
    assert(defaultWs.id === DEFAULT_WORKSPACE_ID, 'Default workspace must have ws_default ID');
    assert(defaultWs.name === 'Default Workspace', 'Default workspace name is Default Workspace');
    console.log('  PASS: Test A');
  }

  console.log('Test B: Workspace CRUD operations');
  {
    const ws = WorkspaceManager.createWorkspace({
      name: 'Client Production',
      description: 'Client animation projects',
      rootDirectory: 'D:/Production',
      preferences: { autoCompanion: false }
    });

    assert(ws.id.startsWith('ws_'), 'Workspace ID prefix');
    assert(WorkspaceManager.getWorkspace(ws.id)?.name === 'Client Production', 'Workspace created and retrievable');

    WorkspaceManager.updateWorkspace(ws.id, { name: 'Client Production (Updated)' });
    assert(WorkspaceManager.getWorkspace(ws.id)?.name === 'Client Production (Updated)', 'Workspace updated');

    const all = WorkspaceManager.getAllWorkspaces();
    assert(all.some(w => w.id === ws.id), 'Workspace listed in all workspaces');

    WorkspaceManager.deleteWorkspace(ws.id);
    assert(WorkspaceManager.getWorkspace(ws.id) === undefined, 'Workspace deleted');
    console.log('  PASS: Test B');
  }

  // ====================================================================
  // Part 2: Project CRUD & Workspace Association (Tests C, D)
  // ====================================================================

  console.log('Test C: Project CRUD operations');
  {
    const proj = ProjectManager.createProject({
      name: 'Fantasy City',
      description: 'Medieval 3D city scene',
      projectType: 'CREATIVE_3D',
      rootPath: 'D:/Projects/FantasyCity',
      tags: ['blender', 'medieval', 'city']
    });

    assert(proj.id.startsWith('proj_'), 'Project ID prefix');
    assert(ProjectManager.getProject(proj.id)?.name === 'Fantasy City', 'Project retrievable');

    ProjectManager.updateProject(proj.id, { description: 'Updated 3D scene description' });
    assert(ProjectManager.getProject(proj.id)?.description === 'Updated 3D scene description', 'Project updated');

    console.log('  PASS: Test C');
  }

  console.log('Test D: Project/Workspace parent-child association');
  {
    const activeWs = WorkspaceManager.getActiveWorkspace();
    const proj = ProjectManager.createProject({
      workspaceId: activeWs.id,
      name: 'Associated Project',
      projectType: 'GENERAL'
    });

    const updatedWs = WorkspaceManager.getWorkspace(activeWs.id);
    assert(updatedWs?.projectIds.includes(proj.id) === true, 'Parent workspace indexes project ID');

    const wsProjects = WorkspaceStore.getProjectsForWorkspace(activeWs.id);
    assert(wsProjects.some(p => p.id === proj.id), 'Project retrieved via workspace');
    console.log('  PASS: Test D');
  }

  // ====================================================================
  // Part 3: Application & Asset Bindings (Tests E, R, S)
  // ====================================================================

  console.log('Test E & R: Multi-application project bindings');
  {
    const proj = ProjectManager.createProject({
      name: 'Fantasy Film',
      projectType: 'VIDEO_VFX',
      rootPath: 'D:/Films/FantasyFilm'
    });

    // Bind Blender
    ProjectManager.bindApplication(proj.id, {
      appId: 'blender',
      projectFilePath: 'D:/Films/FantasyFilm/scene_01.blend'
    });

    // Bind After Effects
    ProjectManager.bindApplication(proj.id, {
      appId: 'after_effects',
      projectFilePath: 'D:/Films/FantasyFilm/comp_vfx.aep'
    });

    const refreshed = ProjectManager.getProject(proj.id);
    assert(refreshed?.applications.length === 2, 'Project binds multiple applications');
    assert(refreshed?.applications.some(a => a.appId === 'blender'), 'Blender bound');
    assert(refreshed?.applications.some(a => a.appId === 'after_effects'), 'After Effects bound');

    // Unbind one
    ProjectManager.unbindApplication(proj.id, 'after_effects');
    assert(ProjectManager.getProject(proj.id)?.applications.length === 1, 'Unbind application works');
    console.log('  PASS: Test E & R');
  }

  console.log('Test S: Application session association and resolution');
  {
    const proj = ProjectManager.createProject({
      name: 'Sci-Fi Scene',
      projectType: 'CREATIVE_3D'
    });
    ProjectManager.bindApplication(proj.id, {
      appId: 'blender',
      projectFilePath: 'D:/SciFi/hangar.blend'
    });

    const activeSession: ApplicationSession = {
      appId: 'blender',
      connectionStatus: 'CONNECTED',
      activeProject: 'hangar.blend',
      foreground: true,
      capabilities: ['blender.create_object']
    };

    const resolved = ProjectContextResolver.resolveProject('generate assets', activeSession);
    assert(resolved?.id === proj.id, 'Resolved project matching active application file');
    console.log('  PASS: Test S');
  }

  // ====================================================================
  // Part 4: Workflow & Conversation Associations (Tests F, G, V)
  // ====================================================================

  console.log('Test F & G: Association of workflows and conversations');
  {
    const proj = ProjectManager.createProject({ name: 'Workflow Linked Project' });
    ProjectManager.associateWorkflow(proj.id, 'wf_alpha_101');
    ProjectManager.associateConversation(proj.id, 'conv_chat_202');

    const refreshed = ProjectManager.getProject(proj.id);
    assert(refreshed?.workflowIds.includes('wf_alpha_101') === true, 'Workflow ID associated');
    assert(refreshed?.conversationIds.includes('conv_chat_202') === true, 'Conversation ID associated');
    console.log('  PASS: Test F & G');
  }

  console.log('Test V: Single workflow authority invariant');
  {
    // ProjectManager and WorkspaceStore have NO workflow execution or cancellation powers
    assert(!('start' in ProjectManager), 'ProjectManager cannot start workflows');
    assert(!('cancel' in ProjectManager), 'ProjectManager cannot cancel workflows');
    assert(!('execute' in WorkspaceStore), 'WorkspaceStore cannot execute workflows');
    console.log('  PASS: Test V');
  }

  // ====================================================================
  // Part 5: Decision Memory (Tests N, I)
  // ====================================================================

  console.log('Test N: Decision creation, candidate status, and user confirmation');
  {
    const proj = ProjectManager.createProject({ name: 'Architecture Project' });

    // 1. Candidate decision (pending confirmation)
    const dec = ProjectManager.addDecision(
      proj.id,
      'Keep all buildings under four stories and gothic style.',
      'DESIGN',
      'conv_123',
      false // not confirmed yet
    );

    assert(dec !== null, 'Decision created');
    assert(dec.confirmedByUser === false, 'New candidate decision is unconfirmed');
    assert(ProjectManager.getConfirmedDecisions(proj.id).length === 0, 'Unconfirmed decision not in confirmed list');

    // 2. Explicit confirmation
    const confirmed = ProjectManager.confirmDecision(proj.id, dec.id);
    assert(confirmed === true, 'Decision confirmed');
    const confirmedList = ProjectManager.getConfirmedDecisions(proj.id);
    assert(confirmedList.length === 1, 'Confirmed decision now in confirmed list');
    assert(confirmedList[0].statement.includes('gothic style'), 'Statement preserved');
    console.log('  PASS: Test N');
  }

  // ====================================================================
  // Part 6: Context Snapshot & Bounding (Tests H, I, J, W, X)
  // ====================================================================

  console.log('Test H, I, J: Bounded ProjectContextSnapshot (max 5 decisions, max 3 changes)');
  {
    const proj = ProjectManager.createProject({
      name: 'Massive City',
      projectType: 'CREATIVE_3D',
      rootPath: 'D:/Projects/MassiveCity'
    });

    // Add 8 confirmed decisions
    for (let i = 1; i <= 8; i++) {
      const d = ProjectManager.addDecision(proj.id, `Decision #${i}`, 'GENERAL', undefined, true);
      assert(d !== null, 'Decision added');
    }

    // Add 5 recent changes
    for (let i = 1; i <= 5; i++) {
      ProjectManager.addRecentChange(proj.id, `Change #${i}`);
    }

    const snapshot = ProjectContextResolver.buildSnapshot(ProjectManager.getProject(proj.id) ?? null);

    assert(snapshot.project?.name === 'Massive City', 'Project name present');
    assert(snapshot.recentDecisions.length === 5, 'Decisions bounded to max 5');
    assert(snapshot.recentDecisions[4] === 'Decision #8', 'Most recent decision included');
    assert(snapshot.recentChanges.length === 3, 'Recent changes bounded to max 3');
    console.log('  PASS: Test H, I, J');
  }

  console.log('Test W: JSON serialization for external reasoning');
  {
    const proj = ProjectManager.getProject(ProjectManager.getAllProjects()[0]?.id);
    const snapshot = ProjectContextResolver.buildSnapshot(proj ?? null);
    const serialized = JSON.stringify(snapshot);
    const parsed = JSON.parse(serialized);

    assert(parsed.workspaceId !== undefined, 'WorkspaceId serializable');
    assert(parsed.recentDecisions !== undefined, 'Decisions serializable');
    console.log('  PASS: Test W');
  }

  console.log('Test X: Project context integration with ContextManager');
  {
    const proj = ProjectManager.createProject({ name: 'Director Context Project' });
    WorkspaceManager.setActiveProject(proj.id);

    const context = RezelDirector.getContext();
    assert(context.projectContext !== undefined, 'projectContext present in ContextSnapshot');
    assert(context.projectContext?.project?.id === proj.id, 'Active project populated in ContextSnapshot');
    console.log('  PASS: Test X');
  }

  // ====================================================================
  // Part 7: Project Context Switching & Lock Invariance (Tests K, L, M)
  // ====================================================================

  console.log('Test K, L, M: Safe project switching (no lock migration, no auto-resume)');
  {
    const projA = ProjectManager.createProject({ name: 'Project A' });
    const projB = ProjectManager.createProject({ name: 'Project B' });

    WorkspaceManager.setActiveProject(projA.id);
    assert(WorkspaceManager.getActiveProject()?.id === projA.id, 'Project A active');

    // Simulate lock held in system
    await ResourceLockManager.acquireLocks('wf_locked_in_A', 's1', [
      { uri: 'app.blender', access: 'EXCLUSIVE' }
    ]);

    // Switch to Project B
    const switchResult = RezelDirector.switchProject(projB.id);
    assert(switchResult.previousProjectId === projA.id, 'Previous project recorded');
    assert(switchResult.currentProjectId === projB.id, 'Current project updated to B');
    assert(WorkspaceManager.getActiveProject()?.id === projB.id, 'Active project is B');

    // Verify lock still belongs to wf_locked_in_A and was NOT migrated
    const hasLock = ResourceLockManager['activeLocks'].some(l => l.workflowId === 'wf_locked_in_A' && l.uri === 'app.blender');
    assert(hasLock === true, 'Lock belongs to original workflow, no migration');

    ResourceLockManager.releaseWorkflowLocks('wf_locked_in_A');
    console.log('  PASS: Test K, L, M');
  }

  // ====================================================================
  // Part 8: Persistence, Corruption & Recovery (Tests O, P, Q, T)
  // ====================================================================

  console.log('Test O, P, Q, T: Persistence save/load, corruption resilience, and schema versioning');
  {
    // 1. Clean save and load
    await WorkspaceStore.save();
    await WorkspaceStore.load(true);
    assert(WorkspaceStore.getAllProjects().length > 0, 'Projects restored on reload');

    // 2. Corrupted JSON simulation
    (mock_tauri_core_fs() as any)['rezel_workspace.json'] = 'INVALID_JSON_CORRUPT{{{';
    await WorkspaceStore.load(true);
    assert(WorkspaceStore.getAllWorkspaces().length === 1, 'Corrupted store fails closed to clean default workspace');

    // 3. Incompatible schema version
    (mock_tauri_core_fs() as any)['rezel_workspace.json'] = JSON.stringify({ version: 999, workspaces: {} });
    await WorkspaceStore.load(true);
    assert(WorkspaceStore.getActiveWorkspaceId() === DEFAULT_WORKSPACE_ID, 'Incompatible version starts fresh');
    console.log('  PASS: Test O, P, Q, T');
  }

  // ====================================================================
  // Part 9: Security Invariants (Test U)
  // ====================================================================

  console.log('Test U: Security boundary enforcement');
  {
    // Ensure no command execution or tool running is reachable from Workspace layer
    assert(!('execute' in WorkspaceStore), 'WorkspaceStore has no execution capabilities');
    assert(!('runShell' in ProjectManager), 'ProjectManager cannot execute shell commands');
    assert(!('authorize' in ProjectContextResolver), 'ProjectContextResolver cannot grant authorizations');
    console.log('  PASS: Test U');
  }

  console.log('\n========================================');
  console.log('ALL MILESTONE 10.10 TESTS PASSED!');
  console.log('========================================\n');
}

function mock_tauri_core_fs() {
  const mod = import.meta as any;
  return (globalThis as any)._mockFileSystem || {};
}

runTests().catch(err => {
  console.error('Test 10.10 Failed:', err);
  process.exit(1);
});
