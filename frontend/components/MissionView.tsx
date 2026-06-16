"use client";

import React, { useState, useMemo } from "react";
import { useStore, StateNode, StateTree } from "@/store/useStore";
import {
  Clock, ArrowUpRight, Bookmark,
  AlertOctagon, PlayCircle, PauseCircle, Filter, X, ChevronDown
} from "lucide-react";

// ─── Enriched task with parent breadcrumb ────────────────────────────────────

interface TaskWithParents {
  task: StateNode;
  responsibility: string | null;
  project: string | null;
  goal: string | null;
}

// ─── Collect all tasks with their ancestry ───────────────────────────────────

function collectAllTasks(stateTree: StateTree): TaskWithParents[] {
  const results: TaskWithParents[] = [];

  const walk = (
    node: StateNode,
    responsibility: string | null,
    project: string | null,
    goal: string | null
  ) => {
    const r = node.type === "RESPONSIBILITY" ? node.name : responsibility;
    const p = node.type === "PROJECT" ? node.name : project;
    const g = node.type === "GOAL" ? node.name : goal;

    if (node.type === "TASK") {
      results.push({ task: node, responsibility: r, project: p, goal: g });
    }

    node.projects?.forEach(child => walk(child, r, p, g));
    node.goals?.forEach(child => walk(child, r, p, g));
    node.tasks?.forEach(child => walk(child, r, p, g));
  };

  stateTree.responsibilities.forEach(n => walk(n, null, null, null));
  stateTree.orphan_projects.forEach(n => walk(n, null, null, null));
  stateTree.orphan_goals.forEach(n => walk(n, null, null, null));
  stateTree.orphan_tasks.forEach(n => walk(n, null, null, null));

  return results;
}

