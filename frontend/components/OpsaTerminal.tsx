"use client";

import React, { useRef, useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import {
  Terminal, Send, Code, HelpCircle, ChevronUp, ChevronDown, Layers
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuggestionItem {
  value: string;
  type: "keyword" | "responsibility" | "project" | "goal" | "task" | "field" | "clause";
}

// ─── Autocomplete helpers (mirrored from ConsoleView) ─────────────────────────

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
        if (idx !== -1) maxIdx = Math.max(maxIdx, idx + sep.length);
      });
      if (maxIdx !== -1) return prefix.length + maxIdx;
      return prefix.length;
    }
  }

  const separators = [
    "UNDER ", "OF ", "WITH ", "BY ", "UNTIL ", "TO ", "FROM ", "AS ", "INTO ", ", "
  ];
  let maxIdx = -1;
  separators.forEach(sep => {
    const idx = upper.lastIndexOf(sep);
    if (idx !== -1) maxIdx = Math.max(maxIdx, idx + sep.length);
  });
  if (maxIdx !== -1) return maxIdx;

  const firstSpace = inputText.indexOf(" ");
  if (firstSpace !== -1) return firstSpace + 1;
  return 0;
}

function getReplacementStartIndex(inputText: string): number {
  const upper = inputText.toUpperCase();

  const clauseKeywords = [" UNDER ", " WITH ", " BY ", " UNTIL ", " INTO "];
  for (const kw of clauseKeywords) {
    const idx = upper.lastIndexOf(kw);
    if (idx !== -1) return idx + kw.length;
  }

  const verbPrefixes = [
    "COMPLETE ", "DELETE ", "START ", "PAUSE ", "ARCHIVE ", "RESTORE ",
    "PROMOTE ", "DEMOTE ", "UNBLOCK ", "DEFER ", "BLOCK ", "UNBLOCK ",
    "MOVE ", "SPLIT ", "MERGE ", "SCHEDULE ", "LINK ", "UNLINK ",
    "UPDATE ", "WHY BLOCKED "
  ];
  for (const pref of verbPrefixes) {
    if (upper.startsWith(pref)) {
      const clausesAfterTarget = [" TO ", " FROM ", " AS ", ", "];
      let clauseIdx = -1;
      for (const kw of clausesAfterTarget) {
        const i = upper.lastIndexOf(kw);
        if (i !== -1 && i > clauseIdx) clauseIdx = i + kw.length - 1;
      }
      if (clauseIdx !== -1) {
        for (const kw of clausesAfterTarget) {
          const i = upper.lastIndexOf(kw);
          if (i !== -1 && i + kw.length - 1 === clauseIdx) return i + kw.length;
        }
      }
      return pref.length;
    }
  }

  const createPrefixes = [
    "CREATE RESPONSIBILITY ", "CREATE PROJECT ", "CREATE GOAL ", "CREATE TASK "
  ];
  for (const pref of createPrefixes) {
    if (upper.startsWith(pref)) return pref.length;
  }

  return getSegmentStartIndex(inputText);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OpsaTerminal() {
  const {
    executeCommand, executeScript, setActiveTab,
    pendingConsoleInput, setPendingConsoleInput, graph
  } = useStore();

  const [input, setInput] = useState("");
  const [isMultiLine, setIsMultiLine] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const suggestionListRef = useRef<HTMLDivElement>(null);

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // ── Entity list from graph ──
  const entities = React.useMemo(() => {
    if (!graph || !graph.nodes) return [];

    const nodeMap = new Map<string, typeof graph.nodes[0]>();
    graph.nodes.forEach(n => nodeMap.set(n.id, n));

    const parentMap = new Map<string, string>();
    graph.edges.forEach(e => {
      if (e.type === "hierarchy") parentMap.set(e.target, e.source);
    });

    const labelCounts = new Map<string, number>();
    graph.nodes.forEach(n => labelCounts.set(n.label, (labelCounts.get(n.label) || 0) + 1));

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

  // ── Suggestion engine ──
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
          const seenFull = new Set<string>();
          matchingChildren.forEach(child => {
            if (child.parentName) {
              const parentName = child.parentName;
              if (parentName.toUpperCase().startsWith(parentUpper)) {
                const fullForm = `${child.name} OF ${parentName}`;
                if (!seenFull.has(fullForm)) {
                  seenFull.add(fullForm);
                  items.push({ value: fullForm, type: child.type.toLowerCase() as any });
                }
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

    // SHOW queries
    if (upper.startsWith("SHOW ")) {
      const afterShow = inputVal.slice(5);
      return filterList(afterShow, [
        "ACTIVE", "BLOCKED", "DEFERRED", "PAUSED", "NOT STARTED", "ARCHIVED",
        "RESPONSIBILITIES", "PROJECTS", "GOALS", "TASKS", "RECENT"
      ], "keyword");
    }

    // WHY queries
    if (upper.startsWith("WHY ")) {
      if (!upper.startsWith("WHY BLOCKED ")) {
        return filterList(inputVal.slice(4), ["BLOCKED"], "keyword");
      } else {
        return filterEntities(inputVal.slice(12));
      }
    }

    // CREATE commands
    if (upper.startsWith("CREATE ")) {
      if (!upper.startsWith("CREATE RESPONSIBILITY ") &&
          !upper.startsWith("CREATE PROJECT ") &&
          !upper.startsWith("CREATE GOAL ") &&
          !upper.startsWith("CREATE TASK ")) {
        return filterList(inputVal.slice(7), ["RESPONSIBILITY", "PROJECT", "GOAL", "TASK"], "keyword");
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
          return [];
        }
      }
      return [];
    }

    // UPDATE command
    if (upper.startsWith("UPDATE ")) {
      if (upper.includes(" SET ")) {
        const afterSet = upper.slice(upper.indexOf(" SET ") + 5);
        if (!afterSet.includes("=")) {
          return filterList(afterSet, ["name", "priority", "status", "scheduled_from", "scheduled_to"], "field");
        }
        const fieldPart = afterSet.split("=")[0].trim();
        const valPart = afterSet.split("=")[1]?.trim() || "";
        if (fieldPart === "PRIORITY") {
          return filterList(valPart, ["LOW", "MEDIUM", "HIGH", "URGENT"], "keyword");
        }
        if (fieldPart === "STATUS") {
          return filterList(valPart, ["ACTIVE", "PAUSED", "NOT_STARTED", "COMPLETED", "ARCHIVED", "DEFERRED"], "keyword");
        }
        return [];
      }
      const words = trimmed.split(" ");
      const lastWord = words[words.length - 1].toUpperCase();
      if (words.length > 2 && "SET".startsWith(lastWord)) {
        return [{ value: "SET", type: "clause" }];
      }
      if (words.length === 2) {
        return filterEntities(inputVal.slice(7));
      }
      return [];
    }

    // Single-target commands
    const singleTargetCmds = [
      "COMPLETE ", "DELETE ", "START ", "PAUSE ", "ARCHIVE ", "RESTORE ",
      "PROMOTE ", "DEMOTE ", "UNBLOCK ", "SCHEDULE "
    ];
    for (const cmd of singleTargetCmds) {
      if (upper.startsWith(cmd)) {
        const afterCmd = inputVal.slice(cmd.length);
        if (cmd === "SCHEDULE ") {
          const hasFrom = upper.includes(" FROM ");
          const hasTo = upper.includes(" TO ");
          if (!hasFrom) {
            const words = trimmed.split(" ");
            const lastWord = words[words.length - 1].toUpperCase();
            if (words.length > 1 && "FROM".startsWith(lastWord)) {
              return [{ value: "FROM", type: "clause" }];
            }
            return filterEntities(afterCmd);
          }
          if (hasFrom && !hasTo) {
            const words = trimmed.split(" ");
            const lastWord = words[words.length - 1].toUpperCase();
            if ("TO".startsWith(lastWord)) return [{ value: "TO", type: "clause" }];
          }
          return [];
        }
        return filterEntities(afterCmd);
      }
    }

    // DEFER command
    if (upper.startsWith("DEFER ")) {
      if (upper.includes(" UNTIL ")) {
        return [];
      }
      const words = trimmed.split(" ");
      const lastWord = words[words.length - 1].toUpperCase();
      if (words.length > 1 && "UNTIL".startsWith(lastWord)) {
        return [{ value: "UNTIL", type: "clause" }];
      }
      return filterEntities(inputVal.slice(6));
    }

    // BLOCK / MOVE / MERGE / LINK / UNLINK
    const twoPartCmds: Record<string, { joiner: string; label: string }> = {
      "BLOCK ": { joiner: " BY ", label: "BY" },
      "MOVE ": { joiner: " UNDER ", label: "UNDER" },
      "LINK ": { joiner: " TO ", label: "TO" },
      "UNLINK ": { joiner: " FROM ", label: "FROM" }
    };
    for (const [prefix, info] of Object.entries(twoPartCmds)) {
      if (upper.startsWith(prefix)) {
        const joinerUpper = info.joiner.toUpperCase();
        if (upper.includes(joinerUpper)) {
          const joinerIdx = upper.lastIndexOf(joinerUpper);
          const afterJoiner = inputVal.slice(joinerIdx + info.joiner.length);
          return filterEntities(afterJoiner);
        }
        const words = trimmed.split(" ");
        const lastWord = words[words.length - 1].toUpperCase();
        if (words.length > 1 && info.label.startsWith(lastWord)) {
          return [{ value: info.label, type: "clause" }];
        }
        return filterEntities(inputVal.slice(prefix.length));
      }
    }

    // MERGE / SPLIT
    if (upper.startsWith("MERGE ") || upper.startsWith("SPLIT ")) {
      if (upper.includes(" INTO ")) {
        return [];
      }
      const words = trimmed.split(" ");
      const lastWord = words[words.length - 1].toUpperCase();
      if (words.length > 1 && "INTO".startsWith(lastWord)) {
        return [{ value: "INTO", type: "clause" }];
      }
      const prefix = upper.startsWith("MERGE ") ? "MERGE " : "SPLIT ";
      return filterEntities(inputVal.slice(prefix.length));
    }

    const topCmds = [
      "CREATE RESPONSIBILITY", "CREATE PROJECT", "CREATE GOAL", "CREATE TASK",
      "COMPLETE", "DELETE", "START", "PAUSE", "SCHEDULE", "BLOCK",
      "UNBLOCK", "MOVE", "MERGE", "SPLIT", "UPDATE", "SHOW", "WHY", "DEFER",
      "LINK", "UNLINK", "ARCHIVE", "RESTORE", "PROMOTE", "DEMOTE"
    ];
    return filterList(trimmed, topCmds, "keyword");
  };

  // ── Suggestion badge ──
  const getSuggestionBadge = (type: SuggestionItem["type"]) => {
    switch (type) {
      case "keyword":
        return <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-blue-100/80 text-blue-800 uppercase tracking-wider">CMD</span>;
      case "clause":
        return <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-800 uppercase tracking-wider">Clause</span>;
      case "field":
        return <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 uppercase tracking-wider">Prop</span>;
      case "responsibility":
        return <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#D46B4E]" /><span className="text-[8px] font-bold text-[#D46B4E] uppercase tracking-wider">Resp</span></span>;
      case "project":
        return <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#3D5A80]" /><span className="text-[8px] font-bold text-[#3D5A80] uppercase tracking-wider">Proj</span></span>;
      case "goal":
        return <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#E09F3E]" /><span className="text-[8px] font-bold text-[#E09F3E] uppercase tracking-wider">Goal</span></span>;
      case "task":
        return <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#5F8C6E]" /><span className="text-[8px] font-bold text-[#5F8C6E] uppercase tracking-wider">Task</span></span>;
      default: return null;
    }
  };

  // ── Event handlers ──
  const handleSelectSuggestion = (sug: SuggestionItem) => {
    const repStart = getReplacementStartIndex(input);
    const prefix = input.slice(0, repStart);
    let completion = sug.value;
    const needsQuotes = sug.type !== "keyword" && sug.type !== "clause" && sug.type !== "field" && completion.includes(" ");
    if (needsQuotes) completion = `"${completion}"`;
    setInput(prefix + completion);
    setShowSuggestions(false);
    setTimeout(() => inputRef.current?.focus(), 20);
  };

  const handleInputChange = (val: string) => {
    setInput(val);
    setSuggestions(getSuggestions(val));
    setSelectedIndex(0);
    setShowSuggestions(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === "Enter") handleSubmit(e as any);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Tab") {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === "Enter") {
      if (suggestions[selectedIndex] && showSuggestions) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[selectedIndex]);
      } else {
        handleSubmit(e as any);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const cmd = input;
    setInput("");
    setShowSuggestions(false);
    if (isMultiLine) {
      await executeScript(cmd);
    } else {
      await executeCommand(cmd);
    }
  };

  // ── pendingConsoleInput watcher (for WHY BLOCKED links etc.) ──
  useEffect(() => {
    if (pendingConsoleInput) {
      setInput(pendingConsoleInput);
      setPendingConsoleInput("");
      setIsExpanded(true);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [pendingConsoleInput, setPendingConsoleInput]);

  // Focus on mode switch
  useEffect(() => {
    if (!isMultiLine) setTimeout(() => inputRef.current?.focus(), 50);
    else setTimeout(() => textareaRef.current?.focus(), 50);
  }, [isMultiLine]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll selected suggestion into view
  useEffect(() => {
    if (suggestionListRef.current) {
      const el = suggestionListRef.current.children[selectedIndex] as HTMLElement;
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e3dbcd] bg-[#FAF7F2]/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.07)] px-4 pb-6">
      {/* Terminal bar header */}
      <div className="flex items-center justify-between py-1.5 border-b border-[#e3dbcd]/60 bg-[#F5F0E6]/50 -mx-4 px-4 mb-0">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-[#7A8C74] animate-pulse" />
          <span className="text-[10px] font-mono font-bold text-[#7A8C74] uppercase tracking-widest">opsa-terminal</span>
          <span className="text-[9px] font-mono text-[#67736b] border border-[#e3dbcd] px-1.5 py-0.5 rounded-md">v1.0.0</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsMultiLine(m => !m)}
            className={`flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-md transition-colors border ${
              isMultiLine
                ? "bg-[#7A8C74]/10 text-[#7A8C74] border-[#7A8C74]/20"
                : "bg-transparent text-[#67736b] border-[#e3dbcd] hover:text-[#2c312e]"
            }`}
          >
            <Code className="h-2.5 w-2.5" />
            <span>{isMultiLine ? "Transaction" : "Single"}</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("reference")}
            className="flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-md border border-[#e3dbcd] bg-transparent text-[#67736b] hover:text-[#2c312e] transition-colors"
          >
            <HelpCircle className="h-2.5 w-2.5" />
            <span>Docs</span>
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(e => !e)}
            className="p-0.5 rounded text-[#67736b] hover:text-[#2c312e] transition-colors"
            title={isExpanded ? "Collapse terminal" : "Expand terminal"}
          >
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Collapsible input body */}
      {isExpanded && (
        <form ref={formRef} onSubmit={handleSubmit} className="relative pt-2">
          {/* Suggestions popover — floats above the terminal */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              ref={suggestionListRef}
              className="absolute bottom-full left-0 mb-1 w-full max-h-[240px] overflow-y-auto bg-[#FAF7F2]/98 backdrop-blur-md border border-[#e3dbcd] rounded-xl shadow-xl z-50 flex flex-col p-1.5 font-mono text-[11px]"
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
                      <span className="text-[8px] text-gray-400 font-sans border border-[#e3dbcd] px-1 rounded bg-[#F5F0E6]">Tab</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Input row */}
          {isMultiLine ? (
            <div className="flex flex-col gap-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={"BEGIN TRANSACTION\nCREATE RESPONSIBILITY Startup\nCREATE PROJECT TLD UNDER Startup\nEND TRANSACTION"}
                rows={5}
                className="w-full bg-[#2E3630] text-[#EDE9E1] font-mono text-xs p-3.5 rounded-xl border border-[#2c312e]/10 focus:outline-none focus:border-[#7A8C74] resize-none placeholder-gray-500 leading-relaxed shadow-inner"
              />
              <button
                type="submit"
                className="flex items-center justify-center gap-2 bg-[#7A8C74] hover:bg-[#687863] text-white font-mono text-xs py-2.5 rounded-xl transition-all shadow-sm border border-[#7A8C74]/20 cursor-pointer"
              >
                <Layers className="h-4 w-4" />
                <span>Commit Transaction Script</span>
              </button>
            </div>
          ) : (
            <div className="relative flex items-center">
              <span className="absolute left-3.5 text-[#7A8C74] font-mono text-xs select-none pointer-events-none">$</span>
              <input
                ref={inputRef}
                type="text"
                id="opsa-terminal-input"
                value={input}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  setSuggestions(getSuggestions(input));
                  setSelectedIndex(0);
                  setShowSuggestions(true);
                }}
                placeholder="Enter command… (Tab to autocomplete, ↑↓ to navigate)"
                className="w-full bg-[#2E3630] text-[#EDE9E1] font-mono text-xs pl-8 pr-20 py-2.5 rounded-xl border border-[#2c312e]/10 focus:outline-none focus:border-[#7A8C74] placeholder-gray-500 shadow-inner"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="submit"
                className="absolute right-2 flex items-center gap-1 text-[10px] font-mono px-3 py-1.5 rounded-lg bg-[#7A8C74] hover:bg-[#687863] text-white border border-[#7A8C74]/20 transition-all cursor-pointer shadow-sm"
              >
                <Send className="h-3 w-3" />
                <span>Run</span>
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
