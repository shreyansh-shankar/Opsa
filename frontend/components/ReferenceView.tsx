"use client";

import React from "react";
import { useStore } from "@/store/useStore";
import { Terminal, ShieldAlert, CheckCircle, HelpCircle, ArrowRight, Play } from "lucide-react";

interface CommandHelpItem {
  cmd: string;
  desc: string;
  example: string;
  notes?: string;
}

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
          cmd: "SHOW ACTIVE / BLOCKED / DEFERRED / ARCHIVED",
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
      <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
        <HelpCircle className="h-5 w-5 text-cyan-400" />
        <h2 className="font-mono font-bold text-sm tracking-wider text-gray-200">OPSA COMMAND REFERENCE GUIDE</h2>
      </div>

      <div className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs font-mono text-cyan-300 bg-cyan-500/5 p-3 rounded-lg border border-cyan-500/10">
          <Terminal className="h-4 w-4 shrink-0" />
          <span>
            <strong>Usage Tip:</strong> In transactional scripts, wrap commands in <code>BEGIN TRANSACTION</code> and <code>END TRANSACTION</code> blocks.
          </span>
        </div>

        <div className="flex flex-col gap-8">
          {categories.map((cat, idx) => (
            <div key={idx} className="flex flex-col gap-3">
              <div className="flex flex-col">
                <h3 className="text-xs font-mono font-bold text-cyan-400 uppercase tracking-wide">
                  {cat.title}
                </h3>
                <span className="text-[10px] text-gray-500 font-mono mt-0.5">{cat.subtitle}</span>
              </div>

              <div className="flex flex-col gap-3">
                {cat.items.map((item, itemIdx) => (
                  <div
                    key={itemIdx}
                    className="p-3 bg-gray-950/40 border border-gray-900 rounded-lg flex flex-col gap-2 hover:border-gray-850 transition-colors"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                      <code className="text-xs font-mono font-bold text-gray-200 bg-black/40 px-2 py-0.5 rounded border border-gray-850">
                        {item.cmd}
                      </code>
                      <button
                        onClick={() => handleTry(item.example)}
                        className="flex items-center gap-1 text-[9px] font-mono text-cyan-400 hover:text-cyan-300 border border-cyan-500/10 hover:border-cyan-500/30 bg-cyan-500/5 px-2 py-0.5 rounded transition-all"
                      >
                        <Play className="h-2.5 w-2.5" />
                        <span>Try in Console</span>
                      </button>
                    </div>

                    <p className="text-[11px] text-gray-400 font-mono leading-relaxed">
                      {item.desc}
                    </p>

                    {item.notes && (
                      <span className="text-[9px] text-amber-500/90 font-mono italic">
                        * Note: {item.notes}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
