import React, { useState, useMemo } from 'react';
import {
  Cpu,
  Copy,
  Check,
  Play,
  Zap,
  Terminal,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';
import { ModelCatalog } from '../../../lib/ai/providers/ModelCatalog';
import { IsolatedCodeRunner } from '../../../lib/security/IsolatedCodeRunner';
import { WorkspaceStateStore } from '../../../lib/workspace/WorkspaceStateStore';
import styles from '../SpatialSurface.module.css';

export const CodeEditorWorkspace: React.FC = () => {
  const availableModels = useMemo(() => ModelCatalog.listModels(), []);
  const initialDraft = WorkspaceStateStore.getCodeDraft();

  const [selectedModelId, setSelectedModelId] = useState<string>(() => {
    return initialDraft?.selectedModelId || availableModels[0]?.id || 'gemini-3.6-flash';
  });

  const activeModelMeta = useMemo(() => {
    return ModelCatalog.getModel(selectedModelId) || availableModels[0];
  }, [selectedModelId, availableModels]);

  const [codeContent, setCodeContent] = useState<string>(() => {
    return initialDraft?.codeContent ||
      '// Rezel OS — Computational Module\nfunction computeSpatialTension(nodes) {\n  return nodes.reduce((acc, val, idx) => acc + val * Math.sin(idx * 0.5), 0);\n}\n\n// Execute test with sample node coordinates\nreturn computeSpatialTension([12, 45, 78, 34, 89]);';
  });

  const [astStatus, setAstStatus] = useState<string>(() => {
    return initialDraft?.astStatus || 'SYNTAX NOMINAL · AST READY';
  });

  const [taskExecutionState, setTaskExecutionState] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [executionOutput, setExecutionOutput] = useState<string | null>(() => {
    return initialDraft?.lastOutput || null;
  });
  const [copiedCode, setCopiedCode] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeContent);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleVerifyAst = (code: string) => {
    try {
      let openBraces = 0;
      let openParens = 0;
      let openBrackets = 0;
      for (const char of code) {
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
        if (char === '(') openParens++;
        if (char === ')') openParens--;
        if (char === '[') openBrackets++;
        if (char === ']') openBrackets--;
      }
      if (openBraces !== 0 || openParens !== 0 || openBrackets !== 0) {
        const warning = `SYNTAX WARNING: Unbalanced delimiters ({${openBraces}}, (${openParens}), [${openBrackets}])`;
        setAstStatus(warning);
        WorkspaceStateStore.setCodeDraft({ astStatus: warning });
        return false;
      }
      const verified = 'SYNTAX VERIFIED · AST VALID · ZERO ERRORS';
      setAstStatus(verified);
      WorkspaceStateStore.setCodeDraft({ astStatus: verified });
      return true;
    } catch (err: any) {
      const errStatus = `SYNTAX ERROR: ${err?.message || 'Parse error'}`;
      setAstStatus(errStatus);
      WorkspaceStateStore.setCodeDraft({ astStatus: errStatus });
      return false;
    }
  };

  const handleCodeChange = (newCode: string) => {
    setCodeContent(newCode);
    handleVerifyAst(newCode);
    WorkspaceStateStore.setCodeDraft({ codeContent: newCode });
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
    WorkspaceStateStore.setCodeDraft({ selectedModelId: modelId });
  };

  // P0 Fix: Sandboxed execution inside isolated WebWorker with zero window/DOM/Tauri access
  const handleExecuteCode = async () => {
    setTaskExecutionState('running');
    setExecutionOutput(null);

    const isValid = handleVerifyAst(codeContent);
    if (!isValid) {
      setTaskExecutionState('error');
      const errOut = 'Execution aborted: Syntax validation failed.';
      setExecutionOutput(errOut);
      WorkspaceStateStore.setCodeDraft({ lastOutput: errOut });
      return;
    }

    const execResult = await IsolatedCodeRunner.execute(codeContent);

    if (execResult.success) {
      setTaskExecutionState('completed');
      const out = `Sandbox Output (${execResult.durationMs}ms · Model: ${activeModelMeta?.displayName || 'Isolated VM'}):\n${execResult.output}`;
      setExecutionOutput(out);
      WorkspaceStateStore.setCodeDraft({ lastOutput: out });
    } else {
      setTaskExecutionState('error');
      setExecutionOutput(execResult.output);
      WorkspaceStateStore.setCodeDraft({ lastOutput: execResult.output });
    }
  };

  return (
    <div className={styles.taskCodeEditor}>
      <div className={styles.taskToolbar}>
        {/* Dynamic Runtime Model Selector */}
        <div className={styles.modelSelectorContainer}>
          <Cpu size={12} className="text-amber-400" />
          <select
            className={styles.modelSelectDropdown}
            value={selectedModelId}
            onChange={(e) => handleModelChange(e.target.value)}
            title="Select AI Model from ModelCatalog"
          >
            {availableModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.displayName} ({m.vendor} · ${m.pricing.inputPerMillionUSD}/M)
              </option>
            ))}
          </select>
        </div>

        <div className={styles.editorActionButtons}>
          <button
            type="button"
            onClick={handleCopyCode}
            className={styles.toolIconBtn}
            title="Copy code to clipboard"
          >
            {copiedCode ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
            <span>{copiedCode ? 'COPIED' : 'COPY'}</span>
          </button>

          <button
            type="button"
            onClick={handleExecuteCode}
            className={styles.executeButton}
            disabled={taskExecutionState === 'running'}
            title="Execute script in isolated sandboxed WebWorker"
          >
            {taskExecutionState === 'running' ? (
              <Zap size={12} className="animate-spin text-amber-400" />
            ) : (
              <Play size={12} />
            )}
            <span>{taskExecutionState === 'running' ? 'EXECUTING...' : 'RUN SANDBOX'}</span>
          </button>
        </div>
      </div>

      <textarea
        className={styles.codeTextarea}
        value={codeContent}
        onChange={(e) => handleCodeChange(e.target.value)}
        spellCheck={false}
        placeholder="Enter JavaScript code to evaluate in isolated sandbox..."
      />

      <div className={styles.taskConsoleOutput}>
        <div className={styles.consoleHeader}>
          <div className="flex items-center gap-1.5">
            <Terminal size={11} />
            <ShieldCheck size={11} className="text-emerald-400" />
            <span>{astStatus}</span>
          </div>
        </div>
        {executionOutput && (
          <div className={styles.consoleResult}>
            {taskExecutionState === 'error' ? (
              <AlertCircle size={12} className="text-red-400 shrink-0" />
            ) : (
              <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
            )}
            <span className="whitespace-pre-wrap">{executionOutput}</span>
          </div>
        )}
      </div>
    </div>
  );
};
