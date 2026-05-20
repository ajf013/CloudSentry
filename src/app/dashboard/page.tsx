// src/app/dashboard/page.tsx
"use client";
import { useEffect, useState, startTransition, useRef } from "react";
import { UserButton, useUser, useClerk } from "@clerk/nextjs";
import Link from "next/link";
import DefenderLogo from "@/components/DefenderLogo";
import SecurityTrendChart from "@/components/SecurityTrendChart";


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
    bicep?: string;
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

const getFallbackTerraform = (displayName: string) => {
  const resourceName = displayName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").substring(0, 30);
  return `# CloudSentry Auto-Generated Terraform Fix
# Recommendation: ${displayName}

resource "azurerm_security_center_assessment" "${resourceName}" {
  assessment_policy_id = "/providers/Microsoft.Security/assessmentMetadata/${resourceName}"
  target_resource_id   = "/subscriptions/sub-id-placeholder"
  status {
    code = "Healthy"
  }
}
`;
};

const getFallbackBicep = (displayName: string) => {
  const resourceName = displayName.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").substring(0, 30);
  return `// CloudSentry Auto-Generated Bicep Fix
// Recommendation: ${displayName}

targetScope = 'subscription'

resource assessment 'Microsoft.Security/assessments@2021-06-01' = {
  name: '${resourceName}'
  properties: {
    status: {
      code: 'Healthy'
    }
  }
}
`;
};

const MOCK_TENANTS = [
  {
    id: "3a8f6d19-b2c4-4e78-9a3d-c5f6b7e8d9a0",
    displayName: "Contoso Enterprise Security",
    secureScore: { current: 34, max: 50, percentage: 68 },
    subscriptions: [
      { id: "sub-1", subscriptionId: "c87a5b39-1234-5678-abcd-ef1234567890", displayName: "Contoso Production Subscription", state: "Enabled" },
      { id: "sub-2", subscriptionId: "d98b6c40-2345-6789-bcde-f23456789012", displayName: "Contoso Staging & Sandbox", state: "Enabled" }
    ],
    recommendations: [
      { id: "rec-1", name: "mfa", status: "Unhealthy", displayName: "MFA should be enabled on accounts with owner permissions on your subscription", severity: "High", description: "Multi-factor authentication (MFA) should be enabled for all subscription owners...", remediation: "Enable MFA in Entra ID Portal.", categories: ["Identity"], scoreWeight: 10 },
      { id: "rec-2", name: "storage_firewall", status: "Unhealthy", displayName: "Storage accounts should restrict network access using virtual network rules", severity: "Medium", description: "Protect your storage accounts by allowing access only from specified networks...", remediation: "Configure firewall settings in Azure Storage Account.", categories: ["Storage"], scoreWeight: 5 },
      { id: "rec-3", name: "sql_auditing", status: "Healthy", displayName: "SQL servers should have vulnerability assessment enabled", severity: "Low", description: "Configure vulnerability assessment on your SQL servers...", remediation: "Enable SQL vulnerability assessment.", categories: ["SQL Database"], scoreWeight: 2 }
    ]
  },
  {
    id: "8b7c6d5e-4a3b-2c1d-0e9f-8a7b6c5d4e3f",
    displayName: "Fabrikam Global Cloud",
    secureScore: { current: 15, max: 35, percentage: 42 },
    subscriptions: [
      { id: "sub-3", subscriptionId: "e01c2d3e-3456-7890-cdef-012345678901", displayName: "Fabrikam Core Infrastructure", state: "Enabled" },
      { id: "sub-4", subscriptionId: "f12d3e4f-4567-8901-def0-123456789012", displayName: "Fabrikam Legacy Applications", state: "Enabled" }
    ],
    recommendations: [
      { id: "rec-4", name: "public_ip_vm", status: "Unhealthy", displayName: "Virtual machines should not be public to the internet", severity: "High", description: "Restrict public IP addresses from being associated with virtual machines...", remediation: "Remove public IP association or restrict NSG rules.", categories: ["Compute"], scoreWeight: 15 },
      { id: "rec-5", name: "tls_web_app", status: "Unhealthy", displayName: "Web Application should only be accessible over HTTPS", severity: "Medium", description: "Enforce HTTPS redirection and use TLS 1.2+ for Web Applications...", remediation: "Set HTTPS Only to True in App Service configuration.", categories: ["App Service"], scoreWeight: 8 },
      { id: "rec-6", name: "keyvault_purge", status: "Unhealthy", displayName: "Key Vaults should have purge protection enabled", severity: "Medium", description: "Enable purge protection to prevent permanent deletion of secrets...", remediation: "Enable purge protection via PowerShell/CLI.", categories: ["Key Vault"], scoreWeight: 6 }
    ]
  },
  {
    id: "0a1b2c3d-4e5f-6a7b-8c9d-0e1f2a3b4c5d",
    displayName: "Acme Gov Cloud Sandbox",
    secureScore: { current: 40, max: 45, percentage: 89 },
    subscriptions: [
      { id: "sub-5", subscriptionId: "a09b8c7d-5678-9012-ef01-234567890123", displayName: "Acme Federal Gov Core", state: "Enabled" }
    ],
    recommendations: [
      { id: "rec-7", name: "aks_authorized_ip", status: "Unhealthy", displayName: "API server authorized IP ranges should be defined on Azure Kubernetes Service", severity: "High", description: "Restrict access to the AKS API server by defining authorized IP ranges...", remediation: "Configure authorized IP ranges in AKS cluster settings.", categories: ["Kubernetes"], scoreWeight: 12 },
      { id: "rec-8", name: "acr_admin_user", status: "Healthy", displayName: "Admin user should be disabled for Container Registries", severity: "Medium", description: "Disable admin user to restrict credentials sharing...", remediation: "Disable admin user on ACR.", categories: ["Container Registry"], scoreWeight: 4 }
    ]
  }
];

