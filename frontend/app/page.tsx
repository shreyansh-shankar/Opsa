"use client";

import React, { useEffect } from "react";
import { useStore, StateNode } from "@/store/useStore";
import CommandPalette from "@/components/CommandPalette";
import MissionView from "@/components/MissionView";
import ResponsibilityView from "@/components/ResponsibilityView";
import DependencyGraph from "@/components/DependencyGraph";
import TimelineView from "@/components/TimelineView";
import ConsoleView from "@/components/ConsoleView";
import ReferenceView from "@/components/ReferenceView";

import {
  Compass,
  Layers,
  Network,
  GitBranch,
  Terminal,
  RefreshCw,
  Award,
  CircleDot,
  HelpCircle
} from "lucide-react";

export default function Home() {
  const {
    activeTab,
    setActiveTab,
    stateTree,
    fetchState,
    isLoading,
    error
  } = useStore();

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Extract total counts for stats
  const getStats = () => {
    if (!stateTree) return { responsibilities: 0, projects: 0, goals: 0, tasks: 0 };
    
    let responsibilities = stateTree.responsibilities.length;
    let projects = stateTree.orphan_projects.length;
    let goals = stateTree.orphan_goals.length;
    let tasks = stateTree.orphan_tasks.length;

    const count = (node: StateNode) => {
      if (node.type === "PROJECT") projects++;
      if (node.type === "GOAL") goals++;
      if (node.type === "TASK") tasks++;
      node.projects?.forEach(count);
      node.goals?.forEach(count);
      node.tasks?.forEach(count);
    };

    stateTree.responsibilities.forEach(count);
    return { responsibilities, projects, goals, tasks };
  };

  const stats = getStats();

  const tabs = [
    { id: "mission", label: "Mission Overview", icon: Compass, component: MissionView },
    { id: "responsibility", label: "Commitment Tree", icon: Layers, component: ResponsibilityView },
    { id: "graph", label: "Dependency Network", icon: Network, component: DependencyGraph },
    { id: "timeline", label: "Operation Timeline", icon: GitBranch, component: TimelineView },
    { id: "console", label: "System Console", icon: Terminal, component: ConsoleView },
    { id: "reference", label: "Command Reference", icon: HelpCircle, component: ReferenceView }
  ] as const;

  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component || MissionView;

  return (
    <div className="flex flex-col min-h-screen bg-gray-950 text-gray-100 pb-12 selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* 1. Header Banner */}
      <header className="border-b border-gray-900 bg-gray-950/60 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-mono font-bold text-lg">
              Ω
            </span>
            <div className="flex flex-col">
              <h1 className="text-base font-mono font-bold tracking-widest text-cyan-400 uppercase">
                Opsa <span className="text-gray-400 text-xs font-normal">/ MissionOS</span>
              </h1>
              <span className="text-[9px] text-gray-500 font-mono uppercase tracking-widest">
                Declarative Life Runtime
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {error && (
              <span className="text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/25 px-2.5 py-1 rounded">
                Sync Error
              </span>
            )}
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400 bg-cyan-500/5 border border-cyan-500/10 px-2.5 py-1 rounded">
              <CircleDot className="h-3 w-3 animate-pulse text-cyan-400" />
              <span>Runtime Online</span>
            </div>
            <button
              onClick={() => fetchState()}
              disabled={isLoading}
              className="p-1.5 rounded bg-gray-900 border border-gray-800 text-gray-400 hover:text-cyan-400 hover:border-cyan-500/30 disabled:opacity-50 transition-all cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-cyan-400" : ""}`} />
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main content container */}
      <main className="max-w-7xl mx-auto px-4 mt-6 grow flex flex-col gap-6 w-full">
        {/* Command palette is always present at the top */}
        <CommandPalette />

        {/* Workspace Body */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Navigation Sidebar Panel */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col gap-4 shadow-sm">
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500 border-b border-gray-900 pb-2">
                Navigation
              </h2>
              <nav className="flex flex-col gap-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      id={`nav-tab-${tab.id}`}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-mono transition-all border ${
                        isActive
                          ? "bg-cyan-500/10 text-cyan-300 border-cyan-500/20 glow-cyan font-bold"
                          : "text-gray-400 bg-transparent border-transparent hover:text-gray-200 hover:bg-white/2"
                      }`}
                    >
                      <Icon className={`h-4.5 w-4.5 ${isActive ? "text-cyan-400" : "text-gray-500"}`} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Sidebar Stats Panel */}
            <div className="glass-panel p-4 rounded-xl border border-white/5 flex flex-col gap-4 shadow-sm">
              <div className="flex items-center gap-1.5 border-b border-gray-900 pb-2">
                <Award className="h-4 w-4 text-cyan-400" />
                <h2 className="text-[10px] font-mono uppercase tracking-widest text-gray-500">
                  Commitment Stats
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/30 border border-gray-900 p-2.5 rounded-lg flex flex-col">
                  <span className="text-lg font-mono font-bold text-gray-100">
                    {stats.responsibilities}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono uppercase tracking-wide">
                    Domains
                  </span>
                </div>
                <div className="bg-black/30 border border-gray-900 p-2.5 rounded-lg flex flex-col">
                  <span className="text-lg font-mono font-bold text-gray-100">
                    {stats.projects}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono uppercase tracking-wide">
                    Projects
                  </span>
                </div>
                <div className="bg-black/30 border border-gray-900 p-2.5 rounded-lg flex flex-col">
                  <span className="text-lg font-mono font-bold text-gray-100">
                    {stats.goals}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono uppercase tracking-wide">
                    Goals
                  </span>
                </div>
                <div className="bg-black/30 border border-gray-900 p-2.5 rounded-lg flex flex-col">
                  <span className="text-lg font-mono font-bold text-gray-100">
                    {stats.tasks}
                  </span>
                  <span className="text-[9px] text-gray-500 font-mono uppercase tracking-wide">
                    Tasks
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Central Active View Workspace */}
          <div className="lg:col-span-3">
            <ActiveComponent />
          </div>
        </div>
      </main>
    </div>
  );
}
