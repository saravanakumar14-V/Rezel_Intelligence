/**
 * REZEL PHASE 16 — WORKFLOW TEMPLATE REGISTRY & CANONICAL WORKFLOWS
 *
 * Implements the template registry and declares canonical creative workflows:
 * - Workflow A: Blender Asset Preparation
 * - Workflow B: Blender -> After Effects Handoff
 * - Workflow C: After Effects Production Export
 * - Workflow D: Reusable Parameterized Creative Template
 * - Workflow E: Full Deterministic Creative Pipeline
 */

import type { WorkflowTemplate } from '../types';

// ─── WORKFLOW A: Blender Asset Preparation ────────────────────────────────────

export const WORKFLOW_A_BLENDER_ASSET_PREP: WorkflowTemplate = {
  id: 'workflow_a_blender_asset_prep',
  version: '1.0.0',
  name: 'Blender 3D Asset Creation & Render Pipeline',
  description: 'Creates a 3D mesh object, applies transform and material, and renders/exports a verified file artifact in Blender.',
  parameters: [
    {
      name: 'meshName',
      type: 'string',
      description: 'Name of the 3D mesh object to create',
      required: true,
      defaultValue: 'HeroAsset',
    },
    {
      name: 'materialName',
      type: 'string',
      description: 'Name of the material to create and assign',
      required: true,
      defaultValue: 'HeroMaterial',
    },
    {
      name: 'renderOutputPath',
      type: 'string',
      description: 'Destination file path for the rendered image',
      required: true,
      defaultValue: 'C:\\renders\\hero_asset.png',
    },
  ],
  steps: [
    {
      id: 'step_create_mesh',
      name: 'Create Mesh Object',
      description: 'Creates a 3D cube object in Blender scene',
      applicationId: 'blender',
      operationId: 'create_object',
      parameters: {
        name: '{{inputs.meshName}}',
        type: 'CUBE',
        location: '[0, 0, 0]',
      },
      dependencies: [],
      preconditions: ['APP_READY'],
      postconditions: [
        {
          operator: 'EXISTS',
          entityType: 'MESH',
        },
      ],
      outputArtifacts: [
        {
          name: 'mesh_obj',
          type: 'OBJECT_REFERENCE',
          required: true,
        },
      ],
    },
    {
      id: 'step_transform_mesh',
      name: 'Transform Mesh Object',
      description: 'Positions and scales the mesh object',
      applicationId: 'blender',
      operationId: 'transform_object',
      parameters: {
        objectId: '{{inputs.meshName}}',
        location: '[0, 0, 1.5]',
        scale: '[1.2, 1.2, 1.2]',
      },
      dependencies: ['step_create_mesh'],
      preconditions: ['APP_READY'],
    },
    {
      id: 'step_create_material',
      name: 'Create Material',
      description: 'Creates a new PBR material in Blender',
      applicationId: 'blender',
      operationId: 'material_create',
      parameters: {
        name: '{{inputs.materialName}}',
      },
      dependencies: ['step_create_mesh'],
      preconditions: ['APP_READY'],
    },
    {
      id: 'step_assign_material',
      name: 'Assign Material to Mesh',
      description: 'Assigns created material to the mesh object',
      applicationId: 'blender',
      operationId: 'material_assign',
      parameters: {
        objectId: '{{inputs.meshName}}',
        materialName: '{{inputs.materialName}}',
      },
      dependencies: ['step_transform_mesh', 'step_create_material'],
      preconditions: ['APP_READY'],
    },
    {
      id: 'step_render_image',
      name: 'Render Image Asset',
      description: 'Renders the scene to an image file artifact',
      applicationId: 'blender',
      operationId: 'render_image',
      parameters: {
        outputPath: '{{inputs.renderOutputPath}}',
      },
      dependencies: ['step_assign_material'],
      preconditions: ['APP_READY'],
      outputArtifacts: [
        {
          name: 'rendered_image',
          type: 'FILE',
          description: 'Rendered asset file from Blender',
          required: true,
        },
      ],
    },
  ],
  outputs: [
    {
      name: 'final_render_file',
      type: 'FILE',
      sourceStepId: 'step_render_image',
      sourceArtifactName: 'rendered_image',
    },
  ],
};

// ─── WORKFLOW B: Blender → After Effects Handoff ──────────────────────────────

