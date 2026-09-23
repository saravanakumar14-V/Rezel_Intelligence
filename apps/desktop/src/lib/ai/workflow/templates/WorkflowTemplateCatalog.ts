/**
 * REZEL PHASE 14 — WORKFLOW TEMPLATE CATALOG
 *
 * Declarative reusable workflow templates composing genuinely existing, registered
 * application capabilities (Blender + After Effects).
 *
 * Invariant:
 * - NO phantom or unverified capabilities.
 */

import type { WorkflowDefinition } from '../types';

export const BLENDER_TO_AFTER_EFFECTS_TEMPLATE: WorkflowDefinition = {
  id: 'blender_to_after_effects_asset_flow',
  version: '1.0.0',
  name: 'Blender 3D Asset to After Effects Composite Pipeline',
  description: 'Creates a verified 3D asset in Blender and creates a composite in After Effects.',
  inputs: [
    {
      name: 'meshName',
      type: 'string',
      description: 'Name of the 3D mesh object to create in Blender',
      required: true,
      defaultValue: 'HeroAsset',
    },
    {
      name: 'compName',
      type: 'string',
      description: 'Name of the destination composition in After Effects',
      required: true,
      defaultValue: 'MainComposite',
    },
  ],
  steps: [
    {
      id: 'step_blender_create',
      name: 'Create Blender Mesh Asset',
      description: 'Create 3D primitive mesh object in Blender',
      applicationId: 'blender',
      operationId: 'create_object',
      parameters: {
        name: '{{params.meshName}}',
        type: 'CUBE',
        location: '[0, 0, 0]',
      },
      dependencies: [],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      postconditions: [
        {
          operator: 'EXISTS',
          entityType: 'MESH',
        },
      ],
      outputArtifacts: [
        {
          name: 'blender_asset',
          type: 'OBJECT_REFERENCE',
          description: 'Verified 3D mesh object reference produced by Blender',
          required: true,
        },
      ],
    },
    {
      id: 'step_ae_create_comp',
      name: 'Create After Effects Composition',
      description: 'Create main destination composition in After Effects',
      applicationId: 'after_effects',
      operationId: 'create_comp',
      parameters: {
        name: '{{params.compName}}',
        width: 1920,
        height: 1080,
        duration: 10,
        frameRate: 30,
      },
      dependencies: ['step_blender_create'],
      preconditions: ['PROJECT_OPEN'],
      postconditions: [
        {
          operator: 'EXISTS',
          entityType: 'COMPOSITION',
        },
      ],
      outputArtifacts: [
        {
          name: 'ae_composition',
          type: 'COMPOSITION_REFERENCE',
          description: 'Created destination composition reference',
          required: true,
        },
      ],
    },
    {
      id: 'step_ae_add_title',
      name: 'Add Title Layer to AE Composition',
      description: 'Adds title text layer referencing the Blender asset',
      applicationId: 'after_effects',
      operationId: 'add_text_layer',
      parameters: {
        compName: '{{params.compName}}',
        text: 'Rendered Asset: {{artifacts.blender_asset}}',
        fontSize: 48,
      },
      dependencies: ['step_ae_create_comp'],
      preconditions: ['ACTIVE_COMPOSITION'],
      postconditions: [
        {
          operator: 'EXISTS',
          entityType: 'LAYER',
        },
      ],
    },
  ],
  outputs: [
    {
      name: 'final_composition',
      type: 'COMPOSITION_REFERENCE',
      sourceStepId: 'step_ae_create_comp',
      sourceArtifactName: 'ae_composition',
    },
  ],
};

export class WorkflowTemplateCatalogImpl {
  private templates = new Map<string, WorkflowDefinition>();

  constructor() {
    this.register(BLENDER_TO_AFTER_EFFECTS_TEMPLATE);
  }

  register(template: WorkflowDefinition): void {
    this.templates.set(template.id, template);
  }

  get(templateId: string): WorkflowDefinition | undefined {
    const t = this.templates.get(templateId);
    return t ? JSON.parse(JSON.stringify(t)) : undefined;
  }

  list(): WorkflowDefinition[] {
    return Array.from(this.templates.values()).map((t) => JSON.parse(JSON.stringify(t)));
  }
}

export const WorkflowTemplateCatalog = new WorkflowTemplateCatalogImpl();
