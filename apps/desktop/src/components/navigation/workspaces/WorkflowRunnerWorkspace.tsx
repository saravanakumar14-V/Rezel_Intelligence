import React, { useState, useEffect, useMemo } from 'react';
import { Layers, RefreshCw } from 'lucide-react';
import { WorkflowRuntime } from '../../../lib/ai/WorkflowRuntime';
import { ToolRegistry } from '../../../lib/ai/ToolRegistry';
import type { Workflow } from '../../../lib/ai/types';

export const WorkflowRunnerWorkspace: React.FC = () => {
  const [activeWorkflows, setActiveWorkflows] = useState<Workflow[]>([]);
  const [recentWorkflows, setRecentWorkflows] = useState<Workflow[]>([]);

  const tools = useMemo(() => ToolRegistry.getAll(), []);

  const refresh = () => {
    setActiveWorkflows(WorkflowRuntime.listActive ? WorkflowRuntime.listActive() : []);
    setRecentWorkflows(WorkflowRuntime.listRecent ? WorkflowRuntime.listRecent() : []);
  };

  useEffect(() => {
    refresh();
  }, []);

  const allWorkflows = useMemo(() => {
    return [...activeWorkflows, ...recentWorkflows];
  }, [activeWorkflows, recentWorkflows]);

  return (
    <div className="flex flex-col h-full w-full min-h-[380px] p-2">
      {/* Header Stats */}
      <div className="flex items-center justify-between p-3 bg-[#040C24]/80 border border-emerald-500/20 rounded-xl mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Layers size={13} className="text-emerald-400" />
          <span className="font-mono text-[10px] tracking-wider text-emerald-300 uppercase font-bold">
            WORKFLOW RUNTIME · {activeWorkflows.length} ACTIVE · {tools.length} REGISTERED TOOLS
          </span>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-mono text-[9px] tracking-wider uppercase transition-colors"
        >
          <RefreshCw size={10} />
          <span>SYNC</span>
        </button>
      </div>

      {/* Workflow Queue */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {allWorkflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
            <Layers size={24} className="text-slate-600" />
            <span className="font-mono text-xs text-slate-400 font-bold uppercase tracking-widest">
              NO ACTIVE WORKFLOWS
            </span>
            <p className="font-sans text-xs text-slate-500 max-w-[280px]">
              Multi-step execution DAGs and autonomous pipelines will be tracked here when initiated through dialogue or tool dispatch.
            </p>
          </div>
        ) : (
          allWorkflows.map((wf) => (
            <div
              key={wf.id}
              className="flex items-center justify-between p-3 rounded-xl bg-[#060B1E]/60 border border-white/5"
            >
              <div className="flex flex-col gap-1">
                <span className="font-sans text-xs font-medium text-white">{wf.plan?.goal || wf.id}</span>
                <span className="font-mono text-[9px] text-slate-400">
                  {wf.plan?.steps?.length || 0} steps · Created {new Date(wf.plan?.createdAt || Date.now()).toLocaleTimeString()}
                </span>
              </div>

              <span className={`px-2 py-0.5 rounded font-mono text-[9px] uppercase font-bold ${
                wf.status === 'RUNNING' ? 'bg-amber-400/20 text-amber-300' : 'bg-emerald-400/20 text-emerald-300'
              }`}>
                {wf.status}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
