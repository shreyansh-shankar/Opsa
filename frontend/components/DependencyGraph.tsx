"use client";

import React, { useState, useMemo } from "react";
import { useStore, GraphNode, GraphEdge } from "@/store/useStore";
import { Network, Activity } from "lucide-react";

export default function DependencyGraph() {
  const { graph } = useStore();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-xl text-center text-gray-500 font-mono text-xs border border-white/5">
        <Network className="h-8 w-8 mx-auto mb-4 text-cyan-400 opacity-60" />
        <span>No network data available. Declare relationships with BLOCK or LINK.</span>
      </div>
    );
  }

  // Layer nodes based on their type to construct a readable left-to-right hierarchy layout
  const layoutData = useMemo(() => {
    const nodes = [...graph.nodes];
    const edges = [...graph.edges];

    const layers: Record<string, number> = {
      RESPONSIBILITY: 0,
      PROJECT: 1,
      GOAL: 2,
      TASK: 3
    };

    // Group nodes by layer
    const grouped: Record<number, GraphNode[]> = { 0: [], 1: [], 2: [], 3: [] };
    nodes.forEach((node) => {
      const lay = layers[node.type] ?? 3;
      grouped[lay].push(node);
    });

    // Positions mapping
    const positions: Record<string, { x: number; y: number }> = {};
    const width = 850;
    const height = 480;

    // Distribute columns
    const colSpacing = width / 4;

    Object.keys(grouped).forEach((key) => {
      const layIndex = parseInt(key);
      const colNodes = grouped[layIndex];
      const colX = 80 + layIndex * colSpacing;
      
      const count = colNodes.length;
      colNodes.forEach((node, idx) => {
        // Distribute vertically
        const ySpacing = height / (count + 1);
        const colY = ySpacing * (idx + 1);
        positions[node.id] = { x: colX, y: colY };
      });
    });

    return { nodes, edges, positions };
  }, [graph]);

  const { nodes, edges, positions } = layoutData;

  const getStatusColor = (status: string, type: string) => {
    if (status === "COMPLETED") return "#10b981"; // emerald
    if (status === "BLOCKED") return "#f43f5e"; // rose
    if (status === "DEFERRED") return "#f59e0b"; // amber
    return type === "RESPONSIBILITY" ? "#8b5cf6" : "#06b6d4"; // violet or cyan
  };

  const getEdgeStyle = (edge: GraphEdge) => {
    const isRelated = hoveredNode === edge.source || hoveredNode === edge.target;
    if (edge.type === "blocks") {
      return {
        stroke: isRelated ? "#f43f5e" : "#ef4444",
        strokeWidth: isRelated ? 2.5 : 1.5,
        strokeDasharray: "0",
        opacity: hoveredNode && !isRelated ? 0.2 : 0.8
      };
    }
    if (edge.type === "hierarchy") {
      return {
        stroke: isRelated ? "#8b5cf6" : "#4b5563",
        strokeWidth: isRelated ? 1.5 : 1.0,
        strokeDasharray: "4,4",
        opacity: hoveredNode && !isRelated ? 0.15 : 0.5
      };
    }
    // general link
    return {
      stroke: isRelated ? "#06b6d4" : "#3b82f6",
      strokeWidth: isRelated ? 2.0 : 1.2,
      strokeDasharray: "2,2",
      opacity: hoveredNode && !isRelated ? 0.2 : 0.6
    };
  };

  return (
    <div className="glass-panel p-5 rounded-xl border border-white/5 flex flex-col gap-4">
      <div className="flex items-center gap-2 border-b border-gray-800 pb-3">
        <Network className="h-5 w-5 text-cyan-400" />
        <h2 className="font-mono font-bold text-sm tracking-wider text-gray-200">DEPENDENCY & COMMITMENT GRAPH</h2>
        <div className="ml-auto flex items-center gap-4 text-[10px] font-mono text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-violet-500 rounded-full" />
            <span>Responsibility</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-cyan-400 rounded-full" />
            <span>Project/Goal/Task</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 border-t border-dashed border-red-500" />
            <span>Blocks</span>
          </span>
        </div>
      </div>

      <div className="relative bg-gray-950/70 rounded-lg overflow-x-auto border border-gray-850 p-2 select-none">
        <svg
          viewBox="0 0 880 500"
          className="w-full min-w-[800px] h-[500px]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Arrow Markers for direction */}
            <marker
              id="arrow-blocks"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
            </marker>
            <marker
              id="arrow-link"
              viewBox="0 0 10 10"
              refX="18"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6" />
            </marker>
          </defs>

          {/* 1. Render Edges (lines) first */}
          {edges.map((edge, idx) => {
            const p1 = positions[edge.source];
            const p2 = positions[edge.target];
            if (!p1 || !p2) return null;

            const style = getEdgeStyle(edge);
            const isBlocks = edge.type === "blocks";
            const markerId = isBlocks ? "url(#arrow-blocks)" : edge.type === "hierarchy" ? "" : "url(#arrow-link)";

            return (
              <line
                key={`edge-${idx}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.strokeDasharray}
                opacity={style.opacity}
                markerEnd={markerId}
                className="transition-all duration-300"
              />
            );
          })}

          {/* 2. Render Nodes (interactive groups) */}
          {nodes.map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;

            const color = getStatusColor(node.status, node.type);
            const isHovered = hoveredNode === node.id;
            const isDimmed = hoveredNode && hoveredNode !== node.id;

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                className="cursor-pointer"
                opacity={isDimmed ? 0.35 : 1}
                style={{ transition: "opacity 0.25s ease" }}
              >
                {/* Outer Glow Ring for hover */}
                {isHovered && (
                  <circle
                    r="16"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    className="animate-ping"
                    opacity="0.4"
                  />
                )}

                {/* Node circle */}
                <circle
                  r={node.type === "RESPONSIBILITY" ? "12" : "8"}
                  fill="#1f2937"
                  stroke={color}
                  strokeWidth="2.5"
                />

                {/* Status/Type center dot */}
                <circle
                  r={node.type === "RESPONSIBILITY" ? "5" : "3"}
                  fill={color}
                />

                {/* Label tag */}
                <text
                  y="-18"
                  textAnchor="middle"
                  fill={isHovered ? "#22d3ee" : "#f3f4f6"}
                  fontSize="10"
                  fontFamily="monospace"
                  fontWeight={node.type === "RESPONSIBILITY" ? "bold" : "normal"}
                  className="transition-colors pointer-events-none"
                >
                  {node.label}
                </text>
                
                {/* Node type display on hover */}
                {isHovered && (
                  <text
                    y="25"
                    textAnchor="middle"
                    fill="#9ca3af"
                    fontSize="8"
                    fontFamily="monospace"
                    className="pointer-events-none"
                  >
                    {node.type} ({node.status})
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
