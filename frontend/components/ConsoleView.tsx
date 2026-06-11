"use client";

import React, { useRef, useEffect, useState } from "react";
import { useStore } from "@/store/useStore";
import { Terminal, Trash2, ShieldAlert, CheckCircle, Info, Settings } from "lucide-react";

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
            <form onSubmit={handleSend} className="relative flex items-center p-3 border-t border-[#e3dbcd] bg-[#FAF7F2]">
              <span className="absolute left-6 text-[#7A8C74] font-mono text-xs select-none">$</span>
              <input
                type="text"
                value={cmdInput}
                onChange={(e) => setCmdInput(e.target.value)}
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
