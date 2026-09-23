/**
 * Rezel 13.2.1 — Built-in Application Profile: Windows Calculator
 *
 * Declarative profile for Windows Calculator (calc.exe / CalculatorApp.exe).
 */

import type { ApplicationProfile } from '../types';

export const CALCULATOR_PROFILE: ApplicationProfile = {
  appId: 'calculator',
  name: 'Windows Calculator',
  vendor: 'Microsoft',
  aliases: ['calculator', 'calc', 'wincalc', 'standard calculator'],
  executableNames: ['calc.exe', 'CalculatorApp.exe', 'Calculator.exe'],
  versionRange: '*',

  capabilities: {
    read: ['display.result', 'window.mode'],
    interact: ['keypad.input', 'operator.select', 'display.clear'],
    write: [],
    execute: ['calculate.evaluate', 'history.clear'],
  },

  landmarks: {
    main_window: {
      id: 'main_window',
      description: 'Calculator top-level application window',
      matchers: [
        { className: 'ApplicationFrameWindow' },
        { automationId: 'Calculator' },
        { name: 'Calculator' },
      ],
    },
    display: {
      id: 'display',
      description: 'Primary calculation results display',
      matchers: [
        { automationId: 'CalculatorResults' },
        { name: 'Display is' },
        { role: 'Text' },
      ],
    },
    btn_0: {
      id: 'btn_0',
      description: 'Digit button 0',
      matchers: [{ automationId: 'num0Button' }, { name: 'Zero' }],
    },
    btn_1: {
      id: 'btn_1',
      description: 'Digit button 1',
      matchers: [{ automationId: 'num1Button' }, { name: 'One' }],
    },
    btn_2: {
      id: 'btn_2',
      description: 'Digit button 2',
      matchers: [{ automationId: 'num2Button' }, { name: 'Two' }],
    },
    btn_3: {
      id: 'btn_3',
      description: 'Digit button 3',
      matchers: [{ automationId: 'num3Button' }, { name: 'Three' }],
    },
    btn_4: {
      id: 'btn_4',
      description: 'Digit button 4',
      matchers: [{ automationId: 'num4Button' }, { name: 'Four' }],
    },
    btn_5: {
      id: 'btn_5',
      description: 'Digit button 5',
      matchers: [{ automationId: 'num5Button' }, { name: 'Five' }],
    },
    btn_6: {
      id: 'btn_6',
      description: 'Digit button 6',
      matchers: [{ automationId: 'num6Button' }, { name: 'Six' }],
    },
    btn_7: {
      id: 'btn_7',
      description: 'Digit button 7',
      matchers: [{ automationId: 'num7Button' }, { name: 'Seven' }],
    },
    btn_8: {
      id: 'btn_8',
      description: 'Digit button 8',
      matchers: [{ automationId: 'num8Button' }, { name: 'Eight' }],
    },
    btn_9: {
      id: 'btn_9',
      description: 'Digit button 9',
      matchers: [{ automationId: 'num9Button' }, { name: 'Nine' }],
    },
    btn_plus: {
      id: 'btn_plus',
      description: 'Addition operator button (+)',
      matchers: [{ automationId: 'plusButton' }, { name: 'Plus' }],
    },
    btn_minus: {
      id: 'btn_minus',
      description: 'Subtraction operator button (-)',
      matchers: [{ automationId: 'minusButton' }, { name: 'Minus' }],
    },
    btn_multiply: {
      id: 'btn_multiply',
      description: 'Multiplication operator button (×)',
      matchers: [{ automationId: 'multiplyButton' }, { name: 'Multiply' }],
    },
    btn_divide: {
      id: 'btn_divide',
      description: 'Division operator button (÷)',
      matchers: [{ automationId: 'divideButton' }, { name: 'Divide' }],
    },
    btn_equals: {
      id: 'btn_equals',
      description: 'Equals / Evaluate button (=)',
      matchers: [{ automationId: 'equalButton' }, { name: 'Equals' }],
    },
    btn_clear: {
      id: 'btn_clear',
      description: 'Clear current entry / display (C / CE)',
      matchers: [{ automationId: 'clearButton' }, { automationId: 'clearEntryButton' }, { name: 'Clear' }],
    },
  },

  states: {
    APP_READY: {
      id: 'APP_READY',
      description: 'Calculator window is open and ready for input',
      matchers: [
        {
          operator: 'EXISTS',
          entityType: 'WINDOW',
        },
      ],
    },
  },

  operations: {
    clear_display: {
      id: 'clear_display',
      description: 'Press clear button to reset current entry',
      aliases: ['clear display', 'clear entry', 'clear', 'reset calculator', 'reset display'],
      capabilities: ['interact'],
      preconditions: ['APP_READY'],
      execution: [
        {
          type: 'invoke',
          landmarkId: 'btn_clear',
        },
      ],
      postconditions: [],
    },
    calculate_equals: {
      id: 'calculate_equals',
      description: 'Press equals button to compute the pending operation',
      aliases: ['calculate equals', 'calculate', 'equals', 'evaluate', 'compute', 'press equals', 'get result'],
      capabilities: ['interact', 'execute'],
      preconditions: ['APP_READY'],
      execution: [
        {
          type: 'invoke',
          landmarkId: 'btn_equals',
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
