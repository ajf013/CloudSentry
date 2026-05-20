// src/app/dashboard/page.tsx
"use client";
import { useEffect, useState, startTransition, useRef } from "react";
import { UserButton, useUser, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import DefenderLogo from "@/components/DefenderLogo";


interface Subscription {
  id: string;
  subscriptionId: string;
  displayName: string;
  state: string;
}

interface SecureScore {
  current: number;
  max: number;
  percentage: number;
}

interface Recommendation {
  id: string;
  name: string;
  status: string;
  displayName: string;
  severity: string;
  description: string;
  remediation: string;
  categories: string[];
  scoreWeight: number;
}

interface AIResponse {
  description: string;
  manualFix: string[];
  scriptFix: {
    cli: string;
    terraform?: string;
  };
  exemptionRationale: string;
  exemptionCommand: string;
}

interface DualAIResponse {
  gemini: AIResponse | null;
  geminiError?: string;
  azureOpenAI: AIResponse | null;
  azureOpenAIError?: string;
}

function stripHtml(htmlString: string): string {
  if (!htmlString) return "";
  return htmlString.replace(/<[^>]*>/g, "");
}

export default function Dashboard() {
  const { user } = useUser();
  const { signOut } = useClerk();
  
  // Settings menu states
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // State
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string>("");
  const [loadingSubs, setLoadingSubs] = useState(true);
  const [errorSubs, setErrorSubs] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("");
  const [tenantId, setTenantId] = useState<string>("");
  
  const [secureScore, setSecureScore] = useState<SecureScore | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [errorData, setErrorData] = useState<string | null>(null);
  
  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Unhealthy");
  const [severityFilter, setSeverityFilter] = useState("All");

  // Modal State
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null);
  const [aiData, setAiData] = useState<DualAIResponse | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [errorAi, setErrorAi] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"manual" | "cli" | "exemption">("manual");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [profilePhotoError, setProfilePhotoError] = useState(false);

  const geminiData = aiData?.gemini || null;
  const azureData = aiData?.azureOpenAI || null;
  // Fetch Tenant Info on mount
  useEffect(() => {
    async function loadTenant() {
      try {
        const res = await fetch("/api/azure/tenant");
        if (res.ok) {
          const data = await res.json();
          setTenantName(data.displayName);
          setTenantId(data.tenantId);
        } else {
          setTenantName("Unconnected");
        }
      } catch (err) {
        console.error("Failed to load tenant info:", err);
        setTenantName("Error");
      }
    }
    loadTenant();
  }, []);

  // Handle outside clicks for settings dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. Fetch Subscriptions on mount
  useEffect(() => {
    async function loadSubs() {
      try {
        setLoadingSubs(true);
        setErrorSubs(null);
        const res = await fetch("/api/azure/subscriptions");
        if (!res.ok) {
          const errData = await res.json();
          if (errData.code === "TOKEN_MISSING") {
            throw new Error("TOKEN_MISSING");
          }
          throw new Error(errData.error || "Failed to fetch subscriptions");
        }
        const data: Subscription[] = await res.json();
        setSubscriptions(data);
        if (data.length > 0) {
          setSelectedSubId(data[0].subscriptionId);
        }
      } catch (err: any) {
        console.error(err);
        setErrorSubs(err.message || "An unexpected error occurred");
      } finally {
        setLoadingSubs(false);
      }
    }
    loadSubs();
  }, []);

  // 2. Fetch Dashboard Data when selected Subscription changes
  useEffect(() => {
    if (!selectedSubId) return;

    async function loadDefenderData() {
      try {
        setLoadingData(true);
        setErrorData(null);
        const res = await fetch(`/api/azure/defender-data?subscriptionId=${selectedSubId}`);
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || "Failed to fetch Defender data");
        }
        const data = await res.json();
        
        // Clean and map recommendations properties safely
        const rawRecs = data.recommendations || [];
        const cleanRecs = Array.isArray(rawRecs) 
          ? rawRecs.map((item: any) => {
              // ARG returns item as raw resource columns. Fallback handles direct mapped items.
              return {
                id: item.id || "",
                name: item.name || "",
                status: item.status || "Unhealthy",
                displayName: item.displayName || item.name || "Unknown Assessment",
                severity: item.severity || "Medium",
                description: item.description || "",
                remediation: item.remediation || "",
                categories: Array.isArray(item.categories) ? item.categories : [],
                scoreWeight: Number(item.scoreWeight) || 0
              };
            })
          : [];

        setSecureScore(data.secureScore);
        setRecommendations(cleanRecs);
      } catch (err: any) {
        console.error(err);
        setErrorData(err.message || "Failed to fetch dashboard data");
      } finally {
        setLoadingData(false);
      }
    }

    loadDefenderData();
  }, [selectedSubId]);

  // 3. Trigger AI Fix / Exemption steps
  const handleOpenRec = async (rec: Recommendation) => {
    setSelectedRec(rec);
    setAiData(null);
    setErrorAi(null);
    setLoadingAi(true);
    setActiveTab("manual");

    try {
      const res = await fetch("/api/remediate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: rec.displayName,
          description: rec.description,
          remediation: rec.remediation,
          resourceId: rec.id,
          subscriptionId: selectedSubId,
          assessmentName: rec.name
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to generate AI remediation");
      }

      const data: DualAIResponse = await res.json();
      setAiData(data);
    } catch (err: any) {
      console.error(err);
      setErrorAi(err.message || "Failed to contact AI service. Ensure GEMINI_API_KEY is configured.");
    } finally {
      setLoadingAi(false);
    }
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(type);
    setTimeout(() => setCopiedText(null), 2000);
  };

  // Filter recommendations
  const filteredRecs = recommendations.filter((rec) => {
    const matchesSearch = rec.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          rec.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "All" || rec.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesSeverity = severityFilter === "All" || rec.severity.toLowerCase() === severityFilter.toLowerCase();
    return matchesSearch && matchesStatus && matchesSeverity;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* Top Navigation */}
      <nav className="glass-panel navbar" style={{
        borderRadius: "12px"
      }}>
        {/* Left Side: Home Button */}
        <div style={{ justifySelf: "start", display: "flex", alignItems: "center" }}>
          <Link href="/" className="btn-secondary" style={{ 
            width: "40px",
            height: "40px",
            padding: 0,
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.05)",
            background: "rgba(255, 255, 255, 0.02)",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
            transition: "all 0.2s"
          }} title="Go to Home">
            <span style={{ fontSize: "1.2rem" }}>🏠</span>
          </Link>
        </div>

        {/* Center: Logo / App Name */}
        <div className="navbar-logo">
          <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <DefenderLogo size={28} />
            <span style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text-primary)" }}>
              Cloud<span style={{ color: "var(--accent-cyan)" }}>Sentry</span>
            </span>
          </Link>
        </div>

        {/* Right Side: Account Settings Dropdown */}
        <div className="navbar-user-section" ref={menuRef}>
          {user && (
            <div style={{ position: "relative" }}>
              <button 
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="btn-secondary" 
                style={{ 
                  height: "40px",
                  width: "40px",
                  padding: 0, 
                  borderRadius: "8px", 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  cursor: "pointer",
                  background: showSettingsMenu ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.02)",
                  transition: "all 0.2s ease"
                }}
                title="Account Settings"
              >
                <span style={{ fontSize: "1.2rem", lineHeight: 1 }}>⚙️</span>
              </button>

              {showSettingsMenu && (
                <div className="glass-panel settings-dropdown">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", paddingBottom: "0.75rem", borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
                    <img 
                      src={profilePhotoError ? user.imageUrl : "/api/azure/profile-photo"} 
                      alt={user.fullName || "Microsoft Account"} 
                      onError={() => setProfilePhotoError(true)}
                      style={{ 
                        width: "44px", 
                        height: "44px", 
                        borderRadius: "50%", 
                        border: "2px solid var(--accent-primary)",
                        objectFit: "cover"
                      }}
                    />
                    <div style={{ display: "flex", flexDirection: "column", textAlign: "left", overflow: "hidden" }}>
                      <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {user.fullName || user.firstName || "Connected User"}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {user.primaryEmailAddress?.emailAddress || "Microsoft Account"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", textAlign: "left" }}>
                    <span style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--text-muted)", fontWeight: 600, letterSpacing: "0.05em" }}>
                      Active Azure Tenant
                    </span>
                    <div style={{ 
                      background: "rgba(255, 255, 255, 0.02)", 
                      padding: "0.6rem 0.85rem", 
                      borderRadius: "8px", 
                      border: "1px solid rgba(255, 255, 255, 0.04)"
                    }}>
                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--accent-cyan)", wordBreak: "break-all" }}>
                        {tenantName || "Microsoft Entra Tenant"}
                      </div>
                      <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: "0.25rem", fontFamily: "monospace", wordBreak: "break-all" }}>
                        ID: {tenantId || "Fetching..."}
                      </div>
                    </div>
                  </div>

                  <button 
                    onClick={async () => {
                      await signOut();
                      window.location.href = "/sign-in";
                    }}
                    className="btn-secondary" 
                    style={{ 
                      width: "100%",
                      padding: "0.6rem", 
                      fontSize: "0.85rem", 
                      borderRadius: "8px", 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "center",
                      gap: "0.5rem",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      cursor: "pointer",
                      background: "rgba(239, 68, 68, 0.08)",
                      color: "#f87171",
                      transition: "all 0.2s ease"
                    }}
                  >
                    <span>🚪</span> Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Main Container */}
      <main className="container animate-fade-in" style={{ flex: 1, paddingBottom: "3rem" }}>
        
        {/* Error State: Clerk Microsoft Token Missing */}
        {errorSubs === "TOKEN_MISSING" && (
          <div className="glass-panel" style={{
            padding: "3rem",
            textAlign: "center",
            maxWidth: "600px",
            margin: "4rem auto 0 auto",
            border: "1px solid rgba(239, 68, 68, 0.3)"
          }}>
            <span style={{ fontSize: "3rem", display: "block", marginBottom: "1rem" }}>🔑</span>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "1rem" }}>
              Microsoft Account Required
            </h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: "2rem", fontSize: "0.95rem", lineHeight: 1.6 }}>
              To view subscription recommendations and secure scores, your Clerk account must be connected to a Microsoft Azure account.
            </p>
            <button onClick={async () => {
              await signOut();
              window.location.href = "/sign-in";
            }} className="btn-primary">
              Re-authenticate with Microsoft Account
            </button>
          </div>
        )}

        {/* Normal Loaded State */}
        {errorSubs !== "TOKEN_MISSING" && (
          <>
            {/* Header Controls */}
            <div className="header-controls">
              <div>
                <h1 style={{ fontSize: "1.75rem", fontWeight: 800 }}>Security Dashboard</h1>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                  Analyze posture assessments for CloudSentry
                </p>
              </div>

              {/* Subscription Selector */}
              <div className="form-group" style={{ minWidth: "250px", marginBottom: 0 }}>
                <label className="form-label">Select Subscription</label>
                {loadingSubs ? (
                  <div className="shimmer" style={{ height: "42px", borderRadius: "8px", width: "100%" }} />
                ) : errorSubs ? (
                  <div style={{ color: "var(--severity-high)", fontSize: "0.85rem" }}>{errorSubs}</div>
                ) : (
                  <select
                    className="form-select"
                    value={selectedSubId}
                    onChange={(e) => setSelectedSubId(e.target.value)}
                  >
                    {subscriptions.map((sub) => (
                      <option key={sub.subscriptionId} value={sub.subscriptionId}>
                        {sub.displayName} ({sub.state})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Overview / Score Grid */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "1.5rem",
              marginBottom: "2rem"
            }}>
              {/* Score Indicator */}
              <div className="glass-panel score-card">
                {loadingData ? (
                  <div className="shimmer" style={{ width: "90px", height: "90px", borderRadius: "50%" }} />
                ) : (
                  <div style={{ position: "relative", width: "90px", height: "90px" }}>
                    <svg width="90" height="90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                      <circle 
                        cx="50" 
                        cy="50" 
                        r="40" 
                        fill="none" 
                        stroke="url(#scoreGrad)" 
                        strokeWidth="8" 
                        strokeDasharray="251.2"
                        strokeDashoffset={251.2 - (251.2 * (secureScore?.percentage || 0)) / 100}
                        strokeLinecap="round"
                        transform="rotate(-90 50 50)"
                        style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)" }}
                      />
                      <defs>
                        <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="var(--accent-primary)" />
                          <stop offset="100%" stopColor="var(--accent-cyan)" />
                        </linearGradient>
                      </defs>
                    </svg>
                    <div style={{
                      position: "absolute",
                      top: 0, left: 0, right: 0, bottom: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center"
                    }}>
                      <span style={{ fontSize: "1.4rem", fontWeight: 800 }}>
                        {Math.round(secureScore?.percentage || 0)}%
                      </span>
                    </div>
                  </div>
                )}
                <div>
                  <h3 style={{ fontSize: "1.1rem", fontWeight: 700 }}>Security Posture Score</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
                    {loadingData 
                      ? "Loading score..." 
                      : `Currently completing ${secureScore?.current || 0} out of ${secureScore?.max || 0} security controls.`
                    }
                  </p>
                </div>
              </div>

              {/* Status summary cards */}
              <div className="glass-panel status-grid">
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                    Unhealthy Rules
                  </span>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, color: loadingData ? "var(--text-muted)" : "var(--severity-high)", marginTop: "0.25rem" }}>
                    {loadingData ? "..." : recommendations.filter(r => r.status === "Unhealthy").length}
                  </div>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                    High Severity
                  </span>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, color: loadingData ? "var(--text-muted)" : "var(--severity-high)", marginTop: "0.25rem" }}>
                    {loadingData ? "..." : recommendations.filter(r => r.severity === "High" && r.status === "Unhealthy").length}
                  </div>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                    Healthy Rules
                  </span>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, color: loadingData ? "var(--text-muted)" : "var(--severity-healthy)", marginTop: "0.25rem" }}>
                    {loadingData ? "..." : recommendations.filter(r => r.status === "Healthy").length}
                  </div>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase" }}>
                    Target Score
                  </span>
                  <div style={{ fontSize: "1.75rem", fontWeight: 800, color: "var(--accent-cyan)", marginTop: "0.25rem" }}>
                    100%
                  </div>
                </div>
              </div>
            </div>

            {/* Recommendations Filter Bar */}
            <div className="glass-panel" style={{
              padding: "1rem 1.5rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
              marginBottom: "1.5rem",
              borderRadius: "12px"
            }}>
              {/* Search */}
              <input
                type="text"
                placeholder="Search recommendations..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "white",
                  padding: "0.6rem 1rem",
                  borderRadius: "8px",
                  fontSize: "0.9rem",
                  width: "100%",
                  maxWidth: "350px",
                  outline: "none"
                }}
              />

              {/* Dropdown Filters */}
              <div className="filters-container">
                <div>
                  <select
                    className="form-select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                  >
                    <option value="Unhealthy">Unhealthy</option>
                    <option value="Healthy">Healthy</option>
                    <option value="All">All Statuses</option>
                  </select>
                </div>

                <div>
                  <select
                    className="form-select"
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    style={{ padding: "0.5rem 1rem", fontSize: "0.85rem" }}
                  >
                    <option value="All">All Severities</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Recommendations List */}
            {loadingData ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {[1, 2, 3, 4].map(idx => (
                  <div key={idx} className="shimmer glass-panel" style={{ height: "70px", borderRadius: "12px" }} />
                ))}
              </div>
            ) : errorData ? (
              <div className="glass-panel" style={{ padding: "2rem", textAlign: "center", color: "var(--severity-high)" }}>
                ⚠️ Error loading recommendations: {errorData}
              </div>
            ) : filteredRecs.length === 0 ? (
              <div className="glass-panel" style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
                🎉 No recommendations match your filters. Posture is secure!
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {filteredRecs.map((rec) => (
                  <div
                    key={rec.id || rec.name}
                    onClick={() => handleOpenRec(rec)}
                    className="glass-panel rec-item"
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
                        <span className={`badge ${
                          rec.status === "Healthy" ? "badge-healthy" : 
                          rec.severity === "High" ? "badge-high" :
                          rec.severity === "Medium" ? "badge-medium" : "badge-low"
                        }`}>
                          {rec.severity}
                        </span>
                        <h4 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                          {rec.displayName}
                        </h4>
                      </div>
                      <p style={{
                        color: "var(--text-secondary)",
                        fontSize: "0.85rem",
                        display: "-webkit-box",
                        WebkitLineClamp: 1,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden"
                      }}>
                        {stripHtml(rec.description) || "No description provided."}
                      </p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "1rem" }} className="rec-item-action">
                      {rec.status === "Unhealthy" && (
                        <span style={{ fontSize: "0.8rem", color: "var(--accent-primary)", fontWeight: 600 }}>
                          🤖 Generate Fix
                        </span>
                      )}
                      <span style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>→</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* AI Remediation Detail Panel Modal */}
      {selectedRec && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.8)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "1.5rem"
        }} onClick={() => setSelectedRec(null)}>
          <div 
            className="glass-panel" 
            style={{
              width: "100%",
              maxWidth: "1200px",
              maxHeight: "90vh",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              borderRadius: "16px",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.5)",
              animation: "fadeIn 0.3s ease"
            }} 
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              padding: "1.5rem",
              borderBottom: "1px solid var(--card-border)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "start"
            }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span className={`badge ${
                    selectedRec.status === "Healthy" ? "badge-healthy" : 
                    selectedRec.severity === "High" ? "badge-high" :
                    selectedRec.severity === "Medium" ? "badge-medium" : "badge-low"
                  }`}>
                    {selectedRec.severity}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "monospace" }}>
                    ID: {selectedRec.name}
                  </span>
                </div>
                <h3 style={{ fontSize: "1.25rem", fontWeight: 700 }}>{selectedRec.displayName}</h3>
              </div>
              <button 
                onClick={() => setSelectedRec(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  fontSize: "1.5rem",
                  cursor: "pointer",
                  lineHeight: 1
                }}
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: "1.5rem", flex: 1, display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {loadingAi ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div style={{ color: "var(--text-secondary)", fontSize: "0.9rem", fontStyle: "italic" }}>
                    🤖 Consulting Google Gemini & Azure OpenAI for comparative remediation details...
                  </div>
                  <div className="shimmer" style={{ height: "40px", borderRadius: "8px" }} />
                  <div className="shimmer" style={{ height: "120px", borderRadius: "8px" }} />
                </div>
              ) : errorAi ? (
                <div style={{ color: "var(--severity-high)", padding: "1rem", background: "rgba(239, 68, 68, 0.1)", borderRadius: "8px", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                  <p style={{ fontWeight: 600 }}>⚠️ AI Remediation Failed</p>
                  <p style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>{errorAi}</p>
                </div>
              ) : aiData ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
                  
                  {/* Tabs Selector */}
                  <div className="modal-tabs" style={{ marginBottom: "0.5rem" }}>
                    {(["manual", "cli", "exemption"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        style={{
                          background: "transparent",
                          border: "none",
                          borderBottom: activeTab === tab ? "2px solid var(--accent-primary)" : "2px solid transparent",
                          color: activeTab === tab ? "var(--text-primary)" : "var(--text-secondary)",
                          padding: "0.5rem 0",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          textTransform: "capitalize"
                        }}
                      >
                        {tab === "manual" ? "Manual Fix" : tab === "cli" ? "Azure CLI" : "Exemption Details"}
                      </button>
                    ))}
                  </div>

                  {/* Comparative Side-by-Side Panels Grid */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: "1.5rem"
                  }}>
                    
                    {/* LEFT PANEL: Google Gemini */}
                    <div style={{
                      background: "rgba(66, 133, 244, 0.03)",
                      border: "1px solid rgba(66, 133, 244, 0.2)",
                      borderRadius: "12px",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem"
                    }}>
                      {/* Provider Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(66, 133, 244, 0.15)", paddingBottom: "0.75rem" }}>
                        <h4 style={{ fontWeight: 700, fontSize: "1rem", color: "#4285f4" }}>Google Gemini</h4>
                        <span className="badge" style={{ background: "rgba(66, 133, 244, 0.15)", color: "#8ab4f8", fontSize: "0.7rem", fontWeight: 600 }}>Gemini 2.5 Flash</span>
                      </div>

                      {/* Content */}
                      {aiData.geminiError ? (
                        <div style={{ color: "var(--severity-high)", fontSize: "0.85rem", padding: "0.5rem 0" }}>
                          ⚠️ Provider Error: {aiData.geminiError}
                        </div>
                      ) : geminiData ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                          
                          {/* Description always shown inside panel */}
                          <div>
                            <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Assessment Summary</h5>
                            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>{geminiData.description}</p>
                          </div>

                          {/* Tab Content */}
                          {activeTab === "manual" && (
                            <div>
                              <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>Manual Clicks</h5>
                              <ol style={{ paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                {geminiData.manualFix.map((step: string, idx: number) => (
                                  <li key={idx} style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {activeTab === "cli" && (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>CLI Command</h5>
                                <button 
                                  onClick={() => handleCopy(geminiData.scriptFix.cli, "gemini-cli")}
                                  className="btn-secondary"
                                  style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                                >
                                  {copiedText === "gemini-cli" ? "Copied!" : "Copy"}
                                </button>
                              </div>
                              <pre style={{
                                background: "#08090f",
                                padding: "0.75rem",
                                borderRadius: "6px",
                                overflowX: "auto",
                                fontSize: "0.75rem",
                                fontFamily: "monospace",
                                color: "#a5b4fc"
                              }}><code>{geminiData.scriptFix.cli}</code></pre>
                            </div>
                          )}



                          {activeTab === "exemption" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                              <div>
                                <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Exemption Rationale</h5>
                                <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>{geminiData.exemptionRationale}</p>
                              </div>
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                  <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Exemption CLI</h5>
                                  <button 
                                    onClick={() => handleCopy(geminiData.exemptionCommand, "gemini-ex")}
                                    className="btn-secondary"
                                    style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                                  >
                                    {copiedText === "gemini-ex" ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                <pre style={{
                                  background: "#08090f",
                                  padding: "0.75rem",
                                  borderRadius: "6px",
                                  overflowX: "auto",
                                  fontSize: "0.75rem",
                                  fontFamily: "monospace",
                                  color: "#f43f5e"
                                }}><code>{geminiData.exemptionCommand}</code></pre>
                              </div>
                            </div>
                          )}

                        </div>
                      ) : (
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Gemini provider did not return data.</div>
                      )}
                    </div>

                    {/* RIGHT PANEL: Azure AI / OpenAI */}
                    <div style={{
                      background: "rgba(0, 120, 212, 0.03)",
                      border: "1px solid rgba(0, 120, 212, 0.2)",
                      borderRadius: "12px",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem"
                    }}>
                      {/* Provider Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid rgba(0, 120, 212, 0.15)", paddingBottom: "0.75rem" }}>
                        <h4 style={{ fontWeight: 700, fontSize: "1rem", color: "#0078d4" }}>Azure AI</h4>
                        <span className="badge" style={{ background: "rgba(0, 120, 212, 0.15)", color: "#60cdff", fontSize: "0.7rem", fontWeight: 600 }}>GPT-4o</span>
                      </div>

                      {/* Content */}
                      {aiData.azureOpenAIError ? (
                        <div style={{ color: "var(--severity-high)", fontSize: "0.85rem", padding: "0.5rem 0" }}>
                          ⚠️ Provider Error: {aiData.azureOpenAIError}
                        </div>
                      ) : azureData ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                          
                          {/* Description always shown inside panel */}
                          <div>
                            <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Assessment Summary</h5>
                            <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>{azureData.description}</p>
                          </div>

                          {/* Tab Content */}
                          {activeTab === "manual" && (
                            <div>
                              <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.5rem" }}>Manual Clicks</h5>
                              <ol style={{ paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                                {azureData.manualFix.map((step: string, idx: number) => (
                                  <li key={idx} style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>{step}</li>
                                ))}
                              </ol>
                            </div>
                          )}

                          {activeTab === "cli" && (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>CLI Command</h5>
                                <button 
                                  onClick={() => handleCopy(azureData.scriptFix.cli, "azure-cli")}
                                  className="btn-secondary"
                                  style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                                >
                                  {copiedText === "azure-cli" ? "Copied!" : "Copy"}
                                </button>
                              </div>
                              <pre style={{
                                background: "#08090f",
                                padding: "0.75rem",
                                borderRadius: "6px",
                                overflowX: "auto",
                                fontSize: "0.75rem",
                                fontFamily: "monospace",
                                color: "#a5b4fc"
                              }}><code>{azureData.scriptFix.cli}</code></pre>
                            </div>
                          )}



                          {activeTab === "exemption" && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                              <div>
                                <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "0.25rem" }}>Exemption Rationale</h5>
                                <p style={{ fontSize: "0.85rem", lineHeight: 1.5, color: "var(--text-secondary)" }}>{azureData.exemptionRationale}</p>
                              </div>
                              <div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                                  <h5 style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase" }}>Exemption CLI</h5>
                                  <button 
                                    onClick={() => handleCopy(azureData.exemptionCommand, "azure-ex")}
                                    className="btn-secondary"
                                    style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                                  >
                                    {copiedText === "azure-ex" ? "Copied!" : "Copy"}
                                  </button>
                                </div>
                                <pre style={{
                                  background: "#08090f",
                                  padding: "0.75rem",
                                  borderRadius: "6px",
                                  overflowX: "auto",
                                  fontSize: "0.75rem",
                                  fontFamily: "monospace",
                                  color: "#f43f5e"
                                }}><code>{azureData.exemptionCommand}</code></pre>
                              </div>
                            </div>
                          )}

                        </div>
                      ) : (
                        <div style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>Azure AI provider did not return data.</div>
                      )}
                    </div>
                    
                  </div>

                </div>
              ) : (
                <div style={{ color: "var(--text-secondary)" }}>No data available.</div>
              )}
            </div>

            {/* Modal Footer */}
            <div style={{
              padding: "1.25rem 1.5rem",
              borderTop: "1px solid var(--card-border)",
              display: "flex",
              justifyContent: "end"
            }}>
              <button 
                onClick={() => setSelectedRec(null)} 
                className="btn-secondary"
                style={{ padding: "0.5rem 1.5rem" }}
              >
                Close Panel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
