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
  HelpCircle,
  Settings,
  ShieldCheck,
  User
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
    { id: "responsibility", label: "Commit Tree", icon: Layers, component: ResponsibilityView },
    { id: "graph", label: "Dependency Network", icon: Network, component: DependencyGraph },
    { id: "timeline", label: "Operation Timeline", icon: GitBranch, component: TimelineView },
    { id: "console", label: "System Console", icon: Terminal, component: ConsoleView },
    { id: "reference", label: "Command Reference", icon: HelpCircle, component: ReferenceView }
  ] as const;

  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component || MissionView;

  return (
    <div className="flex flex-col min-h-screen bg-[#F5F0E6] text-[#2c312e] pb-12 selection:bg-[#7A8C74]/30 selection:text-[#2c312e]">
      {/* 1. Header Banner */}
      <header className="border-b border-[#e3dbcd] bg-[#FAF7F2]/85 sticky top-0 z-40 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-[#7A8C74]/10 border border-[#7A8C74]/20 text-[#7A8C74] font-mono font-bold text-lg">
              Ω
            </span>
            <div className="flex flex-col">
              <h1 className="text-sm font-serif font-bold tracking-wider text-[#2c312e] uppercase">
                Opsa <span className="text-[#67736b] text-xs font-sans font-normal">/ MissionOS</span>
              </h1>
              <span className="text-[9px] text-[#67736b] font-sans uppercase tracking-widest font-semibold">
                Declarative Life Runtime
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#7A8C74] bg-[#7A8C74]/5 border border-[#7A8C74]/15 px-2.5 py-1 rounded-full">
              <CircleDot className="h-3 w-3 animate-pulse text-[#7A8C74]" />
              <span>Runtime Online</span>
            </div>
            <button
              onClick={() => fetchState()}
              disabled={isLoading}
              className="p-2 rounded-lg bg-[#FAF7F2] border border-[#e3dbcd] hover:border-[#d6cebf] text-[#67736b] hover:text-[#7A8C74] disabled:opacity-50 transition-all cursor-pointer shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin text-[#7A8C74]" : ""}`} />
            </button>
            <div className="h-8 w-8 rounded-full bg-[#7A8C74]/20 border border-[#7A8C74]/40 flex items-center justify-center text-[#7A8C74] cursor-pointer">
              <User className="h-4 w-4" />
            </div>
          </div>
        </div>
      </header>

      {/* 2. Main content container */}
      <main className="max-w-7xl mx-auto px-6 mt-6 grow flex flex-col gap-6 w-full">
        {/* Workspace Body */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 items-start">
          {/* Navigation Sidebar Panel */}
          <div className="lg:col-span-1 flex flex-col gap-6 sticky top-20">
            <div className="glass-panel p-4 rounded-2xl flex flex-col gap-5 shadow-sm bg-[#FAF7F2]">
              <h2 className="text-[10px] font-mono uppercase tracking-widest text-[#67736b] font-bold border-b border-[#e3dbcd] pb-2">
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
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-sans transition-all border ${
                        isActive
                          ? "bg-[#7A8C74]/10 text-[#2c312e] border-[#7A8C74]/25 font-bold shadow-sm"
                          : "text-[#67736b] bg-transparent border-transparent hover:text-[#2c312e] hover:bg-[#FAF7F2]/50"
                      }`}
                    >
                      <Icon className={`h-4.5 w-4.5 ${isActive ? "text-[#7A8C74]" : "text-[#67736b]"}`} />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </nav>

              {/* Sidebar Stats Panel */}
              <div className="flex flex-col gap-3 pt-3 border-t border-[#e3dbcd]">
                <div className="flex items-center gap-1.5 pb-1">
                  <Award className="h-4 w-4 text-[#7A8C74]" />
                  <h2 className="text-[9px] font-mono uppercase tracking-widest text-[#67736b] font-bold">
                    Commitment Stats
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-[#FAF7F2] border border-[#e3dbcd] p-2 rounded-xl flex flex-col">
                    <span className="text-sm font-mono font-bold text-[#2c312e]">
                      {stats.responsibilities}
                    </span>
                    <span className="text-[8px] text-[#67736b] font-mono uppercase tracking-wide">
                      Domains
                    </span>
                  </div>
                  <div className="bg-[#FAF7F2] border border-[#e3dbcd] p-2 rounded-xl flex flex-col">
                    <span className="text-sm font-mono font-bold text-[#2c312e]">
                      {stats.projects}
                    </span>
                    <span className="text-[8px] text-[#67736b] font-mono uppercase tracking-wide">
                      Projects
                    </span>
                  </div>
                  <div className="bg-[#FAF7F2] border border-[#e3dbcd] p-2 rounded-xl flex flex-col">
                    <span className="text-sm font-mono font-bold text-[#2c312e]">
                      {stats.goals}
                    </span>
                    <span className="text-[8px] text-[#67736b] font-mono uppercase tracking-wide">
                      Goals
                    </span>
                  </div>
                  <div className="bg-[#FAF7F2] border border-[#e3dbcd] p-2 rounded-xl flex flex-col">
                    <span className="text-sm font-mono font-bold text-[#2c312e]">
                      {stats.tasks}
                    </span>
                    <span className="text-[8px] text-[#67736b] font-mono uppercase tracking-wide">
                      Tasks
                    </span>
                  </div>
                </div>
              </div>

              {/* Support Links in Sidebar */}
              <div className="flex flex-col gap-1 pt-3 border-t border-[#e3dbcd] text-[10px] font-mono text-[#67736b]">
                <button className="flex items-center gap-2 px-2 py-1.5 hover:text-[#7A8C74] text-left transition-colors">
                  <Settings className="h-3.5 w-3.5" />
                  <span>Settings</span>
                </button>
                <button className="flex items-center gap-2 px-2 py-1.5 hover:text-[#7A8C74] text-left transition-colors">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Support</span>
                </button>
              </div>
            </div>
          </div>

          {/* Central Active View Workspace */}
          <div className="lg:col-span-3 flex flex-col gap-6">
            <CommandPalette />
            <ActiveComponent />
          </div>
        </div>
      </main>
    </div>
  );
}
