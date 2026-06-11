"use client";

import React from "react";
import { useStore, StateNode } from "@/store/useStore";
import { AlertCircle, Calendar, CheckCircle, ShieldAlert, Award, Clock, ArrowUpRight } from "lucide-react";

export default function MissionView() {
  const { stateTree, executeCommand, setActiveTab } = useStore();

  if (!stateTree) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 font-mono">
        <Clock className="h-8 w-8 animate-spin mb-4 text-cyan-400" />
        <span>Syncing operational state...</span>
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

  const handleWhyBlocked = (slug: string) => {
    setActiveTab("console");
    executeCommand(`WHY BLOCKED ${slug}`);
  };

  const getPriorityColor = (priority?: string) => {
    if (priority === "URGENT") return "text-rose-400 bg-rose-500/10 border-rose-500/20";
    if (priority === "HIGH") return "text-amber-400 bg-amber-500/10 border-amber-500/20";
    if (priority === "MEDIUM") return "text-cyan-400 bg-cyan-500/10 border-cyan-500/20";
    return "text-gray-400 bg-gray-500/10 border-gray-500/20";
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* 1. Today's Priorities */}
      <div className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
          <Award className="h-5 w-5 text-amber-400" />
          <h2 className="font-mono font-bold text-sm tracking-wider text-gray-200">TODAY'S PRIORITIES</h2>
          <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
            {priorities.length} items
          </span>
        </div>

        {priorities.length === 0 ? (
          <div className="text-gray-500 text-xs font-mono py-6 text-center">
            No high-priority active tasks. Use PROMOTE to raise item priorities.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {priorities.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-950/40 border border-gray-800 hover:border-gray-700 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-200 font-mono">{t.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">slug: {t.slug}</span>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${getPriorityColor(t.priority)}`}>
                  {t.priority}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Blocked Work */}
      <div className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
          <ShieldAlert className="h-5 w-5 text-rose-500" />
          <h2 className="font-mono font-bold text-sm tracking-wider text-gray-200">BLOCKED WORK</h2>
          <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
            {blockedItems.length} items
          </span>
        </div>

        {blockedItems.length === 0 ? (
          <div className="text-gray-500 text-xs font-mono py-6 text-center">
            No blocked tasks. You are clear for takeoff.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {blockedItems.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-950/40 border border-gray-850 hover:border-gray-800 transition-colors"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-200 font-mono">{t.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">slug: {t.slug}</span>
                </div>
                <button
                  onClick={() => handleWhyBlocked(t.slug)}
                  className="flex items-center gap-1 text-[10px] font-mono text-cyan-400 hover:text-cyan-300 border border-cyan-500/20 hover:border-cyan-500/40 bg-cyan-500/5 px-2.5 py-1 rounded transition-all"
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
      <div className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
          <CheckCircle className="h-5 w-5 text-cyan-400" />
          <h2 className="font-mono font-bold text-sm tracking-wider text-gray-200">ACTIVE GOALS</h2>
          <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
            {activeGoals.length} items
          </span>
        </div>

        {activeGoals.length === 0 ? (
          <div className="text-gray-500 text-xs font-mono py-6 text-center">
            No active goals found. Declare a Goal under a Project.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {activeGoals.map((g) => {
              // Calculate progress: completed tasks under goal
              const goalTasks = g.tasks || [];
              const completedCount = goalTasks.filter((t) => t.status === "COMPLETED").length;
              const progressPct = goalTasks.length > 0 ? Math.round((completedCount / goalTasks.length) * 100) : 0;

              return (
                <div
                  key={g.id}
                  className="p-3 rounded-lg bg-gray-950/40 border border-gray-800 flex flex-col gap-2"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-200 font-mono font-semibold">{g.name}</span>
                      <span className="text-[10px] text-gray-500 font-mono">slug: {g.slug}</span>
                    </div>
                    <span className="text-[10px] font-mono text-cyan-400">
                      {completedCount}/{goalTasks.length} tasks ({progressPct}%)
                    </span>
                  </div>

                  <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
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
      <div className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
          <Calendar className="h-5 w-5 text-amber-500" />
          <h2 className="font-mono font-bold text-sm tracking-wider text-gray-200">DEFERRED QUEUE</h2>
          <span className="ml-auto text-xs font-mono px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
            {deferredTasks.length} items
          </span>
        </div>

        {deferredTasks.length === 0 ? (
          <div className="text-gray-500 text-xs font-mono py-6 text-center">
            No deferred tasks.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {deferredTasks.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between p-3 rounded-lg bg-gray-950/40 border border-gray-800"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-gray-200 font-mono">{t.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">slug: {t.slug}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-amber-400 bg-amber-500/5 px-2 py-1 rounded border border-amber-500/10">
                  <AlertCircle className="h-3 w-3" />
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
    </div>
  );
}