export const WORKFLOW_B_BLENDER_TO_AE: WorkflowTemplate = {
  id: 'workflow_b_blender_to_ae',
  version: '1.0.0',
  name: 'Blender to After Effects Asset Handoff',
  description: 'Renders an asset in Blender, validates the file artifact, and imports it directly into an After Effects composition.',
  parameters: [
    {
      name: 'meshName',
      type: 'string',
      required: true,
      defaultValue: 'BlenderModel',
    },
    {
      name: 'renderOutputPath',
      type: 'string',
      required: true,
      defaultValue: 'C:\\renders\\blender_render.png',
    },
    {
      name: 'compName',
      type: 'string',
      required: true,
      defaultValue: 'AE_Composite_Comp',
    },
  ],
  steps: [
    {
      id: 'step_blender_render',
      name: 'Render Blender Asset',
      description: 'Renders Blender scene to file artifact',
      applicationId: 'blender',
      operationId: 'render_image',
      parameters: {
        outputPath: '{{inputs.renderOutputPath}}',
      },
      dependencies: [],
      preconditions: ['APP_READY'],
      outputArtifacts: [
        {
          name: 'blender_render_file',
          type: 'FILE',
          required: true,
        },
      ],
    },
    {
      id: 'step_ae_create_comp',
      name: 'Create Destination Composition',
      description: 'Creates target comp in After Effects',
      applicationId: 'after_effects',
      operationId: 'create_comp',
      parameters: {
        name: '{{inputs.compName}}',
        width: 1920,
        height: 1080,
        duration: 10,
        frameRate: 30,
      },
      dependencies: [],
      preconditions: ['PROJECT_OPEN'],
    },
    {
      id: 'step_ae_import_render',
      name: 'Import Blender Render into AE',
      description: 'Imports verified Blender render file artifact into AE composition',
      applicationId: 'after_effects',
      operationId: 'import_file',
      parameters: {
        filePath: '{{artifacts.blender_render_file}}',
      },
      dependencies: ['step_blender_render', 'step_ae_create_comp'],
      conditions: [
        {
          type: 'artifact_exists',
          artifactName: 'blender_render_file',
        },
        {
          type: 'step_successful',
          stepId: 'step_blender_render',
        },
      ],
      preconditions: ['PROJECT_OPEN'],
      outputArtifacts: [
        {
          name: 'imported_footage',
          type: 'APPLICATION_RESOURCE',
          required: true,
        },
      ],
    },
  ],
  outputs: [
    {
      name: 'imported_asset',
      type: 'APPLICATION_RESOURCE',
      sourceStepId: 'step_ae_import_render',
      sourceArtifactName: 'imported_footage',
    },
  ],
};

// ─── WORKFLOW C: After Effects Production Export ──────────────────────────────

export const WORKFLOW_C_AE_PRODUCTION_EXPORT: WorkflowTemplate = {
  id: 'workflow_c_ae_production_export',
  version: '1.0.0',
  name: 'After Effects Production Comp & Render Pipeline',
  description: 'Creates a composition, adds title & layers, queues render, sets output path, and renders to disk.',
  parameters: [
    {
      name: 'compName',
      type: 'string',
      required: true,
      defaultValue: 'FinalExportComp',
    },
    {
      name: 'titleText',
      type: 'string',
      required: true,
      defaultValue: 'Rezel Intelligence',
    },
    {
      name: 'outputMoviePath',
      type: 'string',
      required: true,
      defaultValue: 'C:\\renders\\ae_output.mov',
    },
  ],
  steps: [
    {
      id: 'step_ae_comp',
      name: 'Create Production Comp',
      description: 'Create main 4K composition in After Effects',
      applicationId: 'after_effects',
      operationId: 'create_comp',
      parameters: {
        name: '{{inputs.compName}}',
        width: 3840,
        height: 2160,
        duration: 5,
        frameRate: 60,
      },
      dependencies: [],
      preconditions: ['PROJECT_OPEN'],
    },
    {
      id: 'step_ae_title',
      name: 'Add Title Layer',
      description: 'Add main title typography',
      applicationId: 'after_effects',
      operationId: 'add_text_layer',
      parameters: {
        compName: '{{inputs.compName}}',
        text: '{{inputs.titleText}}',
        fontSize: 72,
      },
      dependencies: ['step_ae_comp'],
      preconditions: ['ACTIVE_COMPOSITION'],
    },
    {
      id: 'step_ae_queue',
      name: 'Add to Render Queue',
      description: 'Enqueue active composition to render queue',
      applicationId: 'after_effects',
      operationId: 'add_to_render_queue',
      parameters: {},
      dependencies: ['step_ae_title'],
      preconditions: ['PROJECT_OPEN'],
    },
    {
      id: 'step_ae_output_path',
      name: 'Configure Render Output Destination',
      description: 'Set verified target file path for render item',
      applicationId: 'after_effects',
      operationId: 'set_render_output_path',
      parameters: {
        queueIndex: 1,
        outputFilePath: '{{inputs.outputMoviePath}}',
      },
      dependencies: ['step_ae_queue'],
      preconditions: ['PROJECT_OPEN'],
    },
    {
      id: 'step_ae_render',
      name: 'Execute Render',
      description: 'Triggers synchronous After Effects render queue',
      applicationId: 'after_effects',
      operationId: 'start_render',
      parameters: {},
      dependencies: ['step_ae_output_path'],
      preconditions: ['PROJECT_OPEN'],
      outputArtifacts: [
        {
          name: 'rendered_movie',
          type: 'FILE',
          required: true,
        },
      ],
    },
  ],
  outputs: [
    {
      name: 'final_movie',
      type: 'FILE',
      sourceStepId: 'step_ae_render',
      sourceArtifactName: 'rendered_movie',
    },
  ],
};

