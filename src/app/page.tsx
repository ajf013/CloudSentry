"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/nextjs";
import DefenderLogo from "@/components/DefenderLogo";

export default function Home() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut } = useClerk();

  // Settings menu states
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [profilePhotoError, setProfilePhotoError] = useState(false);
  const [tenantName, setTenantName] = useState<string>("");
  const [tenantId, setTenantId] = useState<string>("");
  const [clerkTimeout, setClerkTimeout] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const menuRef = useRef<HTMLDivElement>(null);

  // Load and apply theme on mount
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
    if (savedTheme) {
      setTheme(savedTheme);
      if (savedTheme === "light") {
        document.body.classList.add("light-theme");
      } else {
        document.body.classList.remove("light-theme");
      }
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    if (newTheme === "light") {
      document.body.classList.add("light-theme");
    } else {
      document.body.classList.remove("light-theme");
    }
  };

  // Check for tenant validation error query parameter
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("error") === "no_active_tenant") {
        setAuthError("Your Microsoft account does not have an active Azure tenant. Please connect with an account that has an active tenant.");
        if (isSignedIn) {
          signOut().catch(err => console.error("Auto sign out failed:", err));
        }
      }
    }
  }, [isSignedIn]);

  // Check if Clerk takes too long to load (likely due to missing env variables)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isLoaded) {
        setClerkTimeout(true);
      }
    }, 6000);
    return () => clearTimeout(timer);
  }, [isLoaded]);

  // Fetch Tenant Info on mount
  useEffect(() => {
    async function loadTenant() {
      try {
        const res = await fetch("/api/azure/tenant");
        if (res.ok) {
          const data = await res.json();
          setTenantName(data.displayName);
          setTenantId(data.tenantId);
        }
      } catch (e) {
        console.error("Failed to load tenant info", e);
      }
    }
    if (isSignedIn) {
      loadTenant();
    }
  }, [isSignedIn]);

  // Click outside to close settings menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowSettingsMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {authError && (
        <div style={{
          background: "rgba(239, 68, 68, 0.15)",
          borderBottom: "1px solid rgba(239, 68, 68, 0.25)",
          color: "#f87171",
          padding: "0.85rem 1.5rem",
          fontSize: "0.85rem",
          textAlign: "center",
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          zIndex: 1000
        }}>
          <span>⚠️</span>
          <span>{authError}</span>
          <button 
            onClick={() => setAuthError(null)} 
            style={{ 
              background: "transparent", 
              border: "none", 
              color: "#f87171", 
              cursor: "pointer", 
              marginLeft: "1rem", 
              fontSize: "1.2rem", 
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
      )}
      {/* Header */}
      <header className="glass-panel home-header">
        {/* Left Section: Spacer to center the logo + button */}
        <div className="home-header-left" />

        {/* Center Section: Brand logo/title and Go to Dashboard button */}
        <div className="home-header-center">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <DefenderLogo size={32} />
            <span style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>
              Cloud<span style={{ color: 'var(--accent-cyan)' }}>Sentry</span>
            </span>
          </div>

          {isLoaded && isSignedIn && (
            <Link href="/dashboard" className="btn-primary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
              Go to Dashboard
            </Link>
          )}
        </div>
        
        {/* Right Section: Settings Gear or Sign In */}
        <div className="home-header-right" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} ref={menuRef}>
          {/* Theme Toggle Button */}
          <button 
            onClick={toggleTheme}
            className="btn-secondary" 
            style={{ 
              height: "38px",
              width: "38px",
              padding: 0, 
              borderRadius: "8px", 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              cursor: "pointer",
              background: "rgba(255, 255, 255, 0.02)",
              transition: "all 0.2s ease"
            }}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            <span style={{ fontSize: "1rem" }}>{theme === "dark" ? "☀️" : "🌙"}</span>
          </button>

          {!isLoaded ? (
            clerkTimeout ? (
              <span style={{ fontSize: "0.75rem", color: "#f87171", display: "inline-flex", alignItems: "center", gap: "0.25rem" }} title="Verify Clerk credentials in Netlify configuration">
                ⚠️ Auth Offline
              </span>
            ) : (
              <div className="shimmer" style={{ width: "80px", height: "35px", borderRadius: "8px" }} />
            )
          ) : isSignedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', position: 'relative' }}>
              <button 
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                className="btn-secondary" 
                style={{ 
                  height: "38px",
                  width: "38px",
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

              {showSettingsMenu && user && (
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
                    style={{
                      width: "100%",
                      padding: "0.75rem",
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
          ) : (
            <Link href="/sign-in" className="btn-secondary" style={{ padding: '0.5rem 1.25rem', fontSize: '0.85rem' }}>
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1.5rem',
        textAlign: 'center',
        maxWidth: '1000px',
        margin: '0 auto'
      }} className="animate-fade-in">
        {/* Glow Element */}
        <div style={{
          position: 'absolute',
          top: '25%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '500px',
          height: '500px',
          background: 'var(--primary-glow)',
          pointerEvents: 'none',
          zIndex: -1,
          animation: 'pulse-glow 8s infinite alternate'
        }} />

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 1rem',
          borderRadius: '9999px',
          background: 'rgba(99, 102, 241, 0.1)',
          border: '1px solid rgba(99, 102, 241, 0.25)',
          color: 'var(--accent-primary)',
          fontSize: '0.8rem',
          fontWeight: 600,
          marginBottom: '2rem'
        }}>
          <span>🤖 Powered by Gemini 2.5 & Azure OpenAI (GPT-4o)</span>
        </div>

        <h1 style={{
          fontSize: 'clamp(2.5rem, 6vw, 4.5rem)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.03em',
          marginBottom: '1.5rem',
          background: 'var(--hero-text-gradient)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent'
        }}>
          Secure Your Azure Environment
        </h1>

        <p style={{
          fontSize: 'clamp(1rem, 3vw, 1.25rem)',
          color: 'var(--text-secondary)',
          maxWidth: '650px',
          marginBottom: '3rem',
          lineHeight: 1.6
        }}>
          Connect your Microsoft Tenant to fetch your CloudSentry security score, view recommendations, and generate instant, clear step-by-step AI remediation instructions.
        </p>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', flexDirection: clerkTimeout ? 'column' : 'row', alignItems: 'center' }}>
          {!isLoaded ? (
            clerkTimeout ? (
              <div className="glass-panel" style={{ padding: '1rem 1.5rem', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.02)', borderRadius: '8px', maxWidth: '420px', textAlign: 'center' }}>
                <p style={{ color: '#f87171', fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  ⚠️ Authentication Configuration Offline
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', lineHeight: 1.4 }}>
                  Clerk is taking longer than expected to load. Please verify that your environment variables (<code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> and <code>CLERK_SECRET_KEY</code>) are correctly set in Netlify.
                </p>
              </div>
            ) : (
              <div className="shimmer" style={{ width: "200px", height: "48px", borderRadius: "8px" }} />
            )
          ) : isSignedIn ? (
            <Link href="/dashboard" className="btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.05rem' }}>
              Launch App Dashboard
            </Link>
          ) : (
            <Link href="/sign-in" className="btn-primary" style={{ padding: '1rem 2rem', fontSize: '1.05rem' }}>
              Connect Azure Tenant
            </Link>
          )}
          <a href="#features" className="btn-secondary" style={{ padding: '1rem 2rem', fontSize: '1.05rem' }}>
            Learn More
          </a>
        </div>

        {/* Features Section */}
        <section id="features" style={{
          marginTop: '6rem',
          width: '100%',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.5rem',
          textAlign: 'left'
        }}>
          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📈</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Live Security Score</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Instantly fetch your Azure tenant secure score and view target recommendations to improve posture.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🧠</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>AI Remediation</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Generate step-by-step UI actions and copy-pasteable Azure CLI scripts using comparative Gemini and Azure OpenAI panels.
            </p>
          </div>

          <div className="glass-panel" style={{ padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🔕</div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Guided Exemptions</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Know exactly when a policy doesn't apply and get CLI scripts to register policy exemptions safely.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
