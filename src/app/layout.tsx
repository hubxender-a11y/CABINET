import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { WorkspaceStoreProvider } from "@/components/workspace-store";
import { AuthGate } from "@/components/auth-gate";
import { CompanyProfileProvider } from "@/components/company-profile";
import { NotificationProvider } from "@/components/notification-provider";

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
    <html
      lang="fr"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <NotificationProvider>
          <WorkspaceStoreProvider>
            <AuthGate>
              <CompanyProfileProvider>
                <AppShell>{children}</AppShell>
              </CompanyProfileProvider>
            </AuthGate>
          </WorkspaceStoreProvider>
        </NotificationProvider>
      </body>
    </html>
  );
}
