/**
 * Rezel 13.4 — Built-in Application Profile: Blender 3D
 *
 * Declarative profile for Blender 3D with native WebSocket IPC execution strategy.
 * Covers only verified, genuinely supported capabilities: inspect_scene, create_object, create_camera.
 */

import type { ApplicationProfile } from '../types';

export const BLENDER_PROFILE: ApplicationProfile = {
  appId: 'blender',
  name: 'Blender 3D',
  vendor: 'Blender Foundation',
  aliases: ['blender', 'blender 3d', 'blender3d'],
  executableNames: ['blender.exe', 'blender'],
  versionRange: '*',  capabilities: {
    read: ['scene.info', 'object.list', 'camera.list'],
    interact: ['object.select'],
    write: [
      'project.save',
      'scene.create',
      'scene.switch',
      'collection.create',
      'object.move_to_collection',
      'object.duplicate',
      'object.set_visibility',
      'object.set_active',
      'object.create',
      'camera.create',
      'empty.create',
      'light.create',
      'object.transform',
      'object.rename',
      'object.delete',
      'object.parent',
      'object.unparent',
      'material.create',
      'material.assign',
      'material.set_color',
      'animation.insert_keyframe',
      'render.image',
      'export.asset',
    ],
    execute: [],
  },


  landmarks: {
    main_window: {
      id: 'main_window',
      description: 'Blender 3D top-level application window',
      matchers: [
        { className: 'GHOST_WindowClass' },
        { name: 'Blender' },
      ],
    },
    viewport: {
      id: 'viewport',
      description: '3D Viewport editor area',
      matchers: [
        { name: '3D Viewport' },
      ],
    },
    outliner: {
      id: 'outliner',
      description: 'Scene outliner and collections tree',
      matchers: [
        { name: 'Outliner' },
      ],
    },
  },

  states: {
    APP_READY: {
      id: 'APP_READY',
      description: 'Blender 3D is running and reachable via IPC bridge',
      matchers: [
        {
          operator: 'EXISTS',
          entityType: 'WINDOW',
        },
      ],
    },
    ACTIVE_SCENE: {
      id: 'ACTIVE_SCENE',
      description: 'A valid active scene is loaded in Blender',
      matchers: [
        {
          operator: 'EXISTS',
          entityType: 'DOCUMENT',
        },
      ],
    },
    NO_ACTIVE_SCENE: {
      id: 'NO_ACTIVE_SCENE',
      description: 'No active scene is currently open in Blender',
      matchers: [],
    },
  },

  operations: {
    inspect_scene: {
      id: 'inspect_scene',
      description: 'Inspects objects, cameras, lights, and collections in active Blender scene',
      nativeCapabilityId: 'blender.inspect_scene',
      aliases: [
        'inspect scene',
        'inspect blender',
        'get blender scene',
        'list objects',
        'get objects',
        'scene info',
      ],
      capabilities: ['read'],
      parameters: [],
      preconditions: ['APP_READY'],
      execution: [],
      postconditions: [],
    },

    create_object: {
      id: 'create_object',
      description: 'Creates a primitive 3D mesh object (cube, sphere, plane, cylinder) in Blender',
      nativeCapabilityId: 'blender.create_object',
      aliases: [
        'create object',
        'add object',
        'create mesh',
        'add mesh',
        'create cube',
        'add cube',
        'create sphere',
        'add sphere',
        'create plane',
        'add plane',
        'create cylinder',
        'add cylinder',
      ],
      capabilities: ['write'],
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Unique name for the new object',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          description: 'Primitive type: CUBE, SPHERE, PLANE, or CYLINDER',
          required: false,
          defaultValue: 'CUBE',
        },
        {
          name: 'location',
          type: 'string',
          description: '[x, y, z] location coordinates or JSON string',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    create_camera: {
      id: 'create_camera',
      description: 'Creates and binds a camera in the active Blender scene',
      nativeCapabilityId: 'blender.create_camera',
      aliases: [
        'create camera',
        'add camera',
        'new camera',
        'insert camera',
      ],
      capabilities: ['write'],
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Name of the new camera object',
          required: true,
        },
        {
          name: 'location',
          type: 'string',
          description: '[x, y, z] location coordinates or JSON string',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    create_empty: {
      id: 'create_empty',
      description: 'Creates an empty object in the active Blender scene',
      nativeCapabilityId: 'blender.create_empty',
      aliases: ['create empty', 'add empty', 'new empty', 'insert empty'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Name of the empty object',
          required: true,
        },
        {
          name: 'emptyType',
          type: 'string',
          description: 'Display type (PLAIN_AXES, ARROWS, CUBE, SPHERE, etc.)',
          required: false,
        },
        {
          name: 'location',
          type: 'string',
          description: '[x, y, z] coordinates',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    create_light: {
      id: 'create_light',
      description: 'Creates a light in the active Blender scene',
      nativeCapabilityId: 'blender.create_light',
      aliases: ['create light', 'add light', 'new light', 'insert light'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Name of the light',
          required: true,
        },
        {
          name: 'type',
          type: 'string',
          description: 'Light type (POINT, SUN, SPOT, AREA)',
          required: false,
        },
        {
          name: 'location',
          type: 'string',
          description: '[x, y, z] coordinates',
          required: false,
        },
        {
          name: 'energy',
          type: 'number',
          description: 'Energy in Watts',
          required: false,
        },
        {
          name: 'color',
          type: 'string',
          description: '[r, g, b] color',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    transform_object: {
      id: 'transform_object',
      description: 'Transforms an existing object location, rotation, or scale in Blender',
      nativeCapabilityId: 'blender.transform_object',
      aliases: [
        'transform object',
        'move object',
        'rotate object',
        'scale object',
        'set object transform',
        'set location',
        'set rotation',
        'set scale',
      ],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Target object ID or name to transform',
          required: true,
        },
        {
          name: 'name',
          type: 'string',
          description: 'Target object name alias',
          required: false,
        },
        {
          name: 'location',
          type: 'string',
          description: '[x, y, z] location coordinates or JSON string',
          required: false,
        },
        {
          name: 'rotation',
          type: 'string',
          description: '[x, y, z] Euler rotation in radians or JSON string',
          required: false,
        },
        {
          name: 'rotationMode',
          type: 'string',
          description: 'Rotation mode (e.g. XYZ)',
          required: false,
        },
        {
          name: 'scale',
          type: 'string',
          description: '[x, y, z] scale dimensions or JSON string',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    rename_object: {
      id: 'rename_object',
      description: 'Renames an existing object in Blender',
      nativeCapabilityId: 'blender.rename_object',
      aliases: [
        'rename object',
        'change object name',
        'set object name',
      ],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Current object ID or name',
          required: true,
        },
        {
          name: 'name',
          type: 'string',
          description: 'Current object name alias',
          required: false,
        },
        {
          name: 'newName',
          type: 'string',
          description: 'New unique name for the object',
          required: true,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    delete_object: {
      id: 'delete_object',
      description: 'Deletes an existing object from the Blender scene',
      nativeCapabilityId: 'blender.delete_object',
      aliases: [
        'delete object',
        'remove object',
        'destroy object',
      ],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Target object ID or name to delete',
          required: true,
        },
        {
          name: 'name',
          type: 'string',
          description: 'Target object name alias',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    project_save: {
      id: 'project_save',
      description: 'Saves current Blender project file',
      nativeCapabilityId: 'blender.project.save',
      aliases: ['save project', 'save file', 'save blend'],
      capabilities: ['write'],
      parameters: [],
      preconditions: ['APP_READY'],
      execution: [],
      postconditions: [],
    },

    project_save_as: {
      id: 'project_save_as',
      description: 'Saves current Blender project to an authorized absolute path',
      nativeCapabilityId: 'blender.project.save_as',
      aliases: ['save as', 'save project as', 'save blend as'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'filepath',
          type: 'string',
          description: 'Destination absolute file path',
          required: true,
        },
      ],
      preconditions: ['APP_READY'],
      execution: [],
      postconditions: [],
    },

    scene_create: {
      id: 'scene_create',
      description: 'Creates a new scene in the Blender project',
      nativeCapabilityId: 'blender.scene.create',
      aliases: ['create scene', 'add scene', 'new scene'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Name of the new scene',
          required: true,
        },
        {
          name: 'setActive',
          type: 'boolean',
          description: 'Switch to new scene',
          required: false,
        },
      ],
      preconditions: ['APP_READY'],
      execution: [],
      postconditions: [],
    },

    scene_switch: {
      id: 'scene_switch',
      description: 'Switches the active scene in Blender',
      nativeCapabilityId: 'blender.scene.switch',
      aliases: ['switch scene', 'select scene', 'change scene', 'set active scene'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'sceneName',
          type: 'string',
          description: 'Target scene name',
          required: true,
        },
      ],
      preconditions: ['APP_READY'],
      execution: [],
      postconditions: [],
    },

    collection_create: {
      id: 'collection_create',
      description: 'Creates a new collection in the Blender scene',
      nativeCapabilityId: 'blender.collection.create',
      aliases: ['create collection', 'add collection', 'new collection'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Name of the new collection',
          required: true,
        },
        {
          name: 'parentCollection',
          type: 'string',
          description: 'Optional parent collection',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    object_move_to_collection: {
      id: 'object_move_to_collection',
      description: 'Moves an object into a specified collection',
      nativeCapabilityId: 'blender.object.move_to_collection',
      aliases: ['move object to collection', 'add object to collection', 'set collection'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Target object name or ID',
          required: true,
        },
        {
          name: 'targetCollection',
          type: 'string',
          description: 'Destination collection name',
          required: true,
        },
        {
          name: 'unlinkFromOthers',
          type: 'boolean',
          description: 'Unlink from previous collections',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    object_duplicate: {
      id: 'object_duplicate',
      description: 'Duplicates an existing object in Blender',
      nativeCapabilityId: 'blender.object.duplicate',
      aliases: ['duplicate object', 'clone object', 'copy object'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Target object name or ID',
          required: true,
        },
        {
          name: 'newName',
          type: 'string',
          description: 'Optional name for duplicate',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    object_set_visibility: {
      id: 'object_set_visibility',
      description: 'Sets viewport and render visibility for an object',
      nativeCapabilityId: 'blender.object.set_visibility',
      aliases: ['set visibility', 'hide object', 'show object', 'toggle visibility'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Target object name or ID',
          required: true,
        },
        {
          name: 'viewport',
          type: 'boolean',
          description: 'Viewport visibility',
          required: false,
        },
        {
          name: 'render',
          type: 'boolean',
          description: 'Render visibility',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    object_set_active: {
      id: 'object_set_active',
      description: 'Sets active and selected state for an object',
      nativeCapabilityId: 'blender.object.set_active',
      aliases: ['set active object', 'select object', 'make active'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Target object name or ID',
          required: true,
        },
        {
          name: 'selected',
          type: 'boolean',
          description: 'Whether to select object',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    object_parent: {
      id: 'object_parent',
      description: 'Parents an object to another object with cycle prevention',
      nativeCapabilityId: 'blender.object.parent',
      aliases: ['parent object', 'set parent', 'attach object'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Child object name or ID',
          required: true,
        },
        {
          name: 'parentId',
          type: 'string',
          description: 'Parent object name or ID',
          required: true,
        },
        {
          name: 'keepTransform',
          type: 'boolean',
          description: 'Preserve world transform',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    object_unparent: {
      id: 'object_unparent',
      description: 'Clears parent from an object',
      nativeCapabilityId: 'blender.object.unparent',
      aliases: ['unparent object', 'clear parent', 'detach object'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Child object name or ID',
          required: true,
        },
        {
          name: 'keepTransform',
          type: 'boolean',
          description: 'Preserve world transform',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    material_create: {
      id: 'material_create',
      description: 'Creates a new material in Blender',
      nativeCapabilityId: 'blender.material.create',
      aliases: ['create material', 'add material', 'new material'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'name',
          type: 'string',
          description: 'Name of the material',
          required: true,
        },
        {
          name: 'color',
          type: 'string',
          description: 'RGBA color [r, g, b, a] or JSON string',
          required: false,
        },
      ],
      preconditions: ['APP_READY'],
      execution: [],
      postconditions: [],
    },

    material_assign: {
      id: 'material_assign',
      description: 'Assigns a material to an object',
      nativeCapabilityId: 'blender.material.assign',
      aliases: ['assign material', 'set object material', 'apply material'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Target object name or ID',
          required: true,
        },
        {
          name: 'materialName',
          type: 'string',
          description: 'Target material name',
          required: true,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    material_set_color: {
      id: 'material_set_color',
      description: 'Sets the base color on a material',
      nativeCapabilityId: 'blender.material.set_color',
      aliases: ['set material color', 'change material color', 'color material'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'materialName',
          type: 'string',
          description: 'Material name',
          required: true,
        },
        {
          name: 'color',
          type: 'string',
          description: 'RGB/RGBA color [r, g, b, a] or JSON string',
          required: true,
        },
      ],
      preconditions: ['APP_READY'],
      execution: [],
      postconditions: [],
    },

    animation_insert_keyframe: {
      id: 'animation_insert_keyframe',
      description: 'Inserts a keyframe on an object transform property',
      nativeCapabilityId: 'blender.animation.insert_keyframe',
      aliases: ['insert keyframe', 'add keyframe', 'set keyframe', 'animate transform'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'objectId',
          type: 'string',
          description: 'Target object name or ID',
          required: true,
        },
        {
          name: 'property',
          type: 'string',
          description: 'Property: location, rotation_euler, scale',
          required: true,
        },
        {
          name: 'frame',
          type: 'number',
          description: 'Timeline frame number',
          required: true,
        },
        {
          name: 'value',
          type: 'string',
          description: 'Optional value [x, y, z] or JSON string',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    render_image: {
      id: 'render_image',
      description: 'Renders a still frame to a specified output file',
      nativeCapabilityId: 'blender.render.image',
      aliases: ['render image', 'render frame', 'render still', 'take render'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'outputPath',
          type: 'string',
          description: 'Absolute output file path',
          required: true,
        },
        {
          name: 'format',
          type: 'string',
          description: 'Image format: PNG, JPEG, OPEN_EXR',
          required: false,
        },
        {
          name: 'frame',
          type: 'number',
          description: 'Frame number to render',
          required: false,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
      execution: [],
      postconditions: [],
    },

    export_asset: {
      id: 'export_asset',
      description: 'Exports scene or asset to a file',
      nativeCapabilityId: 'blender.export.asset',
      aliases: ['export asset', 'export model', 'export scene', 'export gltf', 'export fbx', 'export obj'],
      capabilities: ['write'],
      parameters: [
        {
          name: 'outputPath',
          type: 'string',
          description: 'Absolute output file path',
          required: true,
        },
        {
          name: 'format',
          type: 'string',
          description: 'Export format: GLTF, FBX, OBJ, STL',
          required: true,
        },
      ],
      preconditions: ['APP_READY', 'ACTIVE_SCENE'],
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