function renderMarkdown(text: string) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    // Code blocks
    if (line.startsWith("```")) {
      return null;
    }
    // Headers
    if (line.startsWith("### ")) {
      return <h4 key={i} style={{ color: "var(--accent-primary)", marginTop: "1rem", marginBottom: "0.5rem", fontSize: "1rem", fontWeight: 700 }}>{line.replace("### ", "")}</h4>;
    }
    if (line.startsWith("## ")) {
      return <h3 key={i} style={{ color: "var(--accent-primary)", marginTop: "1.25rem", marginBottom: "0.5rem", fontSize: "1.15rem", fontWeight: 700 }}>{line.replace("## ", "")}</h3>;
    }
    if (line.startsWith("# ")) {
      return <h2 key={i} style={{ color: "var(--accent-primary)", marginTop: "1.5rem", marginBottom: "0.5rem", fontSize: "1.25rem", fontWeight: 800 }}>{line.replace("# ", "")}</h2>;
    }
    // Bold highlights
    if (line.startsWith("**") && line.endsWith("**")) {
      return <strong key={i} style={{ display: "block", color: "var(--text-primary)", marginTop: "0.5rem" }}>{line.slice(2, -2)}</strong>;
    }
    // List item
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      return (
        <li key={i} style={{ marginLeft: "1.25rem", color: "var(--text-secondary)", marginBottom: "0.25rem", fontSize: "0.85rem" }}>
          {line.trim().substring(2)}
        </li>
      );
    }
    // Code lines
    if (line.trim().startsWith("`") && line.trim().endsWith("`")) {
      return (
        <code key={i} style={{ background: "rgba(255,255,255,0.08)", padding: "0.2rem 0.4rem", borderRadius: "4px", fontSize: "0.8rem", fontFamily: "monospace", display: "inline-block", margin: "0.2rem 0" }}>
          {line.trim().slice(1, -1)}
        </code>
      );
    }
    return <p key={i} style={{ marginBottom: "0.5rem", fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>{line}</p>;
  });
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
  const [allTenants, setAllTenants] = useState<any[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  
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
  const [activeTab, setActiveTab] = useState<"manual" | "cli" | "exemption" | "iac">("manual");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [profilePhotoError, setProfilePhotoError] = useState(false);
  const [activeIacFormat, setActiveIacFormat] = useState<"terraform" | "bicep">("terraform");

  const geminiData = aiData?.gemini || null;
  const azureData = aiData?.azureOpenAI || null;

  // Copilot State
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);
  const [copilotMessages, setCopilotMessages] = useState<Array<{ sender: "user" | "copilot", text: string }>>([
    {
      sender: "copilot",
      text: "Hello! I am your AI Security Copilot. I can help analyze your CloudSentry posture, explain recommendations, or generate remediation code templates. What would you like to do?"
    }
  ]);
  const [copilotInput, setCopilotInput] = useState("");
  const [loadingCopilot, setLoadingCopilot] = useState(false);

  const handleSendCopilotMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!copilotInput.trim() || loadingCopilot) return;

    const userMessage = copilotInput.trim();
    setCopilotMessages(prev => [...prev, { sender: "user", text: userMessage }]);
    setCopilotInput("");
    setLoadingCopilot(true);

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: userMessage,
          context: {
            tenantName,
            tenantId,
            selectedSubId,
            secureScore,
            recommendationCount: recommendations.length,
            unhealthyCount: recommendations.filter(r => r.status === "Unhealthy").length
          }
        })
      });

      if (!res.ok) {
        throw new Error("Failed to get response from Security Copilot");
      }

      const data = await res.json();
      
      // Keep models separate so user can view response side by side / comparison
      let copilotText = "";
      if (data.gemini && data.azureOpenAI) {
        copilotText = `### Gemini Model Response\n${data.gemini}\n\n### Azure OpenAI Model Response\n${data.azureOpenAI}`;
      } else {
        copilotText = data.gemini || data.azureOpenAI || "Sorry, I was unable to generate a response. Please try again.";
      }

      setCopilotMessages(prev => [...prev, { sender: "copilot", text: copilotText }]);
    } catch (err: any) {
      console.error(err);
      setCopilotMessages(prev => [...prev, { sender: "copilot", text: `Error: ${err.message || "Something went wrong."}` }]);
    } finally {
      setLoadingCopilot(false);
    }
  };
  // Fetch Tenant Info on mount
  useEffect(() => {
    async function loadTenant() {
      try {
        const res = await fetch("/api/azure/tenant");
        if (res.ok) {
          const data = await res.json();
          setTenantName(data.displayName);
          setTenantId(data.tenantId);
          const liveTenant = {
            id: data.tenantId,
            displayName: data.displayName || "Default Live Directory",
            isLive: true
          };
          setAllTenants([liveTenant, ...MOCK_TENANTS]);
          setSelectedTenantId(data.tenantId);
        } else {
          setTenantName("Unconnected");
          setTenantId("unconnected-tenant");
          const unconnectedTenant = {
            id: "unconnected-tenant",
            displayName: "Unconnected Directory",
            isLive: true
          };
          setAllTenants([unconnectedTenant, ...MOCK_TENANTS]);
          setSelectedTenantId("unconnected-tenant");
        }
      } catch (err) {
        console.error("Failed to load tenant info:", err);
        setTenantName("Error");
        setTenantId("error-tenant");
        const errorTenant = {
          id: "error-tenant",
          displayName: "Error Directory",
          isLive: true
        };
        setAllTenants([errorTenant, ...MOCK_TENANTS]);
        setSelectedTenantId("error-tenant");
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

  // 1. Fetch Subscriptions when Tenant changes
  useEffect(() => {
    if (!selectedTenantId) return;

    // Check if selectedTenantId is a mock tenant
    const mockTenant = MOCK_TENANTS.find((t) => t.id === selectedTenantId);
    if (mockTenant) {
      setSubscriptions(mockTenant.subscriptions);
      if (mockTenant.subscriptions.length > 0) {
        setSelectedSubId(mockTenant.subscriptions[0].subscriptionId);
      }
      setTenantName(mockTenant.displayName);
      setTenantId(mockTenant.id);
      setLoadingSubs(false);
      return;
    }

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
        // Restore active live directory name
        const liveTenant = allTenants.find(t => t.id === selectedTenantId);
        if (liveTenant) {
          setTenantName(liveTenant.displayName);
          setTenantId(liveTenant.id);
        }
      } catch (err: any) {
        console.error(err);
        setErrorSubs(err.message || "An unexpected error occurred");
      } finally {
        setLoadingSubs(false);
      }
    }
    loadSubs();
  }, [selectedTenantId, allTenants]);

  // 2. Fetch Dashboard Data when selected Subscription changes
  useEffect(() => {
    if (!selectedSubId) return;

    const mockTenant = MOCK_TENANTS.find((t) => t.id === selectedTenantId);
    if (mockTenant) {
      setSecureScore(mockTenant.secureScore);
      setRecommendations(mockTenant.recommendations);
      setLoadingData(false);
      return;
    }

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
  }, [selectedSubId, selectedTenantId]);

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

  const handleDownload = (filename: string, text: string) => {
    const element = document.createElement("a");
    const file = new Blob([text], { type: "text/plain" });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
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

              {/* Tenant / Directory Switcher */}
              <div className="form-group" style={{ minWidth: "220px", marginBottom: 0 }}>
                <label className="form-label">Directory (Tenant)</label>
                {loadingSubs ? (
                  <div className="shimmer" style={{ height: "42px", borderRadius: "8px", width: "100%" }} />
                ) : (
                  <select
                    className="form-select"
                    value={selectedTenantId}
                    onChange={(e) => setSelectedTenantId(e.target.value)}
                    style={{
                      borderColor: "rgba(99, 102, 241, 0.4)",
                      background: "rgba(99, 102, 241, 0.05)"
                    }}
                  >
                    {allTenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.displayName} {t.isLive ? "(Live)" : "(Mock)"}
                      </option>
                    ))}
                  </select>
                )}
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

            {/* Historical Score Tracking & Charting */}
            <div style={{ marginBottom: "2rem" }}>
              <SecurityTrendChart currentScore={secureScore?.percentage || 0} />
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
                    {(["manual", "cli", "exemption", "iac"] as const).map((tab) => (
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
                          textTransform: "capitalize",
                          marginRight: "1rem"
                        }}
                      >
                        {tab === "manual" ? "Manual Fix" : tab === "cli" ? "Azure CLI" : tab === "exemption" ? "Exemption Details" : "IaC Generator"}
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

                          {activeTab === "iac" && (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", background: "rgba(255,255,255,0.03)", padding: "0.25rem 0.5rem", borderRadius: "6px" }}>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                  {(["terraform", "bicep"] as const).map((fmt) => (
                                    <button
                                      key={fmt}
                                      onClick={() => setActiveIacFormat(fmt)}
                                      className={activeIacFormat === fmt ? "btn-primary" : "btn-secondary"}
                                      style={{ padding: "0.15rem 0.5rem", fontSize: "0.7rem", textTransform: "capitalize" }}
                                    >
                                      {fmt}
                                    </button>
                                  ))}
                                </div>
                                <div style={{ display: "flex", gap: "0.4rem" }}>
                                  <button
                                    onClick={() => {
                                      const text = activeIacFormat === "terraform" 
                                        ? (geminiData.scriptFix?.terraform || getFallbackTerraform(selectedRec?.displayName || "")) 
                                        : (geminiData.scriptFix?.bicep || getFallbackBicep(selectedRec?.displayName || ""));
                                      handleCopy(text, `gemini-${activeIacFormat}`);
                                    }}
                                    className="btn-secondary"
                                    style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                                  >
                                    {copiedText === `gemini-${activeIacFormat}` ? "Copied!" : "Copy"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      const text = activeIacFormat === "terraform" 
                                        ? (geminiData.scriptFix?.terraform || getFallbackTerraform(selectedRec?.displayName || "")) 
                                        : (geminiData.scriptFix?.bicep || getFallbackBicep(selectedRec?.displayName || ""));
                                      handleDownload(`remediation.${activeIacFormat === "terraform" ? "tf" : "bicep"}`, text);
                                    }}
                                    className="btn-secondary"
                                    style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem", borderColor: "var(--accent-primary)", color: "var(--accent-primary)" }}
                                  >
                                    Download
                                  </button>
                                </div>
                              </div>
                              <pre style={{
                                background: "#08090f",
                                padding: "0.75rem",
                                borderRadius: "6px",
                                overflowX: "auto",
                                fontSize: "0.75rem",
                                fontFamily: "monospace",
                                color: "#34d399",
                                maxHeight: "250px"
                              }}><code>{
                                activeIacFormat === "terraform"
                                  ? (geminiData.scriptFix?.terraform || getFallbackTerraform(selectedRec?.displayName || ""))
                                  : (geminiData.scriptFix?.bicep || getFallbackBicep(selectedRec?.displayName || ""))
                              }</code></pre>
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

                          {activeTab === "iac" && (
                            <div>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", background: "rgba(255,255,255,0.03)", padding: "0.25rem 0.5rem", borderRadius: "6px" }}>
                                <div style={{ display: "flex", gap: "0.5rem" }}>
                                  {(["terraform", "bicep"] as const).map((fmt) => (
                                    <button
                                      key={fmt}
                                      onClick={() => setActiveIacFormat(fmt)}
                                      className={activeIacFormat === fmt ? "btn-primary" : "btn-secondary"}
                                      style={{ padding: "0.15rem 0.5rem", fontSize: "0.7rem", textTransform: "capitalize" }}
                                    >
                                      {fmt}
                                    </button>
                                  ))}
                                </div>
                                <div style={{ display: "flex", gap: "0.4rem" }}>
                                  <button
                                    onClick={() => {
                                      const text = activeIacFormat === "terraform" 
                                        ? (azureData.scriptFix?.terraform || getFallbackTerraform(selectedRec?.displayName || "")) 
                                        : (azureData.scriptFix?.bicep || getFallbackBicep(selectedRec?.displayName || ""));
                                      handleCopy(text, `azure-${activeIacFormat}`);
                                    }}
                                    className="btn-secondary"
                                    style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem" }}
                                  >
                                    {copiedText === `azure-${activeIacFormat}` ? "Copied!" : "Copy"}
                                  </button>
                                  <button
                                    onClick={() => {
                                      const text = activeIacFormat === "terraform" 
                                        ? (azureData.scriptFix?.terraform || getFallbackTerraform(selectedRec?.displayName || "")) 
                                        : (azureData.scriptFix?.bicep || getFallbackBicep(selectedRec?.displayName || ""));
                                      handleDownload(`remediation.${activeIacFormat === "terraform" ? "tf" : "bicep"}`, text);
                                    }}
                                    className="btn-secondary"
                                    style={{ padding: "0.15rem 0.4rem", fontSize: "0.7rem", borderColor: "var(--accent-primary)", color: "var(--accent-primary)" }}
                                  >
                                    Download
                                  </button>
                                </div>
                              </div>
                              <pre style={{
                                background: "#08090f",
                                padding: "0.75rem",
                                borderRadius: "6px",
                                overflowX: "auto",
                                fontSize: "0.75rem",
                                fontFamily: "monospace",
                                color: "#34d399",
                                maxHeight: "250px"
                              }}><code>{
                                activeIacFormat === "terraform"
                                  ? (azureData.scriptFix?.terraform || getFallbackTerraform(selectedRec?.displayName || ""))
                                  : (azureData.scriptFix?.bicep || getFallbackBicep(selectedRec?.displayName || ""))
                              }</code></pre>
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
      {/* Copilot Floating Trigger Button */}
      <button
        onClick={() => setIsCopilotOpen(!isCopilotOpen)}
        style={{
          position: "fixed",
          bottom: "2rem",
          right: "2rem",
          width: "60px",
          height: "60px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, #6366f1 0%, #a855f7 100%)",
          color: "white",
          border: "none",
          cursor: "pointer",
          boxShadow: "0 4px 20px rgba(168, 85, 247, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
          transition: "all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
          transform: isCopilotOpen ? "rotate(135deg) scale(0.9)" : "rotate(0deg) scale(1)",
        }}
        title="Security Copilot"
      >
        {isCopilotOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z"/>
            <path d="M12 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm0 5v7"/>
          </svg>
        )}
      </button>

      {/* Copilot Drawer Panel */}
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(480px, 100vw)",
        background: "rgba(10, 11, 18, 0.95)",
        backdropFilter: "blur(20px)",
        borderLeft: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "-10px 0 30px rgba(0,0,0,0.5)",
        zIndex: 9998,
        display: "flex",
        flexDirection: "column",
        transform: isCopilotOpen ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
      }}>
        {/* Header */}
        <div style={{
          padding: "1.25rem 1.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "rgba(99, 102, 241, 0.05)"
        }}>
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#34d399",
                boxShadow: "0 0 8px #34d399"
              }} />
              AI Security Copilot
            </h3>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Interactive Security Analyst</span>
          </div>
          <button
            onClick={() => setIsCopilotOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-secondary)",
              cursor: "pointer",
              padding: "0.25rem"
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Messages List */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "1.5rem",
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem"
        }}>
          {copilotMessages.map((msg, index) => (
            <div
              key={index}
              style={{
                display: "flex",
                justifyContent: msg.sender === "user" ? "flex-end" : "flex-start",
                width: "100%"
              }}
            >
              <div style={{
                maxWidth: "85%",
                padding: "0.85rem 1.1rem",
                borderRadius: "12px",
                fontSize: "0.85rem",
                lineHeight: "1.5",
                background: msg.sender === "user" 
                  ? "linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(168, 85, 247, 0.25) 100%)"
                  : "rgba(255, 255, 255, 0.04)",
                border: msg.sender === "user"
                  ? "1px solid rgba(168, 85, 247, 0.3)"
                  : "1px solid rgba(255, 255, 255, 0.06)",
                color: "var(--text-primary)",
              }}>
                {msg.sender === "copilot" ? renderMarkdown(msg.text) : msg.text}
              </div>
            </div>
          ))}

          {loadingCopilot && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 1rem", color: "var(--text-secondary)", fontSize: "0.8rem" }}>
              <div className="shimmer" style={{ width: "12px", height: "12px", borderRadius: "50%" }} />
              <span>Copilot is analyzing details...</span>
            </div>
          )}
        </div>

        {/* Quick Prompts Chip/List */}
        <div style={{
          padding: "0.5rem 1rem",
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
          background: "rgba(0,0,0,0.1)",
          borderTop: "1px solid rgba(255,255,255,0.04)",
          whiteSpace: "nowrap"
        }}>
          {[
            "Explain lowest score",
            "Terraform code for public VM",
            "Is key vault secure?",
            "How to fix Web App SSL"
          ].map((prompt, pIdx) => (
            <button
              key={pIdx}
              onClick={() => {
                setCopilotInput(prompt);
                setTimeout(() => {
                  setCopilotMessages(prev => [...prev, { sender: "user", text: prompt }]);
                  setLoadingCopilot(true);
                  fetch("/api/copilot", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      prompt: prompt,
                      context: {
                        tenantName,
                        tenantId,
                        selectedSubId,
                        secureScore,
                        recommendationCount: recommendations.length,
                        unhealthyCount: recommendations.filter(r => r.status === "Unhealthy").length
                      }
                    })
                  }).then(r => r.json()).then(data => {
                    let copilotText = "";
                    if (data.gemini && data.azureOpenAI) {
                      copilotText = `### Gemini Model Response\n${data.gemini}\n\n### Azure OpenAI Model Response\n${data.azureOpenAI}`;
                    } else {
                      copilotText = data.gemini || data.azureOpenAI || "Sorry, I was unable to generate a response. Please try again.";
                    }
                    setCopilotMessages(prev => [...prev, { sender: "copilot", text: copilotText }]);
                  }).catch(e => {
                    setCopilotMessages(prev => [...prev, { sender: "copilot", text: `Error: ${e.message}` }]);
                  }).finally(() => setLoadingCopilot(false));
                }, 50);
                setCopilotInput("");
              }}
              style={{
                padding: "0.35rem 0.75rem",
                borderRadius: "15px",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "var(--text-secondary)",
                fontSize: "0.75rem",
                cursor: "pointer",
                transition: "all 0.2s ease"
              }}
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSendCopilotMessage} style={{
          padding: "1rem 1.25rem",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(10, 11, 18, 0.98)",
          display: "flex",
          gap: "0.75rem"
        }}>
          <input
            type="text"
            value={copilotInput}
            onChange={(e) => setCopilotInput(e.target.value)}
            placeholder="Ask about recommendations or security templates..."
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              padding: "0.65rem 1rem",
              color: "white",
              fontSize: "0.85rem",
              outline: "none"
            }}
          />
          <button
            type="submit"
            disabled={loadingCopilot}
            className="btn-primary"
            style={{
              padding: "0.65rem 1.25rem",
              borderRadius: "8px",
              fontSize: "0.85rem",
              boxShadow: "none"
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
