"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiRequestError, apiRequest, AUTH_TOKEN_KEY } from "@/lib/api";
import {
  normalizeInvoiceTemplate,
  type InvoiceTemplateConfiguration,
} from "@/lib/invoice-template";

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
  signatureName: string | null;
  signatureTitle: string | null;
  signatureDataUrl: string | null;
  currencyCode: "CDF" | "USD";
  exchangeRateCdfPerUsd: string | null;
  exchangeRateAppliedAt: string | null;
  invoiceTemplate: InvoiceTemplateConfiguration;
};

export type CompanyProfileChanges = Omit<
  CompanyProfile,
  "id" | "exchangeRateAppliedAt"
>;

type CompanyProfileContextValue = {
  profile: CompanyProfile | null;
  loading: boolean;
  error: string;
  refreshProfile: () => Promise<CompanyProfile>;
  saveProfile: (changes: CompanyProfileChanges) => Promise<CompanyProfile>;
  saveInvoiceTemplate: (
    template: InvoiceTemplateConfiguration,
  ) => Promise<InvoiceTemplateConfiguration>;
};

const CompanyProfileContext =
  createContext<CompanyProfileContextValue | null>(null);

const hasConfiguredApi = Boolean(process.env.NEXT_PUBLIC_API_URL);
const persistedProfileFields: (keyof CompanyProfileChanges)[] = [
  "legalName",
  "tradeName",
  "rccm",
  "nin",
  "nif",
  "taxId",
  "address",
  "province",
  "city",
  "commune",
  "phone",
  "email",
  "sector",
  "taxRegime",
  "vatStatus",
  "signatureName",
  "signatureTitle",
  "signatureDataUrl",
  "currencyCode",
  "exchangeRateCdfPerUsd",
  "invoiceTemplate",
];

function broadcastProfileUpdated() {
  if (!("BroadcastChannel" in window)) return;
  const channel = new BroadcastChannel("factura-company-profile");
  channel.postMessage("profile-updated");
  channel.close();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).sort(([first], [second]) =>
      first.localeCompare(second),
    );
    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function samePersistedValue(
  first: CompanyProfileChanges[keyof CompanyProfileChanges],
  second: CompanyProfileChanges[keyof CompanyProfileChanges],
) {
  if (first === second) return true;
  if (first && second && typeof first === "object" && typeof second === "object") {
    return stableJson(first) === stableJson(second);
  }
  return false;
}

function normalizeExchangeRate(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const normalizedWhole = whole.replace(/^0+(?=\d)/, "");
  const normalizedFraction = fraction.replace(/0+$/, "");
  return normalizedFraction
    ? `${normalizedWhole}.${normalizedFraction}`
    : normalizedWhole;
}

function expectedPersistedValue(
  field: keyof CompanyProfileChanges,
  value: CompanyProfileChanges[keyof CompanyProfileChanges],
) {
  if (field === "invoiceTemplate") return normalizeInvoiceTemplate(value);
  if (
    field === "currencyCode" ||
    field === "signatureDataUrl" ||
    field === "exchangeRateCdfPerUsd"
  ) {
    if (field === "exchangeRateCdfPerUsd" && typeof value === "string") {
      return normalizeExchangeRate(value);
    }
    return value;
  }
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (field === "legalName") return trimmed;
  if (!trimmed) return null;
  return field === "email" ? trimmed.toLowerCase() : trimmed;
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Impossible de charger les paramètres du cabinet.";
}

export function CompanyProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(hasConfiguredApi);
  const [error, setError] = useState("");

  const refreshProfile = useCallback(async () => {
    if (!hasConfiguredApi) {
      const unavailable = new Error(
        "API du cabinet non configurée. Les paramètres ne sont pas enregistrés.",
      );
      setError(unavailable.message);
      throw unavailable;
    }

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
      if (!hasConfiguredApi) {
        const unavailable = new Error(
          "API du cabinet non configurée. Les paramètres n’ont pas été enregistrés.",
        );
        setError(unavailable.message);
        throw unavailable;
      }

      setError("");
      try {
        await apiRequest<CompanyProfile>("/company", {
          method: "PATCH",
          body: JSON.stringify(changes),
        });
        const persisted = await apiRequest<CompanyProfile>("/company");
        const isPersisted = persistedProfileFields.every(
          (field) => {
            const persistedValue =
              field === "exchangeRateCdfPerUsd" &&
              typeof persisted[field] === "string"
                ? normalizeExchangeRate(persisted[field])
                : field === "invoiceTemplate"
                  ? normalizeInvoiceTemplate(persisted.invoiceTemplate)
                : persisted[field];
            return samePersistedValue(
              persistedValue,
              expectedPersistedValue(field, changes[field]),
            );
          },
        );
        if (!isPersisted) {
          throw new Error(
            "La base n’a pas confirmé toutes les modifications. Actualisez les paramètres avant de continuer.",
          );
        }
        setProfile(persisted);
        broadcastProfileUpdated();
        return persisted;
      } catch (caught) {
        const message = errorMessage(caught);
        setError(message);
        throw caught;
      }
    },
    [],
  );

  const saveInvoiceTemplate = useCallback(
    async (template: InvoiceTemplateConfiguration) => {
      if (!hasConfiguredApi) {
        throw new Error(
          "API du cabinet non configurée. Le modèle de facture n’a pas été enregistré.",
        );
      }

      try {
        const persisted = await apiRequest<CompanyProfile>(
          "/company/invoice-template",
          {
            method: "PATCH",
            body: JSON.stringify({ invoiceTemplate: template }),
          },
        );
        if (
          !persisted.invoiceTemplate ||
          persisted.invoiceTemplate.version !== 1 ||
          !Array.isArray(persisted.invoiceTemplate.elements)
        ) {
          throw new Error(
            "Le serveur a accepté la demande mais n’a pas renvoyé un modèle de facture valide.",
          );
        }

        setProfile(persisted);
        broadcastProfileUpdated();
        return normalizeInvoiceTemplate(persisted.invoiceTemplate);
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          (error.status === 404 ||
            (error.status === 400 &&
              error.message.includes("property invoiceTemplate should not exist")))
        ) {
          throw new Error(
              "Le backend Render doit être mis à jour pour enregistrer le modèle.",
          );
        }
        throw error;
      }
    },
    [],
  );

  useEffect(() => {
    if (!window.localStorage.getItem(AUTH_TOKEN_KEY)) return;
    void Promise.resolve().then(refreshProfile).catch(() => undefined);
  }, [refreshProfile]);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("factura-company-profile");
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (
        event.data === "profile-updated" &&
        window.localStorage.getItem(AUTH_TOKEN_KEY)
      ) {
        void refreshProfile().catch(() => undefined);
      }
    };
    return () => channel.close();
  }, [refreshProfile]);

  return (
    <CompanyProfileContext.Provider
      value={{
        profile,
        loading,
        error,
        refreshProfile,
        saveProfile,
        saveInvoiceTemplate,
      }}
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
