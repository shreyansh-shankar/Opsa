"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useStore, GraphNode, GraphEdge } from "@/store/useStore";
import { Network } from "lucide-react";

export default function DependencyGraph() {
  const { graph } = useStore();
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draggedNode, setDraggedNode] = useState<string | null>(null);

  // Initial random positions distributed in a circle centered in 880x500 viewBox
  const initialPositions = useMemo(() => {
    if (!graph || graph.nodes.length === 0) return {};
    const init: Record<string, { x: number; y: number }> = {};
    graph.nodes.forEach((node, idx) => {
      const angle = (idx / graph.nodes.length) * 2 * Math.PI;
      const radius = 120 + Math.random() * 100;
      init[node.id] = {
        x: 440 + Math.cos(angle) * radius,
        y: 250 + Math.sin(angle) * radius
      };
    });
    return init;
  }, [graph]);

  // Sync positions state when graph/initialPositions changes
  useEffect(() => {
    setPositions(initialPositions);
  }, [initialPositions]);

  // Physics simulation loop (Attraction / Repulsion forces)
  useEffect(() => {
    if (!graph || graph.nodes.length === 0) return;
    
    let animationFrameId: number;
    
    const center = { x: 440, y: 250 };
    const kRepulsion = 18000;  // Coulomb repulsion strength
    const kAttraction = 0.05;   // Hooke spring attraction strength
    const gravity = 0.015;      // Force pulling nodes to center
    const damping = 0.85;       // Velocity friction/resistance
    
    // Track velocities across frame renders
    const velocities: Record<string, { x: number; y: number }> = {};
    graph.nodes.forEach((n) => {
      velocities[n.id] = { x: 0, y: 0 };
    });
    
    const step = () => {
      setPositions((prev) => {
        const currentPositions = Object.keys(prev).length > 0 ? prev : initialPositions;
        const next = { ...currentPositions };
        
        // Initialize forces
        const forces: Record<string, { x: number; y: number }> = {};
        graph.nodes.forEach((n) => {
          forces[n.id] = { x: 0, y: 0 };
        });
        
        // 1. Repulsion between all pairs of nodes
        const nodeIds = graph.nodes.map(n => n.id);
        for (let i = 0; i < nodeIds.length; i++) {
          const id1 = nodeIds[i];
          const pos1 = next[id1];
          if (!pos1) continue;
          
          for (let j = i + 1; j < nodeIds.length; j++) {
            const id2 = nodeIds[j];
            const pos2 = next[id2];
            if (!pos2) continue;
            
            const dx = pos1.x - pos2.x;
            const dy = pos1.y - pos2.y;
            const distSq = dx * dx + dy * dy + 1;
            const dist = Math.sqrt(distSq);
            
            if (dist < 280) {
              const force = kRepulsion / distSq;
              const fx = (dx / dist) * force;
              const fy = (dy / dist) * force;
              
              forces[id1].x += fx;
              forces[id1].y += fy;
              forces[id2].x -= fx;
              forces[id2].y -= fy;
            }
          }
        }
        
        // 2. Attraction along edges (springs)
        graph.edges.forEach((edge) => {
          const posSrc = next[edge.source];
          const posTgt = next[edge.target];
          if (!posSrc || !posTgt) return;
          
          const dx = posTgt.x - posSrc.x;
          const dy = posTgt.y - posSrc.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          
          const force = kAttraction * dist;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          
          forces[edge.source].x += fx;
          forces[edge.source].y += fy;
          forces[edge.target].x -= fx;
          forces[edge.target].y -= fy;
        });
        
        // 3. Gravity pulling to center
        graph.nodes.forEach((node) => {
          const pos = next[node.id];
          if (!pos) return;
          
          forces[node.id].x += (center.x - pos.x) * gravity;
          forces[node.id].y += (center.y - pos.y) * gravity;
        });
        
        // 4. Update velocity and positions
        graph.nodes.forEach((node) => {
          const id = node.id;
          if (id === draggedNode) return; // Skip physics for the node currently being dragged
          
          const pos = next[id];
          if (!pos) return;
          
          const vel = velocities[id] || { x: 0, y: 0 };
          vel.x = (vel.x + forces[id].x) * damping;
          vel.y = (vel.y + forces[id].y) * damping;
          
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
          if (speed > 10) {
            vel.x = (vel.x / speed) * 10;
            vel.y = (vel.y / speed) * 10;
          }
          
          velocities[id] = vel;
          
          let nextX = pos.x + vel.x;
          let nextY = pos.y + vel.y;
          
          // Contain within viewport bounds
          if (nextX < 45) { nextX = 45; vel.x = 0; }
          if (nextX > 835) { nextX = 835; vel.x = 0; }
          if (nextY < 45) { nextY = 45; vel.y = 0; }
          if (nextY > 455) { nextY = 455; vel.y = 0; }
          
          next[id] = { x: nextX, y: nextY };
        });
        
        return next;
      });
      
      animationFrameId = requestAnimationFrame(step);
    };
    
    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [graph, draggedNode, initialPositions]);

  // Drag and drop handlers
  const handleMouseDown = (nodeId: string, e: React.MouseEvent<SVGGElement>) => {
    e.preventDefault();
    setDraggedNode(nodeId);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggedNode) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 880;
    const y = ((e.clientY - rect.top) / rect.height) * 500;
    
    setPositions((prev) => ({
      ...prev,
      [draggedNode]: {
        x: Math.max(45, Math.min(835, x)),
        y: Math.max(45, Math.min(455, y))
      }
    }));
  };

  const handleMouseUp = () => {
    setDraggedNode(null);
  };

  if (!graph || graph.nodes.length === 0) {
    return (
      <div className="glass-panel p-12 rounded-2xl text-center text-[#67736b] font-mono text-xs border border-[#e3dbcd]">
        <Network className="h-8 w-8 mx-auto mb-4 text-[#7A8C74] opacity-60 animate-pulse" />
        <span>No network data available. Declare relationships with BLOCK or LINK.</span>
      </div>
    );
  }

  const nodes = graph.nodes;
  const edges = graph.edges;

  const getStatusColor = (status: string, type: string) => {
    if (status === "COMPLETED") return "#5F8C6E"; // Emerald
    if (status === "BLOCKED") return "#C25953"; // Rose
    if (status === "DEFERRED") return "#D4A351"; // Mustard
    if (status === "PAUSED") return "#5C7CFA"; // Blue
    if (status === "NOT_STARTED") return "#788896"; // Slate/Gray
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
          className="w-full min-w-[800px] h-[500px] cursor-grab active:cursor-grabbing"
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
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
            const p1 = positions[edge.source] || initialPositions[edge.source];
            const p2 = positions[edge.target] || initialPositions[edge.target];
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
            const pos = positions[node.id] || initialPositions[node.id];
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
                onMouseDown={(e) => handleMouseDown(node.id, e)}
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
                  y="-15"
                  textAnchor="middle"
                  fill={isHovered ? "#CE8D6D" : "#2c312e"}
                  fontSize="9.5"
                  fontFamily="monospace"
                  fontWeight={node.type === "RESPONSIBILITY" ? "bold" : "normal"}
                  className="transition-colors pointer-events-none select-none"
                >
                  {node.label}
                </text>
                
                {/* Node type display on hover */}
                {isHovered && (
                  <text
                    y="20"
                    textAnchor="middle"
                    fill="#67736b"
                    fontSize="8"
                    fontFamily="monospace"
                    className="pointer-events-none select-none"
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
