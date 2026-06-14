"use client";

import React from "react";
import { useStore, StateNode } from "@/store/useStore";
import { AlertTriangle, Calendar, Clock, ArrowUpRight, Bookmark, Circle, AlertOctagon, PlayCircle, PauseCircle } from "lucide-react";

export default function MissionView() {
  const { stateTree, executeCommand, setActiveTab } = useStore();

  if (!stateTree) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#67736b] font-mono text-xs">
        <Clock className="h-6 w-6 animate-spin mb-4 text-[#7A8C74]" />
        <span>Syncing operational commitments...</span>
      </div>
    );
  }

  // Flatten the tree to extract tasks
  const allTasks: StateNode[] = [];
  
  const collectTasks = (node: StateNode) => {
    if (node.type === "TASK") allTasks.push(node);
    node.projects?.forEach(collectTasks);
    node.goals?.forEach(collectTasks);
    node.tasks?.forEach(collectTasks);
  };

  stateTree.responsibilities.forEach(collectTasks);
  stateTree.orphan_projects.forEach(collectTasks);
  stateTree.orphan_goals.forEach(collectTasks);
  stateTree.orphan_tasks.forEach(collectTasks);

  // Groupings
  const activeTasks = allTasks.filter((t) => t.status === "ACTIVE");
  const blockedItems = allTasks.filter((t) => t.status === "BLOCKED");
  const pausedTasks = allTasks.filter((t) => t.status === "PAUSED");
  const notStartedTasks = allTasks.filter((t) => t.status === "NOT_STARTED");
  const otherTasks = allTasks.filter(
    (t) => !["ACTIVE", "BLOCKED", "PAUSED", "NOT_STARTED"].includes(t.status)
  );

  const handleWhyBlocked = (slug: string) => {
    setActiveTab("console");
    executeCommand(`WHY BLOCKED ${slug}`);
  };

  const getPriorityColor = (priority?: string) => {
    if (priority === "URGENT") return "text-[#C25953] bg-[#C25953]/10 border-[#C25953]/20";
    if (priority === "HIGH") return "text-[#CE8D6D] bg-[#CE8D6D]/10 border-[#CE8D6D]/20";
    if (priority === "MEDIUM") return "text-[#7A8C74] bg-[#7A8C74]/10 border-[#7A8C74]/20";
    return "text-[#67736b] bg-[#e3dbcd]/30 border-[#e3dbcd]/50";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 1. Active Tasks */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <Bookmark className="h-4.5 w-4.5 text-[#7A8C74]" fill="#7A8C74" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">ACTIVE TASKS</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {activeTasks.length} items
          </span>
        </div>

        {activeTasks.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No active tasks. Use `START &lt;target&gt;` to activate a task.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
            {activeTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#e3dbcd] hover:border-[#d6cebf] transition-all"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-[#2c312e] font-sans font-semibold">{t.name}</span>
                  <span className="text-[9px] text-[#67736b] font-mono">slug: {t.slug}</span>
                </div>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${getPriorityColor(t.priority)}`}>
                  {t.priority || "MEDIUM"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Blocked Tasks */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <AlertOctagon className="h-4.5 w-4.5 text-[#C25953]" fill="#C25953" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">BLOCKED TASKS</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {blockedItems.length} items
          </span>
        </div>

        {blockedItems.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No blocked tasks. You are clear for takeoff.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
            {blockedItems.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#e3dbcd] hover:border-[#d6cebf] transition-all"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-[#2c312e] font-sans font-semibold">{t.name}</span>
                  <span className="text-[9px] text-[#67736b] font-mono">slug: {t.slug}</span>
                </div>
                <button
                  onClick={() => handleWhyBlocked(t.slug)}
                  className="flex items-center gap-1 text-[9px] font-mono text-[#7A8C74] hover:text-white border border-[#7A8C74]/20 hover:bg-[#7A8C74] bg-[#7A8C74]/5 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                >
                  <span>Why?</span>
                  <ArrowUpRight className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Paused Tasks */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <PauseCircle className="h-4.5 w-4.5 text-[#5C7CFA]" fill="#5C7CFA" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">PAUSED TASKS</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {pausedTasks.length} items
          </span>
        </div>

        {pausedTasks.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No paused tasks.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
            {pausedTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#e3dbcd] hover:border-[#d6cebf] transition-all"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-[#2c312e] font-sans font-semibold">{t.name}</span>
                  <span className="text-[9px] text-[#67736b] font-mono">slug: {t.slug}</span>
                </div>
                <span className="text-[9px] font-mono text-[#5C7CFA] bg-[#5C7CFA]/5 px-2.5 py-1 rounded-lg border border-[#5C7CFA]/15">
                  PAUSED
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Not Started Tasks */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <PlayCircle className="h-4.5 w-4.5 text-[#788896]" fill="#788896" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">BACKLOG / NOT STARTED</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {notStartedTasks.length} items
          </span>
        </div>

        {notStartedTasks.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No backlog items. All tasks are active or completed.
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
            {notStartedTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#e3dbcd] hover:border-[#d6cebf] transition-all"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-[#2c312e] font-sans font-semibold">{t.name}</span>
                  <span className="text-[9px] text-[#67736b] font-mono">slug: {t.slug}</span>
                </div>
                <span className="text-[9px] font-mono text-[#788896] bg-[#788896]/5 px-2.5 py-1 rounded-lg border border-[#788896]/15">
                  NOT STARTED
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Other Tasks */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm md:col-span-2">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <Clock className="h-4.5 w-4.5 text-[#CE8D6D]" fill="#CE8D6D" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">OTHER TASKS (COMPLETED / DEFERRED / ARCHIVED)</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {otherTasks.length} items
          </span>
        </div>

        {otherTasks.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No other tasks.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[350px] overflow-y-auto pr-1">
            {otherTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#e3dbcd] hover:border-[#d6cebf] transition-all"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-[#2c312e] font-sans font-semibold">{t.name}</span>
                  <span className="text-[9px] text-[#67736b] font-mono">slug: {t.slug}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  {t.status === "DEFERRED" && (
                    <span className="text-[9px] font-mono text-[#D4A351] mr-1">
                      {t.deferred_until ? `Until: ${t.deferred_until}` : `Until: ${t.deferred_condition}`}
                    </span>
                  )}
                  {t.status === "COMPLETED" && (
                    <span className="text-[9px] font-mono text-[#5F8C6E] bg-[#5F8C6E]/5 px-2 py-0.5 rounded border border-[#5F8C6E]/15">
                      COMPLETED
                    </span>
                  )}
                  {t.status === "DEFERRED" && (
                    <span className="text-[9px] font-mono text-[#D4A351] bg-[#D4A351]/5 px-2 py-0.5 rounded border border-[#D4A351]/15">
                      DEFERRED
                    </span>
                  )}
                  {t.status === "ARCHIVED" && (
                    <span className="text-[9px] font-mono text-[#67736b] bg-[#e3dbcd]/30 px-2 py-0.5 rounded border border-[#e3dbcd]/50">
                      ARCHIVED
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
