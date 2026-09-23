/**
 * Rezel 13.2.1 — Built-in Application Profile: Windows File Explorer
 *
 * Declarative profile for Windows File Explorer (explorer.exe).
 */

import type { ApplicationProfile } from '../types';

export const EXPLORER_PROFILE: ApplicationProfile = {
  appId: 'explorer',
  name: 'File Explorer',
  vendor: 'Microsoft',
  aliases: ['explorer', 'file explorer', 'windows explorer', 'file manager', 'files'],
  executableNames: ['explorer.exe'],
  versionRange: '*',

  capabilities: {
    read: ['folder.path', 'items.list', 'selection.current', 'window.title'],
    interact: ['address_bar.focus', 'navigation.tree', 'items.select', 'search.focus'],
    write: ['folder.create', 'item.rename'],
    execute: ['navigation.browse', 'view.refresh', 'item.open'],
  },

  landmarks: {
    main_window: {
      id: 'main_window',
      description: 'Top-level File Explorer window',
      matchers: [
        { className: 'CabinetWClass' },
        { automationId: 'CabinetWClass' },
        { name: 'File Explorer' },
      ],
    },
    address_bar: {
      id: 'address_bar',
      description: 'Breadcrumb and directory path address bar',
      matchers: [
        { automationId: 'AddressBandRoot' },
        { className: 'Address Band Root' },
        { automationId: '41477' },
        { role: 'ComboBox' },
        { role: 'Edit' },
      ],
    },
    navigation_pane: {
      id: 'navigation_pane',
      description: 'Left-side quick access and folder tree navigation pane',
      matchers: [
        { automationId: 'SysTreeView32' },
        { className: 'SysTreeView32' },
        { role: 'Tree' },
      ],
    },
    file_list: {
      id: 'file_list',
      description: 'Main files and folders item view area',
      matchers: [
        { automationId: 'UIItemsView' },
        { className: 'UIItemsView' },
        { className: 'DirectUIHWND' },
        { role: 'List' },
        { role: 'DataGrid' },
      ],
    },
    search_box: {
      id: 'search_box',
      description: 'Top-right folder search input box',
      matchers: [
        { automationId: 'SearchEditBoxWrapper' },
        { name: 'Search' },
        { role: 'Edit' },
      ],
    },
  },

  states: {
    APP_READY: {
      id: 'APP_READY',
      description: 'File Explorer window is open and displaying a folder view',
      matchers: [
        {
          operator: 'EXISTS',
          entityType: 'WINDOW',
        },
      ],
    },
  },

  operations: {
    focus_address_bar: {
      id: 'focus_address_bar',
      description: 'Focus the address bar for direct path input',
      aliases: ['focus address bar', 'focus path bar', 'activate address bar', 'address bar'],
      capabilities: ['interact'],
      preconditions: ['APP_READY'],
      execution: [
        {
          type: 'focus_landmark',
          landmarkId: 'address_bar',
        },
      ],
      postconditions: [],
    },
    navigate_to_path: {
      id: 'navigate_to_path',
      description: 'Navigate Explorer to a specific folder path via address bar',
      aliases: [
        'navigate to path',
        'go to path',
        'navigate to folder',
        'go to folder',
        'navigate',
        'open folder',
        'open path',
        'go to directory',
        'change directory',
        'go to',
      ],
      capabilities: ['interact', 'execute'],
      parameters: [
        {
          name: 'path',
          type: 'string',
          description: 'Absolute folder path to navigate to',
          required: true,
        },
      ],
      preconditions: ['APP_READY'],
      execution: [
        {
          type: 'focus_landmark',
          landmarkId: 'address_bar',
        },
        {
          type: 'type_text',
          landmarkId: 'address_bar',
          textRef: 'path',
        },
        {
          type: 'hotkey',
          keys: ['Enter'],
        },
      ],
      postconditions: [],
    },
    refresh_view: {
      id: 'refresh_view',
      description: 'Refresh the active folder view',
      aliases: ['refresh view', 'refresh folder', 'refresh', 'reload folder', 'reload'],
      capabilities: ['execute'],
      preconditions: ['APP_READY'],
      execution: [
        {
          type: 'hotkey',
          keys: ['F5'],
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