// ─── WORKFLOW D: Reusable Parameterized Creative Template ────────────────────

export const WORKFLOW_D_MOTION_GRAPHICS: WorkflowTemplate = {
  id: 'workflow_d_motion_graphics',
  version: '1.0.0',
  name: 'Parameterized Motion Graphics Template',
  description: 'Fully parameterized template substituting fonts, text, and transform values.',
  parameters: [
    {
      name: 'projectName',
      type: 'string',
      required: true,
      defaultValue: 'PromoVideo',
    },
    {
      name: 'headline',
      type: 'string',
      required: true,
      defaultValue: 'Next Gen OS',
    },
    {
      name: 'durationSeconds',
      type: 'number',
      required: true,
      defaultValue: 15,
    },
  ],
  steps: [
    {
      id: 'step_comp',
      name: 'Create Motion Comp',
      description: 'Create parameterized composition',
      applicationId: 'after_effects',
      operationId: 'create_comp',
      parameters: {
        name: '{{inputs.projectName}}_Comp',
        width: 1920,
        height: 1080,
        duration: '{{inputs.durationSeconds}}',
        frameRate: 30,
      },
      dependencies: [],
      preconditions: ['PROJECT_OPEN'],
    },
    {
      id: 'step_headline',
      name: 'Add Headline Text',
      description: 'Add stylized headline',
      applicationId: 'after_effects',
      operationId: 'add_text_layer',
      parameters: {
        compName: '{{inputs.projectName}}_Comp',
        text: '{{inputs.headline}}',
        fontSize: 64,
      },
      dependencies: ['step_comp'],
      preconditions: ['ACTIVE_COMPOSITION'],
    },
  ],
};

// ─── WORKFLOW E: Full Deterministic Creative Pipeline ─────────────────────────

