"use client";

import React, { useRef, useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { Terminal, Trash2, ShieldAlert, CheckCircle, Info, Settings } from "lucide-react";

interface SuggestionItem {
  value: string;
  type: "keyword" | "responsibility" | "project" | "goal" | "task" | "field" | "clause";
}

function getSegmentStartIndex(inputText: string): number {
  const upper = inputText.toUpperCase();
  
  const commandPrefixes = [
    "CREATE RESPONSIBILITY ",
    "CREATE PROJECT ",
    "CREATE GOAL ",
    "CREATE TASK ",
    "WHY BLOCKED ",
    "SHOW "
  ];
  for (const prefix of commandPrefixes) {
    if (upper.startsWith(prefix)) {
      const rest = inputText.slice(prefix.length);
      const restUpper = rest.toUpperCase();
      const separators = [
        "UNDER ", "OF ", "WITH ", "BY ", "UNTIL ", "TO ", "FROM ", "AS ", "INTO ", ", "
      ];
      let maxIdx = -1;
      separators.forEach(sep => {
        const idx = restUpper.lastIndexOf(sep);
        if (idx !== -1) {
          maxIdx = Math.max(maxIdx, idx + sep.length);
        }
      });
      if (maxIdx !== -1) {
        return prefix.length + maxIdx;
      }
      return prefix.length;
    }
  }

  const separators = [
    "UNDER ", "OF ", "WITH ", "BY ", "UNTIL ", "TO ", "FROM ", "AS ", "INTO ", ", "
  ];
  let maxIdx = -1;
  separators.forEach(sep => {
    const idx = upper.lastIndexOf(sep);
    if (idx !== -1) {
      maxIdx = Math.max(maxIdx, idx + sep.length);
    }
  });
  if (maxIdx !== -1) {
    return maxIdx;
  }

  const firstSpace = inputText.indexOf(" ");
  if (firstSpace !== -1) {
    return firstSpace + 1;
  }

  return 0;
}

export default function ConsoleView() {
  const { consoleLogs, clearConsole, executeCommand, pendingConsoleInput, setPendingConsoleInput, graph } = useStore();
  const [cmdInput, setCmdInput] = useState("");
  const consoleEndRef = useRef<HTMLDivElement>(null);
  
  // Autocomplete suggestions state
  const formRef = useRef<HTMLFormElement>(null);
  const suggestionListRef = useRef<HTMLDivElement>(null);
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Parse all entities from dependency graph for target referencing
  const entities = React.useMemo(() => {
    if (!graph || !graph.nodes) return [];
    
    const nodeMap = new Map<string, typeof graph.nodes[0]>();
    graph.nodes.forEach(n => nodeMap.set(n.id, n));

    const parentMap = new Map<string, string>();
    graph.edges.forEach(e => {
      if (e.type === "hierarchy") {
        parentMap.set(e.target, e.source);
      }
    });

    const labelCounts = new Map<string, number>();
    graph.nodes.forEach(n => {
      labelCounts.set(n.label, (labelCounts.get(n.label) || 0) + 1);
    });

    return graph.nodes.map(n => {
      const parentId = parentMap.get(n.id);
      const parentNode = parentId ? nodeMap.get(parentId) : null;
      const isDuplicate = (labelCounts.get(n.label) || 0) > 1;
      
      return {
        id: n.id,
        name: n.label,
        type: n.type,
        parentName: parentNode ? parentNode.label : null,
        isDuplicate,
        unambiguousName: parentNode ? `${n.label} OF ${parentNode.label}` : n.label
      };
    });
  }, [graph]);

  const getSuggestions = (inputVal: string): SuggestionItem[] => {
    const upper = inputVal.toUpperCase();
    const trimmed = inputVal.trim();

    const topKeywords = [
      "CREATE RESPONSIBILITY", "CREATE PROJECT", "CREATE GOAL", "CREATE TASK",
      "COMPLETE", "DELETE", "START", "PAUSE", "SCHEDULE", "BLOCK", "UNBLOCK",
      "MOVE", "MERGE", "SPLIT", "UPDATE", "SHOW ACTIVE", "SHOW BLOCKED",
      "SHOW DEFERRED", "SHOW PAUSED", "SHOW NOT STARTED", "SHOW ARCHIVED",
      "SHOW RESPONSIBILITIES", "SHOW PROJECTS", "SHOW GOALS", "SHOW TASKS",
      "SHOW RECENT", "WHY BLOCKED", "DEFER", "LINK", "UNLINK", "ARCHIVE",
      "RESTORE", "PROMOTE", "DEMOTE"
    ];

    if (!trimmed) {
      return topKeywords.map(k => ({ value: k, type: "keyword" as const }));
    }

    const segStart = getSegmentStartIndex(inputVal);
    const currentSegment = inputVal.slice(segStart);
    const currentSegUpper = currentSegment.trim().toUpperCase();

    const filterEntitiesBasic = (prefix: string, typeFilter?: string[]): SuggestionItem[] => {
      const cleanPrefix = prefix.replace(/^["']|["']$/g, "").trim().toUpperCase();
      const items: SuggestionItem[] = [];
      const seen = new Set<string>();

      entities.forEach(e => {
        if (typeFilter && !typeFilter.includes(e.type)) return;

        const flatName = e.name;
        const unambiguousName = e.unambiguousName;
        const typeLower = e.type.toLowerCase() as any;

        if (flatName.toUpperCase().startsWith(cleanPrefix) && !seen.has(flatName)) {
          seen.add(flatName);
          items.push({ value: flatName, type: typeLower });
        }
        if (e.isDuplicate && unambiguousName.toUpperCase().startsWith(cleanPrefix) && !seen.has(unambiguousName)) {
          seen.add(unambiguousName);
          items.push({ value: unambiguousName, type: typeLower });
        }
      });

      return items;
    };

    const filterEntities = (prefix: string, typeFilter?: string[]): SuggestionItem[] => {
      const cleanPrefix = prefix.replace(/^["']|["']$/g, "").trim();
      const upperPrefix = cleanPrefix.toUpperCase();

      const lastOfIdx = upperPrefix.lastIndexOf(" OF ");
      const lastUnderIdx = upperPrefix.lastIndexOf(" UNDER ");
      const delimIdx = Math.max(lastOfIdx, lastUnderIdx);

      if (delimIdx !== -1) {
        const isOf = lastOfIdx > lastUnderIdx;
        const sepLen = isOf ? 4 : 7;
        const childPart = cleanPrefix.slice(0, delimIdx).trim();
        const parentPart = cleanPrefix.slice(delimIdx + sepLen).trim();
        const childUpper = childPart.toUpperCase();
        const parentUpper = parentPart.toUpperCase();

        const matchingChildren = entities.filter(e => e.name.toUpperCase() === childUpper);
        if (matchingChildren.length > 0) {
          const items: SuggestionItem[] = [];
          const seenParents = new Set<string>();

          matchingChildren.forEach(child => {
            if (child.parentName) {
              const parentName = child.parentName;
              if (parentName.toUpperCase().startsWith(parentUpper) && !seenParents.has(parentName)) {
                seenParents.add(parentName);
                const pEnt = entities.find(e => e.name === parentName);
                const pType = pEnt ? pEnt.type.toLowerCase() as any : "project";
                items.push({ value: parentName, type: pType });
              }
            }
          });
          return items;
        }
        return filterEntitiesBasic(parentPart, typeFilter);
      }

      return filterEntitiesBasic(cleanPrefix, typeFilter);
    };

    const filterList = (prefix: string, list: string[], itemType: SuggestionItem["type"]): SuggestionItem[] => {
      const cleanPrefix = prefix.trim().toUpperCase();
      return list
        .filter(item => item.toUpperCase().startsWith(cleanPrefix))
        .map(item => ({ value: item, type: itemType }));
    };

    // 1. SHOW queries
    if (upper.startsWith("SHOW ")) {
      const afterShow = inputVal.slice(5);
      return filterList(afterShow, [
        "ACTIVE", "BLOCKED", "DEFERRED", "PAUSED", "NOT STARTED", "ARCHIVED",
        "RESPONSIBILITIES", "PROJECTS", "GOALS", "TASKS", "RECENT"
      ], "keyword");
    }

    // 2. WHY queries
    if (upper.startsWith("WHY ")) {
      if (!upper.startsWith("WHY BLOCKED ")) {
        const afterWhy = inputVal.slice(4);
        return filterList(afterWhy, ["BLOCKED"], "keyword");
      } else {
        const afterWhyBlocked = inputVal.slice(12);
        return filterEntities(afterWhyBlocked);
      }
    }

    // 3. CREATE command
    if (upper.startsWith("CREATE ")) {
      if (!upper.startsWith("CREATE RESPONSIBILITY ") &&
          !upper.startsWith("CREATE PROJECT ") &&
          !upper.startsWith("CREATE GOAL ") &&
          !upper.startsWith("CREATE TASK ")) {
        const afterCreate = inputVal.slice(7);
        return filterList(afterCreate, ["RESPONSIBILITY", "PROJECT", "GOAL", "TASK"], "keyword");
      }

      const prefixes = [
        { key: "CREATE PROJECT ", type: "PROJECT" },
        { key: "CREATE GOAL ", type: "GOAL" },
        { key: "CREATE TASK ", type: "TASK" }
      ];

      for (const pref of prefixes) {
        if (upper.startsWith(pref.key)) {
          const lastUnderIdx = upper.lastIndexOf(" UNDER ");
          if (lastUnderIdx !== -1) {
            const parentTyped = inputVal.slice(lastUnderIdx + 7);
            if (pref.type === "PROJECT") return filterEntities(parentTyped, ["RESPONSIBILITY"]);
            if (pref.type === "GOAL") return filterEntities(parentTyped, ["PROJECT"]);
            if (pref.type === "TASK") return filterEntities(parentTyped, ["RESPONSIBILITY", "PROJECT", "GOAL"]);
          } else {
            const words = trimmed.split(" ");
            const lastWord = words[words.length - 1].toUpperCase();
            if (lastWord && "UNDER".startsWith(lastWord) && words.length > 2) {
              return [{ value: "UNDER", type: "clause" }];
            }
          }
        }
      }
      return [];
    }

    // 4. UPDATE command
    if (upper.startsWith("UPDATE ")) {
      const lastSetIdx = upper.lastIndexOf(" SET ");
      if (lastSetIdx !== -1) {
        const afterSet = inputVal.slice(lastSetIdx + 5);
        const afterSetUpper = afterSet.toUpperCase();
        
        if (afterSetUpper.includes("PARENT = ")) {
          const pVal = afterSet.slice(afterSetUpper.lastIndexOf("PARENT = ") + 9);
          return filterEntities(pVal);
        }
        if (afterSetUpper.includes("PRIORITY = ")) {
          const pVal = afterSet.slice(afterSetUpper.lastIndexOf("PRIORITY = ") + 11);
          return filterList(pVal, ["LOW", "MEDIUM", "HIGH", "URGENT"], "field");
        }
        if (afterSetUpper.includes("STATUS = ")) {
          const sVal = afterSet.slice(afterSetUpper.lastIndexOf("STATUS = ") + 9);
          return filterList(sVal, [
            "NOT_STARTED", "ACTIVE", "BLOCKED", "PAUSED", "COMPLETED", "DEFERRED", "ARCHIVED"
          ], "field");
        }
        if (afterSetUpper.includes("SCHEDULED_FROM = ")) {
          const sVal = afterSet.slice(afterSetUpper.lastIndexOf("SCHEDULED_FROM = ") + 17);
          return filterList(sVal, ["NOW", "null"], "field");
        }
        if (afterSetUpper.includes("SCHEDULED_TO = ")) {
          const sVal = afterSet.slice(afterSetUpper.lastIndexOf("SCHEDULED_TO = ") + 15);
          return filterList(sVal, ["null"], "field");
        }

        const fields = ["parent =", "priority =", "status =", "scheduled_from =", "scheduled_to ="];
        const parts = afterSet.split(",");
        const lastPart = parts[parts.length - 1].trim();
        return filterList(lastPart, fields, "field");
      } else {
        const afterUpdate = inputVal.slice(7);
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "SET".startsWith(lastWord) && words.length > 2) {
          return [{ value: "SET", type: "clause" }];
        }
        return filterEntities(afterUpdate);
      }
    }

    // 5. DEFER command
    if (upper.startsWith("DEFER ")) {
      const lastUntilIdx = upper.lastIndexOf(" UNTIL ");
      if (lastUntilIdx !== -1) {
        const condVal = inputVal.slice(lastUntilIdx + 7);
        const list = entities.map(e => `${e.name}.Completed`);
        return filterList(condVal, list, "field");
      } else {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "UNTIL".startsWith(lastWord) && words.length > 2) {
          return [{ value: "UNTIL", type: "clause" }];
        }
        const afterDefer = inputVal.slice(6);
        return filterEntities(afterDefer);
      }
    }

    // 6. BLOCK command
    if (upper.startsWith("BLOCK ")) {
      const lastWithIdx = upper.lastIndexOf(" WITH ");
      const lastByIdx = upper.lastIndexOf(" BY ");
      const delimIdx = Math.max(lastWithIdx, lastByIdx);
      if (delimIdx !== -1) {
        const isWith = lastWithIdx > lastByIdx;
        const blockerVal = inputVal.slice(delimIdx + (isWith ? 6 : 4));
        return filterEntities(blockerVal);
      } else {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "WITH".startsWith(lastWord) && words.length > 2) return [{ value: "WITH", type: "clause" }];
        if (lastWord && "BY".startsWith(lastWord) && words.length > 2) return [{ value: "BY", type: "clause" }];
        
        const afterBlock = inputVal.slice(6);
        return filterEntities(afterBlock);
      }
    }

    // 7. LINK command
    if (upper.startsWith("LINK ")) {
      const lastAsIdx = upper.lastIndexOf(" AS ");
      const lastToIdx = upper.lastIndexOf(" TO ");
      if (lastAsIdx !== -1) {
        const relVal = inputVal.slice(lastAsIdx + 4);
        return filterList(relVal, ["blocks", "depends_on", "related_to"], "field");
      } else if (lastToIdx !== -1) {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "AS".startsWith(lastWord) && words.length > 4) return [{ value: "AS", type: "clause" }];
        
        const targetVal = inputVal.slice(lastToIdx + 4);
        return filterEntities(targetVal);
      } else {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "TO".startsWith(lastWord) && words.length > 2) return [{ value: "TO", type: "clause" }];
        
        const srcVal = inputVal.slice(5);
        return filterEntities(srcVal);
      }
    }

    // 8. UNLINK command
    if (upper.startsWith("UNLINK ")) {
      const lastFromIdx = upper.lastIndexOf(" FROM ");
      if (lastFromIdx !== -1) {
        const targetVal = inputVal.slice(lastFromIdx + 6);
        return filterEntities(targetVal);
      } else {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "FROM".startsWith(lastWord) && words.length > 2) return [{ value: "FROM", type: "clause" }];
        
        const srcVal = inputVal.slice(7);
        return filterEntities(srcVal);
      }
    }

    // 9. MOVE command
    if (upper.startsWith("MOVE ")) {
      const lastUnderIdx = upper.lastIndexOf(" UNDER ");
      if (lastUnderIdx !== -1) {
        const parentVal = inputVal.slice(lastUnderIdx + 7);
        return filterEntities(parentVal);
      } else {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "UNDER".startsWith(lastWord) && words.length > 2) return [{ value: "UNDER", type: "clause" }];
        
        const targetVal = inputVal.slice(5);
        return filterEntities(targetVal);
      }
    }

    // 10. SCHEDULE command
    if (upper.startsWith("SCHEDULE ")) {
      const lastToIdx = upper.lastIndexOf(" TO ");
      const lastFromIdx = upper.lastIndexOf(" FROM ");
      if (lastToIdx !== -1) {
        const toVal = inputVal.slice(lastToIdx + 4);
        return filterList(toVal, ["null", "5 days", "72 hours", "1 week", "30 mins"], "field");
      } else if (lastFromIdx !== -1) {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "TO".startsWith(lastWord) && words.length > 4) return [{ value: "TO", type: "clause" }];
        
        const fromVal = inputVal.slice(lastFromIdx + 6);
        return filterList(fromVal, ["NOW", "null"], "field");
      } else {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "FROM".startsWith(lastWord) && words.length > 2) return [{ value: "FROM", type: "clause" }];
        
        const targetVal = inputVal.slice(9);
        return filterEntities(targetVal, ["GOAL", "TASK"]);
      }
    }

    // 11. SPLIT command
    if (upper.startsWith("SPLIT ")) {
      const lastIntoIdx = upper.lastIndexOf(" INTO ");
      if (lastIntoIdx !== -1) {
        return [];
      } else {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "INTO".startsWith(lastWord) && words.length > 2) return [{ value: "INTO", type: "clause" }];
        
        const targetVal = inputVal.slice(6);
        return filterEntities(targetVal);
      }
    }

    // 12. MERGE command
    if (upper.startsWith("MERGE ")) {
      const lastIntoIdx = upper.lastIndexOf(" INTO ");
      if (lastIntoIdx !== -1) {
        return [];
      } else {
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (lastWord && "INTO".startsWith(lastWord) && words.length > 2) return [{ value: "INTO", type: "clause" }];
        
        const afterMerge = inputVal.slice(6);
        const lastCommaIdx = afterMerge.lastIndexOf(",");
        const currentSourceTyped = lastCommaIdx !== -1 ? afterMerge.slice(lastCommaIdx + 1) : afterMerge;
        return filterEntities(currentSourceTyped);
      }
    }

    // 13. Direct Target commands
    const directCmds = [
      { key: "COMPLETE ", len: 9 },
      { key: "DELETE ", len: 7 },
      { key: "START ", len: 6 },
      { key: "PAUSE ", len: 6 },
      { key: "ARCHIVE ", len: 8 },
      { key: "RESTORE ", len: 8 },
      { key: "PROMOTE ", len: 8 },
      { key: "DEMOTE ", len: 7 },
      { key: "UNBLOCK ", len: 8 }
    ];

    for (const cmd of directCmds) {
      if (upper.startsWith(cmd.key)) {
        const afterCmd = inputVal.slice(cmd.len);
        const afterCmdUpper = afterCmd.toUpperCase();
        
        const lastOfIdx = afterCmdUpper.lastIndexOf(" OF ");
        const lastUnderIdx = afterCmdUpper.lastIndexOf(" UNDER ");
        const delimIdx = Math.max(lastOfIdx, lastUnderIdx);
        
        if (delimIdx !== -1) {
          const isOf = lastOfIdx > lastUnderIdx;
          const parentVal = afterCmd.slice(delimIdx + (isOf ? 4 : 7));
          return filterEntities(parentVal);
        } else {
          const words = trimmed.split(" ");
          const lastWord = words[words.length - 1].toUpperCase();
          if (lastWord && "OF".startsWith(lastWord) && words.length > 1) return [{ value: "OF", type: "clause" }];
          if (lastWord && "UNDER".startsWith(lastWord) && words.length > 1) return [{ value: "UNDER", type: "clause" }];
          
          return filterEntities(afterCmd);
        }
      }
    }

    const topCmds = [
      "CREATE RESPONSIBILITY", "CREATE PROJECT", "CREATE GOAL", "CREATE TASK",
      "COMPLETE", "DELETE", "START", "PAUSE", "SCHEDULE", "BLOCK",
      "UNBLOCK", "MOVE", "MERGE", "SPLIT", "UPDATE", "SHOW", "WHY", "DEFER",
      "LINK", "UNLINK", "ARCHIVE", "RESTORE", "PROMOTE", "DEMOTE"
    ];
    return filterList(trimmed, topCmds, "keyword");
  };

  const handleSelectSuggestion = (sug: SuggestionItem) => {
    const segStart = getSegmentStartIndex(cmdInput);
    const prefix = cmdInput.slice(0, segStart);
    
    let completion = sug.value;
    
    // Auto-wrap entity names containing spaces in quotes
    const needsQuotes = sug.type !== "keyword" && sug.type !== "clause" && sug.type !== "field" && completion.includes(" ");
    if (needsQuotes) {
      completion = `"${completion}"`;
    }
    
    const newVal = prefix + completion;
    setCmdInput(newVal);
    setShowSuggestions(false);
    
    // Refocus input field
    const inputEl = document.querySelector('input[placeholder*="Enter query command"]') as HTMLInputElement;
    if (inputEl) {
      setTimeout(() => inputEl.focus(), 20);
    }
  };

  const handleInputChange = (val: string) => {
    setCmdInput(val);
    const s = getSuggestions(val);
    setSuggestions(s);
    setSelectedIndex(0);
    setShowSuggestions(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Tab" || e.key === "Enter") {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  // Close suggestions when clicking outside the command form
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep active suggestion visible on scroll during keyboard navigation
  useEffect(() => {
    if (suggestionListRef.current) {
      const activeEl = suggestionListRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs]);

  useEffect(() => {
    if (pendingConsoleInput) {
      setCmdInput(pendingConsoleInput);
      setPendingConsoleInput("");
      
      const inputEl = document.querySelector('input[placeholder*="Enter query command"]') as HTMLInputElement;
      if (inputEl) {
        setTimeout(() => inputEl.focus(), 50);
      }
    }
  }, [pendingConsoleInput, setPendingConsoleInput]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmdInput.trim()) return;
    const command = cmdInput;
    setCmdInput("");
    setShowSuggestions(false);
    await executeCommand(command);
  };

  const getLogStyle = (type: string) => {
    switch (type) {
      case "error":
        return {
          text: "text-[#C25953] font-semibold",
          bg: "bg-[#C25953]/5 border-l-2 border-[#C25953]",
          icon: <ShieldAlert className="h-4 w-4 text-[#C25953] shrink-0 mt-0.5" />
        };
      case "success":
        return {
          text: "text-[#5F8C6E] font-semibold",
          bg: "bg-[#5F8C6E]/5 border-l-2 border-[#5F8C6E]",
          icon: <CheckCircle className="h-4 w-4 text-[#5F8C6E] shrink-0 mt-0.5" />
        };
      case "input":
        return {
          text: "text-[#2c312e] font-bold",
          bg: "bg-[#7A8C74]/5 border-l-2 border-[#7A8C74]",
          icon: <span className="text-[#7A8C74] font-mono text-xs select-none shrink-0 mt-0.5">$ opsa&gt;</span>
        };
      default:
        return {
          text: "text-[#67736b] whitespace-pre-wrap leading-relaxed",
          bg: "bg-[#F5F0E6]/20 border-l border-[#e3dbcd]",
          icon: <Info className="h-4 w-4 text-[#7A8C74] shrink-0 mt-0.5" />
        };
    }
  };

  const getSuggestionBadge = (type: SuggestionItem["type"]) => {
    switch (type) {
      case "keyword":
        return (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-100/80 text-blue-800 uppercase tracking-wider scale-90">
            CMD
          </span>
        );
      case "clause":
        return (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 uppercase tracking-wider scale-90">
            Clause
          </span>
        );
      case "field":
        return (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 uppercase tracking-wider scale-90">
            Prop
          </span>
        );
      case "responsibility":
        return (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D46B4E]" />
            <span className="text-[8px] font-bold text-[#D46B4E] uppercase tracking-wider scale-90">Resp</span>
          </span>
        );
      case "project":
        return (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3D5A80]" />
            <span className="text-[8px] font-bold text-[#3D5A80] uppercase tracking-wider scale-90">Proj</span>
          </span>
        );
      case "goal":
        return (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E09F3E]" />
            <span className="text-[8px] font-bold text-[#E09F3E] uppercase tracking-wider scale-90">Goal</span>
          </span>
        );
      case "task":
        return (
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5F8C6E]" />
            <span className="text-[8px] font-bold text-[#5F8C6E] uppercase tracking-wider scale-90">Task</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col border-b border-[#e3dbcd] pb-3">
        <h2 className="text-xl font-serif font-bold text-[#2c312e]">System Console</h2>
        <span className="text-xs font-sans italic text-[#67736b] mt-0.5">
          &quot;Precision is the byproduct of clarity.&quot; — Core Protocols
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
        {/* Left Console area */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="glass-panel rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col h-[520px] shadow-sm overflow-hidden">
            {/* Console header */}
            <div className="flex items-center justify-between border-b border-[#e3dbcd] px-4 py-3 bg-[#F5F0E6]/30">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#7A8C74] animate-pulse" />
                <span className="text-xs font-mono font-bold text-[#2c312e] uppercase">Interactive System Console</span>
              </div>
              <button
                onClick={clearConsole}
                className="flex items-center gap-1 text-[10px] font-mono text-[#67736b] hover:text-[#C25953] bg-[#FAF7F2] border border-[#e3dbcd] hover:border-[#C25953]/30 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear Logs</span>
              </button>
            </div>

            {/* Terminal logs list */}
            <div className="grow overflow-y-auto p-4 flex flex-col gap-2.5 font-mono text-xs bg-[#FAF7F2]">
              {consoleLogs.map((log, idx) => {
                const style = getLogStyle(log.type);
                return (
                  <div
                    key={idx}
                    className={`flex items-start gap-2.5 p-2 rounded-lg transition-colors ${style.bg}`}
                  >
                    {style.icon}
                    <div className="flex flex-col gap-1 grow">
                      <span className={style.text}>{log.text}</span>
                      <span className="text-[9px] text-[#67736b] self-end select-none">{log.timestamp}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={consoleEndRef} />
            </div>

            {/* Inline Terminal command line */}
            <form
              ref={formRef}
              onSubmit={handleSend}
              className="relative flex items-center p-3 border-t border-[#e3dbcd] bg-[#FAF7F2]"
            >
              {/* Suggestion Popover */}
              {showSuggestions && suggestions.length > 0 && (
                <div
                  ref={suggestionListRef}
                  className="absolute bottom-full mb-1.5 left-3 w-[calc(100%-1.5rem)] max-h-[220px] overflow-y-auto bg-[#FAF7F2]/95 backdrop-blur-md border border-[#e3dbcd] rounded-xl shadow-lg z-50 flex flex-col p-1.5 font-mono text-[11px]"
                >
                  {suggestions.map((sug, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectSuggestion(sug)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`flex items-center justify-between text-left px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        idx === selectedIndex
                          ? "bg-[#7A8C74]/15 text-[#2c312e]"
                          : "text-[#67736b] hover:bg-[#7A8C74]/5"
                      }`}
                    >
                      <span className="truncate pr-4">{sug.value}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {getSuggestionBadge(sug.type)}
                        {idx === selectedIndex && (
                          <span className="text-[8px] text-gray-400 font-sans border border-[#e3dbcd] px-1 rounded bg-[#F5F0E6]">
                            Tab
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <span className="absolute left-6 text-[#7A8C74] font-mono text-xs select-none">$</span>
              <input
                type="text"
                value={cmdInput}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  const s = getSuggestions(cmdInput);
                  setSuggestions(s);
                  setSelectedIndex(0);
                  setShowSuggestions(true);
                }}
                placeholder="Enter query command... (e.g. SHOW ACTIVE, WHY BLOCKED Launch)"
                className="w-full bg-[#FAF7F2] text-[#2c312e] font-mono text-xs pl-8 pr-12 py-2.5 rounded-xl border border-[#e3dbcd] focus:outline-none focus:border-[#7A8C74] placeholder-gray-400"
              />
              <button
                type="submit"
                className="absolute right-5 text-[10px] font-mono px-3 py-1 rounded-lg bg-[#F5F0E6] border border-[#e3dbcd] hover:border-[#d6cebf] text-[#2c312e] hover:bg-[#e3dbcd]/30 transition-colors cursor-pointer"
              >
                Run
              </button>
            </form>
          </div>
        </div>

        {/* Right Environment & Quick Reference Sidebar */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Environment State Card */}
          <div className="glass-panel p-4 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#67736b] font-bold border-b border-[#e3dbcd] pb-2">
              Environment State
            </h3>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-mono text-[#2c312e]">
                  <span>CPU Load</span>
                  <span>14%</span>
                </div>
                <div className="w-full bg-[#e3dbcd] rounded-full h-1.5 overflow-hidden">
                  <div className="bg-[#5F8C6E] h-1.5 rounded-full" style={{ width: "14%" }} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-mono text-[#2c312e]">
                  <span>Memory Usage</span>
                  <span>42%</span>
                </div>
                <div className="w-full bg-[#e3dbcd] rounded-full h-1.5 overflow-hidden">
                  <div className="bg-[#D4A351] h-1.5 rounded-full" style={{ width: "42%" }} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-[10px] font-mono text-[#2c312e]">
                  <span>Disk Cache</span>
                  <span>28%</span>
                </div>
                <div className="w-full bg-[#e3dbcd] rounded-full h-1.5 overflow-hidden">
                  <div className="bg-[#CE8D6D] h-1.5 rounded-full" style={{ width: "28%" }} />
                </div>
              </div>
            </div>
          </div>

          {/* Quick Reference Card */}
          <div className="glass-panel p-4 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#67736b] font-bold border-b border-[#e3dbcd] pb-2">
              Quick Reference
            </h3>
            <div className="flex flex-col gap-3 text-[10px] font-mono text-[#2c312e]">
              <div>
                <span className="text-[#CE8D6D] font-bold">LIST:</span>
                <p className="text-[#67736b] mt-0.5">Show all active system entities.</p>
              </div>
              <div>
                <span className="text-[#CE8D6D] font-bold">TRACE:</span>
                <p className="text-[#67736b] mt-0.5">Audit the logs for a specific node ID.</p>
              </div>
              <div>
                <span className="text-[#CE8D6D] font-bold">WIPE:</span>
                <p className="text-[#67736b] mt-0.5">Force clear session temporary cache.</p>
              </div>
            </div>
            <button
              onClick={() => setPendingConsoleInput("SHOW ACTIVE")}
              className="flex items-center justify-center gap-1.5 bg-[#7A8C74] hover:bg-[#687863] text-white font-mono text-[10px] py-2 rounded-xl transition-all shadow-sm cursor-pointer"
            >
              View Documentation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
