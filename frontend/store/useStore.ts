import { create } from "zustand";

export interface StateNode {
  id: string;
  name: string;
  slug: string;
  status: string;
  type: "RESPONSIBILITY" | "PROJECT" | "GOAL" | "TASK";
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  deferred_until?: string | null;
  deferred_condition?: string | null;
  projects?: StateNode[];
  goals?: StateNode[];
  tasks?: StateNode[];
}

export interface StateTree {
  responsibilities: StateNode[];
  orphan_projects: StateNode[];
  orphan_goals: StateNode[];
  orphan_tasks: StateNode[];
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  transaction_id: string | null;
  operation: string;
  target: string;
  payload: any;
  status: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  status: string;
  priority?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface ConsoleLog {
  timestamp: string;
  text: string;
  type: "info" | "success" | "error" | "input";
}

interface AppState {
  activeTab: "mission" | "responsibility" | "graph" | "timeline" | "console" | "reference";
  stateTree: StateTree | null;
  timeline: TimelineEvent[];
  graph: GraphData | null;
  consoleLogs: ConsoleLog[];
  isLoading: boolean;
  error: string | null;
  
  setActiveTab: (tab: AppState["activeTab"]) => void;
  addConsoleLog: (text: string, type: ConsoleLog["type"]) => void;
  clearConsole: () => void;
  fetchState: () => Promise<void>;
  executeCommand: (command: string) => Promise<boolean>;
  executeScript: (script: string) => Promise<boolean>;
  executeQuery: (queryText: string) => Promise<void>;
  pendingConsoleInput: string;
  setPendingConsoleInput: (val: string) => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export const useStore = create<AppState>((set, get) => ({
  activeTab: "mission",
  stateTree: null,
  timeline: [],
  graph: null,
  consoleLogs: [
    {
      timestamp: new Date().toLocaleTimeString(),
      text: "Opsa operational runtime loaded. Type HELP or commands to get started.",
      type: "info"
    }
  ],
  isLoading: false,
  error: null,
  pendingConsoleInput: "",

  setActiveTab: (tab) => set({ activeTab: tab }),
  setPendingConsoleInput: (val) => set({ pendingConsoleInput: val }),

  addConsoleLog: (text, type) => {
    set((state) => ({
      consoleLogs: [
        ...state.consoleLogs,
        { timestamp: new Date().toLocaleTimeString(), text, type }
      ]
    }));
  },

  clearConsole: () => set({ consoleLogs: [] }),

  fetchState: async () => {
    set({ isLoading: true });
    try {
      const [stateRes, timelineRes, graphRes] = await Promise.all([
        fetch(`${API_BASE}/state`),
        fetch(`${API_BASE}/timeline`),
        fetch(`${API_BASE}/graph`)
      ]);

      if (!stateRes.ok || !timelineRes.ok || !graphRes.ok) {
        throw new Error("Failed to synchronize state with server.");
      }

      const stateTree = await stateRes.json();
      const timeline = await timelineRes.json();
      const graph = await graphRes.json();

      set({ stateTree, timeline, graph, error: null });
    } catch (err: any) {
      set({ error: err.message });
      get().addConsoleLog(`Sync error: ${err.message}`, "error");
    } finally {
      set({ isLoading: false });
    }
  },

  executeCommand: async (command) => {
    if (!command.trim()) return false;
    get().addConsoleLog(`opsa> ${command}`, "input");
    set({ isLoading: true });
    
    // Check if it is a query command (starts with SHOW or WHY)
    const upperCmd = command.trim().toUpperCase();
    if (upperCmd.startsWith("SHOW") || upperCmd.startsWith("WHY")) {
      set({ isLoading: false });
      await get().executeQuery(command);
      return true;
    }

    try {
      const res = await fetch(`${API_BASE}/commands`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Command execution failed.");
      }

      get().addConsoleLog(data.message || "Command executed successfully.", "success");
      await get().fetchState();
      return true;
    } catch (err: any) {
      get().addConsoleLog(err.message, "error");
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  executeScript: async (script) => {
    if (!script.trim()) return false;
    get().addConsoleLog(`opsa script run:\n${script}`, "input");
    set({ isLoading: true });

    try {
      const res = await fetch(`${API_BASE}/scripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Transaction failed.");
      }

      get().addConsoleLog(
        `Transaction committed successfully. TxID: ${data.transaction_id}`,
        "success"
      );
      await get().fetchState();
      return true;
    } catch (err: any) {
      get().addConsoleLog(`Transaction rolled back: ${err.message}`, "error");
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  executeQuery: async (queryText) => {
    try {
      const res = await fetch(`${API_BASE}/queries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: queryText })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Query failed.");
      }

      if (queryText.trim().toUpperCase().startsWith("WHY")) {
        // Render ASCII block
        get().addConsoleLog(data.result, "info");
      } else {
        // SHOW queries: format list cleanly
        const results = data.result;
        if (!results || results.length === 0) {
          get().addConsoleLog("No records found.", "info");
        } else {
          const lines = results.map((r: any) => {
            if (r.type) {
              return `[${r.type}] ${r.name} (${r.status || r.priority || 'ACTIVE'})`;
            }
            return `${r.name || r.operation || JSON.stringify(r)}`;
          });
          get().addConsoleLog(lines.join("\n"), "info");
        }
      }
    } catch (err: any) {
      get().addConsoleLog(`Query execution error: ${err.message}`, "error");
    }
  }
}));
