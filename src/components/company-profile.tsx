"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiRequest } from "@/lib/api";

export type CompanyProfile = {
  id: string;
  legalName: string;
  tradeName: string | null;
  rccm: string | null;
  nin: string | null;
  nif: string | null;
  taxId: string | null;
  address: string | null;
  province: string | null;
  city: string | null;
  commune: string | null;
  phone: string | null;
  email: string | null;
  sector: string | null;
  taxRegime: string | null;
  vatStatus: string | null;
  currencyCode: "CDF" | "USD";
};

export type CompanyProfileChanges = Omit<CompanyProfile, "id">;

type CompanyProfileContextValue = {
  profile: CompanyProfile | null;
  loading: boolean;
  error: string;
  refreshProfile: () => Promise<CompanyProfile>;
  saveProfile: (changes: CompanyProfileChanges) => Promise<CompanyProfile>;
};

const CompanyProfileContext =
  createContext<CompanyProfileContextValue | null>(null);

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Impossible de charger les paramètres du cabinet.";
}

export function CompanyProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshProfile = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const current = await apiRequest<CompanyProfile>("/company");
      setProfile(current);
      return current;
    } catch (caught) {
      const message = errorMessage(caught);
      setError(message);
      throw caught;
    } finally {
      setLoading(false);
    }
  }, []);

  const saveProfile = useCallback(
    async (changes: CompanyProfileChanges) => {
      setError("");
      try {
        const updated = await apiRequest<CompanyProfile>("/company", {
          method: "PATCH",
          body: JSON.stringify(changes),
        });
        setProfile(updated);
        if ("BroadcastChannel" in window) {
          const channel = new BroadcastChannel("factura-company-profile");
          channel.postMessage("profile-updated");
          channel.close();
        }
        return updated;
      } catch (caught) {
        const message = errorMessage(caught);
        setError(message);
        throw caught;
      }
    },
    [],
  );

  useEffect(() => {
    void Promise.resolve().then(refreshProfile).catch(() => undefined);
  }, [refreshProfile]);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("factura-company-profile");
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === "profile-updated") {
        void refreshProfile().catch(() => undefined);
      }
    };
    return () => channel.close();
  }, [refreshProfile]);

  return (
    <CompanyProfileContext.Provider
      value={{ profile, loading, error, refreshProfile, saveProfile }}
    >
      {children}
    </CompanyProfileContext.Provider>
  );
}

export function useCompanyProfile() {
  const context = useContext(CompanyProfileContext);
  if (!context) {
    throw new Error(
      "useCompanyProfile doit être utilisé dans CompanyProfileProvider.",
    );
  }
  return context;
}

export function companyDisplayName(profile: CompanyProfile | null) {
  return profile?.tradeName?.trim() || profile?.legalName?.trim() || "FACTURA RDC";
}

export function companyLocation(profile: CompanyProfile | null) {
  return [profile?.commune, profile?.city, profile?.province]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(", ") || "République Démocratique du Congo";
}