export const WORKFLOW_E_FULL_CREATIVE_PIPELINE: WorkflowTemplate = {
  id: 'workflow_e_full_creative_pipeline',
  version: '1.0.0',
  name: 'Full Cross-Application 3D to VFX Production Pipeline',
  description: 'End-to-end multi-app pipeline: Blender model + render -> AE import -> VFX composition -> final export.',
  parameters: [
    {
      name: 'modelName',
      type: 'string',
      required: true,
      defaultValue: 'SciFi_Core',
    },
    {
      name: 'blenderRenderPath',
      type: 'string',
      required: true,
      defaultValue: 'C:\\renders\\core_3d.png',
    },
    {
      name: 'finalExportPath',
      type: 'string',
      required: true,
      defaultValue: 'C:\\renders\\final_vfx.mov',
    },
  ],
  steps: [
    {
      id: 'step_b_mesh',
      name: 'Blender: Model 3D Asset',
      description: 'Generate 3D asset in Blender',
      applicationId: 'blender',
      operationId: 'create_object',
      parameters: {
        name: '{{inputs.modelName}}',
        type: 'CYLINDER',
        location: '[0, 0, 0]',
      },
      dependencies: [],
      preconditions: ['APP_READY'],
    },
    {
      id: 'step_b_render',
      name: 'Blender: Render Still Frame',
      description: 'Renders 3D frame to disk artifact',
      applicationId: 'blender',
      operationId: 'render_image',
      parameters: {
        outputPath: '{{inputs.blenderRenderPath}}',
      },
      dependencies: ['step_b_mesh'],
      preconditions: ['APP_READY'],
      outputArtifacts: [
        {
          name: 'blender_frame',
          type: 'FILE',
          required: true,
        },
      ],
    },
    {
      id: 'step_ae_comp',
      name: 'AE: Create Master Comp',
      description: 'Creates composite workspace in AE',
      applicationId: 'after_effects',
      operationId: 'create_comp',
      parameters: {
        name: 'Master_VFX_Comp',
        width: 1920,
        height: 1080,
        duration: 10,
        frameRate: 30,
      },
      dependencies: [],
      preconditions: ['PROJECT_OPEN'],
    },
    {
      id: 'step_ae_import',
      name: 'AE: Import 3D Frame',
      description: 'Imports Blender render artifact into AE composition',
      applicationId: 'after_effects',
      operationId: 'import_file',
      parameters: {
        filePath: '{{artifacts.blender_frame}}',
      },
      dependencies: ['step_b_render', 'step_ae_comp'],
      conditions: [
        {
          type: 'artifact_exists',
          artifactName: 'blender_frame',
        },
      ],
      preconditions: ['PROJECT_OPEN'],
    },
    {
      id: 'step_ae_title',
      name: 'AE: Add HUD Text Layer',
      description: 'Adds UI text overlays in AE',
      applicationId: 'after_effects',
      operationId: 'add_text_layer',
      parameters: {
        compName: 'Master_VFX_Comp',
        text: 'VFX Overlay: {{inputs.modelName}}',
        fontSize: 36,
      },
      dependencies: ['step_ae_import'],
      preconditions: ['ACTIVE_COMPOSITION'],
    },
    {
      id: 'step_ae_queue',
      name: 'AE: Enqueue Master Comp',
      description: 'Adds comp to render queue',
      applicationId: 'after_effects',
      operationId: 'add_to_render_queue',
      parameters: {},
      dependencies: ['step_ae_title'],
      preconditions: ['PROJECT_OPEN'],
    },
    {
      id: 'step_ae_out_path',
      name: 'AE: Configure Output Path',
      description: 'Sets output path for final render',
      applicationId: 'after_effects',
      operationId: 'set_render_output_path',
      parameters: {
        queueIndex: 1,
        outputFilePath: '{{inputs.finalExportPath}}',
      },
      dependencies: ['step_ae_queue'],
      preconditions: ['PROJECT_OPEN'],
    },
    {
      id: 'step_ae_render',
      name: 'AE: Render Final Movie',
      description: 'Executes synchronous render queue',
      applicationId: 'after_effects',
      operationId: 'start_render',
      parameters: {},
      dependencies: ['step_ae_out_path'],
      preconditions: ['PROJECT_OPEN'],
      outputArtifacts: [
        {
          name: 'final_movie_file',
          type: 'FILE',
          required: true,
        },
      ],
    },
  ],
  outputs: [
    {
      name: 'final_production_output',
      type: 'FILE',
      sourceStepId: 'step_ae_render',
      sourceArtifactName: 'final_movie_file',
    },
  ],
};

// ─── REGISTRY CLASS ──────────────────────────────────────────────────────────

export class WorkflowTemplateRegistryImpl {
  private templates = new Map<string, WorkflowTemplate>();

  constructor() {
    this.register(WORKFLOW_A_BLENDER_ASSET_PREP);
    this.register(WORKFLOW_B_BLENDER_TO_AE);
    this.register(WORKFLOW_C_AE_PRODUCTION_EXPORT);
    this.register(WORKFLOW_D_MOTION_GRAPHICS);
    this.register(WORKFLOW_E_FULL_CREATIVE_PIPELINE);
  }

  register(template: WorkflowTemplate): void {
    this.templates.set(template.id, template);
  }

  get(templateId: string): WorkflowTemplate | undefined {
    const t = this.templates.get(templateId);
    return t ? JSON.parse(JSON.stringify(t)) : undefined;
  }

  list(): WorkflowTemplate[] {
    return Array.from(this.templates.values()).map((t) => JSON.parse(JSON.stringify(t)));
  }

  has(templateId: string): boolean {
    return this.templates.has(templateId);
  }
}

export const WorkflowTemplateRegistry = new WorkflowTemplateRegistryImpl();
