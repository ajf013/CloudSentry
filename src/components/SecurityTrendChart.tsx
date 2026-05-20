"use client";

import { useEffect, useState } from "react";

interface HistoryPoint {
  date: string;
  score: number;
}

interface SecurityTrendChartProps {
  currentScore: number;
}

export default function SecurityTrendChart({ currentScore }: SecurityTrendChartProps) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  // Initialize and load history
  useEffect(() => {
    const stored = localStorage.getItem("cloudsentry_score_history");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHistory(parsed);
          return;
        }
      } catch (e) {
        console.error("Failed to parse historical scores", e);
      }
    }

    // Default mock history if none exists
    const today = new Date();
    const mockData: HistoryPoint[] = [];
    const baseScores = [42, 48, 45, 55, 60, currentScore || 68];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const formattedDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      mockData.push({
        date: formattedDate,
        score: baseScores[5 - i]
      });
    }

    setHistory(mockData);
    localStorage.setItem("cloudsentry_score_history", JSON.stringify(mockData));
  }, [currentScore]);

  // Record a new scan if it differs from the last logged score
  const logCurrentScore = (score: number) => {
    if (!score || history.length === 0) return;
    
    const lastEntry = history[history.length - 1];
    if (lastEntry.score === score) return; // Already recorded

    const todayStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    let updatedHistory = [...history];

    if (lastEntry.date === todayStr) {
      // Update today's entry
      updatedHistory[updatedHistory.length - 1].score = score;
    } else {
      // Append new entry
      updatedHistory.push({ date: todayStr, score });
    }

    // Limit to last 10 points
    if (updatedHistory.length > 10) {
      updatedHistory.shift();
    }

    setHistory(updatedHistory);
    localStorage.setItem("cloudsentry_score_history", JSON.stringify(updatedHistory));
  };

  // Watch currentScore to record it
  useEffect(() => {
    if (currentScore > 0 && history.length > 0) {
      logCurrentScore(currentScore);
    }
  }, [currentScore, history.length]);

  // Handlers for simulation
  const addSimulatedPoint = () => {
    const nextDate = new Date();
    // Simulate future date based on history length
    nextDate.setDate(nextDate.getDate() + 1);
    const formattedDate = nextDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    
    const randomScore = Math.floor(Math.random() * 25) + 70; // 70 to 95
    const updated = [...history, { date: formattedDate, score: randomScore }];
    
    if (updated.length > 10) updated.shift();
    
    setHistory(updated);
    localStorage.setItem("cloudsentry_score_history", JSON.stringify(updated));
  };

  const resetHistory = () => {
    localStorage.removeItem("cloudsentry_score_history");
    const today = new Date();
    const mockData: HistoryPoint[] = [];
    const baseScores = [42, 48, 45, 55, 60, currentScore || 68];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      mockData.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: baseScores[5 - i]
      });
    }
    setHistory(mockData);
    localStorage.setItem("cloudsentry_score_history", JSON.stringify(mockData));
  };

  // Chart configuration
  const width = 600;
  const height = 220;
  const paddingLeft = 40;
  const paddingRight = 30;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Calculate coordinates
  const points = history.map((point, index) => {
    const x = paddingLeft + (index / (history.length - 1 || 1)) * chartWidth;
    const y = paddingTop + chartHeight - (point.score / 100) * chartHeight;
    return { x, y, score: point.score, date: point.date };
  });

  // Construct SVG Path commands
  let linePath = "";
  let areaPath = "";

  if (points.length > 0) {
    linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(" ");
    areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;
  }

  return (
    <div className="glass-panel" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            📈 Posture History & Trends
          </h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: "0.25rem" }}>
            Historical security score records over scan sessions
          </p>
        </div>
        
        {/* Simulation Actions */}
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button 
            onClick={addSimulatedPoint}
            className="btn-secondary" 
            style={{ 
              padding: "0.4rem 0.75rem", 
              fontSize: "0.75rem", 
              borderColor: "rgba(99, 102, 241, 0.3)", 
              background: "rgba(99, 102, 241, 0.05)",
              color: "var(--accent-primary)"
            }}
          >
            🧪 Simulate Scan
          </button>
          <button 
            onClick={resetHistory}
            className="btn-secondary" 
            style={{ padding: "0.4rem 0.75rem", fontSize: "0.75rem", color: "var(--text-muted)" }}
            title="Restore default mock dataset"
          >
            Reset
          </button>
        </div>
      </div>

      {/* SVG Chart */}
      <div style={{ position: "relative", width: "100%", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", minWidth: "500px" }}>
          {/* Gradients definitions */}
          <defs>
            <linearGradient id="trendLineGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent-primary)" />
              <stop offset="100%" stopColor="var(--accent-cyan)" />
            </linearGradient>
            <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--accent-cyan)" stopOpacity="0.0" />
            </linearGradient>
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Y-Axis Gridlines */}
          {[0, 25, 50, 75, 100].map((val) => {
            const y = paddingTop + chartHeight - (val / 100) * chartHeight;
            return (
              <g key={val}>
                <line 
                  x1={paddingLeft} 
                  y1={y} 
                  x2={width - paddingRight} 
                  y2={y} 
                  stroke="rgba(255, 255, 255, 0.05)" 
                  strokeWidth="1" 
                  strokeDasharray="4 4" 
                />
                <text 
                  x={paddingLeft - 10} 
                  y={y + 4} 
                  fill="var(--text-muted)" 
                  fontSize="9" 
                  fontFamily="monospace" 
                  textAnchor="end"
                >
                  {val}%
                </text>
              </g>
            );
          })}

          {/* Area under the line */}
          {areaPath && (
            <path d={areaPath} fill="url(#trendAreaGrad)" />
          )}

          {/* Smooth Trend Line */}
          {linePath && (
            <path 
              d={linePath} 
              fill="none" 
              stroke="url(#trendLineGrad)" 
              strokeWidth="3.5" 
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glow)"
            />
          )}

          {/* Coordinate nodes */}
          {points.map((p, idx) => (
            <g key={idx}>
              <circle
                cx={p.x}
                cy={p.y}
                r={hoveredPoint === idx ? "7" : "5"}
                fill="var(--bg-card)"
                stroke={hoveredPoint === idx ? "var(--accent-cyan)" : "var(--accent-primary)"}
                strokeWidth="2.5"
                style={{ cursor: "pointer", transition: "all 0.15s ease" }}
                onMouseEnter={() => setHoveredPoint(idx)}
                onMouseLeave={() => setHoveredPoint(null)}
              />
              
              {/* Date label under chart */}
              <text
                x={p.x}
                y={height - 10}
                fill="var(--text-muted)"
                fontSize="9"
                textAnchor="middle"
              >
                {p.date}
              </text>

              {/* Show value label on hovered node */}
              {hoveredPoint === idx && (
                <g>
                  {/* Tooltip background */}
                  <rect
                    x={p.x - 28}
                    y={p.y - 32}
                    width="56"
                    height="20"
                    rx="4"
                    fill="var(--bg-card)"
                    stroke="rgba(255, 255, 255, 0.15)"
                    strokeWidth="1"
                  />
                  {/* Tooltip value */}
                  <text
                    x={p.x}
                    y={p.y - 18}
                    fill="var(--text-primary)"
                    fontSize="10"
                    fontWeight="bold"
                    textAnchor="middle"
                  >
                    {p.score}%
                  </text>
                </g>
              )}
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
