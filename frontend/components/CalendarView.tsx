"use client";

import React, { useState, useEffect } from "react";
import { useStore, StateNode, StateTree } from "@/store/useStore";
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
  GripVertical,
  Search,
  AlertCircle,
} from "lucide-react";

// Backlog utility helper functions
const getAllTasks = (tree: StateTree) => {
  const tasks: (StateNode & {
    parentResponsibilitySlug?: string;
    parentProjectSlug?: string;
    parentGoalSlug?: string;
  })[] = [];

  tree.responsibilities?.forEach((r) => {
    r.tasks?.forEach((t) => {
      tasks.push({ ...t, parentResponsibilitySlug: r.slug });
    });
    r.projects?.forEach((p) => {
      p.tasks?.forEach((t) => {
        tasks.push({ ...t, parentResponsibilitySlug: r.slug, parentProjectSlug: p.slug });
      });
      p.goals?.forEach((g) => {
        g.tasks?.forEach((t) => {
          tasks.push({
            ...t,
            parentResponsibilitySlug: r.slug,
            parentProjectSlug: p.slug,
            parentGoalSlug: g.slug
          });
        });
      });
    });
  });

  tree.orphan_projects?.forEach((p) => {
    p.tasks?.forEach((t) => {
      tasks.push({ ...t, parentProjectSlug: p.slug });
    });
    p.goals?.forEach((g) => {
      g.tasks?.forEach((t) => {
        tasks.push({ ...t, parentProjectSlug: p.slug, parentGoalSlug: g.slug });
      });
    });
  });

  tree.orphan_goals?.forEach((g) => {
    g.tasks?.forEach((t) => {
      tasks.push({ ...t, parentGoalSlug: g.slug });
    });
  });

  tree.orphan_tasks?.forEach((t) => {
    tasks.push(t);
  });

  return tasks;
};

const getAllResponsibilities = (tree: StateTree) => {
  return tree.responsibilities?.map((r) => ({ slug: r.slug, name: r.name })) || [];
};

const getAllProjects = (tree: StateTree, parentRespSlug?: string) => {
  const projects: { slug: string; name: string; parentResponsibilitySlug?: string }[] = [];
  const walk = (node: StateNode, currentResp?: string) => {
    let r = currentResp;
    if (node.type === "RESPONSIBILITY") r = node.slug;
    if (node.type === "PROJECT") {
      projects.push({
        slug: node.slug,
        name: node.name,
        parentResponsibilitySlug: r,
      });
    }
    node.projects?.forEach((n) => walk(n, r));
    node.goals?.forEach((n) => walk(n, r));
    node.tasks?.forEach((n) => walk(n, r));
  };

  tree.responsibilities?.forEach((n) => walk(n));
  if (!parentRespSlug) {
    tree.orphan_projects?.forEach((n) => walk(n));
  }
  
  if (parentRespSlug) {
    return projects.filter((p) => p.parentResponsibilitySlug === parentRespSlug);
  }
  return projects;
};

const getAllGoals = (tree: StateTree, parentProjSlug?: string, parentRespSlug?: string) => {
  const goals: { slug: string; name: string; parentProjectSlug?: string; parentResponsibilitySlug?: string }[] = [];
  const walk = (node: StateNode, currentResp?: string, currentProj?: string) => {
    let r = currentResp;
    let p = currentProj;
    if (node.type === "RESPONSIBILITY") r = node.slug;
    if (node.type === "PROJECT") p = node.slug;
    if (node.type === "GOAL") {
      goals.push({
        slug: node.slug,
        name: node.name,
        parentProjectSlug: p,
        parentResponsibilitySlug: r,
      });
    }
    node.projects?.forEach((n) => walk(n, r, p));
    node.goals?.forEach((n) => walk(n, r, p));
    node.tasks?.forEach((n) => walk(n, r, p));
  };

  tree.responsibilities?.forEach((n) => walk(n));
  tree.orphan_projects?.forEach((n) => walk(n));
  if (!parentProjSlug && !parentRespSlug) {
    tree.orphan_goals?.forEach((n) => walk(n));
  }

  let filtered = goals;
  if (parentRespSlug) {
    filtered = filtered.filter((g) => g.parentResponsibilitySlug === parentRespSlug);
  }
  if (parentProjSlug) {
    filtered = filtered.filter((g) => g.parentProjectSlug === parentProjSlug);
  }
  return filtered;
};

