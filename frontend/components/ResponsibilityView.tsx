"use client";

import React, { useState } from "react";
import { useStore, StateNode } from "@/store/useStore";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Target, CheckCircle2, Circle, AlertTriangle, Calendar, Layers, PlayCircle, PauseCircle } from "lucide-react";

export default function ResponsibilityView() {
  const { stateTree } = useStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!stateTree) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#67736b] font-mono text-xs">
        <Layers className="h-6 w-6 animate-spin mb-4 text-[#7A8C74]" />
        <span>Synchronizing commitment structure...</span>
      </div>
    );
  }

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !(prev[id] ?? true) }));
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return <span className="text-[9px] font-mono text-[#5F8C6E] bg-[#5F8C6E]/10 border border-[#5F8C6E]/20 px-2 py-0.5 rounded-md">Completed</span>;
      case "BLOCKED":
        return <span className="text-[9px] font-mono text-[#C25953] bg-[#C25953]/10 border border-[#C25953]/20 px-2 py-0.5 rounded-md">Blocked</span>;
      case "DEFERRED":
        return <span className="text-[9px] font-mono text-[#D4A351] bg-[#D4A351]/10 border border-[#D4A351]/20 px-2 py-0.5 rounded-md">Deferred</span>;
      case "PAUSED":
        return <span className="text-[9px] font-mono text-[#5C7CFA] bg-[#5C7CFA]/10 border border-[#5C7CFA]/20 px-2 py-0.5 rounded-md">Paused</span>;
      case "NOT_STARTED":
        return <span className="text-[9px] font-mono text-[#788896] bg-[#788896]/10 border border-[#788896]/20 px-2 py-0.5 rounded-md">Not Started</span>;
      case "ARCHIVED":
        return <span className="text-[9px] font-mono text-[#67736b] bg-[#e3dbcd]/30 border border-[#e3dbcd]/50 px-2 py-0.5 rounded-md">Archived</span>;
      default:
        return <span className="text-[9px] font-mono text-[#7A8C74] bg-[#7A8C74]/10 border border-[#7A8C74]/20 px-2 py-0.5 rounded-md">Active</span>;
    }
  };

  const computeProgress = (node: StateNode): { completed: number; total: number; pct: number } => {
    let completed = 0;
    let total = 0;

    const count = (n: StateNode) => {
      if (n.type === "TASK") {
        total++;
        if (n.status === "COMPLETED") completed++;
      }
      n.projects?.forEach(count);
      n.goals?.forEach(count);
      n.tasks?.forEach(count);
    };

    count(node);
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, pct };
  };

  const renderTask = (task: StateNode, depth: number) => {
    return (
      <div
        key={task.id}
        className="flex items-center gap-3 py-2 pl-4 border-l border-[#e3dbcd] hover:bg-[#F5F0E6]/30 transition-all rounded-r-xl"
        style={{ marginLeft: `${depth * 16}px` }}
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

  const renderGoal = (goal: StateNode, depth: number) => {
    const isCollapsed = collapsed[goal.id] ?? true;
    const { completed, total, pct } = computeProgress(goal);

    return (
      <div key={goal.id} className="flex flex-col" style={{ marginLeft: `${depth * 16}px` }}>
        <div
          onClick={() => toggleCollapse(goal.id)}
          className="flex items-center gap-2.5 py-2 px-3 border-l border-[#e3dbcd] hover:bg-[#F5F0E6]/30 cursor-pointer transition-all rounded-r-xl group"
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-[#67736b]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#67736b]" />}
          <Target className="h-4 w-4 text-[#CE8D6D]" />
          <div className="flex items-center gap-2 grow">
            <span className="text-xs font-sans font-bold text-[#2c312e] group-hover:text-[#7A8C74] transition-colors">
              {goal.name}
            </span>
            <span className="text-[9px] text-[#67736b] font-mono">({goal.slug})</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] text-[#CE8D6D] font-mono font-semibold">
              {completed}/{total} ({pct}%)
            </span>
            {getStatusBadge(goal.status)}
          </div>
        </div>

        {!isCollapsed && (
          <div className="flex flex-col mt-1 mb-2">
            {goal.tasks && goal.tasks.map((t) => renderTask(t, 1))}
            {(!goal.tasks || goal.tasks.length === 0) && (
              <div className="text-[9px] text-[#67736b] font-mono italic pl-8 py-1">No tasks under this goal.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderProject = (project: StateNode, depth: number) => {
    const isCollapsed = collapsed[project.id] ?? true;
    const { completed, total, pct } = computeProgress(project);

    return (
      <div key={project.id} className="flex flex-col" style={{ marginLeft: `${depth * 16}px` }}>
        <div
          onClick={() => toggleCollapse(project.id)}
          className="flex items-center gap-2.5 py-2.5 px-3 border-l-2 border-[#d6cebf] hover:bg-[#F5F0E6]/30 cursor-pointer transition-all rounded-r-xl group"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4 text-[#67736b]" /> : <ChevronDown className="h-4 w-4 text-[#67736b]" />}
          <Folder className="h-4 w-4 text-[#7A8C74] shrink-0" />
          
          <div className="flex items-center gap-2.5 grow">
            <span className="text-xs font-sans font-bold text-[#2c312e] group-hover:text-[#7A8C74] transition-colors">
              {project.name}
            </span>
            <span className="text-[9px] text-[#67736b] font-mono">({project.slug})</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] text-[#7A8C74] font-mono font-semibold">
              {completed}/{total} ({pct}%)
            </span>
            {getStatusBadge(project.status)}
          </div>
        </div>

        {!isCollapsed && (
          <div className="flex flex-col gap-1 mt-1 mb-3">
            {project.goals && project.goals.map((g) => renderGoal(g, 1))}
            {project.tasks && project.tasks.map((t) => renderTask(t, 1))}
            {(!project.goals || project.goals.length === 0) && (!project.tasks || project.tasks.length === 0) && (
              <div className="text-[9px] text-[#67736b] font-mono italic pl-8 py-1">No sub-items in project.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderResponsibility = (resp: StateNode) => {
    const isCollapsed = collapsed[resp.id] ?? true;
    const { completed, total, pct } = computeProgress(resp);

    return (
      <div key={resp.id} className="glass-panel rounded-2xl overflow-hidden border border-[#e3dbcd] bg-[#FAF7F2] shadow-sm flex flex-col">
        {/* Responsibility Header Banner */}
        <div
          onClick={() => toggleCollapse(resp.id)}
          className="bg-[#F5F0E6]/50 p-4 border-b border-[#e3dbcd] hover:bg-[#F5F0E6]/75 cursor-pointer transition-all flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            {isCollapsed ? <ChevronRight className="h-4 w-4 text-[#67736b]" /> : <ChevronDown className="h-4 w-4 text-[#67736b]" />}
            {isCollapsed ? <Folder className="h-4.5 w-4.5 text-[#D4A351]" /> : <FolderOpen className="h-4.5 w-4.5 text-[#D4A351]" />}
            <div className="flex flex-col">
              <span className="text-xs font-serif font-bold text-[#2c312e] group-hover:text-[#7A8C74] transition-colors uppercase tracking-wider">
                {resp.name}
              </span>
              <span className="text-[9px] text-[#67736b] font-mono">slug: {resp.slug}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden sm:flex flex-col items-end gap-1">
              <span className="text-[9px] text-[#67736b] font-mono">Overall Completion</span>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-[#e3dbcd] rounded-full h-1.5 overflow-hidden">
                  <div className="bg-[#5F8C6E] h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[9px] font-mono font-bold text-[#5F8C6E]">{pct}%</span>
              </div>
            </div>
            {getStatusBadge(resp.status)}
          </div>
        </div>

        {/* Responsibility children */}
        {!isCollapsed && (
          <div className="p-4 flex flex-col gap-2 bg-[#FAF7F2]">
            {resp.projects && resp.projects.map((p) => renderProject(p, 0))}
            {resp.tasks && resp.tasks.map((t) => renderTask(t, 0))}
            {(!resp.projects || resp.projects.length === 0) && (!resp.tasks || resp.tasks.length === 0) && (
              <div className="text-[10px] text-[#67736b] font-mono italic p-4 text-center">No projects or tasks under responsibility.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {stateTree.responsibilities.map(renderResponsibility)}

      {/* Orphans check */}
      {(stateTree.orphan_projects.length > 0 || stateTree.orphan_goals.length > 0 || stateTree.orphan_tasks.length > 0) && (
        <div className="glass-panel p-4 rounded-2xl border border-[#C25953]/20 bg-[#FAF7F2] flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[#C25953] border-b border-[#e3dbcd] pb-2">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider">UNLINKED (ORPHAN) ENTITIES</h3>
          </div>
          <div className="flex flex-col gap-2">
            {stateTree.orphan_projects.map((p) => renderProject(p, 0))}
            {stateTree.orphan_goals.map((g) => renderGoal(g, 0))}
            {stateTree.orphan_tasks.map((t) => renderTask(t, 0))}
          </div>
        </div>
      )}

      {stateTree.responsibilities.length === 0 &&
       stateTree.orphan_projects.length === 0 &&
       stateTree.orphan_goals.length === 0 &&
       stateTree.orphan_tasks.length === 0 && (
        <div className="glass-panel p-12 rounded-2xl text-center text-[#67736b] font-mono text-xs border border-[#e3dbcd]">
          No committing structures declared. Try: `CREATE RESPONSIBILITY Startup`
        </div>
      )}
    </div>
  );
}
