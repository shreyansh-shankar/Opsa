"use client";

import React, { useState, useRef, useEffect } from "react";
import { useStore } from "@/store/useStore";
import { Terminal, Send, Layers, HelpCircle, Code } from "lucide-react";

export default function CommandPalette() {
  const { executeCommand, executeScript, addConsoleLog, setActiveTab } = useStore();
  const [input, setInput] = useState("");
  const [isMultiLine, setIsMultiLine] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isMultiLine && inputRef.current) {
      inputRef.current.focus();
    } else if (isMultiLine && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isMultiLine]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    let success = false;
    if (isMultiLine) {
      success = await executeScript(input);
    } else {
      success = await executeCommand(input);
    }

    if (success) {
      setInput("");
    }
  };

  const handleHelp = () => {
    setActiveTab("reference");
  };

  return (
    <div className="glass-panel w-full p-4 rounded-xl shadow-lg border border-white/5 transition-all">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-sm">
            <Terminal className="h-4 w-4 animate-pulse" />
            <span>opsa-terminal v1.0.0</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMultiLine(!isMultiLine)}
              className={`flex items-center gap-1 text-xs font-mono px-2 py-1 rounded transition-colors ${
                isMultiLine
                  ? "bg-violet-600/30 text-violet-400 border border-violet-500/20"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              <Code className="h-3.5 w-3.5" />
              <span>{isMultiLine ? "Transaction Mode" : "Single Command"}</span>
            </button>
            <button
              type="button"
              onClick={handleHelp}
              className="flex items-center gap-1 text-xs font-mono bg-gray-800 text-gray-400 hover:bg-gray-700 px-2 py-1 rounded transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" />
              <span>Reference</span>
            </button>
          </div>
        </div>

        <div className="relative flex items-center">
          {isMultiLine ? (
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="BEGIN TRANSACTION&#10;CREATE RESPONSIBILITY Startup&#10;CREATE PROJECT TLD UNDER Startup&#10;END TRANSACTION"
              rows={5}
              className="w-full bg-gray-950/80 text-cyan-300 font-mono text-sm p-3 rounded-lg border border-gray-800 focus:outline-none focus:border-cyan-500/50 resize-none placeholder-gray-600 leading-relaxed"
            />
          ) : (
            <div className="flex w-full items-center">
              <span className="absolute left-3 text-cyan-500 font-mono text-sm select-none">&gt;</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="CREATE RESPONSIBILITY Startup"
                className="w-full bg-gray-950/80 text-cyan-300 font-mono text-sm pl-8 pr-12 py-3 rounded-lg border border-gray-800 focus:outline-none focus:border-cyan-500/50 placeholder-gray-600"
              />
            </div>
          )}

          {!isMultiLine && (
            <button
              type="submit"
              className="absolute right-2 text-cyan-400 hover:text-cyan-300 p-1.5 rounded bg-gray-900 border border-gray-800 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </div>

        {isMultiLine && (
          <button
            type="submit"
            className="flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 text-white font-mono text-sm py-2 rounded-lg transition-colors border border-violet-500/20"
          >
            <Layers className="h-4 w-4" />
            <span>Commit Transaction Script</span>
          </button>
        )}
      </form>
    </div>
  );
}
