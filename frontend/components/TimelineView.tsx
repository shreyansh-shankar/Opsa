"use client";

import React from "react";
import { useStore, TimelineEvent } from "@/store/useStore";
import { GitCommit, GitBranch, Terminal, ShieldAlert, CheckCircle, Award } from "lucide-react";

export default function TimelineView() {
  const { timeline } = useStore();

  if (!timeline || timeline.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-2xl text-center text-[#67736b] font-mono text-xs border border-[#e3dbcd] bg-[#FAF7F2]">
        <GitBranch className="h-8 w-8 mx-auto mb-4 text-[#7A8C74] opacity-60 animate-pulse" />
        <span>No operations recorded. Write a command to emit your first event.</span>
      </div>
    );
  }

  // Helper to format payload keys into text list
  const formatPayload = (payload: any) => {
    if (!payload || Object.keys(payload).length === 0) return null;
    return (
      <div className="bg-[#2E3630] border border-[#2c312e]/10 rounded-xl p-3 mt-1.5 text-[10px] font-mono text-[#EDE9E1] max-w-md break-all leading-normal shadow-inner">
        {Object.entries(payload).map(([k, v]) => (
          <div key={k}>
            <span className="text-[#CE8D6D]">{k}:</span> {JSON.stringify(v)}
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
          <span className="absolute left-6 top-6 bottom-[-24px] w-0.5 bg-[#e3dbcd] group-hover:bg-[#d6cebf] transition-colors" />
        )}

        {/* Timeline Icon */}
        <span className="absolute left-3.5 top-3.5 shrink-0 z-10">
          {e.status === "FAILED" ? (
            <ShieldAlert className="h-5 w-5 text-[#C25953] bg-[#F5F0E6] rounded-full" />
          ) : e.operation.startsWith("CREATE_") ? (
            <GitCommit className="h-5 w-5 text-[#7A8C74] bg-[#F5F0E6] rounded-full" />
          ) : e.operation === "COMPLETE" ? (
            <CheckCircle className="h-5 w-5 text-[#5F8C6E] bg-[#F5F0E6] rounded-full" />
          ) : (
            <Terminal className="h-5 w-5 text-[#CE8D6D] bg-[#F5F0E6] rounded-full" />
          )}
        </span>

        {/* Event Card Panel */}
        <div className="glass-panel w-full p-4 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] group-hover:bg-[#FAF7F2] hover:border-[#d6cebf] hover:shadow-sm transition-all flex flex-col gap-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[#2c312e]">{e.operation}</span>
              <span className="text-[10px] text-[#67736b] font-mono">on {e.target}</span>
            </div>
            <span className="text-[9px] text-[#67736b] font-mono">{dateStr}</span>
          </div>

          {formatPayload(e.payload)}

          {isTxn && (
            <div className="flex items-center gap-1.5 text-[8px] font-mono text-[#CE8D6D] uppercase tracking-widest mt-1">
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
      <div className="flex items-center gap-2 border-b border-[#e3dbcd] pb-3">
        <GitBranch className="h-5 w-5 text-[#7A8C74]" />
        <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">EVENT TIMELINE HISTORY (GIT LOG)</h2>
      </div>

      <div className="flex flex-col gap-5 pt-2">
        {timeline.map((e, idx) => renderEvent(e, idx))}
      </div>
    </div>
  );
}
