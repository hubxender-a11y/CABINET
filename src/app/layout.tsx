import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { WorkspaceStoreProvider } from "@/components/workspace-store";
import { AuthGate } from "@/components/auth-gate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FACTURA RDC",
  description: "Plateforme intelligente de facturation et gestion commerciale pour la RDC",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-100 text-slate-900">
        <WorkspaceStoreProvider>
          <AuthGate>
            <AppShell>{children}</AppShell>
          </AuthGate>
        </WorkspaceStoreProvider>
      </body>
    </html>
  );
}
