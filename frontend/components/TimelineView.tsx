"use client";

import React from "react";
import { useStore, TimelineEvent } from "@/store/useStore";
import { GitCommit, GitBranch, Terminal, ShieldAlert, CheckCircle, Award } from "lucide-react";

export default function TimelineView() {
  const { timeline } = useStore();

  if (!timeline || timeline.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-xl text-center text-gray-500 font-mono text-xs border border-white/5">
        <GitBranch className="h-8 w-8 mx-auto mb-4 text-cyan-400 opacity-60 animate-pulse" />
        <span>No operations recorded. Write a command to emit your first event.</span>
      </div>
    );
  }

  // Helper to format payload keys into text list
  const formatPayload = (payload: any) => {
    if (!payload || Object.keys(payload).length === 0) return null;
    return (
      <div className="bg-black/40 border border-gray-900 rounded p-2 mt-1 text-[10px] font-mono text-gray-400 max-w-md break-all leading-normal">
        {Object.entries(payload).map(([k, v]) => (
          <div key={k}>
            <span className="text-cyan-500">{k}:</span> {JSON.stringify(v)}
          </div>
        ))}
      </div>
    );
  };

  // Group events by transaction_id if present
  const renderEvent = (e: TimelineEvent, idx: number) => {
    const isTxn = !!e.transaction_id;
    const dateStr = new Date(e.timestamp).toLocaleString();

    return (
      <div key={e.id} className="relative flex gap-4 pl-12 group">
        {/* Timeline Connecting line */}
        {idx !== timeline.length - 1 && (
          <span className="absolute left-6 top-6 bottom-[-24px] w-0.5 bg-gray-800 group-hover:bg-gray-700 transition-colors" />
        )}

        {/* Timeline Icon */}
        <span className="absolute left-3.5 top-3.5 shrink-0 z-10">
          {e.status === "FAILED" ? (
            <ShieldAlert className="h-5 w-5 text-rose-500 bg-gray-950 rounded-full" />
          ) : e.operation.startsWith("CREATE_") ? (
            <GitCommit className="h-5 w-5 text-cyan-400 bg-gray-950 rounded-full" />
          ) : e.operation === "COMPLETE" ? (
            <CheckCircle className="h-5 w-5 text-emerald-500 bg-gray-950 rounded-full" />
          ) : (
            <Terminal className="h-5 w-5 text-violet-400 bg-gray-950 rounded-full" />
          )}
        </span>

        {/* Event Card Panel */}
        <div className="glass-panel w-full p-4 rounded-xl border border-white/5 bg-gray-950/20 group-hover:bg-gray-950/40 hover:border-white/10 transition-all flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-gray-200">{e.operation}</span>
              <span className="text-[10px] text-gray-500 font-mono">on {e.target}</span>
            </div>
            <span className="text-[9px] text-gray-500 font-mono">{dateStr}</span>
          </div>

          {formatPayload(e.payload)}

          {isTxn && (
            <div className="flex items-center gap-1.5 text-[8px] font-mono text-violet-400 uppercase tracking-widest mt-1">
              <GitBranch className="h-3 w-3" />
              <span>TxID: {e.transaction_id?.substring(0, 8)}...</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
        <GitBranch className="h-5 w-5 text-cyan-400" />
        <h2 className="font-mono font-bold text-sm tracking-wider text-gray-200">EVENT TIMELINE HISTORY (GIT LOG)</h2>
      </div>

      <div className="flex flex-col gap-5 pt-2">
        {timeline.map((e, idx) => renderEvent(e, idx))}
      </div>
    </div>
  );
}
