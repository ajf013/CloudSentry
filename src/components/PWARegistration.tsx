"use client";

import { useEffect, useState } from "react";

export default function PWARegistration() {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // 0. Auto-clear cache on application updates
    if (typeof window !== "undefined") {
      const buildTime = process.env.NEXT_PUBLIC_BUILD_TIME || "dev";
      const storedBuildTime = localStorage.getItem("app_build_time");

      if (storedBuildTime && storedBuildTime !== buildTime) {
        console.log(`[Cache Manager] App version mismatch (stored: ${storedBuildTime}, current: ${buildTime}). Clearing storage and caches...`);
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
        } catch (err) {
          console.error("[Cache Manager] Failed to clear cache storage:", err);
        }
      }
      localStorage.setItem("app_build_time", buildTime);
    }

    // 1. Register Service Worker
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log("Service Worker registered with scope:", registration.scope);
          })
          .catch((err) => {
            console.error("Service Worker registration failed:", err);
          });
      });
    }

    // 2. Listen for BeforeInstallPrompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 3. Listen for appinstalled event
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
