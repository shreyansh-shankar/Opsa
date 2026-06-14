"use client";

import React from "react";
import { useStore } from "@/store/useStore";
import { Terminal, HelpCircle, Play, Sparkles, Sliders } from "lucide-react";

export default function ReferenceView() {
  const { setActiveTab, setPendingConsoleInput } = useStore();

  const handleTry = (cmdText: string) => {
    setPendingConsoleInput(cmdText);
    setActiveTab("console");
  };

  const categories = [
    {
      title: "1. Structure Creation Commands",
      subtitle: "Declare your work structures. Parents must exist before creating children.",
      items: [
        {
          cmd: "CREATE RESPONSIBILITY <name>",
          desc: "Creates a top-level domain of responsibility (e.g. Career, Health, Startup).",
          example: "CREATE RESPONSIBILITY Startup",
          notes: "No parent allowed. Name must be unique."
        },
        {
          cmd: "CREATE PROJECT <name> UNDER <parent_responsibility>",
          desc: "Declares a project belonging to a specific responsibility domain.",
          example: "CREATE PROJECT TLD UNDER Startup",
          notes: "Parent must be a Responsibility."
        },
        {
          cmd: "CREATE GOAL <name> UNDER <parent_project>",
          desc: "Declares a key outcome or milestone under a project.",
          example: "CREATE GOAL LinuxTrack UNDER TLD",
          notes: "Parent must be a Project."
        },
        {
          cmd: "CREATE TASK <name> UNDER <parent>",
          desc: "Creates an executable task. Can be placed under a Goal, Project, or Responsibility.",
          example: "CREATE TASK Module1 UNDER LinuxTrack",
          notes: "Parent can be a Goal, Project, or Responsibility."
        }
      ]
    },
    {
      title: "2. Status, Priority & Lifecycle Mutations",
      subtitle: "Alter execution progress, prioritize tasks, and manage entity lifetimes.",
      items: [
        {
          cmd: "COMPLETE <target>",
          desc: "Marks a task or goal as completed. Resolves any blocks or state deferrals depending on it.",
          example: "COMPLETE Module1"
        },
        {
          cmd: "START <target>",
          desc: "Starts a paused or not started entity, transitioning its status to ACTIVE.",
          example: "START Module1"
        },
        {
          cmd: "PAUSE <target>",
          desc: "Pauses an active or not started entity, transitioning its status to PAUSED.",
          example: "PAUSE Module1"
        },
        {
          cmd: "PROMOTE <target> / DEMOTE <target>",
          desc: "Increases or decreases priority levels (LOW -> MEDIUM -> HIGH -> URGENT).",
          example: "PROMOTE Module1",
          notes: "Promoting an ACTIVE task with HIGH/URGENT priority places it in 'Today's Priorities'."
        },
        {
          cmd: "UPDATE <target> SET <field> = <value>",
          desc: "Modifies parameters like name, parent pointer, or priority.",
          example: "UPDATE Module1 SET priority = URGENT"
        },
        {
          cmd: "DELETE <target>",
          desc: "Permanently deletes an entity and removes any parent reference or relationships connected to it.",
          example: "DELETE Module1"
        },
        {
          cmd: "ARCHIVE <target>",
          desc: "Archives an entity, removing it from active views but preserving event history.",
          example: "ARCHIVE Module1"
        },
        {
          cmd: "RESTORE <target>",
          desc: "Restores an archived entity back to ACTIVE status.",
          example: "RESTORE Module1"
        }
      ]
    },
    {
      title: "3. Dependency & Deferral Commands",
      subtitle: "Represent commitments relations and schedule blocks.",
      items: [
        {
          cmd: "BLOCK <target> BY <blocker_slug>",
          desc: "Declares that the target task is blocked by the blocker task. Shifts target status to BLOCKED.",
          example: "BLOCK Launch BY LandingPage",
          notes: "Fails if adding the dependency creates a cycle (e.g. A blocks B and B blocks A)."
        },
        {
          cmd: "UNBLOCK <target>",
          desc: "Removes all blocker dependencies targeting this task.",
          example: "UNBLOCK Launch"
        },
        {
          cmd: "DEFER <target> UNTIL <date | condition>",
          desc: "Defers task execution until a calendar date (YYYY-MM-DD) or an entity completion condition.",
          example: "DEFER Launch UNTIL LinuxTrack.Completed",
          notes: "Once the condition is completed (or calendar date passes), the task becomes ACTIVE."
        },
        {
          cmd: "LINK <source> TO <target> AS <type>",
          desc: "Creates a custom directional link relationship (types: depends_on, blocks, related_to, linked_to).",
          example: "LINK module1 TO module2 AS related_to"
        }
      ]
    },
    {
      title: "4. Structure Modifications",
      subtitle: "Re-organize commitments or split/merge deliverables.",
      items: [
        {
          cmd: "MOVE <target> UNDER <new_parent>",
          desc: "Moves an entity under a different parent structure.",
          example: "MOVE LinuxTrack UNDER JobSearch",
          notes: "Verifies parent types and hierarchy cycle safety."
        },
        {
          cmd: "SPLIT <target> INTO <name1>, <name2>...",
          desc: "Splits a task into multiple sub-tasks. Archives original task and copies relationships.",
          example: "SPLIT Module3 INTO SubModuleA, SubModuleB"
        },
        {
          cmd: "MERGE <name1>, <name2> INTO <new_name>",
          desc: "Merges multiple source tasks into a single target task.",
          example: "MERGE SubModuleA, SubModuleB INTO Module3"
        }
      ]
    },
    {
      title: "5. System Queries",
      subtitle: "Inspect the runtime's derived database state.",
      items: [
        {
          cmd: "SHOW ACTIVE / BLOCKED / DEFERRED / PAUSED / NOT_STARTED / ARCHIVED",
          desc: "Filters and returns lists of entities matching the status query.",
          example: "SHOW ACTIVE"
        },
        {
          cmd: "SHOW RESPONSIBILITIES / PROJECTS / GOALS / TASKS",
          desc: "Lists all entities belonging to a specific tier type.",
          example: "SHOW TASKS"
        },
        {
          cmd: "WHY BLOCKED <target>",
          desc: "Renders the recursive dependency tree explaining why a target is blocked.",
          example: "WHY BLOCKED Launch"
        }
      ]
    }
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Blueprint Header Banner */}
      <div className="glass-panel p-6 rounded-2xl border border-[#e3dbcd] relative overflow-hidden bg-[#2E3630] text-[#FAF7F2] shadow-sm flex flex-col gap-2">
        {/* Subtle technical graphic grids background */}
        <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
          backgroundImage: 'radial-gradient(#FAF7F2 1px, transparent 1px)',
          backgroundSize: '16px 16px'
        }} />
        <h2 className="text-2xl font-serif font-bold tracking-tight z-10">Refine Your Architecture</h2>
        <p className="text-xs font-sans text-[#EDE9E1]/80 max-w-lg z-10 leading-relaxed">
          Browse the schema for transactional operations within the MISSIONOS ecosystem.
          Manage nested hierarchies and maintain declarative integrity.
        </p>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 border-b border-[#e3dbcd] pb-3">
          <HelpCircle className="h-5 w-5 text-[#7A8C74]" />
          <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">OPSA COMMAND REFERENCE GUIDE</h2>
        </div>

        <div className="flex items-center gap-2.5 text-xs font-mono text-[#D4A351] bg-[#D4A351]/5 p-3 rounded-xl border border-[#D4A351]/15">
          <Terminal className="h-4 w-4 shrink-0" />
          <span>
            <strong>Usage Tip:</strong> In transactional scripts, wrap commands in <code>BEGIN TRANSACTION</code> and <code>END TRANSACTION</code> blocks for atomicity.
          </span>
        </div>

        {/* Command categories */}
        <div className="flex flex-col gap-8 mt-2">
          {categories.map((cat, idx) => (
            <div key={idx} className="flex flex-col gap-4">
              <div className="flex flex-col">
                <h3 className="text-xs font-sans font-bold text-[#7A8C74] uppercase tracking-wider">
                  {cat.title}
                </h3>
                <span className="text-[10px] text-[#67736b] font-mono mt-0.5">{cat.subtitle}</span>
              </div>

              <div className="flex flex-col gap-4">
                {cat.items.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    className="glass-panel p-4 rounded-xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-3 hover:border-[#d6cebf] transition-all shadow-sm"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <code className="text-xs font-mono font-bold text-[#EDE9E1] bg-[#2E3630] px-3 py-1 rounded-lg border border-[#2c312e]/10 shadow-sm">
                        {item.cmd}
                      </code>
                      <button
                        onClick={() => handleTry(item.example)}
                        className="flex items-center gap-1.5 text-[9px] font-mono text-[#7A8C74] hover:text-white border border-[#7A8C74]/20 hover:bg-[#7A8C74] bg-[#7A8C74]/5 px-2.5 py-1 rounded-lg transition-all cursor-pointer"
                      >
                        <Play className="h-2.5 w-2.5" />
                        <span>Try in Console</span>
                      </button>
                    </div>

                    <p className="text-xs text-[#2c312e]/80 font-sans leading-relaxed pl-1">
                      {item.desc}
                    </p>

                    {item.notes && (
                      <span className="text-[9.5px] text-[#D4A351] font-mono pl-1">
                        * Note: {item.notes}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom double column information footnotes */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-3 shadow-sm">
            <div className="flex items-center gap-2 text-[#CE8D6D]">
              <Sparkles className="h-4.5 w-4.5" />
              <h4 className="text-xs font-sans font-bold uppercase tracking-wider">Semantic Naming</h4>
            </div>
            <p className="text-xs text-[#67736b] font-sans leading-relaxed">
              Ensure your structure names are descriptive yet concise. The OPSA runtime uses these identifiers for auto-generating your operation timeline and dependency tree.
            </p>
            <button
              onClick={() => handleTry("SHOW RESPONSIBILITIES")}
              className="text-[10px] font-mono text-[#CE8D6D] hover:underline self-start mt-1 cursor-pointer"
            >
              Learn about naming conventions →
            </button>
          </div>

          <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-3 shadow-sm">
            <div className="flex items-center gap-2 text-[#7A8C74]">
              <Sliders className="h-4.5 w-4.5" />
              <h4 className="text-xs font-sans font-bold uppercase tracking-wider">Nesting Limits</h4>
            </div>
            <p className="text-xs text-[#67736b] font-sans leading-relaxed">
              While OPSA supports deep nesting, we recommend a max depth of 4 layers to maintain clarity. Use Responsibility &gt; Project &gt; Goal &gt; Task as your primary mental model.
            </p>
            <button
              onClick={() => handleTry("SHOW TASKS")}
              className="text-[10px] font-mono text-[#7A8C74] hover:underline self-start mt-1 cursor-pointer"
            >
              View best practices →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