// ─── Small reusable filter dropdown ──────────────────────────────────────────

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const isFiltered = value !== "";

  return (
    <div className="relative flex items-center">
      {/* When filtered: show value chip + separate clear X */}
      {isFiltered ? (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-l-lg border-y border-l border-[#7A8C74]/30 bg-[#7A8C74]/10 text-[#2c312e] font-semibold transition-all"
          >
            <span className="max-w-[120px] truncate">{value}</span>
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex items-center px-1.5 py-1.5 rounded-r-lg border-y border-r border-[#7A8C74]/30 bg-[#7A8C74]/10 text-[#7A8C74] hover:text-[#C25953] hover:bg-[#C25953]/5 hover:border-[#C25953]/20 transition-all"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 text-[10px] font-mono px-2.5 py-1.5 rounded-lg border border-[#e3dbcd] bg-[#F5F0E6] text-[#67736b] hover:border-[#d6cebf] hover:text-[#2c312e] transition-all"
        >
          <span>{label}</span>
          <ChevronDown className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}

      {open && (
        <div className="absolute top-full mt-1 left-0 z-30 min-w-[160px] max-h-[220px] overflow-y-auto bg-[#FAF7F2] border border-[#e3dbcd] rounded-xl shadow-xl flex flex-col p-1">
          {options.length === 0 ? (
            <span className="text-[10px] font-mono text-[#67736b] px-3 py-2 italic">No options</span>
          ) : (
            options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`text-left text-[10px] font-mono px-3 py-1.5 rounded-lg transition-colors ${
                  opt === value
                    ? "bg-[#7A8C74]/15 text-[#2c312e] font-semibold"
                    : "text-[#67736b] hover:bg-[#7A8C74]/5 hover:text-[#2c312e]"
                }`}
              >
                {opt}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Task card ────────────────────────────────────────────────────────────────

function TaskCard({
  item,
  action
}: {
  item: TaskWithParents;
  action?: React.ReactNode;
}) {
  const t = item.task;
  const crumbs = [item.responsibility, item.project, item.goal].filter(Boolean);

  const getPriorityColor = (priority?: string) => {
    if (priority === "URGENT") return "text-[#C25953] bg-[#C25953]/10 border-[#C25953]/20";
    if (priority === "HIGH") return "text-[#CE8D6D] bg-[#CE8D6D]/10 border-[#CE8D6D]/20";
    if (priority === "MEDIUM") return "text-[#7A8C74] bg-[#7A8C74]/10 border-[#7A8C74]/20";
    return "text-[#67736b] bg-[#e3dbcd]/30 border-[#e3dbcd]/50";
  };

  return (
    <div className="flex items-start justify-between p-3 rounded-xl bg-[#FAF7F2] border border-[#e3dbcd] hover:border-[#d6cebf] transition-all gap-2">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-[#2c312e] font-sans font-semibold truncate">{t.name}</span>
        {crumbs.length > 0 && (
          <span className="text-[8.5px] text-[#67736b] font-mono truncate opacity-70">
            {crumbs.join(" › ")}
          </span>
        )}
        <span className="text-[9px] text-[#67736b]/60 font-mono">{t.slug}</span>
      </div>
      <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
        {action ?? (
          <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${getPriorityColor(t.priority)}`}>
            {t.priority || "MEDIUM"}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Section panel ────────────────────────────────────────────────────────────

function TaskPanel({
  title,
  icon,
  items,
  emptyMsg,
  fullWidth = false,
  renderAction,
}: {
  title: string;
  icon: React.ReactNode;
  items: TaskWithParents[];
  emptyMsg: string;
  fullWidth?: boolean;
  renderAction?: (item: TaskWithParents) => React.ReactNode;
}) {
  return (
    <div className={`glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm ${fullWidth ? "md:col-span-2" : ""}`}>
      <div className="flex items-center gap-2.5 border-b border-[#e3dbcd] pb-3">
        {icon}
        <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">{title}</h2>
        <span className="ml-auto text-[9px] font-mono px-2 py-0.5 rounded-full bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd]/50">
          {items.length} items
        </span>
      </div>

      {items.length === 0 ? (
        <div className="text-[#67736b] text-xs font-sans py-10 text-center italic">{emptyMsg}</div>
      ) : (
        <div className={`flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 ${fullWidth ? "grid grid-cols-1 md:grid-cols-2" : ""}`}>
          {items.map(item => (
            <TaskCard
              key={item.task.id}
              item={item}
              action={renderAction ? renderAction(item) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MissionView() {
  const { stateTree, executeCommand, setActiveTab } = useStore();

  const [filterResponsibility, setFilterResponsibility] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterGoal, setFilterGoal] = useState("");

  const allEnriched = useMemo(() => {
    if (!stateTree) return [];
    return collectAllTasks(stateTree);
  }, [stateTree]);

  // Build option lists from actual data
  const responsibilityOptions = useMemo(() =>
    [...new Set(allEnriched.map(e => e.responsibility).filter(Boolean) as string[])].sort(),
    [allEnriched]
  );
  const projectOptions = useMemo(() => {
    const base = allEnriched
      .filter(e => !filterResponsibility || e.responsibility === filterResponsibility)
      .map(e => e.project)
      .filter(Boolean) as string[];
    return [...new Set(base)].sort();
  }, [allEnriched, filterResponsibility]);

  const goalOptions = useMemo(() => {
    const base = allEnriched
      .filter(e => (!filterResponsibility || e.responsibility === filterResponsibility) &&
                   (!filterProject || e.project === filterProject))
      .map(e => e.goal)
      .filter(Boolean) as string[];
    return [...new Set(base)].sort();
  }, [allEnriched, filterResponsibility, filterProject]);

  // Apply filters
  const filtered = useMemo(() =>
    allEnriched.filter(e =>
      (!filterResponsibility || e.responsibility === filterResponsibility) &&
      (!filterProject || e.project === filterProject) &&
      (!filterGoal || e.goal === filterGoal)
    ),
    [allEnriched, filterResponsibility, filterProject, filterGoal]
  );

  const isFiltered = !!(filterResponsibility || filterProject || filterGoal);

  const activeTasks = filtered.filter(e => e.task.status === "ACTIVE");
  const blockedTasks = filtered.filter(e => e.task.status === "BLOCKED");
  const pausedTasks = filtered.filter(e => e.task.status === "PAUSED");
  const notStartedTasks = filtered.filter(e => e.task.status === "NOT_STARTED");
  const otherTasks = filtered.filter(e => !["ACTIVE", "BLOCKED", "PAUSED", "NOT_STARTED"].includes(e.task.status));

  const handleWhyBlocked = (slug: string) => {
    setActiveTab("console");
    executeCommand(`WHY BLOCKED ${slug}`);
  };

  if (!stateTree) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#67736b] font-mono text-xs">
        <Clock className="h-6 w-6 animate-spin mb-4 text-[#7A8C74]" />
        <span>Syncing operational commitments...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Filter Bar */}
      <div className="glass-panel rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] px-4 py-3 flex flex-wrap items-center gap-2 shadow-sm">
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#67736b] mr-1">
          <Filter className="h-3 w-3" />
          <span className="font-semibold uppercase tracking-wider">Filter</span>
        </div>

        <FilterSelect
          label="Responsibility"
          value={filterResponsibility}
          options={responsibilityOptions}
          onChange={v => { setFilterResponsibility(v); setFilterProject(""); setFilterGoal(""); }}
        />
        <FilterSelect
          label="Project"
          value={filterProject}
          options={projectOptions}
          onChange={v => { setFilterProject(v); setFilterGoal(""); }}
        />
        <FilterSelect
          label="Goal"
          value={filterGoal}
          options={goalOptions}
          onChange={setFilterGoal}
        />

        {isFiltered && (
          <button
            type="button"
            onClick={() => { setFilterResponsibility(""); setFilterProject(""); setFilterGoal(""); }}
            className="ml-auto flex items-center gap-1 text-[9px] font-mono text-[#C25953] hover:text-[#C25953]/70 transition-colors"
          >
            <X className="h-2.5 w-2.5" />
            Clear all
          </button>
        )}

        {isFiltered && (
          <span className="text-[9px] font-mono text-[#67736b] bg-[#F5F0E6] border border-[#e3dbcd] px-2 py-0.5 rounded-full">
            {filtered.length} of {allEnriched.length} tasks
          </span>
        )}
      </div>

      {/* Task panels grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TaskPanel
          title="Active Tasks"
          icon={<Bookmark className="h-4 w-4 text-[#7A8C74]" fill="#7A8C74" />}
          items={activeTasks}
          emptyMsg="No active tasks. Use `START <target>` to activate a task."
        />

        <TaskPanel
          title="Blocked Tasks"
          icon={<AlertOctagon className="h-4 w-4 text-[#C25953]" fill="#C25953" />}
          items={blockedTasks}
          emptyMsg="No blocked tasks. You are clear for takeoff."
          renderAction={item => (
            <button
              onClick={() => handleWhyBlocked(item.task.slug)}
              className="flex items-center gap-1 text-[9px] font-mono text-[#7A8C74] hover:text-white border border-[#7A8C74]/20 hover:bg-[#7A8C74] bg-[#7A8C74]/5 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
            >
              <span>Why?</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
          )}
        />

        <TaskPanel
          title="Paused Tasks"
          icon={<PauseCircle className="h-4 w-4 text-[#5C7CFA]" fill="#5C7CFA" />}
          items={pausedTasks}
          emptyMsg="No paused tasks."
          renderAction={() => (
            <span className="text-[9px] font-mono text-[#5C7CFA] bg-[#5C7CFA]/5 px-2.5 py-1 rounded-lg border border-[#5C7CFA]/15">
              PAUSED
            </span>
          )}
        />

        <TaskPanel
          title="Backlog / Not Started"
          icon={<PlayCircle className="h-4 w-4 text-[#788896]" fill="#788896" />}
          items={notStartedTasks}
          emptyMsg="No backlog items. All tasks are active or completed."
          renderAction={() => (
            <span className="text-[9px] font-mono text-[#788896] bg-[#788896]/5 px-2.5 py-1 rounded-lg border border-[#788896]/15">
              NOT STARTED
            </span>
          )}
        />

        <TaskPanel
          title="Other Tasks (Completed / Deferred / Archived)"
          icon={<Clock className="h-4 w-4 text-[#CE8D6D]" fill="#CE8D6D" />}
          items={otherTasks}
          emptyMsg="No other tasks."
          fullWidth
          renderAction={item => {
            const t = item.task;
            return (
              <div className="flex items-center gap-2">
                {t.status === "DEFERRED" && (
                  <span className="text-[9px] font-mono text-[#D4A351] mr-1">
                    {t.deferred_until ? `Until: ${t.deferred_until}` : t.deferred_condition ? `Until: ${t.deferred_condition}` : ""}
                  </span>
                )}
                {t.status === "COMPLETED" && (
                  <span className="text-[9px] font-mono text-[#5F8C6E] bg-[#5F8C6E]/5 px-2 py-0.5 rounded border border-[#5F8C6E]/15">COMPLETED</span>
                )}
                {t.status === "DEFERRED" && (
                  <span className="text-[9px] font-mono text-[#D4A351] bg-[#D4A351]/5 px-2 py-0.5 rounded border border-[#D4A351]/15">DEFERRED</span>
                )}
                {t.status === "ARCHIVED" && (
                  <span className="text-[9px] font-mono text-[#67736b] bg-[#e3dbcd]/30 px-2 py-0.5 rounded border border-[#e3dbcd]/50">ARCHIVED</span>
                )}
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
