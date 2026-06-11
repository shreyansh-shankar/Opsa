"use client";

import React, { useState, useMemo } from "react";
import { useStore, GraphNode, GraphEdge } from "@/store/useStore";
import { Network } from "lucide-react";

export default function DependencyGraph() {
  const { graph } = useStore();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-2xl text-center text-[#67736b] font-mono text-xs border border-[#e3dbcd]">
        <Network className="h-8 w-8 mx-auto mb-4 text-[#7A8C74] opacity-60 animate-pulse" />
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
        const ySpacing = height / (count + 1);
        const colY = ySpacing * (idx + 1);
        positions[node.id] = { x: colX, y: colY };
      });
    });

    return { nodes, edges, positions };
  }, [graph]);

  const { nodes, edges, positions } = layoutData;

  const getStatusColor = (status: string, type: string) => {
    if (status === "COMPLETED") return "#5F8C6E"; // Emerald
    if (status === "BLOCKED") return "#C25953"; // Rose
    if (status === "DEFERRED") return "#D4A351"; // Mustard
    return type === "RESPONSIBILITY" ? "#CE8D6D" : "#7A8C74"; // Terracotta or Sage
  };

  const getEdgeStyle = (edge: GraphEdge) => {
    const isRelated = hoveredNode === edge.source || hoveredNode === edge.target;
    if (edge.type === "blocks") {
      return {
        stroke: isRelated ? "#C25953" : "#D96E67",
        strokeWidth: isRelated ? 2.5 : 1.5,
        strokeDasharray: "0",
        opacity: hoveredNode && !isRelated ? 0.2 : 0.8
      };
    }
    if (edge.type === "hierarchy") {
      return {
        stroke: isRelated ? "#7A8C74" : "#b0a594",
        strokeWidth: isRelated ? 1.5 : 1.0,
        strokeDasharray: "3,3",
        opacity: hoveredNode && !isRelated ? 0.2 : 0.6
      };
    }
    // general link
    return {
      stroke: isRelated ? "#CE8D6D" : "#d6a894",
      strokeWidth: isRelated ? 2.0 : 1.2,
      strokeDasharray: "1,1",
      opacity: hoveredNode && !isRelated ? 0.25 : 0.6
    };
  };

  return (
    <div className="glass-panel p-5 rounded-2xl border border-[#e3dbcd] bg-[#FAF7F2] flex flex-col gap-4 shadow-sm">
      <div className="flex items-center gap-2 border-b border-[#e3dbcd] pb-3">
        <Network className="h-5 w-5 text-[#7A8C74]" />
        <h2 className="font-sans font-bold text-xs tracking-wider text-[#2c312e] uppercase">DEPENDENCY & COMMITMENT GRAPH</h2>
        <div className="ml-auto flex items-center gap-3 text-[9px] font-mono text-[#67736b]">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-[#CE8D6D] rounded-full" />
            <span>Responsibility</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-[#7A8C74] rounded-full" />
            <span>Project/Goal/Task</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-0.5 border-t border-dashed border-[#C25953]" />
            <span>Blocks</span>
          </span>
        </div>
      </div>

      <div className="relative bg-[#F5F0E6]/50 rounded-xl overflow-x-auto border border-[#e3dbcd] p-2 select-none">
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
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#C25953" />
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
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#CE8D6D" />
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
                    r="15"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    className="animate-ping"
                    opacity="0.3"
                  />
                )}

                {/* Node circle */}
                <circle
                  r={node.type === "RESPONSIBILITY" ? "11" : "7"}
                  fill="#FAF7F2"
                  stroke={color}
                  strokeWidth="2.5"
                />

                {/* Status/Type center dot */}
                <circle
                  r={node.type === "RESPONSIBILITY" ? "4" : "2.5"}
                  fill={color}
                />

                {/* Label tag */}
                <text
                  y="-18"
                  textAnchor="middle"
                  fill={isHovered ? "#CE8D6D" : "#2c312e"}
                  fontSize="9.5"
                  fontFamily="monospace"
                  fontWeight={node.type === "RESPONSIBILITY" ? "bold" : "normal"}
                  className="transition-colors pointer-events-none"
                >
                  {node.label}
                </text>
                
                {/* Node type display on hover */}
                {isHovered && (
                  <text
                    y="22"
                    textAnchor="middle"
                    fill="#67736b"
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
