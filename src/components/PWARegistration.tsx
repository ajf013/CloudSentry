"use client";

import { useEffect, useState } from "react";

export default function PWARegistration() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  
  // App update states
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [newFeatures, setNewFeatures] = useState<string[]>([]);
  const [targetVersion, setTargetVersion] = useState("");
  const [isIOSPWA, setIsIOSPWA] = useState(false);

  useEffect(() => {
    // 0. Detect if running as standalone iOS PWA
    if (typeof window !== "undefined") {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;
      setIsIOSPWA(!!(isIOS && isStandalone));
    }

    // 1. Fetch current app version and check for updates
    const checkVersion = async () => {
      try {
        const res = await fetch("/app-version.json");
        if (res.ok) {
          const data = await res.json();
          const serverVersion = data.version;
          const serverFeatures = data.features || [];
          
          const localVersion = localStorage.getItem("app_version");
          
          if (!localVersion) {
            // First time landing, store current version
            localStorage.setItem("app_version", serverVersion);
          } else if (localVersion !== serverVersion) {
            // Version mismatch detected!
            setTargetVersion(serverVersion);
            setNewFeatures(serverFeatures);
            setUpdateAvailable(true);
          }
        }
      } catch (err) {
        console.error("Failed to check app version:", err);
      }
    };

    checkVersion();

    // 2. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("Service Worker registered with scope:", registration.scope);
            
            // Check for updates to the service worker file itself
            registration.addEventListener("updatefound", () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener("statechange", () => {
                  if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                    // New service worker version is ready (waiting to activate)
                    checkVersion();
                  }
                });
              }
            });
          })
          .catch((err) => {
            console.error("Service Worker registration failed:", err);
          });
      });
    }

    // 3. Listen for BeforeInstallPrompt event (Android/Chrome Desktop)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 4. Listen for appinstalled event
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
      console.log("PWA was installed successfully!");
    };

    window.addEventListener("appinstalled", handleAppInstalled);

    // Check if running in standalone display mode
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const triggerInstall = async () => {
    if (!installPrompt) return;
    
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    console.log(`User response to install prompt: ${outcome}`);
    
    if (outcome === "accepted") {
      setInstallPrompt(null);
    }
  };

  const triggerUpdate = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            caches.delete(key);
          });
        });
      }

      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => {
            registration.update();
          });
        });
      }

      localStorage.setItem("app_version", targetVersion);
      window.location.reload();
    } catch (err) {
      console.error("Failed to perform PWA update:", err);
      window.location.reload();
    }
  };

  // Render Update Prompt overlay if update is available
  if (updateAvailable) {
    return (
      <div 
        className="glass-panel" 
        style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          padding: '1.25rem',
          maxWidth: '350px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
          zIndex: 1000,
          animation: 'fadeIn 0.5s ease',
          border: '1px solid var(--accent-primary)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
        }}
      >
        <div>
          <h4 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            🚀 New Version Available ({targetVersion})
          </h4>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            An update has been released with the following changes:
          </p>
          {newFeatures.length > 0 && (
            <ul style={{ paddingLeft: '1.1rem', margin: '0 0 0.5rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {newFeatures.map((feature, i) => (
                <li key={i} style={{ marginBottom: '0.25rem' }}>{feature}</li>
              ))}
            </ul>
          )}
        </div>

        {isIOSPWA ? (
          <div style={{ 
            padding: '0.5rem 0.75rem', 
            background: 'rgba(239, 68, 68, 0.05)', 
            border: '1px solid rgba(239, 68, 68, 0.15)', 
            borderRadius: '6px' 
          }}>
            <p style={{ color: '#f87171', fontSize: '0.7rem', lineHeight: 1.3, margin: 0 }}>
              <strong>iPhone Bookmark Notice:</strong> Safari home-screen bookmarks do not update files in place automatically. Please delete this app from your home screen and re-add it to enjoy the new features.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={triggerUpdate}
              className="btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', flex: 1 }}
            >
              Update & Refresh
            </button>
            <button 
              onClick={() => setUpdateAvailable(false)}
              className="btn-secondary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
            >
              Later
            </button>
          </div>
        )}
      </div>
    );
  }

  // Fallback to Install Prompt if not installed and prompt is captured
  if (isInstalled || !installPrompt) {
    return null;
  }

  return (
    <div 
      className="glass-panel" 
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        padding: '1.25rem',
        maxWidth: '350px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        zIndex: 1000,
        animation: 'fadeIn 0.5s ease',
        border: '1px solid rgba(99, 102, 241, 0.4)'
      }}
    >
      <div>
        <h4 style={{ color: 'var(--text-primary)', fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          ✨ Install CloudSentry App
        </h4>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
          Install this app on your device for quick dashboard access, desktop launch, and offline security reviews.
        </p>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button 
          onClick={triggerInstall}
          className="btn-primary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.8rem', flex: 1 }}
        >
          Install App
        </button>
        <button 
          onClick={() => setInstallPrompt(null)}
          className="btn-secondary"
          style={{ padding: '0.5rem 1rem', fontSize: '0.8rem' }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
