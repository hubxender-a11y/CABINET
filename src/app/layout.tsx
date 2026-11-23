import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { WorkspaceStoreProvider } from "@/components/workspace-store";
import { AuthGate } from "@/components/auth-gate";
import { CompanyProfileProvider } from "@/components/company-profile";
import { NotificationProvider } from "@/components/notification-provider";

export const metadata: Metadata = {
  title: "Cabinet Transparency | Gestion de cabinet",
  description:
    "Espace de pilotage comptable des entreprises clientes, de leur facturation, fiscalité et archivage en RDC.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="fr"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="min-h-full">
        <NotificationProvider>
          <AuthGate>
            <WorkspaceStoreProvider>
              <CompanyProfileProvider>
                <AppShell>{children}</AppShell>
              </CompanyProfileProvider>
            </WorkspaceStoreProvider>
          </AuthGate>
        </NotificationProvider>
      </body>
    </html>
  );
}
