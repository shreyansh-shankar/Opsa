"use client";

import React, { useState, useRef, useEffect } from "react";
import { useStore } from "@/store/useStore";
import { Terminal, Send, Layers, HelpCircle, Code } from "lucide-react";

export default function CommandPalette() {
  const { executeCommand, executeScript, setActiveTab } = useStore();
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
    <div className="glass-panel w-full p-4 rounded-2xl shadow-sm border border-[#e3dbcd] bg-[#FAF7F2] transition-all">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#7A8C74] font-mono text-xs font-semibold">
            <Terminal className="h-4 w-4 animate-pulse text-[#7A8C74]" />
            <span>opsa-terminal v1.0.0</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMultiLine(!isMultiLine)}
              className={`flex items-center gap-1 text-[10px] font-mono px-2.5 py-1 rounded-lg transition-colors border ${
                isMultiLine
                  ? "bg-[#7A8C74]/10 text-[#7A8C74] border-[#7A8C74]/20"
                  : "bg-[#F5F0E6] text-[#67736b] border-[#e3dbcd] hover:text-[#2c312e] hover:bg-[#e3dbcd]/40"
              }`}
            >
              <Code className="h-3 w-3" />
              <span>{isMultiLine ? "Transaction Mode" : "Single Command"}</span>
            </button>
            <button
              type="button"
              onClick={handleHelp}
              className="flex items-center gap-1 text-[10px] font-mono bg-[#F5F0E6] text-[#67736b] border border-[#e3dbcd] hover:text-[#2c312e] hover:bg-[#e3dbcd]/40 px-2.5 py-1 rounded-lg transition-colors"
            >
              <HelpCircle className="h-3 w-3" />
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
              className="w-full bg-[#2E3630] text-[#EDE9E1] font-mono text-xs p-3.5 rounded-xl border border-[#2c312e]/10 focus:outline-none focus:border-[#7A8C74] resize-none placeholder-gray-500 leading-relaxed shadow-inner"
            />
          ) : (
            <div className="flex w-full items-center">
              <span className="absolute left-3.5 text-[#7A8C74] font-mono text-xs select-none">&gt;</span>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="CREATE RESPONSIBILITY Startup"
                className="w-full bg-[#2E3630] text-[#EDE9E1] font-mono text-xs pl-8 pr-12 py-3 rounded-xl border border-[#2c312e]/10 focus:outline-none focus:border-[#7A8C74] placeholder-gray-500 shadow-inner"
              />
            </div>
          )}

          {!isMultiLine && (
            <button
              type="submit"
              className="absolute right-2 text-[#7A8C74] hover:text-white p-1.5 rounded-lg bg-[#FAF7F2] border border-[#e3dbcd] hover:bg-[#7A8C74] hover:border-[#7A8C74] transition-all shadow-sm"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {isMultiLine && (
          <button
            type="submit"
            className="flex items-center justify-center gap-2 bg-[#7A8C74] hover:bg-[#687863] text-white font-mono text-xs py-2.5 rounded-xl transition-all shadow-sm border border-[#7A8C74]/20"
          >
            <Layers className="h-4 w-4" />
            <span>Commit Transaction Script</span>
          </button>
        )}
      </form>
    </div>
  );
}
