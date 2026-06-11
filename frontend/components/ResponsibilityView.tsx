"use client";

import React, { useState } from "react";
import { useStore, StateNode } from "@/store/useStore";
import { ChevronDown, ChevronRight, Folder, FolderOpen, Target, CheckCircle2, Circle, AlertTriangle, Calendar, Layers } from "lucide-react";

export default function ResponsibilityView() {
  const { stateTree } = useStore();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!stateTree) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 font-mono">
        <Layers className="h-8 w-8 animate-spin mb-4 text-cyan-400" />
        <span>Synchronizing commitment structure...</span>
      </div>
    );
  }

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusBadge = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED":
        return <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">Completed</span>;
      case "BLOCKED":
        return <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">Blocked</span>;
      case "DEFERRED":
        return <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">Deferred</span>;
      case "ARCHIVED":
        return <span className="text-[10px] font-mono text-gray-400 bg-gray-500/10 border border-gray-500/20 px-2 py-0.5 rounded">Archived</span>;
      default:
        return <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded">Active</span>;
    }
  };

  // Helper to compute progress for any node (Responsibility, Project, Goal)
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
        className="flex items-center gap-3 py-2 pl-4 border-l border-gray-800 hover:bg-white/2 transition-colors rounded-r-md"
        style={{ marginLeft: `${depth * 16}px` }}
      >
        {task.status === "COMPLETED" ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
        ) : task.status === "BLOCKED" ? (
          <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
        ) : task.status === "DEFERRED" ? (
          <Calendar className="h-4 w-4 text-amber-500 shrink-0" />
        ) : (
          <Circle className="h-4 w-4 text-cyan-500 shrink-0" />
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-4 grow">
          <span className={`text-xs font-mono ${task.status === "COMPLETED" ? "text-gray-500 line-through" : "text-gray-300"}`}>
            {task.name}
          </span>
          <span className="text-[9px] text-gray-500 font-mono">({task.slug})</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[9px] text-gray-500 font-mono">PRIORITY: {task.priority}</span>
          {getStatusBadge(task.status)}
        </div>
      </div>
    );
  };

  const renderGoal = (goal: StateNode, depth: number) => {
    const isCollapsed = collapsed[goal.id];
    const { completed, total, pct } = computeProgress(goal);

    return (
      <div key={goal.id} className="flex flex-col" style={{ marginLeft: `${depth * 16}px` }}>
        <div
          onClick={() => toggleCollapse(goal.id)}
          className="flex items-center gap-2 py-2 px-3 border-l border-gray-800 hover:bg-white/2 cursor-pointer transition-colors rounded-r-md group"
        >
          {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-gray-500" /> : <ChevronDown className="h-3.5 w-3.5 text-gray-500" />}
          <Target className="h-4 w-4 text-violet-400" />
          <div className="flex items-center gap-3 grow">
            <span className="text-xs font-mono font-semibold text-gray-200 group-hover:text-cyan-300 transition-colors">
              {goal.name}
            </span>
            <span className="text-[9px] text-gray-500 font-mono">({goal.slug})</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] text-violet-400 font-mono">
              {completed}/{total} ({pct}%)
            </span>
            {getStatusBadge(goal.status)}
          </div>
        </div>

        {!isCollapsed && (
          <div className="flex flex-col mt-1 mb-2">
            {goal.tasks && goal.tasks.map((t) => renderTask(t, 1))}
            {(!goal.tasks || goal.tasks.length === 0) && (
              <div className="text-[10px] text-gray-600 font-mono italic pl-8 py-1">No tasks under this goal.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderProject = (project: StateNode, depth: number) => {
    const isCollapsed = collapsed[project.id];
    const { completed, total, pct } = computeProgress(project);

    return (
      <div key={project.id} className="flex flex-col" style={{ marginLeft: `${depth * 16}px` }}>
        <div
          onClick={() => toggleCollapse(project.id)}
          className="flex items-center gap-2 py-2.5 px-3 border-l-2 border-gray-700 hover:bg-white/2 cursor-pointer transition-colors rounded-r-md group"
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
          <Folder className="h-4.5 w-4.5 text-cyan-400 shrink-0" />
          
          <div className="flex items-center gap-3 grow">
            <span className="text-xs font-mono font-bold text-gray-200 group-hover:text-cyan-300 transition-colors">
              {project.name}
            </span>
            <span className="text-[9px] text-gray-500 font-mono">({project.slug})</span>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-[10px] text-cyan-400 font-mono">
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
              <div className="text-[10px] text-gray-600 font-mono italic pl-8 py-1">No sub-items in project.</div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderResponsibility = (resp: StateNode) => {
    const isCollapsed = collapsed[resp.id];
    const { completed, total, pct } = computeProgress(resp);

    return (
      <div key={resp.id} className="glass-panel rounded-xl overflow-hidden border border-white/5 shadow-md flex flex-col">
        {/* Responsibility Header Banner */}
        <div
          onClick={() => toggleCollapse(resp.id)}
          className="bg-gray-900/60 p-4 border-b border-gray-800 hover:bg-gray-900 cursor-pointer transition-colors flex items-center justify-between group"
        >
          <div className="flex items-center gap-3">
            {isCollapsed ? <ChevronRight className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            {isCollapsed ? <Folder className="h-5 w-5 text-amber-500" /> : <FolderOpen className="h-5 w-5 text-amber-500" />}
            <div className="flex flex-col">
              <span className="text-sm font-mono font-bold text-gray-100 group-hover:text-cyan-300 transition-colors uppercase tracking-wider">
                {resp.name}
              </span>
              <span className="text-[10px] text-gray-500 font-mono">slug: {resp.slug}</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden sm:flex flex-col items-end gap-1">
              <span className="text-[10px] text-gray-400 font-mono">Overall Completion</span>
              <div className="flex items-center gap-2">
                <div className="w-24 bg-gray-950 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[10px] font-mono text-emerald-400">{pct}%</span>
              </div>
            </div>
            {getStatusBadge(resp.status)}
          </div>
        </div>

        {/* Responsibility children */}
        {!isCollapsed && (
          <div className="p-4 flex flex-col gap-2">
            {resp.projects && resp.projects.map((p) => renderProject(p, 0))}
            {resp.tasks && resp.tasks.map((t) => renderTask(t, 0))}
            {(!resp.projects || resp.projects.length === 0) && (!resp.tasks || resp.tasks.length === 0) && (
              <div className="text-xs text-gray-600 font-mono italic p-4 text-center">No projects or tasks under responsibility.</div>
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
        <div className="glass-panel p-4 rounded-xl border border-rose-500/20 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-rose-400 border-b border-gray-850 pb-2">
            <AlertTriangle className="h-4 w-4" />
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider">UNLINKED (ORPHAN) ENTITIES</h3>
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
        <div className="glass-panel p-12 rounded-xl text-center text-gray-500 font-mono text-xs border border-white/5">
          No committing structures declared. Try: `CREATE RESPONSIBILITY Startup`
        </div>
      )}
    </div>
  );
}
