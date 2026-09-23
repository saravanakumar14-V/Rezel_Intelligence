/**
 * Rezel 13.2.1 — Built-in Application Profile: Notepad
 *
 * Declarative profile for Windows Notepad (classic and modern WinUI 3 versions).
 */

import type { ApplicationProfile } from '../types';

export const NOTEPAD_PROFILE: ApplicationProfile = {
  appId: 'notepad',
  name: 'Notepad',
  vendor: 'Microsoft',
  aliases: ['notepad', 'text editor', 'editor', 'win32_notepad'],
  executableNames: ['notepad.exe'],
  versionRange: '*',

  capabilities: {
    read: ['document.text', 'document.title', 'window.status'],
    interact: ['editor.focus', 'menu.navigate', 'dialog.interact'],
    write: ['document.edit', 'document.clear'],
    execute: ['file.save', 'file.open', 'file.new'],
  },

  landmarks: {
    main_window: {
      id: 'main_window',
      description: 'Main Notepad application top-level window',
      matchers: [
        { className: 'Notepad' },
        { automationId: 'Notepad' },
        { name: 'Notepad' },
      ],
    },
    editor: {
      id: 'editor',
      description: 'Primary text editing canvas / document area',
      matchers: [
        { automationId: '15' },
        { automationId: 'ContentControl' },
        { className: 'Edit' },
        { className: 'RichEditD2DPT' },
        { controlType: 'Document' },
        { role: 'Document' },
        { role: 'Edit' },
      ],
    },
    file_menu: {
      id: 'file_menu',
      description: 'Top menu bar File item',
      matchers: [
        { name: 'File' },
        { automationId: 'File' },
        { role: 'MenuItem' },
      ],
    },
    status_bar: {
      id: 'status_bar',
      description: 'Bottom status bar showing cursor position and encoding',
      matchers: [
        { className: 'msctls_statusbar32' },
        { automationId: 'StatusBar' },
        { role: 'StatusBar' },
      ],
    },
  },

  states: {
    APP_READY: {
      id: 'APP_READY',
      description: 'Notepad window is active and responsive',
      matchers: [
        {
          operator: 'EXISTS',
          entityType: 'WINDOW',
        },
      ],
    },
    DOCUMENT_OPEN: {
      id: 'DOCUMENT_OPEN',
      description: 'A document is loaded in the editor',
      matchers: [
        {
          operator: 'EXISTS',
          entityType: 'DOCUMENT',
        },
      ],
    },
  },

  operations: {
    focus_editor: {
      id: 'focus_editor',
      description: 'Focus the text editor area ready for input',
      aliases: ['focus editor', 'focus document', 'activate editor'],
      capabilities: ['interact'],
      preconditions: ['APP_READY'],
      execution: [
        {
          type: 'focus_landmark',
          landmarkId: 'editor',
        },
      ],
      postconditions: [],
    },
    type_into_editor: {
      id: 'type_into_editor',
      description: 'Type text into the Notepad editor',
      aliases: ['type into editor', 'type text', 'write text', 'type', 'write into editor'],
      capabilities: ['interact', 'write'],
      parameters: [
        {
          name: 'text',
          type: 'string',
          description: 'Text string to type into the document',
          required: true,
        },
      ],
      preconditions: ['APP_READY'],
      execution: [
        {
          type: 'focus_landmark',
          landmarkId: 'editor',
        },
        {
          type: 'type_text',
          landmarkId: 'editor',
          textRef: 'text',
        },
      ],
      postconditions: [],
    },
    save_document: {
      id: 'save_document',
      description: 'Trigger standard Save hotkey',
      aliases: ['save document', 'save file', 'save', 'save current file'],
      capabilities: ['execute'],
      preconditions: ['APP_READY', 'DOCUMENT_OPEN'],
      execution: [
        {
          type: 'hotkey',
          keys: ['Ctrl', 's'],
        },
      ],
      postconditions: [],
    },
    new_document: {
      id: 'new_document',
      description: 'Create a new blank document tab or window',
      aliases: ['new document', 'create new document', 'new file', 'open new document'],
      capabilities: ['execute'],
      preconditions: ['APP_READY'],
      execution: [
        {
          type: 'hotkey',
          keys: ['Ctrl', 'n'],
        },
      ],
      postconditions: [],
    },
  },

  controlStrategy: {
    preferredTier: 'UIA_SEMANTIC_PATTERN',
    requiresFocusBeforeInput: true,
    preferNativeAdapter: false,
  },
};
