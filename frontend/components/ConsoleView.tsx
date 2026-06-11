"use client";

import React, { useRef, useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { Terminal, Trash2, ShieldAlert, CheckCircle, Info } from "lucide-react";

export default function ConsoleView() {
  const { consoleLogs, clearConsole, executeCommand, pendingConsoleInput, setPendingConsoleInput } = useStore();
  const [cmdInput, setCmdInput] = useState("");
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [consoleLogs]);

  useEffect(() => {
    if (pendingConsoleInput) {
      setCmdInput(pendingConsoleInput);
      setPendingConsoleInput("");
      
      // Auto-focus terminal input
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
    await executeCommand(command);
  };

  const getLogStyle = (type: string) => {
    switch (type) {
      case "error":
        return {
          text: "text-rose-400 font-semibold",
          bg: "bg-rose-500/5 border-l-2 border-rose-500",
          icon: <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
        };
      case "success":
        return {
          text: "text-emerald-400",
          bg: "bg-emerald-500/5 border-l-2 border-emerald-500",
          icon: <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
        };
      case "input":
        return {
          text: "text-cyan-300 font-bold",
          bg: "bg-cyan-500/5 border-l-2 border-cyan-500",
          icon: <span className="text-cyan-400 font-mono text-sm select-none shrink-0 mt-0.5">$</span>
        };
      default:
        return {
          text: "text-gray-300 whitespace-pre-wrap leading-relaxed",
          bg: "bg-gray-950/20 border-l border-gray-800",
          icon: <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
        };
    }
  };

  return (
    <div className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4 h-[580px]">
      <div className="flex items-center justify-between border-b border-gray-800 pb-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5 text-cyan-400" />
          <h2 className="font-mono font-bold text-sm tracking-wider text-gray-200">INTERACTIVE SYSTEM CONSOLE</h2>
        </div>
        <button
          onClick={clearConsole}
          className="flex items-center gap-1.5 text-xs font-mono text-gray-500 hover:text-rose-400 bg-gray-900 border border-gray-800 hover:border-rose-950 px-2.5 py-1 rounded transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Clear logs</span>
        </button>
      </div>

      {/* Terminal Screen log */}
      <div className="grow bg-black/75 rounded-lg border border-gray-900 overflow-y-auto p-4 flex flex-col gap-2.5 font-mono text-xs shadow-inner">
        {consoleLogs.map((log, idx) => {
          const style = getLogStyle(log.type);
          return (
            <div
              key={idx}
              className={`flex items-start gap-2.5 p-2 rounded transition-colors ${style.bg}`}
            >
              {style.icon}
              <div className="flex flex-col gap-1 grow">
                <span className={style.text}>{log.text}</span>
                <span className="text-[9px] text-gray-600 self-end select-none">{log.timestamp}</span>
              </div>
            </div>
          );
        })}
        <div ref={consoleEndRef} />
      </div>

      {/* Inline Terminal command line */}
      <form onSubmit={handleSend} className="relative flex items-center shrink-0">
        <span className="absolute left-3 text-cyan-500 font-mono text-xs select-none">$</span>
        <input
          type="text"
          value={cmdInput}
          onChange={(e) => setCmdInput(e.target.value)}
          placeholder="Enter query command... (e.g. SHOW ACTIVE, WHY BLOCKED Launch)"
          className="w-full bg-gray-950/80 text-cyan-300 font-mono text-xs pl-8 pr-12 py-3 rounded-lg border border-gray-900 focus:outline-none focus:border-cyan-500/50 placeholder-gray-650"
        />
        <button
          type="submit"
          className="absolute right-2 text-xs font-mono px-3 py-1 rounded bg-gray-900 border border-gray-800 hover:border-cyan-500/30 text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Run
        </button>
      </form>
    </div>
  );
}
