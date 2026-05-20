import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import PWARegistration from "@/components/PWARegistration";
import "./globals.css";

import Footer from "@/components/Footer";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "CloudSentry - Cloud Security Posture Dashboard",
  description: "Detect Azure subscription security scores and get AI-powered remediation guidance.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/icon-192x192.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#6366f1",
          colorBackground: "#0d0e18",
          colorText: "#f3f4f6",
          colorTextSecondary: "#9ca3af",
          colorInputText: "#f3f4f6",
          colorInputLabel: "#f3f4f6",
        },
      }}
    >
      <html lang="en" className={`${outfit.variable}`}>
        <body>
          <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {children}
            </div>
            <Footer />
          </div>
          <PWARegistration />
        </body>
      </html>
    </ClerkProvider>
  );
}
