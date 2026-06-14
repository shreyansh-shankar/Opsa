"use client";

import React, { useState } from "react";
import { useStore, StateNode } from "@/store/useStore";
import { Target, ChevronDown, ChevronRight, CheckCircle2, Circle, AlertTriangle, Calendar, PlayCircle, PauseCircle, Layers } from "lucide-react";

export default function GoalView() {
  const { stateTree } = useStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!stateTree) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#67736b] font-mono text-xs">
        <Layers className="h-6 w-6 animate-spin mb-4 text-[#7A8C74]" />
        <span>Synchronizing goals structure...</span>
      </div>
    );
  }

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  // Extract all goals from the tree
  const allGoals: StateNode[] = [];
  
  const collectGoals = (node: StateNode) => {
    if (node.type === "GOAL") {
      allGoals.push(node);
    }
    node.projects?.forEach(collectGoals);
    node.goals?.forEach(collectGoals);
    node.tasks?.forEach(collectGoals);
  };

  stateTree.responsibilities.forEach(collectGoals);
  stateTree.orphan_projects.forEach(collectGoals);
  stateTree.orphan_goals.forEach(collectGoals);
  stateTree.orphan_tasks.forEach(collectGoals);

  // Group goals by status category
  const activeGoals = allGoals.filter((g) => g.status === "ACTIVE");
  const pausedGoals = allGoals.filter((g) => g.status === "PAUSED");
  const otherGoals = allGoals.filter((g) => g.status !== "ACTIVE" && g.status !== "PAUSED");

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return <span className="text-[9px] font-mono text-[#5F8C6E] bg-[#5F8C6E]/10 border border-[#5F8C6E]/20 px-2 py-0.5 rounded-md font-semibold">Completed</span>;
      case "BLOCKED":
        return <span className="text-[9px] font-mono text-[#C25953] bg-[#C25953]/10 border border-[#C25953]/20 px-2 py-0.5 rounded-md font-semibold">Blocked</span>;
      case "DEFERRED":
        return <span className="text-[9px] font-mono text-[#D4A351] bg-[#D4A351]/10 border border-[#D4A351]/20 px-2 py-0.5 rounded-md font-semibold">Deferred</span>;
      case "PAUSED":
        return <span className="text-[9px] font-mono text-[#5C7CFA] bg-[#5C7CFA]/10 border border-[#5C7CFA]/20 px-2 py-0.5 rounded-md font-semibold">Paused</span>;
      case "NOT_STARTED":
        return <span className="text-[9px] font-mono text-[#788896] bg-[#788896]/10 border border-[#788896]/20 px-2 py-0.5 rounded-md font-semibold">Not Started</span>;
      case "ARCHIVED":
        return <span className="text-[9px] font-mono text-[#67736b] bg-[#e3dbcd]/30 border border-[#e3dbcd]/50 px-2 py-0.5 rounded-md font-semibold">Archived</span>;
      default:
        return <span className="text-[9px] font-mono text-[#7A8C74] bg-[#7A8C74]/10 border border-[#7A8C74]/20 px-2 py-0.5 rounded-md font-semibold">Active</span>;
    }
  };

  const computeProgress = (goal: StateNode): { completed: number; total: number; pct: number } => {
    let completed = 0;
    let total = 0;

    const countTasks = (n: StateNode) => {
      if (n.type === "TASK") {
        total++;
        if (n.status === "COMPLETED") completed++;
      }
      n.tasks?.forEach(countTasks);
    };

    countTasks(goal);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, pct };
  };

  const renderTask = (task: StateNode) => {
    return (
      <div
        key={task.id}
        className="flex items-center gap-3 py-2 pl-4 border-l border-[#e3dbcd] hover:bg-[#F5F0E6]/30 transition-all rounded-r-xl"
      >
        {task.status === "COMPLETED" ? (
          <CheckCircle2 className="h-4 w-4 text-[#5F8C6E] shrink-0" />
        ) : task.status === "BLOCKED" ? (
          <AlertTriangle className="h-4 w-4 text-[#C25953] shrink-0" />
        ) : task.status === "DEFERRED" ? (
          <Calendar className="h-4 w-4 text-[#D4A351] shrink-0" />
        ) : task.status === "PAUSED" ? (
          <PauseCircle className="h-4 w-4 text-[#5C7CFA] shrink-0" />
        ) : task.status === "NOT_STARTED" ? (
          <PlayCircle className="h-4 w-4 text-[#788896] shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-[#7A8C74] shrink-0" />
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-3 grow">
          <span className={`text-xs font-sans ${task.status === "COMPLETED" ? "text-[#67736b] line-through" : "text-[#2c312e]"}`}>
            {task.name}
          </span>
          <span className="text-[9px] text-[#67736b] font-mono">({task.slug})</span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span className="text-[9px] text-[#67736b] font-mono">PRIORITY: {task.priority}</span>
          {getStatusBadge(task.status)}
        </div>
      </div>
    );
  };

  const renderGoalCard = (goal: StateNode) => {
    const isCollapsed = collapsed[goal.id] ?? true;
    const { completed, total, pct } = computeProgress(goal);

    return (
      <div key={goal.id} className="glass-panel rounded-xl overflow-hidden border border-[#e3dbcd] bg-[#FAF7F2] shadow-sm flex flex-col transition-all">
        {/* Goal Header */}
        <div
          onClick={() => toggleCollapse(goal.id)}
          className="bg-[#F5F0E6]/30 p-3.5 border-b border-[#e3dbcd] hover:bg-[#F5F0E6]/50 cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            {isCollapsed ? <ChevronRight className="h-4 w-4 text-[#67736b]" /> : <ChevronDown className="h-4 w-4 text-[#67736b]" />}
            <Target className="h-4.5 w-4.5 text-[#CE8D6D]" />
            <div className="flex flex-col">
              <span className="text-xs font-sans font-bold text-[#2c312e] group-hover:text-[#7A8C74] transition-colors">
                {goal.name}
              </span>
              <span className="text-[9px] text-[#67736b] font-mono">slug: {goal.slug}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden sm:flex flex-col items-end gap-1">
              <span className="text-[9px] font-mono font-bold text-[#7A8C74]">
                {completed}/{total} Tasks ({pct}%)
              </span>
              <div className="w-24 bg-[#e3dbcd] rounded-full h-1 overflow-hidden">
                <div className="bg-[#7A8C74] h-1 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
            {getStatusBadge(goal.status)}
          </div>
        </div>

        {/* Goal sub-tasks list */}
        {!isCollapsed && (
          <div className="p-3.5 flex flex-col gap-1.5 bg-[#FAF7F2]">
            {goal.tasks && goal.tasks.map(renderTask)}
            {(!goal.tasks || goal.tasks.length === 0) && (
              <div className="text-[9px] text-[#67736b] font-mono italic pl-4 py-1">No tasks linked to this goal.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Active Goals Category */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-[#e3dbcd] pb-2">
          <Target className="h-4.5 w-4.5 text-[#5F8C6E]" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">ACTIVE GOALS</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#FAF7F2] text-[#67736b] border border-[#e3dbcd]">
            {activeGoals.length} goals
          </span>
        </div>
        {activeGoals.length === 0 ? (
          <div className="glass-panel p-6 rounded-2xl text-center text-[#67736b] font-mono text-xs border border-[#e3dbcd] bg-[#FAF7F2]/50 italic">
            No active goals.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeGoals.map(renderGoalCard)}
          </div>
        )}
      </div>

      {/* Paused Goals Category */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-[#e3dbcd] pb-2">
          <PauseCircle className="h-4.5 w-4.5 text-[#5C7CFA]" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">PAUSED GOALS</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#FAF7F2] text-[#67736b] border border-[#e3dbcd]">
            {pausedGoals.length} goals
          </span>
        </div>
        {pausedGoals.length === 0 ? (
          <div className="glass-panel p-6 rounded-2xl text-center text-[#67736b] font-mono text-xs border border-[#e3dbcd] bg-[#FAF7F2]/50 italic">
            No paused goals.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pausedGoals.map(renderGoalCard)}
          </div>
        )}
      </div>

      {/* Other Goals Category */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2 border-b border-[#e3dbcd] pb-2">
          <Layers className="h-4.5 w-4.5 text-[#788896]" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">OTHER GOALS (BACKLOG / COMPLETED / DEFERRED)</h2>
          <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#FAF7F2] text-[#67736b] border border-[#e3dbcd]">
            {otherGoals.length} goals
          </span>
        </div>
        {otherGoals.length === 0 ? (
          <div className="glass-panel p-6 rounded-2xl text-center text-[#67736b] font-mono text-xs border border-[#e3dbcd] bg-[#FAF7F2]/50 italic">
            No other goals.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {otherGoals.map(renderGoalCard)}
          </div>
        )}
      </div>
    </div>
  );
}
