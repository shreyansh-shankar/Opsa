"use client";

import React, { useState, useEffect } from "react";
import { useStore, StateNode } from "@/store/useStore";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Terminal,
  Compass,
  Target,
  Copy,
  Check,
  CalendarDays,
  CalendarRange,
} from "lucide-react";

export default function CalendarView() {
  const { stateTree, setPendingConsoleInput, setActiveTab } = useStore();
  const [viewMode, setViewMode] = useState<"weekly" | "daily">("weekly");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [filterType, setFilterType] = useState<"GOAL" | "TASK">("TASK");



  // UTC to local time conversion for display
  const formatUTCLocal = (utcStr: string | null | undefined): string => {
    if (!utcStr) return "";
    const d = new Date(utcStr + "Z");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
  };

  const formatUTCLocalDate = (utcStr: string | null | undefined): string => {
    if (!utcStr) return "";
    const d = new Date(utcStr + "Z");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const formatUTCLocalDateTime = (utcStr: string | null | undefined): string => {
    if (!utcStr) return "";
    const d = new Date(utcStr + "Z");
    return d.toLocaleString(undefined, {
      weekday: "short", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  };

  // Get decimal hour in local time from UTC string
  const getLocalHourVal = (utcStr: string): number => {
    const d = new Date(utcStr + "Z");
    return d.getHours() + d.getMinutes() / 60;
  };

  const getLocalDateStr = (utcStr: string): string => {
    const d = new Date(utcStr + "Z");
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  // Keep track of current hour for indicator updates
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  if (!stateTree) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-[#67736b] font-mono text-xs">
        <CalendarIcon className="h-6 w-6 animate-pulse mb-4 text-[#7A8C74]" />
        <span>Synchronizing calendar schedule...</span>
      </div>
    );
  }

  // Extract scheduled items — with UTC→local conversion and goals inheritance
  const scheduledItems: (StateNode & {
    parentName?: string;
    localFrom?: string;  // local date string (YYYY-MM-DD)
    localTo?: string;
    localFromHour?: number;  // local decimal hour
    localToHour?: number;
  })[] = [];

  // For GOAL mode: a goal is scheduled if any child task has a schedule
  // The goal inherits the union of its task schedules
  const collectScheduled = (node: StateNode, parentName?: string) => {
    if (node.type === "GOAL" && filterType === "GOAL") {
      // Check child tasks for schedules
      const taskSchedules: { from: string; to: string }[] = [];
      const walkTasks = (n: StateNode) => {
        if (n.type === "TASK" && (n.scheduled_from || n.scheduled_to)) {
          taskSchedules.push({
            from: n.scheduled_from || n.scheduled_to!,
            to: n.scheduled_to || n.scheduled_from!
          });
        }
        n.tasks?.forEach(walkTasks);
        n.goals?.forEach(walkTasks);
      };
      walkTasks(node);
      if (taskSchedules.length > 0) {
        // Compute union of all task schedules
        const earliest = taskSchedules.reduce((a, b) => a.from < b.from ? a : b);
        const latest = taskSchedules.reduce((a, b) => a.to > b.to ? a : b);
        const item = {
          ...node,
          parentName,
          localFrom: getLocalDateStr(earliest.from),
          localTo: getLocalDateStr(latest.to),
          localFromHour: getLocalHourVal(earliest.from),
          localToHour: getLocalHourVal(latest.to),
          scheduled_from: earliest.from,
          scheduled_to: latest.to
        };
        scheduledItems.push(item);
      }
    } else if (node.type === "TASK" && filterType === "TASK" && (node.scheduled_from || node.scheduled_to)) {
      const from = node.scheduled_from || node.scheduled_to!;
      const to = node.scheduled_to || node.scheduled_from!;
      const item = {
        ...node,
        parentName,
        localFrom: getLocalDateStr(from),
        localTo: getLocalDateStr(to),
        localFromHour: getLocalHourVal(from),
        localToHour: getLocalHourVal(to)
      };
      scheduledItems.push(item);
    }
    const currentName = node.name;
    node.projects?.forEach(n => collectScheduled(n, currentName));
    node.goals?.forEach(n => collectScheduled(n, currentName));
    node.tasks?.forEach(n => collectScheduled(n, currentName));
  };

  stateTree.responsibilities.forEach(n => collectScheduled(n));
  stateTree.orphan_projects.forEach(n => collectScheduled(n));
  stateTree.orphan_goals.forEach(n => collectScheduled(n));
  stateTree.orphan_tasks.forEach(n => collectScheduled(n));

  const filteredScheduledItems = scheduledItems.filter(() => true); // already filtered by type in collectScheduled

  const formatDateString = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const getStartOfWeek = (d: Date) => {
    const date = new Date(d);
    const day = date.getDay();
    // Monday start: Sunday (0) becomes -6, Monday (1) becomes 0
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
  };

  // Get days of the current week (Mon-Sun)
  const monday = getStartOfWeek(selectedDate);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  const weekStartStr = formatDateString(weekDays[0]);
  const weekEndStr = formatDateString(weekDays[6]);
  const selectedDateStr = formatDateString(selectedDate);
  const todayStr = formatDateString(new Date());

  // Daily Hour constants
  const startHour = 8;
  const endHour = 22;
  const totalHours = endHour - startHour; // 14 hours

  // Date Navigation Actions
  const handlePrev = () => {
    if (viewMode === "weekly") {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 7);
      setSelectedDate(d);
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() - 1);
      setSelectedDate(d);
    }
  };

  const handleNext = () => {
    if (viewMode === "weekly") {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 7);
      setSelectedDate(d);
    } else {
      const d = new Date(selectedDate);
      d.setDate(d.getDate() + 1);
      setSelectedDate(d);
    }
  };

  // Check if item overlaps selected week (using local dates)
  const isItemInWeek = (item: typeof scheduledItems[0]) => {
    const fromStr = item.localFrom!;
    const toStr = item.localTo!;
    return fromStr <= weekEndStr && toStr >= weekStartStr;
  };

  // Check if item overlaps selected day (using local dates)
  const isItemInDay = (item: typeof scheduledItems[0], targetDayStr: string = selectedDateStr) => {
    const fromStr = item.localFrom!;
    const toStr = item.localTo!;
    return fromStr <= targetDayStr && toStr >= targetDayStr;
  };

  // Daily decimal hour calculations (using local time)
  const getDailyHourVal = (item: typeof scheduledItems[0], targetDateStr: string, limitHour: number) => {
    const isStartOnThisDay = item.localFrom === targetDateStr;
    const isEndOnThisDay = item.localTo === targetDateStr;

    if (limitHour === startHour) { // start hour
      if (isStartOnThisDay) {
        return item.localFromHour !== undefined ? item.localFromHour : startHour;
      }
      return startHour;
    } else { // end hour
      if (isEndOnThisDay) {
        return item.localToHour !== undefined ? item.localToHour : endHour;
      }
      return endHour;
    }
  };

  // Packing Algorithm for Weekly View
  const getPackedWeeklyRows = () => {
    const weeklyItems = filteredScheduledItems.filter(isItemInWeek);
    
    // Sort by start date then duration (longest first)
    const sorted = [...weeklyItems].sort((a, b) => {
      if (a.localFrom! < b.localFrom!) return -1;
      if (a.localFrom! > b.localFrom!) return 1;
      const aDur = new Date(a.localTo!).getTime() - new Date(a.localFrom!).getTime();
      const bDur = new Date(b.localTo!).getTime() - new Date(b.localFrom!).getTime();
      return bDur - aDur;
    });

    const rows: (StateNode & { parentName?: string; localFrom?: string; localTo?: string; localFromHour?: number; localToHour?: number })[][] = [];
    sorted.forEach(item => {
      let placed = false;
      const start1 = item.localFrom!;
      const end1 = item.localTo!;

      for (let r = 0; r < rows.length; r++) {
        const hasOverlap = rows[r].some(existing => {
          const start2 = existing.scheduled_from!.substring(0, 10);
          const end2 = existing.scheduled_to!.substring(0, 10);
          return start1 <= end2 && start2 <= end1;
        });
        if (!hasOverlap) {
          rows[r].push(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([item]);
      }
    });
    return rows;
  };

  // Packing Algorithm for Daily View
  const getPackedDailyRows = (targetDayStr: string) => {
    const dailyItems = filteredScheduledItems.filter(item => isItemInDay(item, targetDayStr));

    // Sort by starting hour
    const sorted = [...dailyItems].sort((a, b) => {
      const aStart = getDailyHourVal(a, targetDayStr, startHour);
      const bStart = getDailyHourVal(b, targetDayStr, startHour);
      return aStart - bStart;
    });

    const rows: (StateNode & { parentName?: string; localFrom?: string; localTo?: string; localFromHour?: number; localToHour?: number })[][] = [];
    sorted.forEach(item => {
      let placed = false;
      const start1 = getDailyHourVal(item, targetDayStr, startHour);
      const end1 = getDailyHourVal(item, targetDayStr, endHour);

      for (let r = 0; r < rows.length; r++) {
        const hasOverlap = rows[r].some(existing => {
          const start2 = getDailyHourVal(existing, targetDayStr, startHour);
          const end2 = getDailyHourVal(existing, targetDayStr, endHour);
          return start1 < end2 && start2 < end1;
        });
        if (!hasOverlap) {
          rows[r].push(item);
          placed = true;
          break;
        }
      }
      if (!placed) {
        rows.push([item]);
      }
    });
    return rows;
  };

  // Context-Based Color Matching to reference image
  const getContextColor = (contextName: string) => {
    const name = contextName.toLowerCase();
    if (name.includes("onboard") && !name.includes("pre")) {
      return { bg: "bg-[#FF4081]", text: "text-white", border: "border-[#E21B63]", subtitle: "text-white/80" }; // Pink
    }
    if (name.includes("preboard")) {
      return { bg: "bg-[#FFE082]", text: "text-[#5D4037]", border: "border-[#F5C230]", subtitle: "text-[#5D4037]/80" }; // Yellow
    }
    if (name.includes("recruit")) {
      return { bg: "bg-[#AB47BC]", text: "text-white", border: "border-[#8E24AA]", subtitle: "text-white/80" }; // Purple
    }
    if (name.includes("benefit") || name.includes("sustain")) {
      return { bg: "bg-[#FF7043]", text: "text-white", border: "border-[#F4511E]", subtitle: "text-white/80" }; // Orange
    }
    if (name.includes("train") || name.includes("learn") || name.includes("lab")) {
      return { bg: "bg-[#FF8A80]", text: "text-white", border: "border-[#FF5252]", subtitle: "text-white/80" }; // Coral/Red
    }
    if (name.includes("meet") || name.includes("comm") || name.includes("open")) {
      return { bg: "bg-[#9FA8DA]", text: "text-[#1A237E]", border: "border-[#7986CB]", subtitle: "text-[#1A237E]/75" }; // Light Blue/Lavender
    }
    if (name.includes("engineer") || name.includes("dev") || name.includes("front") || name.includes("back")) {
      return { bg: "bg-[#26A69A]", text: "text-white", border: "border-[#00897B]", subtitle: "text-white/80" }; // Teal
    }

    // Default to consistent hash colors
    let hash = 0;
    for (let i = 0; i < contextName.length; i++) {
      hash = contextName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      { bg: "bg-[#EC407A]", text: "text-white", border: "border-[#D81B60]", subtitle: "text-white/80" },
      { bg: "bg-[#26A69A]", text: "text-white", border: "border-[#00897B]", subtitle: "text-white/80" },
      { bg: "bg-[#AB47BC]", text: "text-white", border: "border-[#8E24AA]", subtitle: "text-white/80" },
      { bg: "bg-[#7986CB]", text: "text-white", border: "border-[#5C6BC0]", subtitle: "text-white/80" },
      { bg: "bg-[#42A5F5]", text: "text-white", border: "border-[#1E88E5]", subtitle: "text-white/80" },
      { bg: "bg-[#FFA726]", text: "text-white", border: "border-[#FB8C00]", subtitle: "text-white/80" },
      { bg: "bg-[#FF7043]", text: "text-white", border: "border-[#F4511E]", subtitle: "text-white/80" },
      { bg: "bg-[#78909C]", text: "text-white", border: "border-[#546E7A]", subtitle: "text-white/80" }
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  const getStatusDotColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "COMPLETED": return "bg-[#5F8C6E]";
      case "BLOCKED": return "bg-[#C25953]";
      case "DEFERRED": return "bg-[#D4A351]";
      case "PAUSED": return "bg-[#5C7CFA]";
      case "NOT_STARTED": return "bg-[#788896]";
      default: return "bg-[#7A8C74]";
    }
  };

  const formatTimeRange = (fromStr?: string | null, toStr?: string | null) => {
    if (!fromStr || !toStr) return "All Day";
    const fromLocal = formatUTCLocal(fromStr);
    const toLocal = formatUTCLocal(toStr);
    if (!fromLocal && !toLocal) return "All Day";
    return fromLocal && toLocal ? `${fromLocal} - ${toLocal}` : "All Day";
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleSuggestionClick = (cmd: string) => {
    setPendingConsoleInput(cmd);
    setActiveTab("console");
  };

  // Agenda Selection items
  const selectedDayItems = filteredScheduledItems.filter(item => isItemInDay(item, selectedDateStr));

  // Render Row Packing Grids
  const packedWeeklyRows = getPackedWeeklyRows();
  const packedDailyRows = getPackedDailyRows(selectedDateStr);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* 1. Timeline Calendar Grid (Span 3) */}
      <div className="lg:col-span-3 glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] shadow-sm flex flex-col gap-5">
        
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#e3dbcd] pb-4">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-[#7A8C74]" />
            <h2 className="font-serif font-bold text-base text-[#2c312e]">
              {viewMode === "weekly" ? (
                <span>
                  Week of {weekDays[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {weekDays[6].toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                </span>
              ) : (
                <span>
                  {selectedDate.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </span>
              )}
            </h2>
          </div>
          
          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Goals/Tasks Toggle */}
            <div className="flex rounded-lg border border-[#e3dbcd] bg-[#FAF7F2] p-0.5 shadow-sm mr-2">
              <button
                onClick={() => setFilterType("GOAL")}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono rounded-md transition-all cursor-pointer ${
                  filterType === "GOAL"
                    ? "bg-[#CE8D6D]/15 text-[#2c312e] font-bold"
                    : "text-[#67736b] hover:text-[#2c312e]"
                }`}
              >
                <Target className="h-3.5 w-3.5 text-[#CE8D6D]" />
                <span>Goals</span>
              </button>
              <button
                onClick={() => setFilterType("TASK")}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono rounded-md transition-all cursor-pointer ${
                  filterType === "TASK"
                    ? "bg-[#7A8C74]/15 text-[#2c312e] font-bold"
                    : "text-[#67736b] hover:text-[#2c312e]"
                }`}
              >
                <Compass className="h-3.5 w-3.5 text-[#7A8C74]" />
                <span>Tasks</span>
              </button>
            </div>

            {/* View Mode Toggle */}
            <div className="flex rounded-lg border border-[#e3dbcd] bg-[#FAF7F2] p-0.5 shadow-sm mr-2">
              <button
                onClick={() => setViewMode("weekly")}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono rounded-md transition-all cursor-pointer ${
                  viewMode === "weekly"
                    ? "bg-[#7A8C74]/15 text-[#2c312e] font-bold"
                    : "text-[#67736b] hover:text-[#2c312e]"
                }`}
              >
                <CalendarRange className="h-3.5 w-3.5" />
                <span>Weekly</span>
              </button>
              <button
                onClick={() => setViewMode("daily")}
                className={`flex items-center gap-1.5 px-3 py-1 text-[11px] font-mono rounded-md transition-all cursor-pointer ${
                  viewMode === "daily"
                    ? "bg-[#7A8C74]/15 text-[#2c312e] font-bold"
                    : "text-[#67736b] hover:text-[#2c312e]"
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                <span>Daily</span>
              </button>
            </div>

            {/* Prev/Next buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrev}
                className="p-1.5 rounded-lg border border-[#e3dbcd] bg-[#FAF7F2] hover:bg-[#F5F0E6]/50 text-[#67736b] transition-all cursor-pointer shadow-sm"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => setSelectedDate(new Date())}
                className="px-2.5 py-1 text-[10px] font-mono rounded-lg border border-[#e3dbcd] bg-[#FAF7F2] hover:bg-[#F5F0E6]/50 text-[#67736b] transition-all cursor-pointer shadow-sm"
              >
                Today
              </button>
              <button
                onClick={handleNext}
                className="p-1.5 rounded-lg border border-[#e3dbcd] bg-[#FAF7F2] hover:bg-[#F5F0E6]/50 text-[#67736b] transition-all cursor-pointer shadow-sm"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* TIMELINE VIEWMODE: WEEKLY */}
        {viewMode === "weekly" && (
          <div className="relative flex flex-col min-h-[420px] select-none border border-[#e3dbcd] rounded-2xl bg-[#F5F0E6]/25 overflow-hidden">
            {/* Grid Columns Zebra Background */}
            <div className="grid grid-cols-7 absolute inset-0 pointer-events-none">
              {weekDays.map((day, idx) => {
                const isDayToday = formatDateString(day) === todayStr;
                const isSelected = formatDateString(day) === selectedDateStr;
                return (
                  <div
                    key={idx}
                    className={`border-r border-[#e3dbcd]/40 last:border-r-0 relative flex flex-col justify-between items-center pt-2 ${
                      idx % 2 === 0 ? "bg-[#FAF7F2]/10" : "bg-[#FAF7F2]/30"
                    } ${isDayToday ? "bg-[#7A8C74]/5" : ""}`}
                  >
                    {/* Header Label inside Grid */}
                    <button
                      onClick={() => setSelectedDate(day)}
                      className={`flex flex-col items-center justify-center p-1 rounded-xl transition-all hover:bg-[#7A8C74]/10 ${
                        isSelected ? "bg-[#7A8C74]/15 border border-[#7A8C74]/20 scale-105" : ""
                      }`}
                    >
                      <span className="text-[9px] font-mono text-[#67736b] uppercase">
                        {day.toLocaleDateString(undefined, { weekday: "short" })}
                      </span>
                      <span className={`text-xs font-mono font-bold mt-0.5 ${
                        isDayToday ? "bg-[#7A8C74] text-white h-5 w-5 rounded-full flex items-center justify-center" : "text-[#2c312e]"
                      }`}>
                        {day.getDate()}
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Dynamic Positioned Task Bars */}
            <div className="relative z-10 pt-16 pb-8 flex flex-col gap-2.5 overflow-y-auto max-h-[500px]">
              {packedWeeklyRows.length === 0 ? (
                <div className="text-center py-20 text-[#67736b] font-mono text-xs italic">
                  No scheduled items for this week.
                </div>
              ) : (
                packedWeeklyRows.map((row, rowIdx) => (
                  <div key={rowIdx} className="relative h-14 w-full">
                    {row.map(item => {
                      const startStr = item.localFrom!;
                      const endStr = item.localTo!;
                      
                      let leftCol = weekDays.findIndex(d => formatDateString(d) === startStr);
                      if (leftCol === -1) {
                        leftCol = startStr < weekStartStr ? 0 : 6;
                      }
                      
                      let rightCol = weekDays.findIndex(d => formatDateString(d) === endStr);
                      if (rightCol === -1) {
                        rightCol = endStr > weekEndStr ? 6 : 0;
                      }
                      
                      const span = rightCol - leftCol + 1;
                      const leftPercent = (leftCol / 7) * 100;
                      const widthPercent = (span / 7) * 100;

                      const colors = getContextColor(item.parentName || item.name);

                      return (
                        <div
                          key={item.id}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            paddingLeft: "4px",
                            paddingRight: "4px"
                          }}
                          onClick={() => {
                            const parts = item.localFrom!.split("-");
                            setSelectedDate(new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
                          }}
                          className="absolute inset-y-0 flex flex-col justify-center cursor-pointer group"
                        >
                          <div className={`h-full rounded-xl border p-2 flex flex-col justify-center shadow-sm transition-all hover:scale-[1.01] hover:shadow-md ${colors.bg} ${colors.text} ${colors.border}`}>
                            <span className="text-[10px] font-sans font-bold leading-tight truncate">
                              {item.name}
                            </span>
                            {item.parentName && (
                              <span className={`text-[8px] font-sans font-normal mt-0.5 truncate uppercase tracking-wide ${colors.subtitle}`}>
                                {item.parentName}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TIMELINE VIEWMODE: DAILY */}
        {viewMode === "daily" && (
          <div className="relative flex flex-col min-h-[420px] select-none border border-[#e3dbcd] rounded-2xl bg-[#F5F0E6]/25 overflow-hidden">
            {/* Grid Hourly Zebra Columns */}
            <div className="absolute inset-0 pointer-events-none flex">
              {Array.from({ length: totalHours }).map((_, idx) => {
                const hour = startHour + idx;
                return (
                  <div
                    key={idx}
                    style={{ width: `${100 / totalHours}%` }}
                    className={`border-r border-[#e3dbcd]/40 last:border-r-0 relative flex flex-col justify-start items-center pt-2 ${
                      idx % 2 === 0 ? "bg-[#FAF7F2]/10" : "bg-[#FAF7F2]/30"
                    }`}
                  >
                    <span className="text-[8px] font-mono text-[#67736b]">
                      {String(hour).padStart(2, "0")}:00
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Current hour line highlight indicator if selectedDate is today */}
            {selectedDateStr === todayStr && (
              (() => {
                const currHr = currentTime.getHours() + currentTime.getMinutes() / 60;
                if (currHr >= startHour && currHr <= endHour) {
                  const leftPct = ((currHr - startHour) / totalHours) * 100;
                  return (
                    <div
                      style={{ left: `${leftPct}%` }}
                      className="absolute inset-y-0 w-0.5 bg-[#AB47BC] shadow-lg pointer-events-none z-20 flex items-center justify-center"
                    >
                      <div className="h-2 w-2 rounded-full bg-[#AB47BC] absolute -top-1" />
                    </div>
                  );
                }
                return null;
              })()
            )}

            {/* Dynamic Positioned Hourly Task Bars */}
            <div className="relative z-10 pt-10 pb-8 flex flex-col gap-2.5 overflow-y-auto max-h-[500px]">
              {packedDailyRows.length === 0 ? (
                <div className="text-center py-20 text-[#67736b] font-mono text-xs italic">
                  No scheduled items for this day.
                </div>
              ) : (
                packedDailyRows.map((row, rowIdx) => (
                  <div key={rowIdx} className="relative h-14 w-full">
                    {row.map(item => {
                      const itemStart = getDailyHourVal(item, selectedDateStr, startHour);
                      const itemEnd = getDailyHourVal(item, selectedDateStr, endHour);

                      const leftPercent = ((itemStart - startHour) / totalHours) * 100;
                      const widthPercent = ((itemEnd - itemStart) / totalHours) * 100;

                      const colors = getContextColor(item.parentName || item.name);

                      return (
                        <div
                          key={item.id}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            paddingLeft: "4px",
                            paddingRight: "4px"
                          }}
                          className="absolute inset-y-0 flex flex-col justify-center group"
                        >
                          <div className={`h-full rounded-xl border p-2 flex flex-col justify-center shadow-sm transition-all hover:scale-[1.01] hover:shadow-md ${colors.bg} ${colors.text} ${colors.border}`}>
                            <span className="text-[10px] font-sans font-bold leading-tight truncate">
                              {item.name}
                            </span>
                            {item.parentName && (
                              <span className={`text-[8px] font-sans font-normal mt-0.5 truncate uppercase tracking-wide ${colors.subtitle}`}>
                                {item.parentName}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Sidebar Agenda (Span 1) */}
      <div className="lg:col-span-1 flex flex-col gap-6">
        
        {/* Selected Date Agenda Panel */}
        <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] shadow-sm flex flex-col gap-4">
          <div className="border-b border-[#e3dbcd] pb-3">
            <h3 className="text-xs font-mono uppercase tracking-widest text-[#67736b] font-bold">
              {filterType === "GOAL" ? "Goals" : "Tasks"} Agenda
            </h3>
            <span className="text-xs font-serif font-bold text-[#2c312e] block mt-1">
              {selectedDate.toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric"
              })}
            </span>
          </div>

          <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
            {selectedDayItems.length === 0 ? (
              <div className="py-8 text-center text-[#67736b] font-mono text-xs italic border border-dashed border-[#e3dbcd] rounded-xl bg-[#FAF7F2]/50">
                No events scheduled for this day.
              </div>
            ) : (
              selectedDayItems.map((item) => {
                const colors = getContextColor(item.parentName || item.name);
                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1.5 p-3 rounded-xl border border-[#e3dbcd] bg-[#FAF7F2] hover:bg-[#F5F0E6]/30 transition-colors"
                  >
                    <div className="flex items-center gap-1.5 justify-between">
                      <div className="flex items-center gap-1.5">
                        {item.type === "GOAL" ? (
                          <Target className="h-3.5 w-3.5 text-[#CE8D6D]" />
                        ) : (
                          <Compass className="h-3.5 w-3.5 text-[#7A8C74]" />
                        )}
                        <span className="text-[9px] font-mono font-bold bg-[#e3dbcd]/40 text-[#67736b] px-1.5 py-0.5 rounded uppercase">
                          {item.type}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono text-[#67736b]">
                        Priority: {item.priority || "MEDIUM"}
                      </span>
                    </div>

                    <span className="text-xs font-sans font-bold text-[#2c312e]">
                      {item.name}
                    </span>

                    {item.parentName && (
                      <span className="text-[9px] font-mono text-[#67736b]">
                        Context: {item.parentName}
                      </span>
                    )}

                    <div className="flex items-center justify-between border-t border-[#e3dbcd]/50 pt-2 mt-1">
                      <div className="flex items-center gap-1 text-[9px] font-mono text-[#67736b]">
                        <Clock className="h-3 w-3" />
                        <span>{formatTimeRange(item.scheduled_from, item.scheduled_to)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className={`h-1.5 w-1.5 rounded-full ${getStatusDotColor(item.status)}`} />
                        <span className="text-[9px] font-mono uppercase tracking-wide text-[#2c312e]">
                          {item.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Command suggestions matching selected day */}
        <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] shadow-sm flex flex-col gap-3">
          <div className="flex items-center gap-1.5 border-b border-[#e3dbcd] pb-2">
            <Terminal className="h-4 w-4 text-[#7A8C74]" />
            <h3 className="text-[10px] font-mono uppercase tracking-widest text-[#67736b] font-bold">
              Console suggestions
            </h3>
          </div>
          <div className="flex flex-col gap-2.5">
            <p className="text-[10px] text-[#67736b] leading-relaxed">
              Click suggestions to fill the terminal prompt directly, or copy them.
            </p>
            
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-[#7A8C74] font-semibold">
                Schedule with natural language
              </span>
              <div className="flex items-center justify-between gap-1 p-2 rounded-lg bg-[#F5F0E6]/50 border border-[#e3dbcd] text-[10px] font-mono text-[#2c312e]">
                <button
                  onClick={() => handleSuggestionClick("SCHEDULE [Target] FROM today TO tomorrow")}
                  className="truncate text-left grow hover:text-[#7A8C74] transition-colors font-mono"
                >
                  SCHEDULE [Target] FROM today TO tomorrow
                </button>
                <button
                  onClick={() => copyToClipboard("SCHEDULE [Target] FROM today TO tomorrow")}
                  className="p-1 hover:bg-[#e3dbcd]/40 rounded text-[#67736b] hover:text-[#2c312e] transition-colors shrink-0"
                >
                  {copiedText === "SCHEDULE [Target] FROM today TO tomorrow" ? (
                    <Check className="h-3 w-3 text-[#5F8C6E]" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
              <div className="text-[8px] font-mono text-[#67736b] italic mt-1">
                Try: NOW, today, tomorrow, next friday, 14:30, +3 days
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-mono uppercase tracking-wider text-[#7A8C74] font-semibold">
                Remove schedule details
              </span>
              <div className="flex items-center justify-between gap-1 p-2 rounded-lg bg-[#F5F0E6]/50 border border-[#e3dbcd] text-[10px] font-mono text-[#2c312e]">
                <button
                  onClick={() => handleSuggestionClick(`UPDATE [Target] SET scheduled_from = null, scheduled_to = null`)}
                  className="truncate text-left grow hover:text-[#7A8C74] transition-colors font-mono"
                >
                  UPDATE [Target] SET scheduled_from = null, scheduled_to = null
                </button>
                <button
                  onClick={() => copyToClipboard(`UPDATE [Target] SET scheduled_from = null, scheduled_to = null`)}
                  className="p-1 hover:bg-[#e3dbcd]/40 rounded text-[#67736b] hover:text-[#2c312e] transition-colors shrink-0"
                >
                  {copiedText === `UPDATE [Target] SET scheduled_from = null, scheduled_to = null` ? (
                    <Check className="h-3 w-3 text-[#5F8C6E]" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
