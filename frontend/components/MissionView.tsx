"use client";

import React from "react";
import { useStore, StateNode } from "@/store/useStore";
import { AlertTriangle, Calendar, CheckCircle, ShieldAlert, Award, Clock, ArrowUpRight, Bookmark, CircleCheck, AlertOctagon, PlayCircle, PauseCircle } from "lucide-react";

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

  // Flatten the tree to extract items
  const allTasks: StateNode[] = [];
  const allGoals: StateNode[] = [];
  const allProjects: StateNode[] = [];
  
  const collect = (node: StateNode) => {
    if (node.type === "TASK") allTasks.push(node);
    else if (node.type === "GOAL") allGoals.push(node);
    else if (node.type === "PROJECT") allProjects.push(node);

    node.projects?.forEach(collect);
    node.goals?.forEach(collect);
    node.tasks?.forEach(collect);
  };

  stateTree.responsibilities.forEach(collect);
  stateTree.orphan_projects.forEach(collect);
  stateTree.orphan_goals.forEach(collect);
  stateTree.orphan_tasks.forEach(collect);

  // Groupings
  const priorities = allTasks.filter(
    (t) => t.status === "ACTIVE" && (t.priority === "URGENT" || t.priority === "HIGH")
  );
  const blockedItems = allTasks.filter((t) => t.status === "BLOCKED");
  const activeGoals = allGoals.filter((g) => g.status === "ACTIVE");
  const deferredTasks = allTasks.filter((t) => t.status === "DEFERRED");
  const pausedTasks = allTasks.filter((t) => t.status === "PAUSED");
  const notStartedTasks = allTasks.filter((t) => t.status === "NOT_STARTED");

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
      {/* 1. Today's Priorities */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <Bookmark className="h-4.5 w-4.5 text-[#CE8D6D]" fill="#CE8D6D" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">TODAY'S PRIORITIES</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {priorities.length} items
          </span>
        </div>

        {priorities.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No high-priority active tasks. Use PROMOTE to raise item priorities.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {priorities.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#e3dbcd] hover:border-[#d6cebf] transition-all"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-[#2c312e] font-sans font-semibold">{t.name}</span>
                  <span className="text-[9px] text-[#67736b] font-mono">slug: {t.slug}</span>
                </div>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${getPriorityColor(t.priority)}`}>
                  {t.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Blocked Work */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <AlertOctagon className="h-4.5 w-4.5 text-[#C25953]" fill="#C25953" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">BLOCKED WORK</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {blockedItems.length} items
          </span>
        </div>

        {blockedItems.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No blocked tasks. You are clear for takeoff.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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

      {/* 3. Active Commitments */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <CircleCheck className="h-4.5 w-4.5 text-[#5F8C6E]" fill="#5F8C6E" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">ACTIVE GOALS</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {activeGoals.length} items
          </span>
        </div>

        {activeGoals.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No active goals found. Declare a Goal under a Project.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeGoals.map((g) => {
              const goalTasks = g.tasks || [];
              const completedCount = goalTasks.filter((t) => t.status === "COMPLETED").length;
              const progressPct = goalTasks.length > 0 ? Math.round((completedCount / goalTasks.length) * 100) : 0;

              return (
                <div
                  key={g.id}
                  className="p-3.5 rounded-xl bg-[#F5F0E6]/30 border border-[#e3dbcd] flex flex-col gap-2.5"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-xs text-[#2c312e] font-sans font-bold">{g.name}</span>
                      <span className="text-[9px] text-[#67736b] font-mono">slug: {g.slug}</span>
                    </div>
                    <span className="text-[9px] font-mono text-[#7A8C74] font-semibold">
                      {completedCount}/{goalTasks.length} tasks ({progressPct}%)
                    </span>
                  </div>

                  <div className="w-full bg-[#e3dbcd] rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-[#7A8C74] h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Deferred Queue */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <Calendar className="h-4.5 w-4.5 text-[#D4A351]" fill="#D4A351" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">DEFERRED QUEUE</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {deferredTasks.length} items
          </span>
        </div>

        {deferredTasks.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No deferred tasks.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {deferredTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#e3dbcd]"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-[#2c312e] font-sans font-semibold">{t.name}</span>
                  <span className="text-[9px] text-[#67736b] font-mono">slug: {t.slug}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[9px] font-mono text-[#D4A351] bg-[#D4A351]/5 px-2.5 py-1 rounded-lg border border-[#D4A351]/15">
                  <Clock className="h-3 w-3" />
                  <span>
                    {t.deferred_until
                      ? `Until: ${t.deferred_until}`
                      : `Until: ${t.deferred_condition}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Paused Work */}
      <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
          <PauseCircle className="h-4.5 w-4.5 text-[#5C7CFA]" fill="#5C7CFA" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">PAUSED WORK</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
            {pausedTasks.length} items
          </span>
        </div>

        {pausedTasks.length === 0 ? (
          <div className="text-[#67736b] text-xs font-sans py-12 text-center italic">
            No paused tasks.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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

      {/* 6. Backlog / Not Started */}
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
            No backlog items. All systems are go.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
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
    </div>
  );
}
