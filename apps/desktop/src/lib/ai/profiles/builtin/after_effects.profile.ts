/**
 * Rezel 13.3.1 / 13.3.3 — Built-in Application Profile: Adobe After Effects
 *
 * Declarative profile for Adobe After Effects with native CEP/ExtendScript execution strategy.
 */

import type { ApplicationProfile } from '../types';

export const AFTER_EFFECTS_PROFILE: ApplicationProfile = {
  appId: 'after_effects',
  name: 'Adobe After Effects',
  vendor: 'Adobe',
  aliases: ['after effects', 'aftereffects', 'ae', 'adobe after effects'],
  executableNames: ['AfterFX.exe', 'afterfx.exe'],
  versionRange: '*',

  capabilities: {
    read: ['project.info', 'composition.list', 'layer.list', 'engine.status'],
    interact: ['composition.select', 'layer.select'],
    write: ['layer.create', 'layer.edit', 'composition.create', 'project.edit', 'project.import'],
    execute: ['render.queue', 'project.save'],
  },

  landmarks: {
    main_window: {
      id: 'main_window',
      description: 'Adobe After Effects top-level application window',
      matchers: [
        { className: 'AE_CApplication_17.0' },
        { name: 'Adobe After Effects' },
      ],
    },
    comp_panel: {
      id: 'comp_panel',
      description: 'Active composition viewer panel',
      matchers: [
        { name: 'Composition' },
      ],
    },
    timeline: {
      id: 'timeline',
      description: 'Timeline and layer stack',
      matchers: [
        { name: 'Timeline' },
      ],
    },
  },

  states: {
    APP_READY: {
      id: 'APP_READY',
      description: 'After Effects application is running and reachable',
      matchers: [
        {
          operator: 'EXISTS',
          entityType: 'WINDOW',
        },
      ],
    },
    PROJECT_OPEN: {
      id: 'PROJECT_OPEN',
      description: 'An After Effects project is currently loaded',
      matchers: [
        {
          operator: 'EXISTS',
          entityType: 'DOCUMENT',
        },
      ],
    },
    ACTIVE_COMPOSITION: {
      id: 'ACTIVE_COMPOSITION',
      description: 'An active composition is loaded and ready for layer operations',
      matchers: [
        {
          operator: 'EXISTS',
          entityType: 'COMPOSITION',
        },
      ],
    },
  },

  operations: {
    add_text_layer: {
      id: 'add_text_layer',
      description: 'Adds a styled text layer to an After Effects composition',
      nativeCapabilityId: 'ae_add_text_layer',
      aliases: [
        'add text layer',
        'add text',
        'create text layer',
        'insert text layer',
        'type text layer',
        'write text',
      ],
      capabilities: ['write', 'interact'],
      parameters: [
        {
          name: 'text',
          type: 'string',
          description: 'Source text content',
          required: true,
        },
        {
          name: 'compId',
          type: 'number',
          description: 'Target composition ID',
          required: false,
        },
        {
          name: 'compName',
          type: 'string',
          description: 'Target composition name',
          required: false,
        },
        {
          name: 'fontSize',
          type: 'number',
          description: 'Font size in points',
          required: false,
        },
        {
          name: 'font',
          type: 'string',
          description: 'Font postscript name',
          required: false,
        },
      ],
      preconditions: ['ACTIVE_COMPOSITION'],
      execution: [],
      postconditions: [
        {
          operator: 'EXISTS',
          entityType: 'LAYER',
        },
      ],
    },

    create_comp: {
      id: 'create_comp',
      description: 'Creates a new composition in the active After Effects project',
      nativeCapabilityId: 'ae_create_comp',
      aliases: [
        'create comp',
        'create composition',
        'new comp',
        'new composition',
        'add comp',
      ],
      capabilities: ['write', 'interact'],
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Composition name',
          required: true,
        },
        {
          name: 'width',
          type: 'number',
          description: 'Width in pixels',
          required: false,
        },
        {
          name: 'height',
          type: 'number',
          description: 'Height in pixels',
          required: false,
        },
        {
          name: 'duration',
          type: 'number',
          description: 'Duration in seconds',
          required: false,
        },
        {
          name: 'frameRate',
          type: 'number',
          description: 'Frames per second',
          required: false,
        },
      ],
      preconditions: ['PROJECT_OPEN'],
      execution: [],
      postconditions: [
        {
          operator: 'EXISTS',
          entityType: 'COMPOSITION',
        },
      ],
    },

    set_transform: {
      id: 'set_transform',
      description: 'Sets transform properties (position, scale, rotation, opacity) of a layer',
      nativeCapabilityId: 'ae_set_transform',
      aliases: [
        'set transform',
        'set layer transform',
        'transform layer',
        'move layer',
        'scale layer',
        'rotate layer',
        'set layer opacity',
      ],
      capabilities: ['write', 'interact'],
      parameters: [
        {
          name: 'compId',
          type: 'number',
          description: 'Target composition ID',
          required: false,
        },
        {
          name: 'compName',
          type: 'string',
          description: 'Target composition name',
          required: false,
        },
        {
          name: 'layerIndex',
          type: 'number',
          description: 'Resolved target layer index',
          required: false,
        },
        {
          name: 'layerId',
          type: 'string',
          description: 'Target layer identifier',
          required: false,
        },
        {
          name: 'layerName',
          type: 'string',
          description: 'Target layer name',
          required: false,
        },
        {
          name: 'position',
          type: 'string',
          description: 'Position coordinate JSON string or descriptor',
          required: false,
        },
        {
          name: 'scale',
          type: 'string',
          description: 'Scale percentage JSON string or descriptor',
          required: false,
        },
        {
          name: 'rotation',
          type: 'number',
          description: 'Rotation angle in degrees',
          required: false,
        },
        {
          name: 'opacity',
          type: 'number',
          description: 'Opacity value (0-100)',
          required: false,
        },
      ],
      preconditions: ['ACTIVE_COMPOSITION'],
      execution: [],
      postconditions: [],
    },

    inspect_keyframes: {
      id: 'inspect_keyframes',
      description: 'Inspects keyframes, properties, and current time of a layer in After Effects',
      nativeCapabilityId: 'ae_inspect_timeline',
      aliases: [
        'inspect keyframes',
        'get keyframes',
        'read keyframes',
        'view keyframes',
        'inspect timeline',
        'get timeline',
      ],
      capabilities: ['read'],
      parameters: [
        {
          name: 'compId',
          type: 'number',
          description: 'Target composition ID',
          required: false,
        },
        {
          name: 'layerIndex',
          type: 'number',
          description: 'Target layer index',
          required: false,
        },
        {
          name: 'propertyPath',
          type: 'string',
          description: 'Target property path (e.g. Transform.Position)',
          required: false,
        },
        {
          name: 'maxKeyframes',
          type: 'number',
          description: 'Maximum keyframes to inspect',
          required: false,
        },
      ],
      preconditions: ['ACTIVE_COMPOSITION'],
      execution: [],
      postconditions: [],
    },

    add_keyframe: {
      id: 'add_keyframe',
      description: 'Adds a keyframe at a specified time for a property in the active composition',
      nativeCapabilityId: 'ae_add_keyframe',
      aliases: [
        'add keyframe',
        'insert keyframe',
        'create keyframe',
        'set keyframe',
        'animate property',
      ],
      capabilities: ['write', 'interact'],
      parameters: [
        {
          name: 'compId',
          type: 'number',
          description: 'Target composition ID',
          required: false,
        },
        {
          name: 'layerIndex',
          type: 'number',
          description: 'Target layer index',
          required: false,
        },
        {
          name: 'propertyPath',
          type: 'string',
          description: 'Target property path (e.g. Transform.Position)',
          required: true,
        },
        {
          name: 'time',
          type: 'number',
          description: 'Keyframe time in seconds',
          required: true,
        },
        {
          name: 'value',
          type: 'string',
          description: 'Keyframe value as string representation or number',
          required: true,
        },
      ],
      preconditions: ['ACTIVE_COMPOSITION'],
      execution: [],
      postconditions: [],
    },

    set_keyframe_value: {
      id: 'set_keyframe_value',
      description: 'Sets the value of an existing keyframe at a specified time',
      nativeCapabilityId: 'ae_set_keyframe_value',
      aliases: [
        'set keyframe value',
        'update keyframe',
        'modify keyframe',
        'change keyframe value',
      ],
      capabilities: ['write', 'interact'],
      parameters: [
        {
          name: 'compId',
          type: 'number',
          description: 'Target composition ID',
          required: false,
        },
        {
          name: 'layerIndex',
          type: 'number',
          description: 'Target layer index',
          required: false,
        },
        {
          name: 'propertyPath',
          type: 'string',
          description: 'Target property path (e.g. Transform.Position)',
          required: true,
        },
        {
          name: 'time',
          type: 'number',
          description: 'Target keyframe time in seconds',
          required: true,
        },
        {
          name: 'value',
          type: 'string',
          description: 'New keyframe value',
          required: true,
        },
      ],
      preconditions: ['ACTIVE_COMPOSITION'],
      execution: [],
      postconditions: [],
    },

    inspect_effects: {
      id: 'inspect_effects',
      description: 'Inspects effects applied to a layer and their parameters',
      nativeCapabilityId: 'ae_inspect_effects',
      aliases: [
        'inspect effects',
        'get effects',
        'list effects',
        'read effects',
        'view effects',
        'layer effects',
      ],
      capabilities: ['read'],
      parameters: [
        {
          name: 'compId',
          type: 'number',
          description: 'Target composition ID',
          required: false,
        },
        {
          name: 'layerIndex',
          type: 'number',
          description: 'Target layer index',
          required: false,
        },
        {
          name: 'maxEffects',
          type: 'number',
          description: 'Maximum effects to return',
          required: false,
        },
        {
          name: 'maxPropertiesPerEffect',
          type: 'number',
          description: 'Maximum properties per effect',
          required: false,
        },
      ],
      preconditions: ['ACTIVE_COMPOSITION'],
      execution: [],
      postconditions: [],
    },

    set_property_value: {
      id: 'set_property_value',
      description: 'Sets static value of an effect property on a layer',
      nativeCapabilityId: 'ae_set_property_value',
      aliases: [
        'set property value',
        'set effect property',
        'modify effect property',
        'update effect parameter',
        'change effect property',
      ],
      capabilities: ['write', 'interact'],
      parameters: [
        {
          name: 'compId',
          type: 'number',
          description: 'Target composition ID',
          required: false,
        },
        {
          name: 'layerIndex',
          type: 'number',
          description: 'Target layer index',
          required: true,
        },
        {
          name: 'propertyPath',
          type: 'string',
          description: 'Target property path (e.g. Effects.Gaussian Blur.Blurriness)',
          required: true,
        },
        {
          name: 'value',
          type: 'string',
          description: 'New static property value',
          required: true,
        },
        {
          name: 'effectMatchName',
          type: 'string',
          description: 'Optional effect matchName to disambiguate target effect',
          required: false,
        },
        {
          name: 'occurrenceIndex',
          type: 'number',
          description: 'Optional 1-based occurrence index for duplicate effects',
          required: false,
        },
      ],
      preconditions: ['ACTIVE_COMPOSITION'],
      execution: [],
      postconditions: [],
    },

    inspect_render_queue: {
      id: 'inspect_render_queue',
      description: 'Inspects items currently in the After Effects render queue',
      nativeCapabilityId: 'ae_inspect_render_queue',
      aliases: [
        'inspect render queue',
        'get render queue',
        'list render queue items',
        'check export queue',
        'show render queue',
      ],
      capabilities: ['read'],
      parameters: [
        {
          name: 'maxItems',
          type: 'number',
          description: 'Maximum queue items to retrieve (default: 100)',
          required: false,
        },
      ],
      preconditions: ['PROJECT_OPEN'],
      execution: [],
      postconditions: [],
    },

    add_to_render_queue: {
      id: 'add_to_render_queue',
      description: 'Adds an active or specified composition to the render queue',
      nativeCapabilityId: 'ae_add_to_render_queue',
      aliases: [
        'add to render queue',
        'queue composition for render',
        'queue for export',
        'add comp to render queue',
        'add composition to export queue',
      ],
      capabilities: ['write', 'interact'],
      parameters: [
        {
          name: 'compId',
          type: 'number',
          description: 'Target composition ID (defaults to active composition)',
          required: false,
        },
      ],
      preconditions: ['PROJECT_OPEN'],
      execution: [],
      postconditions: [],
    },

    set_render_output_path: {
      id: 'set_render_output_path',
      description: 'Sets the output destination file path for a render queue item',
      nativeCapabilityId: 'ae_set_render_output_path',
      aliases: [
        'set render output path',
        'set export path',
        'change render destination',
        'set render file path',
        'configure render output',
      ],
      capabilities: ['write', 'interact'],
      parameters: [
        {
          name: 'queueIndex',
          type: 'number',
          description: '1-based index of the target render queue item',
          required: true,
        },
        {
          name: 'outputFilePath',
          type: 'string',
          description: 'Normalized absolute output destination file path',
          required: true,
        },
        {
          name: 'expectedCompId',
          type: 'string',
          description: 'Optional composition ID to guard against stale index shift',
          required: false,
        },
      ],
      preconditions: ['PROJECT_OPEN'],
      execution: [],
      postconditions: [],
    },

    start_render: {
      id: 'start_render',
      description: 'Starts synchronous execution of all queued items in the render queue',
      nativeCapabilityId: 'ae_start_render',
      aliases: [
        'start render',
        'render queue',
        'render all',
        'execute render queue',
        'start export',
        'begin render',
      ],
      capabilities: ['write', 'interact'],
      parameters: [],
      preconditions: ['PROJECT_OPEN'],
      execution: [],
      postconditions: [],
    },

    import_file: {
      id: 'import_file',
      description: 'Imports an external media or footage file into the After Effects project',
      nativeCapabilityId: 'ae_import_file',
      aliases: [
        'import file',
        'import footage',
        'import asset',
        'import media',
        'load asset',
      ],
      capabilities: ['write', 'interact'],
      parameters: [
        {
          name: 'filePath',
          type: 'string',
          description: 'Absolute file path to the footage/asset to import',
          required: true,
        },
        {
          name: 'compId',
          type: 'number',
          description: 'Optional target composition ID to add the footage to as a layer',
          required: false,
        },
      ],
      preconditions: ['PROJECT_OPEN'],
      execution: [],
      postconditions: [],
    },
  },

  controlStrategy: {
    preferredTier: 'APPLICATION_NATIVE',
    requiresFocusBeforeInput: false,
    preferNativeAdapter: true,
  },
};