export default function CalendarView() {
  const { stateTree, setPendingConsoleInput, setActiveTab, executeCommand } = useStore();
  const [viewMode, setViewMode] = useState<"weekly" | "daily">("weekly");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [filterType, setFilterType] = useState<"GOAL" | "TASK">("TASK");

  // Scheduling Drag and Drop State
  const [activeDraggedTask, setActiveDraggedTask] = useState<{
    slug: string;
    name: string;
    duration: number; // in decimal hours
    isExisting: boolean;
    dragStartOffsetHour?: number;
  } | null>(null);

  const [dragOverPreview, setDragOverPreview] = useState<{
    slug: string;
    name: string;
    startHour: number;
    duration: number;
    date: string;
    weeklyDayIndex?: number;
    weeklyDaySpan?: number;
  } | null>(null);

  // Resize State
  const [resizingState, setResizingState] = useState<{
    slug: string;
    edge: "left" | "right";
    initialStartHour: number;
    initialEndHour: number;
    initialX: number;
    containerWidth: number;
    date: string;
  } | null>(null);

  const [liveResizing, setLiveResizing] = useState<{
    slug: string;
    startHour: number;
    endHour: number;
  } | null>(null);

  // Backlog filters
  const [backlogResp, setBacklogResp] = useState<string>("");
  const [backlogProj, setBacklogProj] = useState<string>("");
  const [backlogGoal, setBacklogGoal] = useState<string>("");
  const [backlogSearch, setBacklogSearch] = useState<string>("");
  const [showScheduledInBacklog, setShowScheduledInBacklog] = useState<boolean>(false);

  // Feedback Toast state
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);



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

  const formatLocalToUTCString = (dateStr: string, hourVal: number): string => {
    const parts = dateStr.split("-");
    const y = parseInt(parts[0]);
    const m = parseInt(parts[1]) - 1;
    const d = parseInt(parts[2]);

    const localDate = new Date(y, m, d);
    const h = Math.floor(hourVal);
    const min = Math.round((hourVal - h) * 60);
    localDate.setHours(h, min, 0, 0);

    const utcY = localDate.getUTCFullYear();
    const utcM = String(localDate.getUTCMonth() + 1).padStart(2, "0");
    const utcD = String(localDate.getUTCDate()).padStart(2, "0");
    const utcH = String(localDate.getUTCHours()).padStart(2, "0");
    const utcMin = String(localDate.getUTCMinutes()).padStart(2, "0");
    const utcSec = String(localDate.getUTCSeconds()).padStart(2, "0");

    return `${utcY}-${utcM}-${utcD} ${utcH}:${utcMin}:${utcSec}`;
  };

  // Drag and drop event handlers
  const handleDragLeave = () => {
    setDragOverPreview(null);
  };

  const handleBacklogDragStart = (e: React.DragEvent, task: any) => {
    setActiveDraggedTask({
      slug: task.slug,
      name: task.name,
      duration: 1, // default 1 hour
      isExisting: false
    });
  };

  const handleScheduledDragStart = (e: React.DragEvent, item: any) => {
    if ((e.target as HTMLElement).closest(".resize-handle")) {
      e.preventDefault();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = clickX / rect.width;
    const startHr = getDailyHourVal(item, selectedDateStr, startHour);
    const endHr = getDailyHourVal(item, selectedDateStr, endHour);
    const duration = endHr - startHr;
    const offset = pct * duration;

    setActiveDraggedTask({
      slug: item.slug,
      name: item.name,
      duration: duration,
      isExisting: true,
      dragStartOffsetHour: offset
    });
  };

  const handleWeeklyScheduledDragStart = (e: React.DragEvent, item: any) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = clickX / rect.width;
    
    // Day duration
    const fromDate = new Date(item.localFrom!);
    const toDate = new Date(item.localTo!);
    const durationDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const offsetDays = Math.floor(pct * durationDays);

    setActiveDraggedTask({
      slug: item.slug,
      name: item.name,
      duration: durationDays,
      isExisting: true,
      dragStartOffsetHour: offsetDays * 24
    });
  };

  const handleDailyDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!activeDraggedTask) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const width = rect.width;

    const hourVal = startHour + (relativeX / width) * totalHours;
    const offset = activeDraggedTask.dragStartOffsetHour || 0;
    let startVal = hourVal - offset;
    // Snap to 15 mins
    startVal = Math.round(startVal * 4) / 4;

    const duration = activeDraggedTask.duration || 1;
    const snappedStartHour = Math.max(startHour, Math.min(endHour - duration, startVal));

    setDragOverPreview({
      slug: activeDraggedTask.slug,
      name: activeDraggedTask.name,
      startHour: snappedStartHour,
      duration: duration,
      date: selectedDateStr
    });
  };

  const handleDailyDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPreview(null);
    if (!activeDraggedTask) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const width = rect.width;

    const hourVal = startHour + (relativeX / width) * totalHours;
    const offset = activeDraggedTask.dragStartOffsetHour || 0;
    let startVal = hourVal - offset;
    startVal = Math.round(startVal * 4) / 4;

    const duration = activeDraggedTask.duration || 1;
    const snappedStartHour = Math.max(startHour, Math.min(endHour - duration, startVal));
    const snappedEndHour = snappedStartHour + duration;

    const startStr = formatLocalToUTCString(selectedDateStr, snappedStartHour);
    const endStr = formatLocalToUTCString(selectedDateStr, snappedEndHour);

    const command = `SCHEDULE "${activeDraggedTask.slug}" FROM "${startStr}" TO "${endStr}"`;
    const success = await executeCommand(command);
    if (!success) {
      setFeedbackMessage({ text: `Failed to schedule task "${activeDraggedTask.name}"`, type: "error" });
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
    setActiveDraggedTask(null);
  };

  const handleWeeklyDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!activeDraggedTask) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const width = rect.width;

    const dayIdx = Math.floor((relativeX / width) * 7);
    const snappedDayIdx = Math.max(0, Math.min(6, dayIdx));
    const targetDay = weekDays[snappedDayIdx];
    const targetDayStr = formatDateString(targetDay);

    let spanDays = 1;
    if (activeDraggedTask.isExisting) {
      const item = scheduledItems.find(t => t.slug === activeDraggedTask.slug);
      if (item && item.localFrom && item.localTo) {
        const fromDate = new Date(item.localFrom);
        const toDate = new Date(item.localTo);
        spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (spanDays < 1) spanDays = 1;
      }
    }

    setDragOverPreview({
      slug: activeDraggedTask.slug,
      name: activeDraggedTask.name,
      startHour: 9,
      duration: 1,
      date: targetDayStr,
      weeklyDayIndex: snappedDayIdx,
      weeklyDaySpan: spanDays
    });
  };

  const handleWeeklyDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverPreview(null);
    if (!activeDraggedTask) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const width = rect.width;

    const dayIdx = Math.floor((relativeX / width) * 7);
    const snappedDayIdx = Math.max(0, Math.min(6, dayIdx));
    const targetDay = weekDays[snappedDayIdx];
    const targetDayStr = formatDateString(targetDay);

    let startStr = "";
    let endStr = "";

    if (activeDraggedTask.isExisting) {
      const item = scheduledItems.find(t => t.slug === activeDraggedTask.slug);
      if (item && item.scheduled_from && item.scheduled_to) {
        const fromDate = new Date(item.localFrom!);
        const toDate = new Date(item.localTo!);
        const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
        
        const fromTimePart = item.scheduled_from.includes("T") ? item.scheduled_from.split("T")[1] : item.scheduled_from.split(" ")[1] || "09:00:00";
        const toTimePart = item.scheduled_to.includes("T") ? item.scheduled_to.split("T")[1] : item.scheduled_to.split(" ")[1] || "10:00:00";
        
        const endDay = new Date(targetDay);
        endDay.setDate(targetDay.getDate() + spanDays);
        const endDayStr = formatDateString(endDay);

        startStr = `${targetDayStr} ${fromTimePart.substring(0, 8)}`;
        endStr = `${endDayStr} ${toTimePart.substring(0, 8)}`;
      } else {
        startStr = formatLocalToUTCString(targetDayStr, 9);
        endStr = formatLocalToUTCString(targetDayStr, 10);
      }
    } else {
      startStr = formatLocalToUTCString(targetDayStr, 9);
      endStr = formatLocalToUTCString(targetDayStr, 10);
    }

    const command = `SCHEDULE "${activeDraggedTask.slug}" FROM "${startStr}" TO "${endStr}"`;
    const success = await executeCommand(command);
    if (!success) {
      setFeedbackMessage({ text: `Failed to reschedule task "${activeDraggedTask.name}"`, type: "error" });
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
    setActiveDraggedTask(null);
  };

  const handleResizeMouseDown = (e: React.MouseEvent, item: any, edge: "left" | "right") => {
    e.stopPropagation();
    e.preventDefault();

    const container = e.currentTarget.closest(".relative.flex.min-h-\\[420px\\]");
    if (!container) return;
    const containerWidth = container.getBoundingClientRect().width;

    const startHr = getDailyHourVal(item, selectedDateStr, startHour);
    const endHr = getDailyHourVal(item, selectedDateStr, endHour);

    setResizingState({
      slug: item.slug,
      edge,
      initialStartHour: startHr,
      initialEndHour: endHr,
      initialX: e.clientX,
      containerWidth,
      date: selectedDateStr
    });

    setLiveResizing({
      slug: item.slug,
      startHour: startHr,
      endHour: endHr
    });
  };

  // Resize Effect Listener
  useEffect(() => {
    if (!resizingState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingState.initialX;
      const deltaHours = (deltaX / resizingState.containerWidth) * totalHours;

      let newStart = resizingState.initialStartHour;
      let newEnd = resizingState.initialEndHour;

      if (resizingState.edge === "left") {
        newStart = resizingState.initialStartHour + deltaHours;
        newStart = Math.round(newStart * 4) / 4;
        newStart = Math.max(startHour, Math.min(newEnd - 0.25, newStart));
      } else {
        newEnd = resizingState.initialEndHour + deltaHours;
        newEnd = Math.round(newEnd * 4) / 4;
        newEnd = Math.max(newStart + 0.25, Math.min(endHour, newEnd));
      }

      setLiveResizing({
        slug: resizingState.slug,
        startHour: newStart,
        endHour: newEnd
      });
    };

    const handleMouseUp = async () => {
      if (liveResizing) {
        const startStr = formatLocalToUTCString(resizingState.date, liveResizing.startHour);
        const endStr = formatLocalToUTCString(resizingState.date, liveResizing.endHour);

        const command = `SCHEDULE "${resizingState.slug}" FROM "${startStr}" TO "${endStr}"`;
        const success = await executeCommand(command);
        if (!success) {
          setFeedbackMessage({ text: `Failed to resize task`, type: "error" });
          setTimeout(() => setFeedbackMessage(null), 4000);
        }
      }
      setResizingState(null);
      setLiveResizing(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [resizingState, liveResizing]);

  // Agenda Selection items
  const selectedDayItems = filteredScheduledItems.filter(item => isItemInDay(item, selectedDateStr));

  // Extract all backlog info & filter
  const allBacklogTasks = getAllTasks(stateTree);
  const responsibilities = getAllResponsibilities(stateTree);
  const projects = getAllProjects(stateTree, backlogResp || undefined);
  const goals = getAllGoals(stateTree, backlogProj || undefined, backlogResp || undefined);

  const filteredBacklogTasks = allBacklogTasks.filter(task => {
    if (!showScheduledInBacklog && (task.scheduled_from || task.scheduled_to)) {
      return false;
    }
    if (backlogResp && task.parentResponsibilitySlug !== backlogResp) {
      return false;
    }
    if (backlogProj && task.parentProjectSlug !== backlogProj) {
      return false;
    }
    if (backlogGoal && task.parentGoalSlug !== backlogGoal) {
      return false;
    }
    if (backlogSearch && !task.name.toLowerCase().includes(backlogSearch.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Render Row Packing Grids
  const packedWeeklyRows = getPackedWeeklyRows();
  const packedDailyRows = getPackedDailyRows(selectedDateStr);

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Feedback Toast Notification Banner */}
      {feedbackMessage && (
        <div className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-mono transition-all shadow-sm ${
          feedbackMessage.type === "success"
            ? "bg-[#5F8C6E]/10 text-[#2c312e] border-[#5F8C6E]/30"
            : "bg-[#C25953]/10 text-[#2c312e] border-[#C25953]/30"
        }`}>
          <AlertCircle className={`h-4 w-4 ${feedbackMessage.type === "success" ? "text-[#5F8C6E]" : "text-[#C25953]"}`} />
          <span className="font-semibold">{feedbackMessage.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
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
          <div
            onDragOver={handleWeeklyDragOver}
            onDrop={handleWeeklyDrop}
            onDragLeave={handleDragLeave}
            className="relative flex flex-col min-h-[420px] select-none border border-[#e3dbcd] rounded-2xl bg-[#F5F0E6]/25 overflow-hidden"
          >
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
                      const isCurrentlyDragged = activeDraggedTask?.slug === item.slug;

                      return (
                        <div
                          key={item.id}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            paddingLeft: "4px",
                            paddingRight: "4px",
                            opacity: isCurrentlyDragged ? 0.3 : 1
                          }}
                          draggable={filterType === "TASK"}
                          onDragStart={(e) => handleWeeklyScheduledDragStart(e, item)}
                          onDragEnd={handleDragLeave}
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
            
            {/* Weekly Live Drop Preview */}
            {dragOverPreview && dragOverPreview.weeklyDayIndex !== undefined && (
              <div
                style={{
                  left: `${(dragOverPreview.weeklyDayIndex / 7) * 100}%`,
                  width: `${(dragOverPreview.weeklyDaySpan ?? 1) / 7 * 100}%`,
                  paddingLeft: "4px",
                  paddingRight: "4px"
                }}
                className="absolute bottom-4 h-14 flex flex-col justify-center pointer-events-none z-30"
              >
                <div className="h-full rounded-xl border-2 border-dashed border-[#7A8C74]/50 bg-[#7A8C74]/20 flex flex-col justify-center p-2 text-[#7A8C74] opacity-80 animate-pulse">
                  <span className="text-[10px] font-sans font-bold leading-tight truncate">
                    {dragOverPreview.name}
                  </span>
                  <span className="text-[8px] font-mono mt-0.5">
                    Release to Schedule
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TIMELINE VIEWMODE: DAILY */}
        {viewMode === "daily" && (
          <div
            onDragOver={handleDailyDragOver}
            onDrop={handleDailyDrop}
            onDragLeave={handleDragLeave}
            className="relative flex flex-col min-h-[420px] select-none border border-[#e3dbcd] rounded-2xl bg-[#F5F0E6]/25 overflow-hidden"
          >
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
                      const itemStart = (liveResizing && liveResizing.slug === item.slug)
                        ? liveResizing.startHour
                        : getDailyHourVal(item, selectedDateStr, startHour);
                      const itemEnd = (liveResizing && liveResizing.slug === item.slug)
                        ? liveResizing.endHour
                        : getDailyHourVal(item, selectedDateStr, endHour);

                      const leftPercent = ((itemStart - startHour) / totalHours) * 100;
                      const widthPercent = ((itemEnd - itemStart) / totalHours) * 100;

                      const colors = getContextColor(item.parentName || item.name);
                      const isCurrentlyDragged = activeDraggedTask?.slug === item.slug;
                      const isResizingThis = resizingState?.slug === item.slug;

                      return (
                        <div
                          key={item.id}
                          style={{
                            left: `${leftPercent}%`,
                            width: `${widthPercent}%`,
                            paddingLeft: "4px",
                            paddingRight: "4px",
                            opacity: isCurrentlyDragged ? 0.3 : 1,
                            zIndex: isResizingThis ? 40 : 10
                          }}
                          draggable={filterType === "TASK" && !resizingState}
                          onDragStart={(e) => handleScheduledDragStart(e, item)}
                          onDragEnd={handleDragLeave}
                          className="absolute inset-y-0 flex flex-col justify-center group"
                        >
                          <div className={`relative h-full rounded-xl border p-2 flex flex-col justify-center shadow-sm transition-all hover:scale-[1.01] hover:shadow-md ${colors.bg} ${colors.text} ${colors.border}`}>
                            
                            {/* Left Resize Handle */}
                            {filterType === "TASK" && (
                              <div
                                className="absolute top-0 left-0 bottom-0 w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-20"
                                onMouseDown={(e) => handleResizeMouseDown(e, item, "left")}
                              >
                                <div className="w-1 h-5 bg-white/40 rounded-full" />
                              </div>
                            )}

                            <span className="text-[10px] font-sans font-bold leading-tight truncate px-1">
                              {item.name}
                            </span>
                            {item.parentName && (
                              <span className={`text-[8px] font-sans font-normal mt-0.5 truncate uppercase tracking-wide px-1 ${colors.subtitle}`}>
                                {item.parentName}
                              </span>
                            )}

                            {/* Right Resize Handle */}
                            {filterType === "TASK" && (
                              <div
                                className="absolute top-0 right-0 bottom-0 w-2.5 cursor-ew-resize opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity z-20"
                                onMouseDown={(e) => handleResizeMouseDown(e, item, "right")}
                              >
                                <div className="w-1 h-5 bg-white/40 rounded-full" />
                              </div>
                            )}

                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Daily Live Drop Preview */}
            {dragOverPreview && dragOverPreview.weeklyDayIndex === undefined && dragOverPreview.date === selectedDateStr && (
              <div
                style={{
                  left: `${((dragOverPreview.startHour - startHour) / totalHours) * 100}%`,
                  width: `${(dragOverPreview.duration / totalHours) * 100}%`,
                  paddingLeft: "4px",
                  paddingRight: "4px"
                }}
                className="absolute bottom-4 h-14 flex flex-col justify-center pointer-events-none z-30"
              >
                <div className="h-full rounded-xl border-2 border-dashed border-[#7A8C74]/50 bg-[#7A8C74]/20 flex flex-col justify-center p-2 text-[#7A8C74] opacity-80 animate-pulse">
                  <span className="text-[10px] font-sans font-bold leading-tight truncate">
                    {dragOverPreview.name}
                  </span>
                  <span className="text-[8px] font-mono mt-0.5">
                    Release to Schedule
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Sidebar Agenda & Backlog (Span 1) */}
      <div className="lg:col-span-1 flex flex-col gap-6">
        
        {/* Task Backlog Panel */}
        <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] shadow-sm flex flex-col gap-4">
          <div className="border-b border-[#e3dbcd] pb-2 flex flex-col">
            <h3 className="text-xs font-mono uppercase tracking-widest text-[#67736b] font-bold">
              Task Backlog
            </h3>
            <span className="text-[10px] text-[#67736b] font-mono mt-0.5">
              Drag tasks onto the calendar to schedule
            </span>
          </div>

          {/* Filters */}
          <div className="flex flex-col gap-2 text-xs font-mono">
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                value={backlogSearch}
                onChange={(e) => setBacklogSearch(e.target.value)}
                placeholder="Search tasks..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[#e3dbcd] bg-[#FAF7F2] text-[#2c312e] focus:outline-none focus:border-[#7A8C74] text-xs font-mono"
              />
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#67736b]" />
            </div>

            {/* Responsibility Select */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] uppercase tracking-wide text-[#67736b] font-semibold">Responsibility</label>
              <select
                value={backlogResp}
                onChange={(e) => {
                  setBacklogResp(e.target.value);
                  setBacklogProj(""); // Reset sub-filters
                  setBacklogGoal("");
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[#e3dbcd] bg-[#FAF7F2] text-[#2c312e] focus:outline-none focus:border-[#7A8C74] text-xs font-mono"
              >
                <option value="">All Responsibilities</option>
                {responsibilities.map(r => (
                  <option key={r.slug} value={r.slug}>{r.name}</option>
                ))}
              </select>
            </div>

            {/* Project Select */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] uppercase tracking-wide text-[#67736b] font-semibold">Project</label>
              <select
                value={backlogProj}
                onChange={(e) => {
                  setBacklogProj(e.target.value);
                  setBacklogGoal(""); // Reset sub-filter
                }}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[#e3dbcd] bg-[#FAF7F2] text-[#2c312e] focus:outline-none focus:border-[#7A8C74] text-xs font-mono"
              >
                <option value="">All Projects</option>
                {projects.map(p => (
                  <option key={p.slug} value={p.slug}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Goal Select */}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] uppercase tracking-wide text-[#67736b] font-semibold">Goal</label>
              <select
                value={backlogGoal}
                onChange={(e) => setBacklogGoal(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-[#e3dbcd] bg-[#FAF7F2] text-[#2c312e] focus:outline-none focus:border-[#7A8C74] text-xs font-mono"
              >
                <option value="">All Goals</option>
                {goals.map(g => (
                  <option key={g.slug} value={g.slug}>{g.name}</option>
                ))}
              </select>
            </div>

            {/* Show Scheduled Toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none py-1">
              <input
                type="checkbox"
                checked={showScheduledInBacklog}
                onChange={(e) => setShowScheduledInBacklog(e.target.checked)}
                className="rounded border-[#e3dbcd] text-[#7A8C74] focus:ring-[#7A8C74] h-3.5 w-3.5"
              />
              <span className="text-[10px] text-[#67736b]">Show already scheduled</span>
            </label>
          </div>

          {/* Backlog List */}
          <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
            {filteredBacklogTasks.length === 0 ? (
              <div className="py-8 text-center text-[#67736b] font-mono text-xs italic border border-dashed border-[#e3dbcd] rounded-xl bg-[#FAF7F2]/50">
                No tasks found.
              </div>
            ) : (
              filteredBacklogTasks.map((task) => {
                const isScheduled = task.scheduled_from || task.scheduled_to;
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleBacklogDragStart(e, task)}
                    onDragEnd={handleDragLeave}
                    className="flex items-start gap-2 p-2.5 rounded-xl border border-[#e3dbcd] bg-[#FAF7F2] hover:bg-[#F5F0E6]/30 transition-all cursor-grab active:cursor-grabbing group shadow-sm hover:shadow"
                  >
                    <GripVertical className="h-3.5 w-3.5 text-[#67736b] mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-1 grow min-w-0">
                      <span className="text-xs font-sans font-bold text-[#2c312e] leading-tight truncate">
                        {task.name}
                      </span>
                      
                      {/* badges */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded uppercase ${
                          task.priority === "URGENT" ? "bg-[#C25953]/15 text-[#C25953]" :
                          task.priority === "HIGH" ? "bg-[#CE8D6D]/15 text-[#CE8D6D]" :
                          task.priority === "LOW" ? "bg-[#5F8C6E]/15 text-[#5F8C6E]" :
                          "bg-[#788896]/15 text-[#788896]"
                        }`}>
                          {task.priority || "MEDIUM"}
                        </span>
                        
                        {isScheduled && (
                          <span className="text-[8px] font-mono font-bold bg-[#7A8C74]/15 text-[#7A8C74] px-1.5 py-0.5 rounded uppercase">
                            Scheduled
                          </span>
                        )}

                        <span className={`text-[8px] font-mono font-bold px-1.5 py-0.5 rounded uppercase bg-[#FAF7F2]/80 text-[#67736b] border border-[#e3dbcd]`}>
                          {task.status}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        
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
  </div>
  );
}
