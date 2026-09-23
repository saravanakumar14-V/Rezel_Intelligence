import React, { useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, Lock, Terminal, FolderLock, Globe } from 'lucide-react';
import { PermissionManager } from '../../../lib/security/PermissionManager';

export const SecurityAuditWorkspace: React.FC = () => {
  const [grantedKeys, setGrantedKeys] = useState<readonly string[]>(() => {
    return PermissionManager.getGrantedKeys();
  });

  const handleRevokeAll = () => {
    PermissionManager.revokeAll();
    setGrantedKeys(PermissionManager.getGrantedKeys());
  };

  return (
    <div className="flex flex-col gap-4 w-full h-full min-h-[380px] p-4 text-xs font-sans select-none overflow-y-auto">
      {/* ── Section 1: Security Posture Status Banner ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1 p-3 rounded-lg bg-[#06102A]/90 border border-purple-500/30">
          <div className="flex items-center gap-2 text-purple-300 font-mono text-[10px] uppercase tracking-wider">
            <ShieldCheck size={13} className="text-purple-400" />
            <span>Sandbox Isolation</span>
          </div>
          <span className="text-sm font-semibold text-white">ACTIVE / ENFORCED</span>
          <span className="text-[10px] text-gray-400">Process boundary verified</span>
        </div>

        <div className="flex flex-col gap-1 p-3 rounded-lg bg-[#06102A]/90 border border-cyan-500/30">
          <div className="flex items-center gap-2 text-cyan-300 font-mono text-[10px] uppercase tracking-wider">
            <Lock size={13} className="text-cyan-400" />
            <span>Active Policy</span>
          </div>
          <span className="text-sm font-semibold text-cyan-200">LEAST PRIVILEGE</span>
          <span className="text-[10px] text-gray-400">Confirmation gates armed</span>
        </div>

        <div className="flex flex-col gap-1 p-3 rounded-lg bg-[#06102A]/90 border border-indigo-500/30">
          <div className="flex items-center gap-2 text-indigo-300 font-mono text-[10px] uppercase tracking-wider">
            <Shield size={13} className="text-indigo-400" />
            <span>Session Overrides</span>
          </div>
          <span className="text-sm font-semibold text-indigo-200">
            {grantedKeys.length} ACTIVE GRANTS
          </span>
          <span className="text-[10px] text-gray-400">Volatile in-memory grants</span>
        </div>
      </div>

      {/* ── Section 2: Active Session Grants (Read-Only Observability) ── */}
      <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-[#040C24]/80 border border-cyan-500/20">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] uppercase tracking-wider text-gray-300 font-semibold">
            Active Session Approvals (Ephemeral)
          </span>
          {grantedKeys.length > 0 && (
            <button
              type="button"
              onClick={handleRevokeAll}
              className="px-2 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-[10px] font-mono transition-colors cursor-pointer"
            >
              REVOKE ALL GRANTS
            </button>
          )}
        </div>

        {grantedKeys.length === 0 ? (
          <div className="p-3 rounded bg-black/40 border border-white/5 text-gray-400 text-[11px] italic">
            No session-level overrides active. All privileged actions will require explicit confirmation.
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {grantedKeys.map((k) => (
              <span
                key={k}
                className="px-2 py-1 rounded bg-purple-500/20 border border-purple-500/40 text-purple-200 font-mono text-[10px]"
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 3: Risk Classification Matrix ── */}
      <div className="flex flex-col gap-2 p-3.5 rounded-lg bg-[#040C24]/80 border border-purple-500/20">
        <span className="font-mono text-[11px] uppercase tracking-wider text-gray-300 font-semibold">
          Execution Risk Governance Matrix
        </span>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="flex items-start gap-2.5 p-2.5 rounded bg-black/30 border border-red-500/20">
            <ShieldAlert size={14} className="text-red-400 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="font-semibold text-red-300">CRITICAL / IRREVERSIBLE</span>
              <span className="text-[10px] text-gray-400">System shutdown, format, deletion</span>
              <span className="text-[9px] font-mono text-red-400 mt-1">POLICY: NEVER BYPASSABLE · PROMPT ALWAYS</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded bg-black/30 border border-amber-500/20">
            <Terminal size={14} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="font-semibold text-amber-300">HIGH / HOST EXECUTION</span>
              <span className="text-[10px] text-gray-400">Shell commands, process spawn, system paths</span>
              <span className="text-[9px] font-mono text-amber-400 mt-1">POLICY: ALWAYS REQUIRE CONFIRMATION</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded bg-black/30 border border-blue-500/20">
            <FolderLock size={14} className="text-blue-400 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="font-semibold text-blue-300">MEDIUM / WORKSPACE MUTATION</span>
              <span className="text-[10px] text-gray-400">File writing, directory creation, config update</span>
              <span className="text-[9px] font-mono text-blue-400 mt-1">POLICY: SESSION CONFIRMABLE</span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded bg-black/30 border border-emerald-500/20">
            <Globe size={14} className="text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex flex-col">
              <span className="font-semibold text-emerald-300">LOW / READ & TELEMETRY</span>
              <span className="text-[10px] text-gray-400">Read file, inspect system, local model inference</span>
              <span className="text-[9px] font-mono text-emerald-400 mt-1">POLICY: AUTO-PERMITTED READ ONLY</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
